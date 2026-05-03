/**
 * Sprint 12 G2 — BnplAutoCollectJob unit tests.
 *
 * Mocks PrismaService + BnplInstallmentService. Covers the four behaviour
 * contracts called out in the dev brief:
 *
 *   1. Happy path: due installment with auto-collect on → collectInstallment
 *      runs and returns `collected`.
 *   2. Insufficient balance: collectInstallment returns `failed` → counter
 *      moves to the failed bucket; the job keeps going for the next item.
 *   3. Max attempts reached: the job still calls the service (the cap lives
 *      in the service), but a `skipped` outcome flows through to the
 *      skipped counter without inflating `collected`/`failed`.
 *   4. Same-day re-run: the SQL-level filter on `lastCollectionAttemptAt`
 *      means no installments come back from `findMany` on the second pass,
 *      so `collectInstallment` is not invoked.
 */

import { BnplAutoCollectJob } from './bnpl-auto-collect.job';
import { InstallmentStatus } from '@lons/database';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TENANT = { id: TENANT_ID, name: 'Acme', status: 'active', deletedAt: null };

function makePrisma({
  tenants = [TENANT],
  dueInstallments = [] as Array<{ id: string; dueDate: Date }>,
}: {
  tenants?: typeof TENANT extends infer T ? T[] : never;
  dueInstallments?: Array<{ id: string; dueDate: Date }>;
} = {}) {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue(tenants),
    },
    installmentSchedule: {
      findMany: jest.fn().mockResolvedValue(dueInstallments),
    },
    enterTenantContext: jest.fn(async (_ctx: any, fn: () => Promise<any>) => fn()),
  } as any;
}

describe('BnplAutoCollectJob', () => {
  const today = new Date('2026-05-03T00:00:00.000Z');
  const tomorrow = new Date('2026-05-04T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path — collects a due installment and increments the collected counter', async () => {
    const prisma = makePrisma({
      dueInstallments: [{ id: 'inst-1', dueDate: today }],
    });
    const installmentService = {
      collectInstallment: jest.fn().mockResolvedValue({
        status: 'collected',
        paidAmount: '40.0000',
        walletRef: 'MOCK-1',
      }),
    };
    const job = new BnplAutoCollectJob(prisma, installmentService as any);

    const result = await job.runForTenant(TENANT_ID, today, tomorrow);

    expect(installmentService.collectInstallment).toHaveBeenCalledTimes(1);
    expect(installmentService.collectInstallment).toHaveBeenCalledWith(
      TENANT_ID,
      'inst-1',
      'bnpl-auto-collect:inst-1:2026-05-03',
    );
    expect(result).toEqual({ attempted: 1, collected: 1, failed: 0, skipped: 0 });
  });

  it('insufficient balance path — failed outcome lands in the failed bucket', async () => {
    const prisma = makePrisma({
      dueInstallments: [
        { id: 'inst-fail', dueDate: today },
        { id: 'inst-ok', dueDate: today },
      ],
    });
    const installmentService = {
      collectInstallment: jest
        .fn()
        .mockResolvedValueOnce({ status: 'failed', reason: 'insufficient_balance', attempt: 1 })
        .mockResolvedValueOnce({ status: 'collected', paidAmount: '40.0000', walletRef: 'MOCK-2' }),
    };
    const job = new BnplAutoCollectJob(prisma, installmentService as any);

    const result = await job.runForTenant(TENANT_ID, today, tomorrow);

    expect(installmentService.collectInstallment).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ attempted: 2, collected: 1, failed: 1, skipped: 0 });
  });

  it('max-attempts reached path — service returns skipped, counted as skipped (not failed)', async () => {
    const prisma = makePrisma({
      dueInstallments: [{ id: 'inst-capped', dueDate: today }],
    });
    const installmentService = {
      collectInstallment: jest
        .fn()
        .mockResolvedValue({ status: 'skipped', reason: 'max_attempts_reached' }),
    };
    const job = new BnplAutoCollectJob(prisma, installmentService as any);

    const result = await job.runForTenant(TENANT_ID, today, tomorrow);

    expect(installmentService.collectInstallment).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ attempted: 1, collected: 0, failed: 0, skipped: 1 });
  });

  it('same-day re-run — query filter excludes installments already attempted today, so collectInstallment is not called', async () => {
    // Simulate that the SQL filter `lastCollectionAttemptAt < today OR null`
    // returns nothing on the second invocation of the same day. The job
    // never sees the rows, so collectInstallment is never invoked.
    const prisma = makePrisma({ dueInstallments: [] });
    const installmentService = {
      collectInstallment: jest.fn(),
    };
    const job = new BnplAutoCollectJob(prisma, installmentService as any);

    const result = await job.runForTenant(TENANT_ID, today, tomorrow);

    expect(installmentService.collectInstallment).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: 0, collected: 0, failed: 0, skipped: 0 });
    // Verify the SQL filter is shaped right — the OR clause is the
    // load-bearing piece for same-day idempotency.
    expect(prisma.installmentSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          status: { in: [InstallmentStatus.pending, InstallmentStatus.due, InstallmentStatus.overdue] },
          dueDate: { lt: tomorrow },
          OR: [
            { lastCollectionAttemptAt: null },
            { lastCollectionAttemptAt: { lt: today } },
          ],
        }),
      }),
    );
  });

  it('handleCron — fans out per tenant and continues if one tenant throws', async () => {
    const prisma = {
      tenant: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'tenant-1', name: 'A', status: 'active', deletedAt: null },
            { id: 'tenant-2', name: 'B', status: 'active', deletedAt: null },
          ]),
      },
      installmentSchedule: {
        findMany: jest
          .fn()
          // tenant-1 throws (DB error simulation)
          .mockRejectedValueOnce(new Error('boom'))
          // tenant-2 returns one due installment
          .mockResolvedValueOnce([{ id: 'inst-99', dueDate: today }]),
      },
      enterTenantContext: jest.fn(async (_ctx: any, fn: () => Promise<any>) => fn()),
    } as any;
    const installmentService = {
      collectInstallment: jest.fn().mockResolvedValue({
        status: 'collected',
        paidAmount: '40.0000',
        walletRef: 'MOCK-3',
      }),
    };
    const job = new BnplAutoCollectJob(prisma, installmentService as any);

    await job.handleCron();

    // tenant-1 errored, tenant-2 succeeded — service called once for tenant-2's installment.
    expect(installmentService.collectInstallment).toHaveBeenCalledTimes(1);
    expect(installmentService.collectInstallment).toHaveBeenCalledWith(
      'tenant-2',
      'inst-99',
      expect.stringMatching(/^bnpl-auto-collect:inst-99:\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('handleCron — no active tenants is a graceful no-op', async () => {
    const prisma = {
      tenant: { findMany: jest.fn().mockResolvedValue([]) },
      installmentSchedule: { findMany: jest.fn() },
      enterTenantContext: jest.fn(async (_ctx: any, fn: () => Promise<any>) => fn()),
    } as any;
    const installmentService = { collectInstallment: jest.fn() };
    const job = new BnplAutoCollectJob(prisma, installmentService as any);

    await job.handleCron();

    expect(prisma.installmentSchedule.findMany).not.toHaveBeenCalled();
    expect(installmentService.collectInstallment).not.toHaveBeenCalled();
  });
});
