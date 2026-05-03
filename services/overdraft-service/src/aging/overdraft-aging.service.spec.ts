/**
 * Overdraft aging service — Sprint 11 A5. Pure classifier tests cover the
 * boundary conditions; integration-style tests with mocked Prisma cover
 * the bucket-transition action wiring (notification, freeze, recovery
 * referral, NPL classification).
 */

import { CreditLineStatus } from '@lons/database';

import { OverdraftAgingService } from './overdraft-aging.service';

describe('OverdraftAgingService.calculateDpd (pure)', () => {
  it('returns 0 when dueDate is null', () => {
    expect(OverdraftAgingService.calculateDpd(null, new Date('2026-05-02'))).toBe(0);
  });

  it('returns 0 when today is before dueDate', () => {
    expect(
      OverdraftAgingService.calculateDpd(new Date('2026-05-10'), new Date('2026-05-02')),
    ).toBe(0);
  });

  it('returns 0 on the dueDate itself (grace inclusive)', () => {
    expect(
      OverdraftAgingService.calculateDpd(new Date('2026-05-02'), new Date('2026-05-02')),
    ).toBe(0);
  });

  it('returns the day-difference once past due', () => {
    expect(
      OverdraftAgingService.calculateDpd(new Date('2026-05-01'), new Date('2026-05-08')),
    ).toBe(7);
  });

  it('strips intra-day time components for stable DPD across timezones', () => {
    const due = new Date(Date.UTC(2026, 4, 1, 0, 0, 0));
    const today = new Date(Date.UTC(2026, 4, 8, 23, 59, 59));
    expect(OverdraftAgingService.calculateDpd(due, today)).toBe(7);
  });
});

