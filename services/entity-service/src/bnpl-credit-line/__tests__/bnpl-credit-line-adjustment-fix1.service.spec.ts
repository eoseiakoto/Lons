/**
 * S17-FIX-1 — unit tests for `evaluateProductConfigChange`.
 *
 * Scenarios (per dev prompt):
 *   1. Product maxAmount reduced below existing credit line's approvedLimit
 *      → line is reduced to the new max; adjustment record created.
 *   2. Product maxAmount increased → no change to existing lines.
 *   3. Product maxAmount reduced but line's approvedLimit is already at or
 *      below the new max → no change.
 *   4. Adjustment record created with trigger `PRODUCT_CONFIG_CHANGE`.
 */
import { BnplCreditLineStatus } from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { BnplCreditLineService } from '../bnpl-credit-line.service';
import {
  AdjustmentTrigger,
  BnplCreditLineAdjustmentService,
} from '../bnpl-credit-line-adjustment.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const PRODUCT_ID = '44444444-4444-4444-4444-444444444444';
const LINE_ID = '55555555-5555-5555-5555-555555555555';
const ADJ_ID = '66666666-6666-6666-6666-666666666666';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const SUBSCRIPTION_ID = '33333333-3333-3333-3333-333333333333';

function makeLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LINE_ID,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    subscriptionId: SUBSCRIPTION_ID,
    productId: PRODUCT_ID,
    approvedLimit: '1000.0000' as unknown as { toString(): string },
    availableLimit: '600.0000' as unknown as { toString(): string },
    currency: 'GHS',
    status: BnplCreditLineStatus.active,
    lastReviewedAt: null,
    nextReviewAt: null,
    expiresAt: null,
    suspendedAt: null,
    suspendedReason: null,
    closedAt: null,
    closedReason: null,
    activatedAt: new Date(),
    metadata: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeService() {
  const bnplCreditLine = {
    findMany: jest.fn(),
    update: jest.fn(),
  };
  const bnplCreditLineAdjustment = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
  };
  const product = { findFirst: jest.fn().mockResolvedValue({ bnplConfig: null }) };
  const bnplTransaction = { count: jest.fn().mockResolvedValue(0) };
  const installmentSchedule = {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const scoringResult = { findMany: jest.fn().mockResolvedValue([]) };

  const prisma = {
    bnplCreditLine,
    bnplCreditLineAdjustment,
    product,
    bnplTransaction,
    installmentSchedule,
    scoringResult,
    $transaction: async <T,>(cb: (tx: typeof prisma) => Promise<T>) => cb(prisma),
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

  return { service, prisma, eventBus, bnplCreditLine, bnplCreditLineAdjustment };
}

describe('BnplCreditLineAdjustmentService.evaluateProductConfigChange', () => {
  it('scenario 1: maxAmount reduced below approvedLimit → line is capped and adjustment created', async () => {
    const { service, bnplCreditLine, bnplCreditLineAdjustment, eventBus } =
      makeService();

    // Line at 1000 (available=600), new max is 800.
    bnplCreditLine.findMany.mockResolvedValue([makeLine()]);
    bnplCreditLineAdjustment.create.mockResolvedValue({
      id: ADJ_ID,
      triggeredBy: AdjustmentTrigger.PRODUCT_CONFIG_CHANGE,
      newLimit: '800.0000',
    });

    const results = await service.evaluateProductConfigChange(
      TENANT_ID,
      PRODUCT_ID,
      { newMaxAmount: '800.0000', changeDescription: 'Product ceiling lowered' },
    );

    expect(results).toHaveLength(1);

    // Line update: approvedLimit should be capped to 800.
    const updateCall = bnplCreditLine.update.mock.calls[0][0];
    expect(updateCall.data.approvedLimit).toBe('800.0000');

    // availableLimit (was 600/1000 = 60%) should scale to 60% of 800 = 480.
    expect(updateCall.data.availableLimit).toBe('480.0000');

    // Adjustment record persisted with correct trigger.
    const adjCall = bnplCreditLineAdjustment.create.mock.calls[0][0];
    expect(adjCall.data.previousLimit).toBe('1000.0000');
    expect(adjCall.data.newLimit).toBe('800.0000');
    expect(adjCall.data.triggeredBy).toBe(AdjustmentTrigger.PRODUCT_CONFIG_CHANGE);
    expect(adjCall.data.adjustmentType).toBe('decrease');

    // Event emitted.
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.BNPL_CREDIT_LIMIT_ADJUSTED,
      TENANT_ID,
      expect.objectContaining({
        creditLineId: LINE_ID,
        previousLimit: '1000.0000',
        newLimit: '800.0000',
        triggeredBy: AdjustmentTrigger.PRODUCT_CONFIG_CHANGE,
      }),
    );
  });

  it('scenario 2: maxAmount increased → no change to existing lines', async () => {
    const { service, bnplCreditLine, bnplCreditLineAdjustment, eventBus } =
      makeService();

    // Line at 1000, new max is 1500 (increase — should not touch lines).
    bnplCreditLine.findMany.mockResolvedValue([makeLine()]);

    const results = await service.evaluateProductConfigChange(
      TENANT_ID,
      PRODUCT_ID,
      { newMaxAmount: '1500.0000' },
    );

    expect(results).toHaveLength(0);
    expect(bnplCreditLine.update).not.toHaveBeenCalled();
    expect(bnplCreditLineAdjustment.create).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('scenario 3: maxAmount reduced but line approvedLimit already at or below new max → no change', async () => {
    const { service, bnplCreditLine, bnplCreditLineAdjustment } = makeService();

    // Line at 700 (below new max of 800) — no adjustment needed.
    bnplCreditLine.findMany.mockResolvedValue([
      makeLine({ approvedLimit: '700.0000', availableLimit: '400.0000' }),
    ]);

    const results = await service.evaluateProductConfigChange(
      TENANT_ID,
      PRODUCT_ID,
      { newMaxAmount: '800.0000' },
    );

    expect(results).toHaveLength(0);
    expect(bnplCreditLine.update).not.toHaveBeenCalled();
    expect(bnplCreditLineAdjustment.create).not.toHaveBeenCalled();
  });

  it('scenario 4: adjustment record has trigger PRODUCT_CONFIG_CHANGE and reasonCode product_config_change', async () => {
    const { service, bnplCreditLine, bnplCreditLineAdjustment } = makeService();

    bnplCreditLine.findMany.mockResolvedValue([makeLine()]);
    bnplCreditLineAdjustment.create.mockResolvedValue({
      id: ADJ_ID,
      triggeredBy: AdjustmentTrigger.PRODUCT_CONFIG_CHANGE,
    });

    await service.evaluateProductConfigChange(
      TENANT_ID,
      PRODUCT_ID,
      { newMaxAmount: '500.0000' },
    );

    const adjCall = bnplCreditLineAdjustment.create.mock.calls[0][0];
    expect(adjCall.data.triggeredBy).toBe(AdjustmentTrigger.PRODUCT_CONFIG_CHANGE);
    expect(adjCall.data.reasonCode).toBe('product_config_change');
  });

  it('handles no active credit lines gracefully — returns empty array', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findMany.mockResolvedValue([]);

    const results = await service.evaluateProductConfigChange(
      TENANT_ID,
      PRODUCT_ID,
      { newMaxAmount: '500.0000' },
    );

    expect(results).toHaveLength(0);
  });

  it('queries only ACTIVE and non-deleted credit lines for the product', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findMany.mockResolvedValue([]);

    await service.evaluateProductConfigChange(
      TENANT_ID,
      PRODUCT_ID,
      { newMaxAmount: '500.0000' },
    );

    expect(bnplCreditLine.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        productId: PRODUCT_ID,
        status: BnplCreditLineStatus.active,
        deletedAt: null,
      },
    });
  });
});
