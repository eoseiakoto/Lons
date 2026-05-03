/**
 * BNPL origination service — Sprint 11 Track B / B4.
 * Mock-Prisma integration tests covering the validation gates and the
 * happy path that produces installments + (for IMMEDIATE merchants) a
 * settlement row.
 */

import { BnplOriginationService } from './bnpl-origination.service';
import {
  BnplTransactionStatus,
  CustomerStatus,
  MerchantStatus,
  ProductStatus,
  ProductType,
  SettlementType,
} from '@lons/database';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CUSTOMER = '22222222-2222-2222-2222-222222222222';
const MERCHANT = '33333333-3333-3333-3333-333333333333';
const PRODUCT = '44444444-4444-4444-4444-444444444444';
const LENDER = '55555555-5555-5555-5555-555555555555';
const TX_ID = '66666666-6666-6666-6666-666666666666';

function baseInput(overrides: Partial<any> = {}) {
  return {
    merchantCode: 'ACME',
    customerId: CUSTOMER,
    purchaseAmount: '120.00',
    currency: 'GHS',
    numberOfInstallments: 3,
    purchaseRef: 'order-1',
    idempotencyKey: 'idem-1',
    ...overrides,
  };
}

function makeMocks(opts: {
  existingByIdem?: any;
  merchant?: any;
  customer?: any;
  product?: any;
  existingDefault?: any;
} = {}) {
  const installmentCreateMany = jest.fn();
  const txCreate = jest.fn(async (args: any) => ({
    id: TX_ID,
    ...args.data,
  }));
  const prisma = {
    bnplTransaction: {
      // First findFirst call (idempotency) returns existingByIdem;
      // second call (FIX 3 default gate) returns existingDefault.
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(opts.existingByIdem ?? null)
        .mockResolvedValueOnce(opts.existingDefault ?? null)
        .mockResolvedValue(null),
      create: txCreate,
    },
    merchant: {
      findFirst: jest.fn().mockResolvedValue(opts.merchant ?? null),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue(opts.customer ?? null),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue(opts.product ?? null),
    },
    installmentSchedule: {
      createMany: installmentCreateMany,
    },
    merchantSettlement: { create: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: any) =>
      fn({
        bnplTransaction: { create: txCreate },
        installmentSchedule: { createMany: installmentCreateMany },
      }),
    ),
  };
  const eventBus = { emitAndBuild: jest.fn() };
  const settlementService = {
    createImmediateSettlement: jest.fn().mockResolvedValue({
      settlementId: 'settle-1',
      netAmount: '117.0000',
    }),
  };
  return { prisma, eventBus, settlementService, installmentCreateMany };
}

const merchantImmediate = {
  id: MERCHANT,
  tenantId: TENANT,
  code: 'ACME',
  status: MerchantStatus.active,
  settlementType: SettlementType.IMMEDIATE,
  discountRate: '0.025',
};

const merchantTPlusOne = {
  ...merchantImmediate,
  settlementType: SettlementType.T_PLUS_1,
};

const customerActive = {
  id: CUSTOMER,
  tenantId: TENANT,
  status: CustomerStatus.active,
  kycLevel: 'tier_2',
};

const productBnpl = {
  id: PRODUCT,
  tenantId: TENANT,
  code: 'BNPL_3X',
  type: ProductType.bnpl,
  status: ProductStatus.active,
  lenderId: LENDER,
  currency: 'GHS',
  minAmount: 10,
  maxAmount: 5000,
  interestRate: '0',
  eligibilityRules: { minKycLevel: 'tier_1' },
  overdraftConfig: { firstInstallmentDeferralDays: 0, installmentIntervalDays: 30 },
};

