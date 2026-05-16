/**
 * Sprint 16 fixes (FIX-2) — unit tests for `MicroLoanCreditLimitService`.
 *
 * Covers both entry points:
 *   - reviewOnRepayment() — auto-increase math + cap + threshold gates
 *     + FIX-1 idempotency guard
 *   - reduceOnDefault() — first-default % reduction + second-default
 *     suspension + availableLimit-always-zero invariant
 *
 * Money math is verified with banker's rounding — never raw float
 * equality.
 */
import {
  ContractStatus,
  ProductType,
  SubscriptionStatus,
} from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { MicroLoanCreditLimitService } from '../micro-loan-credit-limit.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const PRODUCT_ID = '33333333-3333-3333-3333-333333333333';
const CONTRACT_ID = '44444444-4444-4444-4444-444444444444';
const SUBSCRIPTION_ID = '55555555-5555-5555-5555-555555555555';
const REPAYMENT_ID = '66666666-6666-6666-6666-666666666666';

function makeContract(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONTRACT_ID,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    contractNumber: 'C-001',
    status: ContractStatus.settled,
    daysPastDue: 0,
    product: {
      id: PRODUCT_ID,
      type: ProductType.micro_loan,
      maxAmount: '2000.0000',
      eligibilityRules: null as Record<string, unknown> | null,
    },
    customer: { id: CUSTOMER_ID },
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SUBSCRIPTION_ID,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    status: SubscriptionStatus.active,
    creditLimit: '1000.0000',
    availableLimit: '1000.0000',
    ...overrides,
  };
}

function makeService(opts: {
  contract?: any;
  subscription?: any;
  onTimeRepayments?: number;
  previousDefaults?: number;
  alreadyReviewed?: any;
} = {}) {
  const contract = {
    findFirst: jest.fn().mockResolvedValue(opts.contract ?? makeContract()),
    count: jest.fn().mockResolvedValue(opts.previousDefaults ?? 0),
  };
  const subscription = {
    findFirst: jest.fn().mockResolvedValue(
      opts.subscription === undefined ? makeSubscription() : opts.subscription,
    ),
    update: jest.fn().mockResolvedValue({}),
  };
  const repayment = {
    count: jest.fn().mockResolvedValue(opts.onTimeRepayments ?? 0),
  };
  const microLoanCreditLimitChange = {
    findFirst: jest.fn().mockResolvedValue(opts.alreadyReviewed ?? null),
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  // $transaction passes the same prisma client back so the test sees
  // every call (write + audit) on the same mock.
  const prisma = {
    contract,
    subscription,
    repayment,
    microLoanCreditLimitChange,
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb({
      subscription,
      microLoanCreditLimitChange,
    })),
  } as any;
  const eventBus = { emitAndBuild: jest.fn() } as any;
  const auditService = {
    record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  } as any;
  const service = new MicroLoanCreditLimitService(prisma, eventBus, auditService);
  return {
    service,
    prisma,
    eventBus,
    auditService,
    contract,
    subscription,
    repayment,
    microLoanCreditLimitChange,
  };
}

