/**
 * S17-FIX-3 — unit tests verifying that PaymentService injects the shared
 * IWalletCollectionAdapter from @lons/common/wallet.
 *
 * Scenarios:
 *   1. Collection adapter is accepted as optional fifth constructor argument.
 *   2. WALLET_COLLECTION_ADAPTER token is the canonical shared Symbol.
 *   3. Adapter collect() can be called with the standard interface shape.
 *   4. PaymentService still works when adapter is not provided (optional).
 */
import {
  IWalletCollectionAdapter,
  WALLET_COLLECTION_ADAPTER,
} from '@lons/common';
import { PaymentService } from '../payment.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CONTRACT_ID = '33333333-3333-3333-3333-333333333333';

function makeCollectionAdapter(): jest.Mocked<IWalletCollectionAdapter> {
  return {
    collect: jest.fn().mockResolvedValue({ success: true, walletRef: 'MOCK-COLLECT-1' }),
  };
}

function makeMinimalPrisma() {
  return {
    repayment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'rep-1' }),
    },
    contract: {
      findFirst: jest.fn().mockResolvedValue({
        id: CONTRACT_ID,
        tenantId: TENANT_ID,
        customerId: 'cust-1',
        status: 'active',
        outstandingPrincipal: '100',
        outstandingInterest: '10',
        outstandingFees: '0',
        outstandingPenalties: '0',
        totalOutstanding: '110',
        totalPaid: '0',
        currency: 'GHS',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    ledgerEntry: {
      create: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('PaymentService — S17-FIX-3 wallet collection adapter injection', () => {
  it('accepts IWalletCollectionAdapter as optional fifth constructor argument', () => {
    const adapter = makeCollectionAdapter();
    const prisma = makeMinimalPrisma();
    const eventBus = { emitAndBuild: jest.fn() } as any;

    const service = new PaymentService(prisma, eventBus, undefined, adapter);
    expect(service).toBeDefined();
    expect((service as any)._walletCollectionAdapter).toBe(adapter);
  });

  it('still works without the adapter (backward-compatible, optional param)', () => {
    const prisma = makeMinimalPrisma();
    const eventBus = { emitAndBuild: jest.fn() } as any;

    // No adapter provided — must not throw.
    const service = new PaymentService(prisma, eventBus);
    expect(service).toBeDefined();
    expect((service as any)._walletCollectionAdapter).toBeUndefined();
  });

  it('WALLET_COLLECTION_ADAPTER token is the canonical shared Symbol', () => {
    expect(WALLET_COLLECTION_ADAPTER).toBe(
      Symbol.for('lons.WALLET_COLLECTION_ADAPTER'),
    );
  });

  it('adapter collect() signature matches IWalletCollectionAdapter interface', async () => {
    const adapter = makeCollectionAdapter();

    const result = await adapter.collect({
      walletId: 'wallet-456',
      amount: '50.0000',
      reference: 'REPAY-REF-1',
    });

    expect(result).toEqual({ success: true, walletRef: 'MOCK-COLLECT-1' });
    expect(adapter.collect).toHaveBeenCalledWith({
      walletId: 'wallet-456',
      amount: '50.0000',
      reference: 'REPAY-REF-1',
    });
  });
});