describe('BnplOriginationService.initiate — validation gates', () => {
  it('rejects non-positive purchaseAmount', async () => {
    const { prisma, eventBus, settlementService } = makeMocks();
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await expect(
      service.initiate(TENANT, baseInput({ purchaseAmount: '0' })),
    ).rejects.toThrow(/positive/);
  });

  it('throws NotFoundError when merchant code is unknown', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: null,
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await expect(service.initiate(TENANT, baseInput())).rejects.toThrow();
  });

  it('rejects when merchant is not active', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: { ...merchantImmediate, status: MerchantStatus.suspended },
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await expect(service.initiate(TENANT, baseInput())).rejects.toThrow(/not active/);
  });

  it('rejects when customer is not active', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: merchantImmediate,
      customer: { ...customerActive, status: CustomerStatus.blacklisted },
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await expect(service.initiate(TENANT, baseInput())).rejects.toThrow(/not active/);
  });

  it('rejects when KYC level is below product minimum', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: merchantImmediate,
      customer: { ...customerActive, kycLevel: 'tier_1' },
      product: { ...productBnpl, eligibilityRules: { minKycLevel: 'tier_2' } },
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await expect(service.initiate(TENANT, baseInput())).rejects.toThrow(/KYC level/);
    const decline = eventBus.emitAndBuild.mock.calls.find(
      (c) => c[0] === 'bnpl.purchase.declined',
    );
    expect(decline).toBeDefined();
  });

  it('rejects when amount is below product minimum', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: merchantImmediate,
      customer: customerActive,
      product: productBnpl,
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await expect(
      service.initiate(TENANT, baseInput({ purchaseAmount: '5' })),
    ).rejects.toThrow(/below product minimum/);
  });

  it('rejects when amount exceeds product maximum', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: merchantImmediate,
      customer: customerActive,
      product: productBnpl,
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await expect(
      service.initiate(TENANT, baseInput({ purchaseAmount: '10000' })),
    ).rejects.toThrow(/exceeds product maximum/);
  });

  it('FIX 3: rejects when customer has an existing defaulted BNPL transaction', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: merchantImmediate,
      customer: customerActive,
      product: productBnpl,
      existingDefault: {
        id: '99999999-9999-9999-9999-999999999999',
        status: BnplTransactionStatus.defaulted,
        merchantId: 'other-merchant',
      },
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await expect(service.initiate(TENANT, baseInput())).rejects.toThrow(
      /existing defaulted BNPL transaction/,
    );
    const decline = eventBus.emitAndBuild.mock.calls.find(
      (c) => c[0] === 'bnpl.purchase.declined',
    );
    expect(decline?.[2]?.reason).toBe('existing_default');
  });

  it('FIX 3: rejects when customer has an existing accelerated BNPL transaction', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: merchantImmediate,
      customer: customerActive,
      product: productBnpl,
      existingDefault: {
        id: '99999999-9999-9999-9999-999999999999',
        status: BnplTransactionStatus.accelerated,
        merchantId: 'other-merchant',
      },
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await expect(service.initiate(TENANT, baseInput())).rejects.toThrow(
      /existing accelerated/,
    );
  });
});

describe('BnplOriginationService.initiate — happy path', () => {
  it('creates a transaction + installments and triggers IMMEDIATE settlement', async () => {
    const { prisma, eventBus, settlementService, installmentCreateMany } = makeMocks({
      merchant: merchantImmediate,
      customer: customerActive,
      product: productBnpl,
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    const result = await service.initiate(TENANT, baseInput());

    expect(result.status).toBe(BnplTransactionStatus.approved);
    expect(result.installments).toHaveLength(3);
    expect(installmentCreateMany).toHaveBeenCalled();
    expect(settlementService.createImmediateSettlement).toHaveBeenCalledWith(TENANT, TX_ID);

    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.purchase.approved');
  });

  it('does NOT call createImmediateSettlement for T+1 merchants', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: merchantTPlusOne,
      customer: customerActive,
      product: productBnpl,
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    await service.initiate(TENANT, baseInput());

    expect(settlementService.createImmediateSettlement).not.toHaveBeenCalled();
  });

  it('does NOT roll back the approved transaction if IMMEDIATE settlement creation fails', async () => {
    const { prisma, eventBus, settlementService } = makeMocks({
      merchant: merchantImmediate,
      customer: customerActive,
      product: productBnpl,
    });
    settlementService.createImmediateSettlement = jest
      .fn()
      .mockRejectedValue(new Error('downstream wallet error'));

    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    const result = await service.initiate(TENANT, baseInput());

    // Customer was still approved; settlement is retryable out-of-band.
    expect(result.status).toBe(BnplTransactionStatus.approved);
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.purchase.approved');
  });

  it('returns the existing transaction on idempotency-key replay', async () => {
    const existing = {
      id: 'prior-tx',
      status: BnplTransactionStatus.approved,
      totalRepayable: '120.0000',
      installments: [
        {
          installmentNumber: 1,
          amount: '40.0000',
          dueDate: new Date('2026-05-02'),
        },
      ],
    };
    const { prisma, eventBus, settlementService } = makeMocks({
      existingByIdem: existing,
    });
    const service = new BnplOriginationService(
      prisma as any,
      eventBus as any,
      settlementService as any,
    );

    const result = await service.initiate(TENANT, baseInput());

    expect(result.transactionId).toBe('prior-tx');
    // Should NOT have run any of the downstream side effects.
    expect(prisma.merchant.findFirst).not.toHaveBeenCalled();
    expect(settlementService.createImmediateSettlement).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });
});
