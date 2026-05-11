/**
 * Sprint 14 (S14-13) — DisbursementFeeService tests.
 *
 * Property-style coverage of the fee math:
 *   - Base rate
 *   - Product modifier (BNPL = base − 10 bps)
 *   - Volume discount bracket
 *   - Idempotency (duplicate disbursementId → no-op)
 */
import { DisbursementFeeService } from '../disbursement-fee.service';

function makeRedisStub(monthlyCount: number) {
  return {
    get: jest.fn(async () => String(monthlyCount)),
  } as never;
}

function makeBillingConfig(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 't1',
    perDisbursementBps: '75',
    microLoanRateModifier: '0',
    overdraftRateModifier: '0',
    bnplRateModifier: '-10',
    factoringRateModifier: '-20',
    volumeDiscountTiers: [
      { threshold: 500, multiplier: '0.75' },
      { threshold: 2000, multiplier: '0.50' },
    ],
    ...overrides,
  };
}

function makePrisma(opts: {
  existingFee?: unknown;
  billingConfig?: unknown;
}) {
  const createdFees: Array<Record<string, unknown>> = [];
  return {
    disbursementFee: {
      findUnique: jest.fn(async () => opts.existingFee ?? null),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        createdFees.push(args.data);
        return { id: 'fee-1', ...args.data };
      }),
    },
    tenantBillingConfig: {
      findUnique: jest.fn(async () => opts.billingConfig ?? null),
    },
    createdFees,
  } as unknown as {
    disbursementFee: { findUnique: jest.Mock; create: jest.Mock };
    tenantBillingConfig: { findUnique: jest.Mock };
    createdFees: Array<Record<string, unknown>>;
  };
}