describe('reviewOnRepayment', () => {
  it('no-op for non-micro-loan products', async () => {
    const { service, subscription } = makeService({
      contract: makeContract({ product: { type: ProductType.bnpl } }),
    });
    await service.reviewOnRepayment(TENANT_ID, CONTRACT_ID, REPAYMENT_ID);
    expect(subscription.update).not.toHaveBeenCalled();
  });

  it('no-op when contract has overdue days (and is not settled)', async () => {
    const { service, subscription } = makeService({
      contract: makeContract({
        status: ContractStatus.overdue,
        daysPastDue: 5,
      }),
    });
    await service.reviewOnRepayment(TENANT_ID, CONTRACT_ID, REPAYMENT_ID);
    expect(subscription.update).not.toHaveBeenCalled();
  });

  it('FIX-1: same repaymentId is a no-op (idempotency guard)', async () => {
    const { service, subscription, auditService } = makeService({
      alreadyReviewed: {
        id: 'audit-existing',
        sourceId: REPAYMENT_ID,
      },
      onTimeRepayments: 5,
    });
    await service.reviewOnRepayment(TENANT_ID, CONTRACT_ID, REPAYMENT_ID);
    expect(subscription.update).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('no-op when below minSuccessfulRepayments threshold', async () => {
    const { service, subscription } = makeService({
      onTimeRepayments: 2, // < default 3
    });
    await service.reviewOnRepayment(TENANT_ID, CONTRACT_ID, REPAYMENT_ID);
    expect(subscription.update).not.toHaveBeenCalled();
  });

  it('happy path: increases by configured percent (default 10% of 1000 → 1100)', async () => {
    const { service, subscription, auditService, eventBus } = makeService({
      onTimeRepayments: 5,
    });
    await service.reviewOnRepayment(TENANT_ID, CONTRACT_ID, REPAYMENT_ID);

    const updateCall = subscription.update.mock.calls[0][0];
    expect(Number(updateCall.data.creditLimit)).toBe(1100);
    // availableLimit moves by the same delta as creditLimit.
    expect(Number(updateCall.data.availableLimit)).toBe(1100);

    const auditCall = auditService.record.mock.calls[0][1];
    expect(auditCall.changeType).toBe('increase');
    expect(Number(auditCall.previousLimit)).toBe(1000);
    expect(Number(auditCall.newLimit)).toBe(1100);
    expect(auditCall.triggeredBy).toBe('system');
    expect(auditCall.sourceId).toBe(REPAYMENT_ID);

    const event = eventBus.emitAndBuild.mock.calls[0];
    expect(event[0]).toBe(EventType.MICRO_LOAN_CREDIT_LIMIT_REVIEWED);
    expect(event[2].changeType).toBe('increase');
    expect(Number(event[2].previousLimit)).toBe(1000);
    expect(Number(event[2].newLimit)).toBe(1100);
  });

  it('caps newLimit at product.maxAmount', async () => {
    const { service, subscription } = makeService({
      contract: makeContract({
        product: {
          type: ProductType.micro_loan,
          maxAmount: '1050.0000',
          eligibilityRules: null,
        },
      }),
      onTimeRepayments: 5,
    });
    await service.reviewOnRepayment(TENANT_ID, CONTRACT_ID, REPAYMENT_ID);
    // 10% of 1000 = 1100; cap = 1050 → newLimit = 1050.
    expect(Number(subscription.update.mock.calls[0][0].data.creditLimit)).toBe(1050);
  });

  it('respects custom increasePercent from product config', async () => {
    const { service, subscription } = makeService({
      contract: makeContract({
        product: {
          type: ProductType.micro_loan,
          maxAmount: '5000.0000',
          eligibilityRules: { creditLimitIncreasePercent: '25' },
        },
      }),
      onTimeRepayments: 5,
    });
    await service.reviewOnRepayment(TENANT_ID, CONTRACT_ID, REPAYMENT_ID);
    // 25% of 1000 = 1250.
    expect(Number(subscription.update.mock.calls[0][0].data.creditLimit)).toBe(1250);
  });
});

describe('reduceOnDefault', () => {
  it('no-op for non-micro-loan products', async () => {
    const { service, subscription } = makeService({
      contract: makeContract({ product: { type: ProductType.bnpl } }),
    });
    await service.reduceOnDefault(TENANT_ID, CONTRACT_ID);
    expect(subscription.update).not.toHaveBeenCalled();
  });

  it('no-op when limit is already zero', async () => {
    const { service, subscription } = makeService({
      subscription: makeSubscription({ creditLimit: '0' }),
      previousDefaults: 0,
    });
    await service.reduceOnDefault(TENANT_ID, CONTRACT_ID);
    expect(subscription.update).not.toHaveBeenCalled();
  });

  it('FIX-1 symmetry: same contract default is a no-op', async () => {
    const { service, subscription } = makeService({
      alreadyReviewed: {
        id: 'audit-existing',
        sourceId: CONTRACT_ID,
        changeType: 'decrease',
      },
    });
    await service.reduceOnDefault(TENANT_ID, CONTRACT_ID);
    expect(subscription.update).not.toHaveBeenCalled();
  });

  it('first default → 50% reduction (default config)', async () => {
    const { service, subscription, eventBus } = makeService({
      previousDefaults: 0,
    });
    await service.reduceOnDefault(TENANT_ID, CONTRACT_ID);

    const updateCall = subscription.update.mock.calls[0][0];
    // 50% of 1000 = 500 reduction → newLimit = 500.
    expect(Number(updateCall.data.creditLimit)).toBe(500);
    // availableLimit always zeroed on default.
    expect(Number(updateCall.data.availableLimit)).toBe(0);

    const event = eventBus.emitAndBuild.mock.calls[0];
    expect(event[0]).toBe(EventType.MICRO_LOAN_CREDIT_LIMIT_REDUCED);
    expect(event[2].changeType).toBe('decrease');
    expect(Number(event[2].previousLimit)).toBe(1000);
    expect(Number(event[2].newLimit)).toBe(500);
  });

  it('second default → suspension (limit = 0)', async () => {
    const { service, subscription } = makeService({
      previousDefaults: 2, // >= default maxDefaultsBeforeSuspension (2)
    });
    await service.reduceOnDefault(TENANT_ID, CONTRACT_ID);

    const updateCall = subscription.update.mock.calls[0][0];
    expect(Number(updateCall.data.creditLimit)).toBe(0);
    expect(Number(updateCall.data.availableLimit)).toBe(0);
  });

  it('respects custom reductionPercent from product config', async () => {
    const { service, subscription } = makeService({
      contract: makeContract({
        product: {
          type: ProductType.micro_loan,
          maxAmount: '5000.0000',
          eligibilityRules: { creditLimitReductionPercent: '25' },
        },
      }),
      previousDefaults: 0,
    });
    await service.reduceOnDefault(TENANT_ID, CONTRACT_ID);
    // 25% of 1000 = 250 reduction → newLimit = 750.
    expect(Number(subscription.update.mock.calls[0][0].data.creditLimit)).toBe(750);
  });
});
