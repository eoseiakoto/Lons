/**
 * FIX-BA-4 — unit tests for `EmiSyncJob`, the scheduler-side @Cron
 * wrapper that drives `EmiDataSyncJob.runForTenant` for every active
 * tenant + every active EMI integration config.
 *
 * We construct the job with hand-rolled mocks rather than spinning up
 * NestJS, matching the pattern other scheduler-job specs use. The
 * scheduler module's wiring (the @Cron decorator firing, EmiDataModule
 * registration) is exercised at boot/integration level — this test
 * focuses on the dispatch behaviour the cron lands in.
 */
import { EmiSyncJob } from './emi-sync.job';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const CONFIG_ACTIVE_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const CONFIG_ACTIVE_2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const CONFIG_INACTIVE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('EmiSyncJob (FIX-BA-4)', () => {
  it('dispatches the worker once per active config across active tenants', async () => {
    const prisma = {
      enterTenantContext: jest.fn(async (_ctx: unknown, fn: () => unknown) =>
        fn(),
      ),
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          { id: TENANT_A, name: 'Tenant A' },
          { id: TENANT_B, name: 'Tenant B' },
        ]),
      },
    };
    const configService = {
      findAll: jest.fn(async (tenantId: string) => {
        if (tenantId === TENANT_A) {
          return [
            { id: CONFIG_ACTIVE_1, isActive: true },
            { id: CONFIG_INACTIVE, isActive: false },
          ];
        }
        return [{ id: CONFIG_ACTIVE_2, isActive: true }];
      }),
    };
    const dataSyncJob = {
      runForTenant: jest.fn().mockResolvedValue({
        tenantId: 'unused',
        attempted: 0,
        succeeded: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      }),
    };

    const job = new EmiSyncJob(
      prisma as unknown as ConstructorParameters<typeof EmiSyncJob>[0],
      dataSyncJob as unknown as ConstructorParameters<typeof EmiSyncJob>[1],
      configService as unknown as ConstructorParameters<typeof EmiSyncJob>[2],
    );

    await job.handleCron();

    // Exactly the two active configs were dispatched — the inactive one
    // for Tenant A was skipped.
    expect(dataSyncJob.runForTenant).toHaveBeenCalledTimes(2);
    expect(dataSyncJob.runForTenant).toHaveBeenCalledWith(
      TENANT_A,
      CONFIG_ACTIVE_1,
    );
    expect(dataSyncJob.runForTenant).toHaveBeenCalledWith(
      TENANT_B,
      CONFIG_ACTIVE_2,
    );
    expect(dataSyncJob.runForTenant).not.toHaveBeenCalledWith(
      TENANT_A,
      CONFIG_INACTIVE,
    );
  });

  it('one config failing does not stop the sweep', async () => {
    const prisma = {
      enterTenantContext: jest.fn(async (_ctx: unknown, fn: () => unknown) =>
        fn(),
      ),
      tenant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: TENANT_A, name: 'Tenant A' }]),
      },
    };
    const configService = {
      findAll: jest.fn().mockResolvedValue([
        { id: CONFIG_ACTIVE_1, isActive: true },
        { id: CONFIG_ACTIVE_2, isActive: true },
      ]),
    };
    const dataSyncJob = {
      runForTenant: jest
        .fn()
        .mockRejectedValueOnce(new Error('upstream down'))
        .mockResolvedValueOnce({
          tenantId: TENANT_A,
          attempted: 0,
          succeeded: 0,
          skipped: 0,
          failed: 0,
          errors: [],
        }),
    };

    const job = new EmiSyncJob(
      prisma as unknown as ConstructorParameters<typeof EmiSyncJob>[0],
      dataSyncJob as unknown as ConstructorParameters<typeof EmiSyncJob>[1],
      configService as unknown as ConstructorParameters<typeof EmiSyncJob>[2],
    );

    await expect(job.handleCron()).resolves.toBeUndefined();
    // Both configs were attempted — the first throwing did not prevent
    // the second from running.
    expect(dataSyncJob.runForTenant).toHaveBeenCalledTimes(2);
  });

  it('skips tenants with no active configs', async () => {
    const prisma = {
      enterTenantContext: jest.fn(async (_ctx: unknown, fn: () => unknown) =>
        fn(),
      ),
      tenant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: TENANT_A, name: 'Tenant A' }]),
      },
    };
    const configService = {
      findAll: jest
        .fn()
        .mockResolvedValue([{ id: CONFIG_INACTIVE, isActive: false }]),
    };
    const dataSyncJob = { runForTenant: jest.fn() };

    const job = new EmiSyncJob(
      prisma as unknown as ConstructorParameters<typeof EmiSyncJob>[0],
      dataSyncJob as unknown as ConstructorParameters<typeof EmiSyncJob>[1],
      configService as unknown as ConstructorParameters<typeof EmiSyncJob>[2],
    );

    await job.handleCron();
    expect(dataSyncJob.runForTenant).not.toHaveBeenCalled();
  });
});
