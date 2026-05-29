import { BrokenPtpJob } from './broken-ptp.job';
import { Prisma } from '@lons/database';

/**
 * S19-9 — broken-PTP scheduler tests. The job is heavily IO-bound;
 * we mock Prisma + the state machine and exercise the routing
 * decisions:
 *
 *   - Past-deadline + underpaid case → transitions to broken_ptp.
 *   - Past-deadline + fully-paid case → no transition (PTP kept).
 *   - Not-yet-deadline → no transition.
 *   - Default grace days when ptpGraceDays is null (3-day fallback).
 *   - Transition error on one case doesn't kill the batch.
 *   - Per-tenant fan-out — each tenant processed in its own context.
 */

const TENANT = 'tenant-1';

function makeJob(opts: {
  tenants?: string[];
  cases?: any[];
  lastPtpTransition?: any;
  paymentsByContract?: Record<string, Prisma.Decimal>;
  transitionShouldThrow?: boolean;
}) {
  const tenants = (opts.tenants ?? [TENANT]).map((id) => ({ id }));
  const cases = opts.cases ?? [];
  const payments = opts.paymentsByContract ?? {};

  const prisma: any = {
    enterTenantContext: jest.fn().mockImplementation(async (_ctx: any, cb: any) => cb()),
    tenant: { findMany: jest.fn().mockResolvedValue(tenants) },
    collectionsCase: { findMany: jest.fn().mockResolvedValue(cases) },
    collectionsCaseTransition: {
      findFirst: jest.fn().mockResolvedValue(opts.lastPtpTransition ?? { createdAt: new Date(0) }),
    },
    repayment: {
      aggregate: jest.fn().mockImplementation(({ where }: any) => ({
        _sum: { amount: payments[where.contractId] ?? new Prisma.Decimal('0') },
      })),
    },
  };

  const stateMachine: any = {
    transition: opts.transitionShouldThrow
      ? jest.fn().mockRejectedValue(new Error('INVALID_TRANSITION'))
      : jest.fn().mockResolvedValue({}),
  };

  const job = new BrokenPtpJob(prisma, stateMachine);
  return { job, prisma, stateMachine };
}

function pastDeadline(daysOld: number, gracePassed = true): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysOld - (gracePassed ? 4 : 0));
  return d;
}

describe('BrokenPtpJob.handleCron', () => {
  it('transitions an underpaid past-deadline case to broken_ptp', async () => {
    const ptpDate = new Date();
    ptpDate.setDate(ptpDate.getDate() - 10); // 10 days ago
    const { job, stateMachine } = makeJob({
      cases: [
        {
          id: 'case-1',
          contractId: 'contract-1',
          ptpDate,
          ptpAmount: new Prisma.Decimal('1000'),
          ptpGraceDays: 3, // deadline = ptpDate + 3 = 7 days ago
          currentOutstanding: new Prisma.Decimal('1500'),
        },
      ],
      paymentsByContract: { 'contract-1': new Prisma.Decimal('200') }, // paid only 200 of 1000
    });
    await job.handleCron();
    expect(stateMachine.transition).toHaveBeenCalledWith(
      TENANT,
      'case-1',
      'broken_ptp',
      'system',
      'scheduler',
      expect.stringContaining('promised 1000'),
    );
  });

  it('does NOT transition when full PTP amount has been received', async () => {
    const ptpDate = new Date();
    ptpDate.setDate(ptpDate.getDate() - 10);
    const { job, stateMachine } = makeJob({
      cases: [
        {
          id: 'case-1',
          contractId: 'contract-1',
          ptpDate,
          ptpAmount: new Prisma.Decimal('1000'),
          ptpGraceDays: 3,
          currentOutstanding: new Prisma.Decimal('1500'),
        },
      ],
      paymentsByContract: { 'contract-1': new Prisma.Decimal('1000') }, // paid in full
    });
    await job.handleCron();
    expect(stateMachine.transition).not.toHaveBeenCalled();
  });

  it('does NOT transition when deadline has not been reached', async () => {
    const ptpDate = new Date();
    ptpDate.setDate(ptpDate.getDate() + 5); // future PTP
    const { job, stateMachine } = makeJob({
      cases: [
        {
          id: 'case-1',
          contractId: 'contract-1',
          ptpDate,
          ptpAmount: new Prisma.Decimal('1000'),
          ptpGraceDays: 3,
          currentOutstanding: new Prisma.Decimal('1500'),
        },
      ],
      paymentsByContract: { 'contract-1': new Prisma.Decimal('0') },
    });
    await job.handleCron();
    expect(stateMachine.transition).not.toHaveBeenCalled();
  });

  it('uses 3-day default grace when ptpGraceDays is null', async () => {
    const ptpDate = new Date();
    ptpDate.setDate(ptpDate.getDate() - 5); // 5 days ago, default grace = 3 → past
    const { job, stateMachine } = makeJob({
      cases: [
        {
          id: 'case-1',
          contractId: 'contract-1',
          ptpDate,
          ptpAmount: new Prisma.Decimal('1000'),
          ptpGraceDays: null, // ← null forces default
          currentOutstanding: new Prisma.Decimal('1500'),
        },
      ],
      paymentsByContract: { 'contract-1': new Prisma.Decimal('0') },
    });
    await job.handleCron();
    expect(stateMachine.transition).toHaveBeenCalledTimes(1);
  });

  it('continues batch when one transition errors', async () => {
    const ptpDate = new Date();
    ptpDate.setDate(ptpDate.getDate() - 10);
    const { job, stateMachine } = makeJob({
      cases: [
        {
          id: 'case-1', contractId: 'c-1', ptpDate,
          ptpAmount: new Prisma.Decimal('1000'), ptpGraceDays: 3,
          currentOutstanding: new Prisma.Decimal('1500'),
        },
        {
          id: 'case-2', contractId: 'c-2', ptpDate,
          ptpAmount: new Prisma.Decimal('500'), ptpGraceDays: 3,
          currentOutstanding: new Prisma.Decimal('500'),
        },
      ],
      paymentsByContract: {},
      transitionShouldThrow: true,
    });
    await expect(job.handleCron()).resolves.not.toThrow();
    expect(stateMachine.transition).toHaveBeenCalledTimes(2); // both attempted
  });

  it('skips cases with no ptpDate (defensive)', async () => {
    const { job, stateMachine } = makeJob({
      cases: [
        {
          id: 'case-1', contractId: 'c-1', ptpDate: null,
          ptpAmount: new Prisma.Decimal('1000'), ptpGraceDays: 3,
          currentOutstanding: new Prisma.Decimal('1500'),
        },
      ],
    });
    await job.handleCron();
    expect(stateMachine.transition).not.toHaveBeenCalled();
  });

  it('fans out across multiple tenants', async () => {
    const ptpDate = new Date();
    ptpDate.setDate(ptpDate.getDate() - 10);
    const { job, prisma } = makeJob({
      tenants: ['t-1', 't-2', 't-3'],
      cases: [],
    });
    await job.handleCron();
    // tenant.findMany once, then per-tenant context entry — 1 + 3 = 4 calls.
    expect(prisma.enterTenantContext).toHaveBeenCalledTimes(4);
  });
});