describe('DisbursementFeeService (S14-13)', () => {
  const eventBus = { emitAndBuild: jest.fn() };

  beforeEach(() => {
    eventBus.emitAndBuild.mockClear();
  });

  it('applies base rate when no modifier and no volume discount', async () => {
    const prisma = makePrisma({
      billingConfig: makeBillingConfig({ volumeDiscountTiers: [] }),
    });
    const service = new DisbursementFeeService(
      prisma as never,
      eventBus as never,
      makeRedisStub(0),
    );

    await service.recordFee('t1', {
      disbursementId: 'd1',
      contractId: 'c1',
      amount: '10000.0000',
      currency: 'USD',
      productType: 'micro_loan',
    });

    expect(prisma.createdFees).toHaveLength(1);
    const fee = prisma.createdFees[0];
    // 75 bps + 0 modifier = 75 bps. 10000 * 75/10000 = 75.0000
    expect(fee.effectiveBps).toBe('75.00');
    expect(fee.feeAmount).toBe('75.0000');
    expect(fee.feeAmountUsd).toBe('75.0000');
    expect(fee.volumeTier).toBe('base');
  });

  it('applies product modifier (BNPL = base − 10 bps)', async () => {
    const prisma = makePrisma({
      billingConfig: makeBillingConfig({ volumeDiscountTiers: [] }),
    });
    const service = new DisbursementFeeService(
      prisma as never,
      eventBus as never,
      makeRedisStub(0),
    );

    await service.recordFee('t1', {
      disbursementId: 'd1',
      contractId: 'c1',
      amount: '10000.0000',
      currency: 'USD',
      productType: 'bnpl',
    });

    const fee = prisma.createdFees[0];
    // 75 + (-10) = 65 bps. 10000 * 65/10000 = 65.0000
    expect(fee.effectiveBps).toBe('65.00');
    expect(fee.feeAmount).toBe('65.0000');
  });

  it('applies volume discount when monthly count crosses the lower bracket', async () => {
    const prisma = makePrisma({
      billingConfig: makeBillingConfig(),
    });
    const service = new DisbursementFeeService(
      prisma as never,
      eventBus as never,
      makeRedisStub(600), // crosses 500 threshold
    );

    await service.recordFee('t1', {
      disbursementId: 'd1',
      contractId: 'c1',
      amount: '10000.0000',
      currency: 'USD',
      productType: 'micro_loan',
    });

    const fee = prisma.createdFees[0];
    // 75 bps * 0.75 = 56.25 bps. 10000 * 56.25/10000 = 56.2500
    expect(fee.effectiveBps).toBe('56.25');
    expect(fee.feeAmount).toBe('56.2500');
    expect(fee.volumeTier).toBe('500+');
  });

  it('applies the highest applicable bracket when count crosses multiple', async () => {
    const prisma = makePrisma({
      billingConfig: makeBillingConfig(),
    });
    const service = new DisbursementFeeService(
      prisma as never,
      eventBus as never,
      makeRedisStub(2500), // crosses both 500 and 2000
    );

    await service.recordFee('t1', {
      disbursementId: 'd1',
      contractId: 'c1',
      amount: '10000.0000',
      currency: 'USD',
      productType: 'micro_loan',
    });

    const fee = prisma.createdFees[0];
    // 75 * 0.5 = 37.5 bps. 10000 * 37.5/10000 = 37.5000
    expect(fee.effectiveBps).toBe('37.50');
    expect(fee.feeAmount).toBe('37.5000');
    expect(fee.volumeTier).toBe('2000+');
  });

  it('is idempotent — duplicate disbursementId is a no-op', async () => {
    const prisma = makePrisma({
      existingFee: { id: 'existing' },
      billingConfig: makeBillingConfig(),
    });
    const service = new DisbursementFeeService(
      prisma as never,
      eventBus as never,
      makeRedisStub(0),
    );

    await service.recordFee('t1', {
      disbursementId: 'd1',
      contractId: 'c1',
      amount: '10000',
      currency: 'USD',
      productType: 'micro_loan',
    });

    expect(prisma.disbursementFee.create).not.toHaveBeenCalled();
  });

  it('skips when no billing config exists for the tenant', async () => {
    const prisma = makePrisma({ billingConfig: null });
    const service = new DisbursementFeeService(
      prisma as never,
      eventBus as never,
      makeRedisStub(0),
    );

    await service.recordFee('t1', {
      disbursementId: 'd1',
      contractId: 'c1',
      amount: '10000',
      currency: 'USD',
      productType: 'micro_loan',
    });

    expect(prisma.disbursementFee.create).not.toHaveBeenCalled();
  });

  it('skips when billing config has no per-disbursement rate', async () => {
    const prisma = makePrisma({
      billingConfig: makeBillingConfig({ perDisbursementBps: null }),
    });
    const service = new DisbursementFeeService(
      prisma as never,
      eventBus as never,
      makeRedisStub(0),
    );

    await service.recordFee('t1', {
      disbursementId: 'd1',
      contractId: 'c1',
      amount: '10000',
      currency: 'USD',
      productType: 'micro_loan',
    });

    expect(prisma.disbursementFee.create).not.toHaveBeenCalled();
  });

  it('emits BILLING_FEE_RECORDED on success', async () => {
    const prisma = makePrisma({
      billingConfig: makeBillingConfig({ volumeDiscountTiers: [] }),
    });
    const service = new DisbursementFeeService(
      prisma as never,
      eventBus as never,
      makeRedisStub(0),
    );

    await service.recordFee('t1', {
      disbursementId: 'd1',
      contractId: 'c1',
      amount: '10000.0000',
      currency: 'USD',
      productType: 'micro_loan',
    });

    expect(eventBus.emitAndBuild).toHaveBeenCalledTimes(1);
    const args = eventBus.emitAndBuild.mock.calls[0];
    expect(args[0]).toBe('billing.fee.recorded');
    expect(args[1]).toBe('t1');
    expect(args[2].feeAmount).toBe('75.0000');
    expect(args[2].productType).toBe('micro_loan');
  });
});
