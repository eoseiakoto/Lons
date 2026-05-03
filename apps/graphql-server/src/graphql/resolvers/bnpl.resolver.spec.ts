/**
 * BNPL resolver — Sprint 11 Track B / B10. Smoke tests verifying that
 * resolvers correctly delegate to their service dependencies. Service
 * logic itself is exhaustively tested in process-engine.
 */

import { BnplResolver } from './bnpl.resolver';

const TENANT = '11111111-1111-1111-1111-111111111111';
const TX_ID = '22222222-2222-2222-2222-222222222222';
const MERCHANT_ID = '33333333-3333-3333-3333-333333333333';
const USER: any = { userId: 'user-1', tenantId: TENANT };

function makeResolver(overrides: Partial<any> = {}) {
  const prisma = {
    bnplTransaction: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    installmentSchedule: { findMany: jest.fn().mockResolvedValue([]) },
    merchant: { findFirst: jest.fn() },
    ...overrides.prisma,
  };
  const origination = {
    initiate: jest.fn().mockResolvedValue({
      transactionId: TX_ID,
      status: 'approved',
      totalRepayable: '120.0000',
      installments: [],
    }),
    ...overrides.origination,
  };
  const eligibility = {
    check: jest.fn().mockResolvedValue({
      eligible: true,
      maxAmount: '1000',
      approvedAmount: '120',
      availableInstallmentPlans: [3, 4, 6],
      interestRate: '0',
      monthlyAmount: '40.0000',
    }),
    ...overrides.eligibility,
  };
  const installment = {
    processInstallmentPayment: jest.fn().mockResolvedValue({
      installmentPaidInFull: true,
      transactionCompleted: false,
      paidAmount: '40.0000',
    }),
    ...overrides.installment,
  };
  const refund = {
    initiate: jest.fn().mockResolvedValue({
      refundedToCustomer: '0.0000',
      clawedBackFromMerchant: '120.0000',
      cancelledInstallments: 1,
      reducedInstallments: 0,
    }),
    ...overrides.refund,
  };
  const merchantService = {
    create: jest.fn().mockResolvedValue({ id: MERCHANT_ID, code: 'M1' }),
    update: jest.fn().mockResolvedValue({ id: MERCHANT_ID }),
    activate: jest.fn().mockResolvedValue({ id: MERCHANT_ID, status: 'active' }),
    suspend: jest.fn().mockResolvedValue({ id: MERCHANT_ID, status: 'suspended' }),
    reactivate: jest.fn().mockResolvedValue({ id: MERCHANT_ID, status: 'active' }),
    deactivate: jest.fn().mockResolvedValue({ id: MERCHANT_ID, status: 'deactivated' }),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    ...overrides.merchantService,
  };
  const resolver = new BnplResolver(
    prisma as any,
    origination as any,
    eligibility as any,
    installment as any,
    refund as any,
    merchantService as any,
  );
  return { resolver, prisma, origination, eligibility, installment, refund, merchantService };
}

describe('BnplResolver — queries', () => {
  it('bnplTransaction returns null when transaction is missing', async () => {
    const { resolver } = makeResolver({
      prisma: { bnplTransaction: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() } },
    });
    const result = await resolver.bnplTransaction(TENANT, TX_ID);
    expect(result).toBeNull();
  });

  it('bnplTransactions filters by status + customerId and emits cursor when over page size', async () => {
    const items = [
      { id: 'a', createdAt: new Date() },
      { id: 'b', createdAt: new Date() },
      { id: 'c', createdAt: new Date() },
    ];
    const { resolver, prisma } = makeResolver({
      prisma: {
        bnplTransaction: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue(items),
          // FIX 11: resolver now does a real count query for totalCount.
          count: jest.fn().mockResolvedValue(items.length),
        },
      },
    });
    const out = await resolver.bnplTransactions(TENANT, 2, undefined, {
      status: 'approved',
      customerId: 'cust-1',
    });
    expect(out.edges).toHaveLength(2);
    expect(out.pageInfo.hasNextPage).toBe(true);
    expect(prisma.bnplTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          customerId: 'cust-1',
          status: 'approved',
        }),
      }),
    );
  });

  it('installmentSchedule throws when transaction is missing', async () => {
    const { resolver } = makeResolver({
      prisma: {
        bnplTransaction: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
        installmentSchedule: { findMany: jest.fn() },
      },
    });
    await expect(resolver.installmentSchedule(TENANT, TX_ID)).rejects.toThrow();
  });

  it('bnplEligibility delegates to the eligibility service', async () => {
    const { resolver, eligibility } = makeResolver();
    const out = await resolver.bnplEligibility(TENANT, 'M1', 'cust-1', '120', 'GHS');
    expect(eligibility.check).toHaveBeenCalledWith(TENANT, {
      merchantCode: 'M1',
      customerId: 'cust-1',
      amount: '120',
      currency: 'GHS',
    });
    expect(out.eligible).toBe(true);
  });
});