describe('OverdraftAgingService.classifyBucket (pure)', () => {
  it.each([
    [0, 'current'],
    [1, 'watch'],
    [7, 'watch'],
    [8, 'substandard'],
    [30, 'substandard'],
    [31, 'doubtful'],
    [90, 'doubtful'],
    [91, 'loss'],
    [365, 'loss'],
  ])('DPD %i → %s', (dpd, expected) => {
    expect(OverdraftAgingService.classifyBucket(dpd)).toBe(expected);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// classifyPortfolio — bucket-transition action wiring
// ───────────────────────────────────────────────────────────────────────────

const TENANT = '11111111-1111-1111-1111-111111111111';
const CL_ID = '22222222-2222-2222-2222-222222222222';
const CUSTOMER = '33333333-3333-3333-3333-333333333333';

function makeCreditLine(overrides: Partial<any> = {}) {
  return {
    id: CL_ID,
    tenantId: TENANT,
    customerId: CUSTOMER,
    productId: '44444444-4444-4444-4444-444444444444',
    status: CreditLineStatus.active,
    outstandingAmount: '500',
    interestAccrued: '0',
    feesOutstanding: '0',
    penaltiesAccrued: '0',
    daysPastDue: 0,
    agingBucket: null,
    dueDate: new Date('2026-05-01'),
    product: {
      type: 'overdraft',
      overdraftConfig: { reminderSchedule: { afterOverdueDays: [1, 3, 7] } },
    },
    ...overrides,
  };
}

function makeMocks(creditLines: any[]) {
  const prisma = {
    creditLine: {
      findMany: jest.fn().mockResolvedValue(creditLines),
      update: jest.fn(),
    },
  };
  const eventBus = { emitAndBuild: jest.fn() };
  const creditLineService = {
    freeze: jest.fn().mockResolvedValue({}),
    adjustLimit: jest.fn().mockResolvedValue({}),
  };
  return { prisma, eventBus, creditLineService };
}

describe('OverdraftAgingService.classifyPortfolio', () => {
  it('skips fully-paid credit lines and resets stale aging fields', async () => {
    const cl = makeCreditLine({
      outstandingAmount: '0',
      interestAccrued: '0',
      feesOutstanding: '0',
      penaltiesAccrued: '0',
      daysPastDue: 5,
      agingBucket: 'watch',
    });
    const { prisma, eventBus, creditLineService } = makeMocks([cl]);

    const service = new OverdraftAgingService(
      prisma as any,
      eventBus as any,
      creditLineService as any,
    );
    const result = await service.classifyPortfolio(TENANT, new Date('2026-05-10'));

    expect(result.transitioned).toEqual([]);
    expect(prisma.creditLine.update).toHaveBeenCalledWith({
      where: { id: CL_ID },
      data: { daysPastDue: 0, agingBucket: 'current', agingUpdatedAt: new Date('2026-05-10') },
    });
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('emits CREDITLINE_AGED on every change and CREDITLINE_OVERDUE_REMINDER_DUE on configured DPD', async () => {
    // dueDate 2026-05-01, today 2026-05-04 → 3 DPD → watch bucket.
    // Reminder schedule includes 3, so reminder event should fire.
    const cl = makeCreditLine({
      dueDate: new Date('2026-05-01'),
      agingBucket: null,
    });
    const { prisma, eventBus, creditLineService } = makeMocks([cl]);

    const service = new OverdraftAgingService(
      prisma as any,
      eventBus as any,
      creditLineService as any,
    );
    await service.classifyPortfolio(TENANT, new Date('2026-05-04'));

    const eventNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('creditline.aged');
    expect(eventNames).toContain('creditline.overdue.reminder_due');
    expect(creditLineService.freeze).not.toHaveBeenCalled();
  });

  it('FIX 2: emits reminder on configured DPD even with no bucket transition (intra-watch)', async () => {
    // After the FIX 2 refactor, reminders fire from the main loop on
    // every configured DPD day — not only on bucket entry. A line
    // already in `watch` from yesterday must still get a DPD-3 reminder
    // when today's run sees DPD jump from 1 to 3.
    const cl = makeCreditLine({
      dueDate: new Date('2026-05-01'),
      daysPastDue: 1,
      agingBucket: 'watch',
    });
    const { prisma, eventBus, creditLineService } = makeMocks([cl]);

    const service = new OverdraftAgingService(
      prisma as any,
      eventBus as any,
      creditLineService as any,
    );
    // 2026-05-01 + 3 = 2026-05-04 → DPD = 3, still watch, no transition.
    await service.classifyPortfolio(TENANT, new Date('2026-05-04'));

    const reminderCalls = eventBus.emitAndBuild.mock.calls.filter(
      (c) => c[0] === 'creditline.overdue.reminder_due',
    );
    expect(reminderCalls).toHaveLength(1);
    expect(reminderCalls[0][2].daysPastDue).toBe(3);
    // Confirm we're testing the no-transition path.
    expect(creditLineService.freeze).not.toHaveBeenCalled();
  });

  it('does NOT emit a reminder when DPD is not in the reminder schedule', async () => {
    // 2 DPD — watch bucket but reminder schedule is [1, 3, 7].
    const cl = makeCreditLine({ dueDate: new Date('2026-05-01') });
    const { prisma, eventBus, creditLineService } = makeMocks([cl]);

    const service = new OverdraftAgingService(
      prisma as any,
      eventBus as any,
      creditLineService as any,
    );
    await service.classifyPortfolio(TENANT, new Date('2026-05-03'));

    const eventNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(eventNames).not.toContain('creditline.overdue.reminder_due');
  });

  it('freezes the credit line on transition into substandard (8+ DPD)', async () => {
    // 8 DPD → substandard bucket
    const cl = makeCreditLine({
      dueDate: new Date('2026-05-01'),
      agingBucket: 'watch',
    });
    const { prisma, eventBus, creditLineService } = makeMocks([cl]);

    const service = new OverdraftAgingService(
      prisma as any,
      eventBus as any,
      creditLineService as any,
    );
    await service.classifyPortfolio(TENANT, new Date('2026-05-09'));

    expect(creditLineService.freeze).toHaveBeenCalledWith(
      TENANT,
      CL_ID,
      'overdue_substandard',
    );
  });

  it('refers to recovery and reduces limit to zero on transition into doubtful (31+ DPD)', async () => {
    // 31 DPD → doubtful
    const cl = makeCreditLine({
      dueDate: new Date('2026-05-01'),
      agingBucket: 'substandard',
    });
    const { prisma, eventBus, creditLineService } = makeMocks([cl]);

    const service = new OverdraftAgingService(
      prisma as any,
      eventBus as any,
      creditLineService as any,
    );
    await service.classifyPortfolio(TENANT, new Date('2026-06-01'));

    const eventNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('creditline.recovery.referred');
    expect(creditLineService.adjustLimit).toHaveBeenCalledWith(
      TENANT,
      CL_ID,
      expect.objectContaining({
        newLimit: '0',
        reasonCode: 'overdue_reduction',
      }),
    );
  });

  it('emits CREDITLINE_NPL_CLASSIFIED on transition into loss (91+ DPD)', async () => {
    // 92 DPD → loss
    const cl = makeCreditLine({
      dueDate: new Date('2026-05-01'),
      agingBucket: 'doubtful',
    });
    const { prisma, eventBus, creditLineService } = makeMocks([cl]);

    const service = new OverdraftAgingService(
      prisma as any,
      eventBus as any,
      creditLineService as any,
    );
    await service.classifyPortfolio(TENANT, new Date('2026-08-01'));

    const eventNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('creditline.npl.classified');
  });

  it('does not run worsening actions on improving transitions (substandard → watch)', async () => {
    // The customer paid down enough for the line to drop back into the
    // watch bucket. No freeze / no recovery / no NPL.
    const cl = makeCreditLine({
      dueDate: new Date('2026-05-01'),
      agingBucket: 'substandard',
      // 5 DPD → watch
    });
    const { prisma, eventBus, creditLineService } = makeMocks([cl]);

    const service = new OverdraftAgingService(
      prisma as any,
      eventBus as any,
      creditLineService as any,
    );
    await service.classifyPortfolio(TENANT, new Date('2026-05-06'));

    expect(creditLineService.freeze).not.toHaveBeenCalled();
    expect(creditLineService.adjustLimit).not.toHaveBeenCalled();
    // creditline.aged still emits so dashboards reflect the new state.
    const eventNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('creditline.aged');
    expect(eventNames).not.toContain('creditline.recovery.referred');
  });

  it('skips the write entirely when DPD and bucket are unchanged', async () => {
    const cl = makeCreditLine({
      dueDate: new Date('2026-05-01'),
      agingBucket: 'watch',
      daysPastDue: 3,
    });
    const { prisma, eventBus, creditLineService } = makeMocks([cl]);

    const service = new OverdraftAgingService(
      prisma as any,
      eventBus as any,
      creditLineService as any,
    );
    const result = await service.classifyPortfolio(TENANT, new Date('2026-05-04'));

    expect(prisma.creditLine.update).not.toHaveBeenCalled();
    expect(result.transitioned).toEqual([]);
  });
});
