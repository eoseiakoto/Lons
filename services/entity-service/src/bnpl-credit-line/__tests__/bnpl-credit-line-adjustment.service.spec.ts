/**
 * Sprint 15 fixes (FIX-4) — unit tests for the adjustment service.
 *
 * Pinned behaviour:
 *   - adjustCreditLimit() is the canonical path for both system + manual
 *     adjustments. Both produce immutable adjustment rows.
 *   - FIX-3 idempotencyKey replay short-circuits without re-applying.
 *   - Decrease scales availableLimit proportionally so utilisation
 *     stays constant.
 *   - All paths emit BNPL_CREDIT_LIMIT_ADJUSTED.
 *
 * Trigger evaluators (purchase history, repayment, score change) are
 * tested via lightweight stubs on the Prisma mock — they're black-box
 * tested through `evaluateAndAdjust`.
 */
import { BnplCreditLineStatus, InstallmentStatus } from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { BnplCreditLineService } from '../bnpl-credit-line.service';
import {
  AdjustmentTrigger,
  BnplCreditLineAdjustmentService,
} from '../bnpl-credit-line-adjustment.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const SUBSCRIPTION_ID = '33333333-3333-3333-3333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-4444-444444444444';
const LINE_ID = '55555555-5555-5555-5555-555555555555';
const ADJ_ID = '66666666-6666-6666-6666-666666666666';

function makeLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LINE_ID,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    subscriptionId: SUBSCRIPTION_ID,
    productId: PRODUCT_ID,
    approvedLimit: '1000.0000' as unknown as { toString(): string },
    availableLimit: '1000.0000' as unknown as { toString(): string },
    currency: 'USD',
    status: BnplCreditLineStatus.active,
    lastReviewedAt: null,
    nextReviewAt: null,
    suspendedAt: null,
    suspendedReason: null,
    closedAt: null,
    closedReason: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeService() {
  const bnplCreditLineAdjustment = {
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  const bnplCreditLine = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const product = {
    findFirst: jest.fn().mockResolvedValue({ bnplConfig: null }),
  };
  const bnplTransaction = { count: jest.fn().mockResolvedValue(0) };
  const installmentSchedule = {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const scoringResult = { findMany: jest.fn().mockResolvedValue([]) };

  const prisma = {
    bnplCreditLineAdjustment,
    bnplCreditLine,
    product,
    bnplTransaction,
    installmentSchedule,
    scoringResult,
    $transaction: async <T,>(cb: (tx: typeof prisma) => Promise<T>) =>
      cb(prisma),
  } as any;
  const eventBus = { emitAndBuild: jest.fn() } as any;
  const creditLineService = {
    findByIdOrThrow: jest.fn(),
  } as unknown as BnplCreditLineService;

  const service = new BnplCreditLineAdjustmentService(
    prisma,
    eventBus,
    creditLineService,
  );

  return {
    service,
    prisma,
    eventBus,
    creditLineService: creditLineService as jest.Mocked<BnplCreditLineService>,
    bnplCreditLineAdjustment,
    bnplCreditLine,
    product,
    bnplTransaction,
    installmentSchedule,
    scoringResult,
  };
}

describe('adjustCreditLimit', () => {
  it('rejects negative newLimit', async () => {
    const { service } = makeService();
    await expect(
      service.adjustCreditLimit(TENANT_ID, LINE_ID, '-1', {
        adjustmentType: 'increase',
        reasonCode: 'manual',
        triggeredBy: 'operator:u1',
      }),
    ).rejects.toThrow(/non-negative/);
  });

  it('rejects when newLimit equals previous', async () => {
    const { service, creditLineService } = makeService();
    creditLineService.findByIdOrThrow.mockResolvedValue(
      makeLine({ approvedLimit: '1000.0000' }) as any,
    );
    await expect(
      service.adjustCreditLimit(TENANT_ID, LINE_ID, '1000.0000', {
        adjustmentType: 'increase',
        reasonCode: 'manual',
        triggeredBy: 'operator:u1',
      }),
    ).rejects.toThrow(/no change to apply/);
  });

  it('FIX-3: idempotency hit returns existing adjustment', async () => {
    const {
      service,
      bnplCreditLineAdjustment,
      creditLineService,
      eventBus,
      bnplCreditLine,
    } = makeService();
    const existing = {
      id: ADJ_ID,
      tenantId: TENANT_ID,
      creditLineId: LINE_ID,
      previousLimit: '1000.0000',
      newLimit: '1200.0000',
      adjustmentType: 'increase',
      reasonCode: 'manual',
      triggeredBy: 'operator:u1',
      idempotencyKey: 'idem-1',
      createdAt: new Date(),
    };
    bnplCreditLineAdjustment.findFirst.mockResolvedValue(existing);

    const result = await service.adjustCreditLimit(
      TENANT_ID,
      LINE_ID,
      '1200.0000',
      {
        adjustmentType: 'increase',
        reasonCode: 'manual',
        triggeredBy: 'operator:u1',
        idempotencyKey: 'idem-1',
      },
    );

    expect(result).toBe(existing);
    expect(bnplCreditLineAdjustment.create).not.toHaveBeenCalled();
    expect(bnplCreditLine.update).not.toHaveBeenCalled();
    expect(creditLineService.findByIdOrThrow).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('persists adjustment + emits event on increase', async () => {
    const {
      service,
      bnplCreditLineAdjustment,
      creditLineService,
      eventBus,
      bnplCreditLine,
    } = makeService();
    creditLineService.findByIdOrThrow.mockResolvedValue(
      makeLine({ approvedLimit: '1000.0000', availableLimit: '600.0000' }) as any,
    );
    bnplCreditLineAdjustment.create.mockResolvedValue({
      id: ADJ_ID,
      newLimit: '1200.0000',
    });

    await service.adjustCreditLimit(TENANT_ID, LINE_ID, '1200.0000', {
      adjustmentType: 'increase',
      reasonCode: 'manual',
      triggeredBy: 'operator:u1',
      idempotencyKey: 'idem-2',
    });

    // The credit line gets updated with the new approvedLimit. Available
    // stays the same on increase.
    const update = bnplCreditLine.update.mock.calls[0][0];
    expect(update.data.approvedLimit).toBe('1200.0000');
    expect(update.data.availableLimit).toBe('600.0000');

    const adj = bnplCreditLineAdjustment.create.mock.calls[0][0];
    expect(adj.data.previousLimit).toBe('1000.0000');
    expect(adj.data.newLimit).toBe('1200.0000');
    expect(adj.data.idempotencyKey).toBe('idem-2');

    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.BNPL_CREDIT_LIMIT_ADJUSTED,
      TENANT_ID,
      expect.objectContaining({
        creditLineId: LINE_ID,
        previousLimit: '1000.0000',
        newLimit: '1200.0000',
        adjustmentType: 'increase',
      }),
    );
  });

  it('decrease rescales availableLimit proportionally', async () => {
    const { service, creditLineService, bnplCreditLine, bnplCreditLineAdjustment } =
      makeService();
    creditLineService.findByIdOrThrow.mockResolvedValue(
      makeLine({ approvedLimit: '1000.0000', availableLimit: '600.0000' }) as any,
    );
    bnplCreditLineAdjustment.create.mockResolvedValue({ id: ADJ_ID });

    // newLimit = 800. Utilisation was 600/1000 = 0.6 → new available = 0.6*800 = 480.
    await service.adjustCreditLimit(TENANT_ID, LINE_ID, '800.0000', {
      adjustmentType: 'decrease',
      reasonCode: 'risk_review',
      triggeredBy: 'operator:u1',
    });

    const update = bnplCreditLine.update.mock.calls[0][0];
    expect(update.data.approvedLimit).toBe('800.0000');
    expect(update.data.availableLimit).toBe('480.0000');
  });
});

describe('evaluateAndAdjust', () => {
  it('skips non-active credit lines', async () => {
    const { service, creditLineService, bnplCreditLine } = makeService();
    creditLineService.findByIdOrThrow.mockResolvedValue(
      makeLine({ status: BnplCreditLineStatus.suspended }) as any,
    );

    const result = await service.evaluateAndAdjust(
      TENANT_ID,
      LINE_ID,
      AdjustmentTrigger.PURCHASE_HISTORY,
    );

    expect(result).toBeNull();
    expect(bnplCreditLine.update).not.toHaveBeenCalled();
  });

  it('respects reviewFrequencyDays cooldown for non-MANUAL triggers', async () => {
    const { service, creditLineService, bnplCreditLineAdjustment } =
      makeService();
    creditLineService.findByIdOrThrow.mockResolvedValue(
      makeLine({ lastReviewedAt: new Date() }) as any,
    );

    const result = await service.evaluateAndAdjust(
      TENANT_ID,
      LINE_ID,
      AdjustmentTrigger.PURCHASE_HISTORY,
    );

    expect(result).toBeNull();
    expect(bnplCreditLineAdjustment.create).not.toHaveBeenCalled();
  });

  it('PURCHASE_HISTORY with clean repayment triggers increase', async () => {
    const {
      service,
      creditLineService,
      bnplTransaction,
      installmentSchedule,
      bnplCreditLineAdjustment,
      bnplCreditLine,
    } = makeService();
    creditLineService.findByIdOrThrow.mockResolvedValue(makeLine() as any);
    bnplTransaction.count.mockResolvedValue(5); // >= default 3
    installmentSchedule.findFirst.mockResolvedValue(null); // no overdues
    bnplCreditLineAdjustment.create.mockResolvedValue({ id: ADJ_ID });

    await service.evaluateAndAdjust(
      TENANT_ID,
      LINE_ID,
      AdjustmentTrigger.PURCHASE_HISTORY,
    );

    expect(bnplCreditLineAdjustment.create).toHaveBeenCalled();
    const update = bnplCreditLine.update.mock.calls[0][0];
    // Default 20% increase on 1000 → 1200.
    expect(update.data.approvedLimit).toBe('1200.0000');
  });

  it('REPAYMENT_BEHAVIOUR with consecutive late payments triggers decrease', async () => {
    const {
      service,
      creditLineService,
      installmentSchedule,
      bnplCreditLineAdjustment,
      bnplCreditLine,
    } = makeService();
    creditLineService.findByIdOrThrow.mockResolvedValue(makeLine() as any);

    // First findMany() — all paid installments for ratio calc.
    // Second findMany() — recent N for late streak check (N = default 2).
    const lateLines = [
      { dueDate: new Date('2026-04-01'), paidAt: new Date('2026-04-15') },
      { dueDate: new Date('2026-05-01'), paidAt: new Date('2026-05-15') },
    ];
    installmentSchedule.findMany
      .mockResolvedValueOnce(lateLines)
      .mockResolvedValueOnce(lateLines);
    bnplCreditLineAdjustment.create.mockResolvedValue({ id: ADJ_ID });

    await service.evaluateAndAdjust(
      TENANT_ID,
      LINE_ID,
      AdjustmentTrigger.REPAYMENT_BEHAVIOUR,
    );

    expect(bnplCreditLineAdjustment.create).toHaveBeenCalled();
    const update = bnplCreditLine.update.mock.calls[0][0];
    // Default 30% decrease on 1000 → 700.
    expect(update.data.approvedLimit).toBe('700.0000');
  });

  it('stamps lastReviewedAt even when no adjustment fires', async () => {
    const { service, creditLineService, bnplCreditLine, installmentSchedule } =
      makeService();
    creditLineService.findByIdOrThrow.mockResolvedValue(makeLine() as any);
    // No paid installments → no signal.
    installmentSchedule.findMany.mockResolvedValue([]);

    const result = await service.evaluateAndAdjust(
      TENANT_ID,
      LINE_ID,
      AdjustmentTrigger.REPAYMENT_BEHAVIOUR,
    );

    expect(result).toBeNull();
    expect(bnplCreditLine.update).toHaveBeenCalledWith({
      where: { id: LINE_ID },
      data: { lastReviewedAt: expect.any(Date) },
    });
  });

  it('MANUAL trigger is a no-op (use adjustCreditLimit directly)', async () => {
    const { service, creditLineService, bnplCreditLineAdjustment } =
      makeService();
    creditLineService.findByIdOrThrow.mockResolvedValue(makeLine() as any);

    const result = await service.evaluateAndAdjust(
      TENANT_ID,
      LINE_ID,
      AdjustmentTrigger.MANUAL,
    );

    expect(result).toBeNull();
    expect(bnplCreditLineAdjustment.create).not.toHaveBeenCalled();
  });

  // The `InstallmentStatus.paid` import lives here so we can reference
  // it in the late-payment fixture above if needed in future test cases.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _paidEnumRef = InstallmentStatus.paid;
});
