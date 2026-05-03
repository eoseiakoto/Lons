/**
 * Interest service — pure-function tests for the daily-rate calculation
 * and the penalty cap math, plus integration-style tests for
 * `closeCyclesDue` (Sprint 11 A4 + A6).
 */

import { InterestService } from './interest.service';
import { CreditLineStatus } from '@lons/database';

describe('InterestService.calculateDailyInterest', () => {
  const service = new InterestService(null as any, null as any, null as any);

  it('returns zero for zero outstanding balance', () => {
    expect(service.calculateDailyInterest('0', '0.30')).toBe('0');
  });

  it('returns zero for zero rate', () => {
    expect(service.calculateDailyInterest('1000', '0')).toBe('0');
  });

  it('computes outstanding * (annualRate / 365)', () => {
    // 1000 × (0.36500 / 365) = 1000 × 0.001 = 1.0000
    expect(service.calculateDailyInterest('1000', '0.36500')).toBe('1.0000');
  });

  it('preserves precision on small rates and large balances', () => {
    // 50,000,000.00 × (0.05 / 365) = 6849.3151 (banker's rounded at 4dp)
    const out = service.calculateDailyInterest('50000000.00', '0.05');
    expect(out).toBe('6849.3151');
  });
});

describe('InterestService.calculateDailyPenalty', () => {
  const service = new InterestService(null as any, null as any, null as any);

  function product(config: Record<string, unknown>) {
    return { overdraftConfig: { penaltyConfig: config } };
  }

  it('returns zero when no penalty config is set', () => {
    expect(
      service.calculateDailyPenalty(
        { outstandingAmount: '1000', penaltiesAccrued: '0', product: { overdraftConfig: null } as any },
        new Date(),
      ),
    ).toBe('0');
  });

  it('returns zero on non-percentage_daily type', () => {
    expect(
      service.calculateDailyPenalty(
        {
          outstandingAmount: '1000',
          penaltiesAccrued: '0',
          product: product({ type: 'flat', amount: '5' }) as any,
        },
        new Date(),
      ),
    ).toBe('0');
  });

  it('applies the configured rate when within cap', () => {
    expect(
      service.calculateDailyPenalty(
        {
          outstandingAmount: '1000',
          penaltiesAccrued: '0',
          product: product({ type: 'percentage_daily', rate: '0.005', maxCapPercent: '0.30' }) as any,
        },
        new Date(),
      ),
    ).toBe('5.0000');
  });

  it('caps the daily penalty at the headroom under maxCapPercent', () => {
    // outstanding = 1000, cap = 1000 × 0.30 = 300 already-accrued = 297
    // headroom = 3, daily-by-rate = 5 → return min(5, 3) = 3
    expect(
      service.calculateDailyPenalty(
        {
          outstandingAmount: '1000',
          penaltiesAccrued: '297',
          product: product({ type: 'percentage_daily', rate: '0.005', maxCapPercent: '0.30' }) as any,
        },
        new Date(),
      ),
    ).toBe('3.0000');
  });

  it('returns zero when penalties have hit the cap exactly', () => {
    expect(
      service.calculateDailyPenalty(
        {
          outstandingAmount: '1000',
          penaltiesAccrued: '300',
          product: product({ type: 'percentage_daily', rate: '0.005', maxCapPercent: '0.30' }) as any,
        },
        new Date(),
      ),
    ).toBe('0');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sprint 11 A4 + A6: cycle close — dueDate, BillingCycleHistory, opening balance
// ───────────────────────────────────────────────────────────────────────────

describe('InterestService.closeCyclesDue — Sprint 11 A4 + A6', () => {
  const TENANT = '11111111-1111-1111-1111-111111111111';
  const CL_ID = '22222222-2222-2222-2222-222222222222';
  const CUSTOMER = '33333333-3333-3333-3333-333333333333';

  function makeCreditLine(overrides: Partial<any> = {}) {
    return {
      id: CL_ID,
      tenantId: TENANT,
      customerId: CUSTOMER,
      status: CreditLineStatus.active,
      outstandingAmount: '500',
      interestAccrued: '12.34',
      feesOutstanding: '2.50',
      penaltiesAccrued: '0',
      currentCycleStart: new Date('2026-04-01'),
      currentCycleEnd: new Date('2026-04-30'),
      product: {
        gracePeriodDays: 7,
        overdraftConfig: { billingCycleDays: 30 },
      },
      ...overrides,
    };
  }

  function makeMocks(creditLines: any[], previousCycle: any = null) {
    const transactionCalls: any[] = [];
    const prisma = {
      creditLine: {
        findMany: jest.fn().mockResolvedValue(creditLines),
        update: jest.fn(),
      },
      billingCycleHistory: {
        findFirst: jest.fn().mockResolvedValue(previousCycle),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (ops: any) => {
        transactionCalls.push(ops);
        return Array.isArray(ops) ? ops.map(() => ({})) : ops;
      }),
    };
    const eventBus = { emitAndBuild: jest.fn() };
    return { prisma, eventBus, transactionCalls };
  }

  it('computes dueDate as cycleEnd + gracePeriodDays', async () => {
    const cl = makeCreditLine();
    const { prisma, eventBus } = makeMocks([cl]);

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

    // cycleEnd 2026-04-30 + 7 days grace = 2026-05-07
    const cycleClosedEvt = eventBus.emitAndBuild.mock.calls.find(
      (c) => c[0] === 'creditline.cycle.closed',
    );
    expect(cycleClosedEvt![2].dueDate).toBe('2026-05-07T00:00:00.000Z');
  });

  it('writes a BillingCycleHistory row inside the cycle-close transaction', async () => {
    const cl = makeCreditLine();
    const { prisma } = makeMocks([cl]);

    const service = new InterestService(prisma as any, { emitAndBuild: jest.fn() } as any, null as any);
    await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

    expect(prisma.billingCycleHistory.create).toHaveBeenCalled();
    const args = prisma.billingCycleHistory.create.mock.calls[0][0];
    expect(args.data).toMatchObject({
      tenantId: TENANT,
      creditLineId: CL_ID,
      cycleNumber: 1,
      openingBalance: '0',
      closingBalance: '514.8400', // 500 + 12.34 + 2.50 + 0 = 514.84
      interestCharged: '12.34',
      feesCharged: '2.50',
      penaltiesCharged: '0',
    });
  });

  it('FIX 1 (P0): resets interestAccrued / feesOutstanding / penaltiesAccrued to 0 after crystallization', async () => {
    // Without the reset, `accrueDaily` would add new interest on top of
    // already-snapshotted interest, and the next cycle-close would
    // double-bill the customer. Verify the credit-line update zeroes
    // the three non-principal balance buckets.
    const cl = makeCreditLine();
    const { prisma } = makeMocks([cl]);

    const service = new InterestService(prisma as any, { emitAndBuild: jest.fn() } as any, null as any);
    await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

    expect(prisma.creditLine.update).toHaveBeenCalled();
    const updateArgs = prisma.creditLine.update.mock.calls[0][0];
    expect(updateArgs.data.interestAccrued).toBe('0');
    expect(updateArgs.data.feesOutstanding).toBe('0');
    expect(updateArgs.data.penaltiesAccrued).toBe('0');
    // Principal must NOT be reset — it carries forward across cycles.
    expect(updateArgs.data.outstandingAmount).toBeUndefined();
  });

  it('uses the previous cycles closing balance as the new openingBalance (A6)', async () => {
    const cl = makeCreditLine();
    const previousCycle = {
      id: 'prev-cycle',
      cycleNumber: 5,
      closingBalance: '321.5000',
    };
    const { prisma, eventBus } = makeMocks([cl], previousCycle);

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

    const stmtEvt = eventBus.emitAndBuild.mock.calls.find(
      (c) => c[0] === 'creditline.statement.generated',
    );
    expect(stmtEvt![2].openingBalance).toBe('321.5000');
    expect(stmtEvt![2].cycleNumber).toBe(6);

    const historyArgs = prisma.billingCycleHistory.create.mock.calls[0][0];
    expect(historyArgs.data.cycleNumber).toBe(6);
    expect(historyArgs.data.openingBalance).toBe('321.5000');
  });

  it('persists dueDate on the credit line so the DPD clock can read it', async () => {
    const cl = makeCreditLine();
    const { prisma } = makeMocks([cl]);

    const service = new InterestService(prisma as any, { emitAndBuild: jest.fn() } as any, null as any);
    await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

    // The credit line update is the second op in the $transaction array.
    const txArg = prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);

    expect(prisma.billingCycleHistory.create).toHaveBeenCalled();
    expect(prisma.creditLine.update).toHaveBeenCalled();
    const updateArgs = prisma.creditLine.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: CL_ID });
    expect(updateArgs.data.dueDate).toEqual(new Date('2026-05-07'));
    // Cycle dates rolled forward
    expect(updateArgs.data.currentCycleStart).toEqual(new Date('2026-05-01'));
    expect(updateArgs.data.currentCycleEnd).toEqual(new Date('2026-05-30'));
  });

  it('FIX 4: sets dueDate equal to cycleEnd when gracePeriodDays is 0', async () => {
    const cl = makeCreditLine({
      product: { gracePeriodDays: 0, overdraftConfig: { gracePeriodDays: 0, billingCycleDays: 30 } },
    });
    const { prisma, eventBus } = makeMocks([cl]);

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

    // cycleEnd is 2026-04-30; with no grace, dueDate must equal it exactly.
    const updateArgs = prisma.creditLine.update.mock.calls[0][0];
    expect(updateArgs.data.dueDate).toEqual(new Date('2026-04-30'));
    const cycleClosedEvt = eventBus.emitAndBuild.mock.calls.find(
      (c) => c[0] === 'creditline.cycle.closed',
    );
    expect(cycleClosedEvt![2].dueDate).toBe('2026-04-30T00:00:00.000Z');
  });

  it('FIX 6: CREDITLINE_CYCLE_CLOSED event includes cycleNumber and openingBalance', async () => {
    const cl = makeCreditLine();
    const previousCycle = { id: 'prev', cycleNumber: 4, closingBalance: '200.0000' };
    const { prisma, eventBus } = makeMocks([cl], previousCycle);

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

    const cycleClosedEvt = eventBus.emitAndBuild.mock.calls.find(
      (c) => c[0] === 'creditline.cycle.closed',
    );
    expect(cycleClosedEvt![2]).toMatchObject({
      cycleNumber: 5,
      openingBalance: '200.0000',
    });
  });

  it('falls back to product.gracePeriodDays when overdraftConfig has none', async () => {
    const cl = makeCreditLine({
      product: { gracePeriodDays: 3, overdraftConfig: { billingCycleDays: 30 } },
    });
    const { prisma, eventBus } = makeMocks([cl]);

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

    // 2026-04-30 + 3 days = 2026-05-03
    const evt = eventBus.emitAndBuild.mock.calls.find((c) => c[0] === 'creditline.cycle.closed');
    expect(evt![2].dueDate).toBe('2026-05-03T00:00:00.000Z');
  });

  it('continues processing other credit lines when one fails', async () => {
    const good = makeCreditLine({ id: 'cl-good' });
    const bad = makeCreditLine({ id: 'cl-bad' });
    const { prisma, eventBus } = makeMocks([bad, good]);

    // First $transaction call (for cl-bad) throws; second succeeds.
    let call = 0;
    prisma.$transaction = jest.fn(async (ops: any) => {
      call += 1;
      if (call === 1) throw new Error('write conflict');
      return Array.isArray(ops) ? ops.map(() => ({})) : ops;
    });

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    const result = await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

    expect(result.closed).toBe(1);
    // The good credit line still emitted both events
    const cycleClosed = eventBus.emitAndBuild.mock.calls.filter(
      (c) => c[0] === 'creditline.cycle.closed',
    );
    expect(cycleClosed).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sprint 11 A12 — accrueDaily + expireDueLines integration coverage
// ───────────────────────────────────────────────────────────────────────────

describe('InterestService.accrueDaily — A12', () => {
  const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const CUSTOMER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  function makeLine(overrides: any = {}) {
    return {
      id: 'cl-1',
      tenantId: TENANT,
      customerId: CUSTOMER,
      outstandingAmount: '1000',
      interestRate: '0.36500', // 36.5% APR → exactly 0.001/day
      interestAccrued: '0',
      penaltiesAccrued: '0',
      product: { overdraftConfig: null },
      ...overrides,
    };
  }

  function makeMocks(lines: any[]) {
    const prisma = {
      creditLine: {
        findMany: jest.fn().mockResolvedValue(lines),
        update: jest.fn(),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    return { prisma, eventBus };
  }

  it('emits interest_accrued and increments interestAccrued for active lines', async () => {
    const cl = makeLine();
    const { prisma, eventBus } = makeMocks([cl]);

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    const result = await service.accrueDaily(TENANT, new Date('2026-05-02'));

    expect(result.processed).toBe(1);
    expect(result.totalInterest).toBe('1.0000');
    expect(prisma.creditLine.update).toHaveBeenCalledWith({
      where: { id: 'cl-1' },
      data: { interestAccrued: '1.0000', penaltiesAccrued: '0.0000' },
    });
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('creditline.interest.accrued');
  });

  it('does not emit interest_accrued when daily interest rounds to zero', async () => {
    const cl = makeLine({ outstandingAmount: '0', interestRate: '0.10' });
    const { prisma, eventBus } = makeMocks([cl]);

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    const result = await service.accrueDaily(TENANT, new Date('2026-05-02'));

    expect(result.processed).toBe(1);
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).not.toContain('creditline.interest.accrued');
  });

  it('emits penalty_applied alongside interest when product has a daily penalty config', async () => {
    const cl = makeLine({
      outstandingAmount: '1000',
      penaltiesAccrued: '0',
      product: {
        overdraftConfig: {
          penaltyConfig: { type: 'percentage_daily', rate: '0.01', maxCapPercent: '0.50' },
        },
      },
    });
    const { prisma, eventBus } = makeMocks([cl]);

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    const result = await service.accrueDaily(TENANT, new Date('2026-05-02'));

    expect(result.totalPenalty).toBe('10.0000');
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('penalty.applied');
  });

  it('continues processing remaining lines when one update throws', async () => {
    const a = makeLine({ id: 'cl-a' });
    const b = makeLine({ id: 'cl-b' });
    const { prisma, eventBus } = makeMocks([a, b]);
    let count = 0;
    prisma.creditLine.update = jest.fn(async () => {
      count += 1;
      if (count === 1) throw new Error('row locked');
      return {};
    });

    const service = new InterestService(prisma as any, eventBus as any, null as any);
    const result = await service.accrueDaily(TENANT, new Date('2026-05-02'));

    expect(result.processed).toBe(1);
  });
});

describe('InterestService.expireDueLines — A12', () => {
  const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  function makeLine(overrides: any = {}) {
    return {
      id: 'cl-1',
      tenantId: TENANT,
      customerId: 'cust-1',
      productId: 'prod-1',
      outstandingAmount: '0',
      interestAccrued: '0',
      feesOutstanding: '0',
      penaltiesAccrued: '0',
      ...overrides,
    };
  }

  function makeMocks(lines: any[]) {
    const prisma = {
      creditLine: {
        findMany: jest.fn().mockResolvedValue(lines),
        update: jest.fn(),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const cache = { invalidate: jest.fn() };
    return { prisma, eventBus, cache };
  }

  it('jumps to closed when the line has zero balance', async () => {
    const cl = makeLine();
    const { prisma, eventBus, cache } = makeMocks([cl]);

    const service = new InterestService(prisma as any, eventBus as any, cache as any);
    const result = await service.expireDueLines(TENANT, new Date('2026-05-02'));

    expect(result.closed).toBe(1);
    expect(result.expired).toBe(0);
    expect(prisma.creditLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'closed',
          closedReason: 'expired_zero_balance',
        }),
      }),
    );
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('creditline.closed');
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('transitions to expired when the line still has balance', async () => {
    const cl = makeLine({ outstandingAmount: '500' });
    const { prisma, eventBus, cache } = makeMocks([cl]);

    const service = new InterestService(prisma as any, eventBus as any, cache as any);
    const result = await service.expireDueLines(TENANT, new Date('2026-05-02'));

    expect(result.expired).toBe(1);
    expect(result.closed).toBe(0);
    expect(prisma.creditLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'expired' }),
      }),
    );
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('creditline.expired');
  });

  it('treats any non-zero balance bucket as outstanding (interest, fees, penalties)', async () => {
    const cl = makeLine({ outstandingAmount: '0', interestAccrued: '5', feesOutstanding: '0' });
    const { prisma, eventBus, cache } = makeMocks([cl]);

    const service = new InterestService(prisma as any, eventBus as any, cache as any);
    const result = await service.expireDueLines(TENANT, new Date('2026-05-02'));

    expect(result.expired).toBe(1);
    expect(result.closed).toBe(0);
  });

  it('processes nothing when no lines are due', async () => {
    const { prisma, eventBus, cache } = makeMocks([]);

    const service = new InterestService(prisma as any, eventBus as any, cache as any);
    const result = await service.expireDueLines(TENANT, new Date('2026-05-02'));

    expect(result).toEqual({ expired: 0, closed: 0 });
    expect(prisma.creditLine.update).not.toHaveBeenCalled();
  });
});
