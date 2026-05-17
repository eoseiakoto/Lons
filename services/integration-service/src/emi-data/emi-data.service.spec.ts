import { EmiDataService } from './emi-data.service';
import { MockEmiDataAdapter } from './mock-emi-data.adapter';
import { IEmiDataAdapter, EmiFinancialSnapshot } from './emi-data-adapter.interface';

const FAST_RETRY = { maxRetries: 0, baseDelay: 1, maxDelay: 1, backoffMultiplier: 1 };

function mockPrisma() {
  return {
    customerFinancialData: { create: jest.fn().mockResolvedValue({ id: 'fd-1' }) },
  } as unknown as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function mkSvc(adapter: IEmiDataAdapter, prisma: ReturnType<typeof mockPrisma>, ttl = 60_000) {
  return new EmiDataService(adapter, prisma, ttl, FAST_RETRY);
}

describe('EmiDataService', () => {
  describe('getFinancialSnapshot', () => {
    it('returns a snapshot via the adapter', async () => {
      const svc = mkSvc(new MockEmiDataAdapter(), mockPrisma());
      const snap = await svc.getFinancialSnapshot('wallet-1');
      expect(snap).not.toBeNull();
      expect(snap?.walletId).toBe('wallet-1');
    });

    it('caches snapshots within the TTL window', async () => {
      const adapter: IEmiDataAdapter = {
        getFinancialSnapshot: jest.fn(async (id: string) => ({
          walletId: id,
          currentBalance: '100.0000',
          currency: 'GHS',
          averageBalance30d: '50.0000',
          averageBalance90d: '60.0000',
          transactionCount30d: 5,
          transactionCount90d: 15,
          incomeConsistency: 70,
          incomeExpenseRatio: '1.2000',
          fetchedAt: new Date(),
        })),
        getTransactionHistory: jest.fn(),
        getWalletBalance: jest.fn(),
        getIncomePatterns: jest.fn(),
        isAvailable: jest.fn(async () => true),
        getProvider: () => 'mock',
      };
      const svc = mkSvc(adapter, mockPrisma(), /* ttl */ 10_000);

      await svc.getFinancialSnapshot('w-cache');
      await svc.getFinancialSnapshot('w-cache');
      await svc.getFinancialSnapshot('w-cache');
      expect(adapter.getFinancialSnapshot).toHaveBeenCalledTimes(1);
    });

    it('returns null and does not throw when the adapter errors', async () => {
      const adapter: IEmiDataAdapter = {
        getFinancialSnapshot: jest.fn(async () => { throw new Error('boom'); }),
        getTransactionHistory: jest.fn(),
        getWalletBalance: jest.fn(),
        getIncomePatterns: jest.fn(),
        isAvailable: jest.fn(async () => true),
        getProvider: () => 'mock',
      };
      const svc = mkSvc(adapter, mockPrisma());
      const snap = await svc.getFinancialSnapshot('w-error');
      expect(snap).toBeNull();
    });
  });

  describe('syncFinancialSnapshot', () => {
    it('persists the snapshot to customer_financial_data', async () => {
      const prisma = mockPrisma();
      const svc = mkSvc(new MockEmiDataAdapter(), prisma);
      const result = await svc.syncFinancialSnapshot(
        'tenant-1',
        'cust-1',
        'wallet-sync',
      );
      expect(result).not.toBeNull();
      expect(prisma.customerFinancialData.create).toHaveBeenCalledTimes(1);
      const args = (prisma.customerFinancialData.create as jest.Mock).mock.calls[0][0];
      expect(args.data.tenantId).toBe('tenant-1');
      expect(args.data.customerId).toBe('cust-1');
      expect(args.data.source).toBe('emi');
      expect(args.data.sourceProvider).toBe('mock');
      expect(args.data.walletId).toBe('wallet-sync');
    });

    it('skips persistence when snapshot cannot be fetched', async () => {
      const adapter: IEmiDataAdapter = {
        getFinancialSnapshot: jest.fn(async () => { throw new Error('down'); }),
        getTransactionHistory: jest.fn(),
        getWalletBalance: jest.fn(),
        getIncomePatterns: jest.fn(),
        isAvailable: jest.fn(async () => false),
        getProvider: () => 'mock',
      };
      const prisma = mockPrisma();
      const svc = mkSvc(adapter, prisma);
      const result = await svc.syncFinancialSnapshot('t', 'c', 'w');
      expect(result).toBeNull();
      expect(prisma.customerFinancialData.create).not.toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('removes a single wallet from the cache', async () => {
      const calls: string[] = [];
      const adapter: IEmiDataAdapter = {
        getFinancialSnapshot: jest.fn(async (id: string) => {
          calls.push(id);
          return {
            walletId: id,
            currentBalance: '1.0000',
            currency: 'GHS',
            averageBalance30d: '1.0000',
            averageBalance90d: '1.0000',
            transactionCount30d: 0,
            transactionCount90d: 0,
            incomeConsistency: 0,
            incomeExpenseRatio: '1.0000',
            fetchedAt: new Date(),
          } as EmiFinancialSnapshot;
        }),
        getTransactionHistory: jest.fn(),
        getWalletBalance: jest.fn(),
        getIncomePatterns: jest.fn(),
        isAvailable: jest.fn(async () => true),
        getProvider: () => 'mock',
      };
      const svc = mkSvc(adapter, mockPrisma(), 60_000);

      await svc.getFinancialSnapshot('w-1');
      await svc.getFinancialSnapshot('w-1');
      expect(calls.length).toBe(1);

      svc.invalidateCache('w-1');
      await svc.getFinancialSnapshot('w-1');
      expect(calls.length).toBe(2);
    });
  });
});