describe('BnplResolver — mutations', () => {
  it('initiateBnplPurchase delegates to origination', async () => {
    const { resolver, origination } = makeResolver();
    const result = await resolver.initiateBnplPurchase(TENANT, {
      merchantCode: 'M1',
      customerId: 'cust-1',
      purchaseAmount: '120',
      currency: 'GHS',
      numberOfInstallments: 3,
      purchaseRef: 'order-1',
      idempotencyKey: 'idem-1',
    });
    expect(origination.initiate).toHaveBeenCalled();
    expect(result.transactionId).toBe(TX_ID);
  });

  it('cancelBnplTransaction delegates to refund.initiate with type=full', async () => {
    const { resolver, refund } = makeResolver();
    const result = await resolver.cancelBnplTransaction(
      TENANT,
      USER,
      TX_ID,
      'merchandise_returned',
      'idem-1',
    );
    expect(refund.initiate).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ transactionId: TX_ID, type: 'full', operatorId: USER.userId }),
    );
    expect(result).toEqual({ transactionId: TX_ID, success: true });
  });

  it('processInstallmentPayment delegates to installment service', async () => {
    const { resolver, installment } = makeResolver();
    const result = await resolver.processInstallmentPayment(
      TENANT,
      'inst-1',
      '40',
      'idem-1',
    );
    // FIX 12 + FIX 16: idempotencyKey is now passed through to the
    // service as a 4th argument.
    expect(installment.processInstallmentPayment).toHaveBeenCalledWith(
      TENANT,
      'inst-1',
      '40',
      'idem-1',
    );
    expect(result.installmentPaidInFull).toBe(true);
  });

  it('initiateBnplRefund passes operatorId from CurrentUser', async () => {
    const { resolver, refund } = makeResolver();
    await resolver.initiateBnplRefund(TENANT, USER, {
      transactionId: TX_ID,
      amount: '40',
      type: 'partial' as any,
      reason: 'damage',
      idempotencyKey: 'idem-1',
    });
    expect(refund.initiate).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ operatorId: USER.userId, type: 'partial' }),
    );
  });

  it('createMerchant delegates with the configured discount rate', async () => {
    const { resolver, merchantService } = makeResolver();
    await resolver.createMerchant(
      TENANT,
      {
        name: 'Acme',
        code: 'ACME',
        discountRate: '0.025',
      },
      'idem-create',
    );
    expect(merchantService.create).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ name: 'Acme', discountRate: '0.025' }),
    );
  });

  it('suspendMerchant rejects empty reason before calling service', async () => {
    const { resolver, merchantService } = makeResolver();
    await expect(
      resolver.suspendMerchant(TENANT, MERCHANT_ID, '   ', 'idem-1'),
    ).rejects.toThrow(/reason is required/);
    expect(merchantService.suspend).not.toHaveBeenCalled();
  });

  it('activateMerchant / reactivateMerchant / deactivateMerchant pass through', async () => {
    const { resolver, merchantService } = makeResolver();
    await resolver.activateMerchant(TENANT, MERCHANT_ID, 'idem-a');
    await resolver.reactivateMerchant(TENANT, MERCHANT_ID, 'idem-r');
    await resolver.deactivateMerchant(TENANT, MERCHANT_ID, 'idem-d');
    expect(merchantService.activate).toHaveBeenCalledWith(TENANT, MERCHANT_ID);
    expect(merchantService.reactivate).toHaveBeenCalledWith(TENANT, MERCHANT_ID);
    expect(merchantService.deactivate).toHaveBeenCalledWith(TENANT, MERCHANT_ID);
  });
});
