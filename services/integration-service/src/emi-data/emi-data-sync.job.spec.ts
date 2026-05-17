import { EmiDataService } from './emi-data.service';
import { EmiDataSyncJob } from './emi-data-sync.job';

function mkSvc(syncImpl: jest.Mock): EmiDataService {
  return { syncFinancialSnapshot: syncImpl } as unknown as EmiDataService;
}

describe('EmiDataSyncJob', () => {
  it('iterates active subscriptions and persists snapshots per customer', async () => {
    const prisma = {
      subscription: {
        findMany: jest.fn().mockResolvedValue([
          { customerId: 'c-1' },
          { customerId: 'c-2' },
        ]),
      },
      walletAccountMapping: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ walletId: 'w-1' })
          .mockResolvedValueOnce({ walletId: 'w-2' }),
      },
      customer: { findFirst: jest.fn() },
    };
    const sync = jest.fn().mockResolvedValue({} as unknown);
    const job = new EmiDataSyncJob(prisma as never, mkSvc(sync));

    const result = await job.runForTenant('t-1');
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenNthCalledWith(1, 't-1', 'c-1', 'w-1');
    expect(sync).toHaveBeenNthCalledWith(2, 't-1', 'c-2', 'w-2');
  });

  it('falls back to customer.metadata.walletId when no wallet mapping exists', async () => {
    const prisma = {
      subscription: { findMany: jest.fn().mockResolvedValue([{ customerId: 'c-1' }]) },
      walletAccountMapping: { findFirst: jest.fn().mockResolvedValue(null) },
      customer: { findFirst: jest.fn().mockResolvedValue({ metadata: { walletId: 'w-legacy' } }) },
    };
    const sync = jest.fn().mockResolvedValue({});
    const job = new EmiDataSyncJob(prisma as never, mkSvc(sync));

    const result = await job.runForTenant('t-2');
    expect(result.succeeded).toBe(1);
    expect(sync).toHaveBeenCalledWith('t-2', 'c-1', 'w-legacy');
  });

  it('skips customers without any wallet id', async () => {
    const prisma = {
      subscription: { findMany: jest.fn().mockResolvedValue([{ customerId: 'c-1' }]) },
      walletAccountMapping: { findFirst: jest.fn().mockResolvedValue(null) },
      customer: { findFirst: jest.fn().mockResolvedValue({ metadata: null }) },
    };
    const sync = jest.fn();
    const job = new EmiDataSyncJob(prisma as never, mkSvc(sync));

    const result = await job.runForTenant('t-3');
    expect(result.skipped).toBe(1);
    expect(sync).not.toHaveBeenCalled();
  });

  it('counts EMI unavailable as skipped, not failed', async () => {
    const prisma = {
      subscription: { findMany: jest.fn().mockResolvedValue([{ customerId: 'c-1' }]) },
      walletAccountMapping: { findFirst: jest.fn().mockResolvedValue({ walletId: 'w-1' }) },
      customer: { findFirst: jest.fn() },
    };
    const sync = jest.fn().mockResolvedValue(null);
    const job = new EmiDataSyncJob(prisma as never, mkSvc(sync));

    const result = await job.runForTenant('t-4');
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('records per-customer errors without aborting the whole batch', async () => {
    const prisma = {
      subscription: { findMany: jest.fn().mockResolvedValue([
        { customerId: 'c-1' }, { customerId: 'c-2' },
      ]) },
      walletAccountMapping: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ walletId: 'w-1' })
          .mockResolvedValueOnce({ walletId: 'w-2' }),
      },
      customer: { findFirst: jest.fn() },
    };
    const sync = jest.fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({});
    const job = new EmiDataSyncJob(prisma as never, mkSvc(sync));

    const result = await job.runForTenant('t-5');
    expect(result.attempted).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.errors).toEqual([{ customerId: 'c-1', error: 'db down' }]);
  });

  // ─────────────────────────────────────────────────────────────────────
  // S17-FIX-8 — sync-status recording on EmiIntegrationConfig
  // ─────────────────────────────────────────────────────────────────────

  it('FIX-8: passes configId → recordSyncSuccess called after successful batch', async () => {
    const prisma = {
      subscription: { findMany: jest.fn().mockResolvedValue([{ customerId: 'c-1' }]) },
      walletAccountMapping: { findFirst: jest.fn().mockResolvedValue({ walletId: 'w-1' }) },
      customer: { findFirst: jest.fn() },
    };
    const sync = jest.fn().mockResolvedValue({});
    const recordSuccess = jest.fn();
    const recordError = jest.fn();
    const configService = {
      recordSyncSuccess: recordSuccess,
      recordSyncError: recordError,
    } as any;
    const job = new EmiDataSyncJob(prisma as never, mkSvc(sync), configService);

    await job.runForTenant('t-fix8a', 'config-1');

    expect(recordSuccess).toHaveBeenCalledWith('t-fix8a', 'config-1');
    expect(recordError).not.toHaveBeenCalled();
  });

  it('FIX-8: batch-wide failure → recordSyncError + re-throws', async () => {
    const prisma = {
      // findMany itself fails — simulates batch-wide DB outage before any
      // per-customer work happens.
      subscription: { findMany: jest.fn().mockRejectedValue(new Error('connection refused')) },
      walletAccountMapping: { findFirst: jest.fn() },
      customer: { findFirst: jest.fn() },
    };
    const sync = jest.fn();
    const recordSuccess = jest.fn();
    const recordError = jest.fn();
    const configService = {
      recordSyncSuccess: recordSuccess,
      recordSyncError: recordError,
    } as any;
    const job = new EmiDataSyncJob(prisma as never, mkSvc(sync), configService);

    await expect(job.runForTenant('t-fix8b', 'config-2')).rejects.toThrow(/connection refused/);

    expect(recordError).toHaveBeenCalledWith('t-fix8b', 'config-2', 'connection refused');
    expect(recordSuccess).not.toHaveBeenCalled();
  });

  it('FIX-8: without configId, sync status recording is skipped (legacy path)', async () => {
    const prisma = {
      subscription: { findMany: jest.fn().mockResolvedValue([]) },
      walletAccountMapping: { findFirst: jest.fn() },
      customer: { findFirst: jest.fn() },
    };
    const sync = jest.fn();
    const recordSuccess = jest.fn();
    const configService = {
      recordSyncSuccess: recordSuccess,
      recordSyncError: jest.fn(),
    } as any;
    const job = new EmiDataSyncJob(prisma as never, mkSvc(sync), configService);

    await job.runForTenant('t-fix8c'); // no configId

    expect(recordSuccess).not.toHaveBeenCalled();
  });
});
