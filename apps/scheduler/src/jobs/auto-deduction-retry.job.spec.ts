/**
 * Sprint 15 fixes (FIX-4) — unit tests for AutoDeductionRetryJob.
 *
 * The retry job is mostly orchestration: pull entries where
 * `nextDeductionRetryAt <= now` and delegate to
 * `AutoDeductionJob.attemptDeduction`. These tests pin the query
 * filter + the delegation pattern; the actual deduction behaviour is
 * covered by `auto-deduction.job.spec.ts`.
 */
import { RepaymentScheduleStatus } from '@lons/database';

import { AutoDeductionJob } from './auto-deduction.job';
import { AutoDeductionRetryJob } from './auto-deduction-retry.job';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function makeJob() {
  const repaymentScheduleEntry = {
    findMany: jest.fn(),
  };
  const prisma = {
    repaymentScheduleEntry,
    tenant: { findMany: jest.fn().mockResolvedValue([]) },
    enterTenantContext: async <T,>(_: unknown, cb: () => Promise<T>) => cb(),
  } as any;
  const inner = {
    attemptDeduction: jest.fn(),
  } as unknown as jest.Mocked<AutoDeductionJob>;
  const job = new AutoDeductionRetryJob(prisma, inner);
  return { job, prisma, inner, repaymentScheduleEntry };
}

describe('AutoDeductionRetryJob.runForTenant', () => {
  const now = new Date('2026-05-12T12:00:00Z');
  const today = new Date('2026-05-12T00:00:00Z');

  it('queries only entries with nextDeductionRetryAt <= now', async () => {
    const { job, repaymentScheduleEntry } = makeJob();
    repaymentScheduleEntry.findMany.mockResolvedValue([]);

    await job.runForTenant(TENANT_ID, now, today);

    const where = repaymentScheduleEntry.findMany.mock.calls[0][0].where;
    expect(where.nextDeductionRetryAt).toEqual({ lte: now, not: null });
    expect(where.status.in).toEqual(
      expect.arrayContaining([
        RepaymentScheduleStatus.pending,
        RepaymentScheduleStatus.partial,
        RepaymentScheduleStatus.overdue,
      ]),
    );
  });

  it('delegates each entry to AutoDeductionJob.attemptDeduction', async () => {
    const { job, inner, repaymentScheduleEntry } = makeJob();
    const e1 = { id: 'e1', contract: { product: {} } };
    const e2 = { id: 'e2', contract: { product: {} } };
    repaymentScheduleEntry.findMany.mockResolvedValue([e1, e2]);
    inner.attemptDeduction
      .mockResolvedValueOnce('collected')
      .mockResolvedValueOnce('failed');

    const summary = await job.runForTenant(TENANT_ID, now, today);

    expect(inner.attemptDeduction).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({ attempted: 2, collected: 1, failed: 1 });
  });

  it('isolates per-entry errors (one throw does not abort the batch)', async () => {
    const { job, inner, repaymentScheduleEntry } = makeJob();
    repaymentScheduleEntry.findMany.mockResolvedValue([
      { id: 'e1', contract: { product: {} } },
      { id: 'e2', contract: { product: {} } },
    ]);
    inner.attemptDeduction
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('collected');

    const summary = await job.runForTenant(TENANT_ID, now, today);

    expect(summary).toEqual({ attempted: 2, collected: 1, failed: 1 });
  });
});
