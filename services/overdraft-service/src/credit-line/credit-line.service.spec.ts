/**
 * Credit line service — focuses on the pure state-machine logic
 * (`assertTransitionAllowed`) plus the limit-bounds and KYC-gating logic
 * added in Sprint 10B (BA findings F1, F2, F3). The full activation flow
 * is exercised by integration tests against a live database in Sprint 11.
 */

import { CreditLineService } from './credit-line.service';
import { CreditLineStatus, CustomerStatus, ProductStatus, ProductType } from '@lons/database';

describe('CreditLineService.assertTransitionAllowed', () => {
  const service = new CreditLineService(null as any, null as any, null as any);

  describe('valid transitions', () => {
    it('pending_activation → active', () => {
      expect(() =>
        service.assertTransitionAllowed(CreditLineStatus.pending_activation, CreditLineStatus.active),
      ).not.toThrow();
    });

    it.each([
      [CreditLineStatus.frozen],
      [CreditLineStatus.suspended],
      [CreditLineStatus.closed],
      [CreditLineStatus.expired],
    ])('active → %s', (to) => {
      expect(() => service.assertTransitionAllowed(CreditLineStatus.active, to)).not.toThrow();
    });

    it('frozen → active', () => {
      expect(() =>
        service.assertTransitionAllowed(CreditLineStatus.frozen, CreditLineStatus.active),
      ).not.toThrow();
    });

    it('frozen → closed', () => {
      expect(() =>
        service.assertTransitionAllowed(CreditLineStatus.frozen, CreditLineStatus.closed),
      ).not.toThrow();
    });

    it('expired → closed', () => {
      expect(() =>
        service.assertTransitionAllowed(CreditLineStatus.expired, CreditLineStatus.closed),
      ).not.toThrow();
    });
  });

  describe('invalid transitions', () => {
    it('rejects pending_activation → frozen', () => {
      expect(() =>
        service.assertTransitionAllowed(CreditLineStatus.pending_activation, CreditLineStatus.frozen),
      ).toThrow(/Invalid credit line status transition/);
    });

    it('rejects pending_activation → closed', () => {
      expect(() =>
        service.assertTransitionAllowed(CreditLineStatus.pending_activation, CreditLineStatus.closed),
      ).toThrow();
    });

    it('rejects closed → anything', () => {
      for (const to of [
        CreditLineStatus.pending_activation,
        CreditLineStatus.active,
        CreditLineStatus.frozen,
        CreditLineStatus.suspended,
        CreditLineStatus.expired,
      ]) {
        expect(() => service.assertTransitionAllowed(CreditLineStatus.closed, to)).toThrow();
      }
    });

    it('rejects frozen → suspended', () => {
      expect(() =>
        service.assertTransitionAllowed(CreditLineStatus.frozen, CreditLineStatus.suspended),
      ).toThrow();
    });

    it('rejects expired → active', () => {
      expect(() =>
        service.assertTransitionAllowed(CreditLineStatus.expired, CreditLineStatus.active),
      ).toThrow();
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sprint 10B BA fixes — F1, F2, F3
// ───────────────────────────────────────────────────────────────────────────

const TENANT = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const PRODUCT_ID = '33333333-3333-3333-3333-333333333333';
const LENDER_ID = '44444444-4444-4444-4444-444444444444';
const CREDIT_LINE_ID = '55555555-5555-5555-5555-555555555555';

const baseCustomer = {
  id: CUSTOMER_ID,
  tenantId: TENANT,
  status: CustomerStatus.active,
  kycLevel: 'tier_2',
  deletedAt: null,
};

const baseProduct = {
  id: PRODUCT_ID,
  tenantId: TENANT,
  code: 'OD_BASIC',
  type: ProductType.overdraft,
  status: ProductStatus.active,
  lenderId: LENDER_ID,
  currency: 'GHS',
  minAmount: 100,
  maxAmount: 10000,
  interestRate: '0.10',
  eligibilityRules: { minKycLevel: 'tier_1' } as Record<string, unknown>,
  overdraftConfig: {} as Record<string, unknown>,
  deletedAt: null,
};

function makeMocks() {
  const prisma = {
    customer: { findFirst: jest.fn() },
    product: { findFirst: jest.fn() },
    creditLine: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    creditLimitChange: { create: jest.fn() },
    walletAccountMapping: { upsert: jest.fn() },
    $transaction: jest.fn(async (fn: any) =>
      fn({
        creditLimitChange: { create: jest.fn() },
        creditLine: { update: jest.fn(async (args: any) => ({ ...args.data, id: CREDIT_LINE_ID })) },
      }),
    ),
  };
  const eventBus = { emitAndBuild: jest.fn() };
  const cache = { put: jest.fn(), invalidate: jest.fn() };
  return { prisma, eventBus, cache };
}

describe('CreditLineService.activateCreditLine — F1: minAmount floor', () => {
  it('floors recommendedLimit at product.minAmount when scoring engine returns a tiny limit', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.customer.findFirst.mockResolvedValue(baseCustomer);
    prisma.product.findFirst.mockResolvedValue(baseProduct);
    prisma.creditLine.findUnique.mockResolvedValue(null);
    prisma.creditLine.create.mockImplementation(async (args: any) => ({
      ...args.data,
      id: CREDIT_LINE_ID,
    }));

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    const result = await service.activateCreditLine(TENANT, {
      customerId: CUSTOMER_ID,
      productCode: 'OD_BASIC',
      recommendedLimit: '1', // well below the 100 floor
    });

    expect(result.approvedLimit).toBe('100.0000');
    const created = prisma.creditLine.create.mock.calls[0][0].data;
    expect(created.approvedLimit).toBe('100.0000');
    expect(created.availableBalance).toBe('100.0000');
  });
});

describe('CreditLineService.adjustLimit — F2: allow newLimit below outstanding', () => {
  it('accepts newLimit < outstandingAmount and clamps availableBalance to 0', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue({
      id: CREDIT_LINE_ID,
      tenantId: TENANT,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      currency: 'GHS',
      status: CreditLineStatus.active,
      approvedLimit: '1000',
      outstandingAmount: '800',
      interestRate: '0.10',
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(
      service.adjustLimit(TENANT, CREDIT_LINE_ID, {
        newLimit: '500',
        reasonCode: 'risk_review',
        triggeredBy: 'risk_team',
      }),
    ).resolves.toBeDefined();

    expect(prisma.$transaction).toHaveBeenCalled();
    const cachePutArg = cache.put.mock.calls[0][0];
    expect(cachePutArg.creditLine.approvedLimit).toBe('500');
    expect(cachePutArg.creditLine.availableBalance).toBe('0.0000');
  });

  it('still rejects negative newLimit', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue({
      id: CREDIT_LINE_ID,
      tenantId: TENANT,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      currency: 'GHS',
      status: CreditLineStatus.active,
      approvedLimit: '1000',
      outstandingAmount: '0',
      interestRate: '0.10',
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(
      service.adjustLimit(TENANT, CREDIT_LINE_ID, {
        newLimit: '-10',
        reasonCode: 'risk_review',
        triggeredBy: 'risk_team',
      }),
    ).rejects.toThrow(/non-negative/);
  });
});

describe('CreditLineService.activateCreditLine — F3: KYC level gate', () => {
  it('rejects activation when customer KYC level is below product minimum', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.customer.findFirst.mockResolvedValue({ ...baseCustomer, kycLevel: 'tier_1' });
    prisma.product.findFirst.mockResolvedValue({
      ...baseProduct,
      eligibilityRules: { minKycLevel: 'tier_2' },
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(
      service.activateCreditLine(TENANT, {
        customerId: CUSTOMER_ID,
        productCode: 'OD_BASIC',
        recommendedLimit: '500',
      }),
    ).rejects.toThrow(/KYC level 'tier_1' is below product minimum 'tier_2'/);
    expect(prisma.creditLine.create).not.toHaveBeenCalled();
  });

  it('allows activation when customer KYC meets product minimum', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.customer.findFirst.mockResolvedValue({ ...baseCustomer, kycLevel: 'tier_2' });
    prisma.product.findFirst.mockResolvedValue({
      ...baseProduct,
      eligibilityRules: { minKycLevel: 'tier_2' },
    });
    prisma.creditLine.findUnique.mockResolvedValue(null);
    prisma.creditLine.create.mockImplementation(async (args: any) => ({
      ...args.data,
      id: CREDIT_LINE_ID,
    }));

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(
      service.activateCreditLine(TENANT, {
        customerId: CUSTOMER_ID,
        productCode: 'OD_BASIC',
        recommendedLimit: '500',
      }),
    ).resolves.toMatchObject({ creditLineId: CREDIT_LINE_ID });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sprint 11 — A2 + A3: penalty waiver, suspend/reinstate, limit-review event
// ───────────────────────────────────────────────────────────────────────────

const baseCreditLine = {
  id: CREDIT_LINE_ID,
  tenantId: TENANT,
  customerId: CUSTOMER_ID,
  productId: PRODUCT_ID,
  currency: 'GHS',
  status: CreditLineStatus.active,
  approvedLimit: '1000',
  outstandingAmount: '0',
  interestRate: '0.10',
  penaltiesAccrued: '50',
};

describe('CreditLineService.waivePenalties — A2', () => {
  it('subtracts the waiver amount from penaltiesAccrued and emits PENALTY_WAIVED', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue(baseCreditLine);

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await service.waivePenalties(TENANT, CREDIT_LINE_ID, {
      amount: '30',
      reason: 'goodwill — first-time delinquency',
      operatorId: 'op-123',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(cache.invalidate).toHaveBeenCalledWith(TENANT, CUSTOMER_ID, PRODUCT_ID);
    const emit = eventBus.emitAndBuild.mock.calls[0];
    expect(emit[0]).toBe('penalty.waived');
    expect(emit[2]).toMatchObject({
      creditLineId: CREDIT_LINE_ID,
      waivedAmount: '30',
      previousPenalties: '50',
      remainingPenalties: '20.0000',
      operatorId: 'op-123',
    });
  });

  it('rejects waivers that exceed the current penaltiesAccrued', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue(baseCreditLine);

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(
      service.waivePenalties(TENANT, CREDIT_LINE_ID, {
        amount: '100',
        reason: 'over-waiver',
        operatorId: 'op-123',
      }),
    ).rejects.toThrow(/exceeds penaltiesAccrued/);
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('rejects non-positive waiver amounts', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue(baseCreditLine);

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(
      service.waivePenalties(TENANT, CREDIT_LINE_ID, {
        amount: '0',
        reason: 'zero-waiver',
        operatorId: 'op-123',
      }),
    ).rejects.toThrow(/must be positive/);
  });
});

describe('CreditLineService.suspend / reinstate — A3', () => {
  it('suspends an active credit line and emits CREDITLINE_SUSPENDED', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue(baseCreditLine);
    prisma.creditLine.update.mockResolvedValue({
      ...baseCreditLine,
      status: CreditLineStatus.suspended,
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await service.suspend(TENANT, CREDIT_LINE_ID, 'periodic_review');

    const emit = eventBus.emitAndBuild.mock.calls[0];
    expect(emit[0]).toBe('creditline.suspended');
    expect(emit[2]).toMatchObject({
      creditLineId: CREDIT_LINE_ID,
      reason: 'periodic_review',
    });
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('rejects suspending from an invalid state (e.g. closed)', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue({
      ...baseCreditLine,
      status: CreditLineStatus.closed,
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(service.suspend(TENANT, CREDIT_LINE_ID, 'x')).rejects.toThrow(
      /Invalid credit line status transition/,
    );
  });

  it('reinstates a suspended credit line and emits CREDITLINE_REINSTATED', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue({
      ...baseCreditLine,
      status: CreditLineStatus.suspended,
    });
    prisma.creditLine.update.mockResolvedValue({
      ...baseCreditLine,
      status: CreditLineStatus.active,
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await service.reinstate(TENANT, CREDIT_LINE_ID);

    const emit = eventBus.emitAndBuild.mock.calls[0];
    expect(emit[0]).toBe('creditline.reinstated');
    expect(emit[2]).toMatchObject({ creditLineId: CREDIT_LINE_ID, customerId: CUSTOMER_ID });
  });

  it('rejects reinstating a credit line that is not suspended', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue(baseCreditLine);

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(service.reinstate(TENANT, CREDIT_LINE_ID)).rejects.toThrow(/not suspended/);
  });
});

describe('CreditLineService.scheduleLimitReview — A3', () => {
  it('emits CREDITLINE_LIMIT_REVIEW_SCHEDULED with the scheduled time', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue(baseCreditLine);

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    const scheduledFor = new Date('2026-06-01T00:00:00Z');
    await service.scheduleLimitReview(TENANT, CREDIT_LINE_ID, scheduledFor);

    const emit = eventBus.emitAndBuild.mock.calls[0];
    expect(emit[0]).toBe('creditline.limit.review_scheduled');
    expect(emit[2]).toMatchObject({
      creditLineId: CREDIT_LINE_ID,
      scheduledFor: '2026-06-01T00:00:00.000Z',
      reasonCode: 'periodic_review',
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sprint 11 A12 — freeze / unfreeze / deactivate coverage
// ───────────────────────────────────────────────────────────────────────────

describe('CreditLineService.freeze / unfreeze — A12', () => {
  it('freezes an active credit line and emits CREDITLINE_FROZEN', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue(baseCreditLine);
    prisma.creditLine.update.mockResolvedValue({
      ...baseCreditLine,
      status: CreditLineStatus.frozen,
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await service.freeze(TENANT, CREDIT_LINE_ID, 'fraud_suspected');

    expect(eventBus.emitAndBuild.mock.calls[0][0]).toBe('creditline.frozen');
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('rejects freezing a closed credit line', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue({
      ...baseCreditLine,
      status: CreditLineStatus.closed,
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(service.freeze(TENANT, CREDIT_LINE_ID, 'r')).rejects.toThrow(
      /Invalid credit line status transition/,
    );
  });

  it('unfreezes a frozen credit line and clears frozenAt/frozenReason', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue({
      ...baseCreditLine,
      status: CreditLineStatus.frozen,
    });
    prisma.creditLine.update.mockResolvedValue({
      ...baseCreditLine,
      status: CreditLineStatus.active,
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await service.unfreeze(TENANT, CREDIT_LINE_ID);

    expect(prisma.creditLine.update).toHaveBeenCalledWith({
      where: { id: CREDIT_LINE_ID },
      data: expect.objectContaining({
        status: CreditLineStatus.active,
        frozenAt: null,
        frozenReason: null,
      }),
    });
    expect(eventBus.emitAndBuild.mock.calls[0][0]).toBe('creditline.unfrozen');
  });

  it('rejects unfreezing when the credit line is not frozen', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue(baseCreditLine);

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(service.unfreeze(TENANT, CREDIT_LINE_ID)).rejects.toThrow(/not frozen/);
  });
});

describe('CreditLineService.activateCreditLine — FIX 3 (wallet mapping)', () => {
  it('upserts a WalletAccountMapping when the customer has wallet metadata', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.customer.findFirst.mockResolvedValue({
      ...baseCustomer,
      metadata: { walletId: 'WALLET_123', walletProvider: 'mtn_momo' },
    });
    prisma.product.findFirst.mockResolvedValue(baseProduct);
    prisma.creditLine.findUnique.mockResolvedValue(null);
    prisma.creditLine.create.mockImplementation(async (args: any) => ({
      ...args.data,
      id: CREDIT_LINE_ID,
    }));

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await service.activateCreditLine(TENANT, {
      customerId: CUSTOMER_ID,
      productCode: 'OD_BASIC',
      recommendedLimit: '500',
    });

    expect(prisma.walletAccountMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_walletId: { provider: 'mtn_momo', walletId: 'WALLET_123' } },
        create: expect.objectContaining({
          tenantId: TENANT,
          customerId: CUSTOMER_ID,
          walletId: 'WALLET_123',
          provider: 'mtn_momo',
          isPrimary: true,
        }),
        update: {},
      }),
    );
  });

  it('skips wallet mapping when the customer has no wallet metadata', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.customer.findFirst.mockResolvedValue({ ...baseCustomer, metadata: null });
    prisma.product.findFirst.mockResolvedValue(baseProduct);
    prisma.creditLine.findUnique.mockResolvedValue(null);
    prisma.creditLine.create.mockImplementation(async (args: any) => ({
      ...args.data,
      id: CREDIT_LINE_ID,
    }));

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await service.activateCreditLine(TENANT, {
      customerId: CUSTOMER_ID,
      productCode: 'OD_BASIC',
      recommendedLimit: '500',
    });

    expect(prisma.walletAccountMapping.upsert).not.toHaveBeenCalled();
  });

  it('skips wallet mapping when walletId is set but walletProvider is missing', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.customer.findFirst.mockResolvedValue({
      ...baseCustomer,
      metadata: { walletId: 'WALLET_123' }, // no provider
    });
    prisma.product.findFirst.mockResolvedValue(baseProduct);
    prisma.creditLine.findUnique.mockResolvedValue(null);
    prisma.creditLine.create.mockImplementation(async (args: any) => ({
      ...args.data,
      id: CREDIT_LINE_ID,
    }));

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await service.activateCreditLine(TENANT, {
      customerId: CUSTOMER_ID,
      productCode: 'OD_BASIC',
      recommendedLimit: '500',
    });

    // The activation succeeds; mapping just isn't created (legacy webhook
    // fallback handles such customers until ops backfills the provider).
    expect(prisma.walletAccountMapping.upsert).not.toHaveBeenCalled();
  });
});

describe('CreditLineService.deactivateCreditLine — A12', () => {
  it('rejects deactivation when any balance is non-zero', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue({
      ...baseCreditLine,
      outstandingAmount: '100',
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await expect(service.deactivateCreditLine(TENANT, CREDIT_LINE_ID)).rejects.toThrow(
      /must be zero/,
    );
  });

  it('transitions to closed when all balances are zero, emits CREDITLINE_CLOSED', async () => {
    const { prisma, eventBus, cache } = makeMocks();
    prisma.creditLine.findFirst.mockResolvedValue({
      ...baseCreditLine,
      outstandingAmount: '0',
      interestAccrued: '0',
      feesOutstanding: '0',
      penaltiesAccrued: '0',
    });
    prisma.creditLine.update.mockResolvedValue({
      ...baseCreditLine,
      status: CreditLineStatus.closed,
    });

    const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
    await service.deactivateCreditLine(TENANT, CREDIT_LINE_ID);

    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('creditline.closed');
  });
});
