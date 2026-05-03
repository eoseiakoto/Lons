/**
 * BNPL eligibility — Sprint 11 Track B / B5. Mock-Prisma tests for each
 * decline reason + the happy path that returns plans + monthly amount.
 */

import { BnplEligibilityService } from './bnpl-eligibility.service';
import {
  CustomerStatus,
  MerchantStatus,
  ProductStatus,
  ProductType,
  BnplTransactionStatus,
} from '@lons/database';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CUSTOMER = '22222222-2222-2222-2222-222222222222';

function makePrisma(opts: {
  merchant?: any;
  customer?: any;
  product?: any;
  blockedTx?: any;
} = {}) {
  return {
    merchant: { findFirst: jest.fn().mockResolvedValue(opts.merchant ?? null) },
    customer: { findFirst: jest.fn().mockResolvedValue(opts.customer ?? null) },
    product: { findFirst: jest.fn().mockResolvedValue(opts.product ?? null) },
    bnplTransaction: { findFirst: jest.fn().mockResolvedValue(opts.blockedTx ?? null) },
  };
}

const merchantActive = {
  id: 'merch',
  tenantId: TENANT,
  status: MerchantStatus.active,
};

const customerActive = {
  id: CUSTOMER,
  tenantId: TENANT,
  status: CustomerStatus.active,
  kycLevel: 'tier_2',
};

const productBnpl = {
  id: 'prod',
  tenantId: TENANT,
  type: ProductType.bnpl,
  status: ProductStatus.active,
  minAmount: 10,
  maxAmount: 1000,
  interestRate: '0',
  eligibilityRules: { minKycLevel: 'tier_1' },
  overdraftConfig: { availableInstallmentPlans: [3, 4, 6], installmentIntervalDays: 30 },
};

describe('BnplEligibilityService', () => {
  it('rejects non-positive amount', async () => {
    const service = new BnplEligibilityService(makePrisma() as any);
    await expect(
      service.check(TENANT, {
        merchantCode: 'M1',
        customerId: CUSTOMER,
        amount: '0',
        currency: 'GHS',
      }),
    ).rejects.toThrow(/positive/);
  });

  it('returns ineligible when merchant is missing', async () => {
    const service = new BnplEligibilityService(makePrisma() as any);
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '100',
      currency: 'GHS',
    });
    expect(out.eligible).toBe(false);
    expect(out.reason).toBe('merchant_not_active');
  });

  it('returns ineligible when merchant is suspended', async () => {
    const service = new BnplEligibilityService(
      makePrisma({ merchant: { ...merchantActive, status: MerchantStatus.suspended } }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '100',
      currency: 'GHS',
    });
    expect(out.reason).toBe('merchant_not_active');
  });

  it('returns ineligible when customer is blacklisted', async () => {
    const service = new BnplEligibilityService(
      makePrisma({
        merchant: merchantActive,
        customer: { ...customerActive, status: CustomerStatus.blacklisted },
      }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '100',
      currency: 'GHS',
    });
    expect(out.reason).toMatch(/customer_status_/);
  });

  it('returns ineligible when no active BNPL product is configured', async () => {
    const service = new BnplEligibilityService(
      makePrisma({ merchant: merchantActive, customer: customerActive }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '100',
      currency: 'GHS',
    });
    expect(out.reason).toBe('no_active_bnpl_product');
  });

  it('returns ineligible when KYC is below product minimum', async () => {
    const service = new BnplEligibilityService(
      makePrisma({
        merchant: merchantActive,
        customer: { ...customerActive, kycLevel: 'tier_1' },
        product: { ...productBnpl, eligibilityRules: { minKycLevel: 'tier_2' } },
      }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '100',
      currency: 'GHS',
    });
    expect(out.reason).toBe('kyc_below_minimum');
  });

  it('blocks customers with an existing default', async () => {
    const service = new BnplEligibilityService(
      makePrisma({
        merchant: merchantActive,
        customer: customerActive,
        product: productBnpl,
        blockedTx: { id: 'tx-defaulted', status: BnplTransactionStatus.defaulted },
      }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '100',
      currency: 'GHS',
    });
    expect(out.reason).toBe('existing_default');
  });

  it('returns ineligible when amount is below product minimum', async () => {
    const service = new BnplEligibilityService(
      makePrisma({
        merchant: merchantActive,
        customer: customerActive,
        product: productBnpl,
      }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '5',
      currency: 'GHS',
    });
    expect(out.reason).toBe('amount_below_min');
    expect(out.maxAmount).toBe('1000');
  });

  it('returns ineligible when amount exceeds product maximum', async () => {
    const service = new BnplEligibilityService(
      makePrisma({
        merchant: merchantActive,
        customer: customerActive,
        product: productBnpl,
      }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '5000',
      currency: 'GHS',
    });
    expect(out.reason).toBe('amount_above_max');
  });

  it('returns eligible with the default plan + monthly amount', async () => {
    const service = new BnplEligibilityService(
      makePrisma({
        merchant: merchantActive,
        customer: customerActive,
        product: productBnpl,
      }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '120',
      currency: 'GHS',
    });
    expect(out.eligible).toBe(true);
    expect(out.availableInstallmentPlans).toEqual([3, 4, 6]);
    expect(out.approvedAmount).toBe('120');
    // 0% interest → monthlyAmount = 120 / 3 = 40.0000
    expect(out.monthlyAmount).toBe('40.0000');
  });

  it('factors interest into monthlyAmount when product has a non-zero rate', async () => {
    const service = new BnplEligibilityService(
      makePrisma({
        merchant: merchantActive,
        customer: customerActive,
        product: { ...productBnpl, interestRate: '0.12' },
      }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '1000',
      currency: 'GHS',
    });
    // tenor = 3 × 30 = 90 days; interest = 1000 × 0.12 × 90/365 = 29.589041
    // total = 1029.5890 → /3 = 343.1963 (banker-rounded at 4dp)
    expect(out.monthlyAmount).toBe('343.1963');
  });

  it('uses default plans [3, 4, 6] when product config is empty', async () => {
    const service = new BnplEligibilityService(
      makePrisma({
        merchant: merchantActive,
        customer: customerActive,
        product: { ...productBnpl, overdraftConfig: null },
      }) as any,
    );
    const out = await service.check(TENANT, {
      merchantCode: 'M1',
      customerId: CUSTOMER,
      amount: '120',
      currency: 'GHS',
    });
    expect(out.availableInstallmentPlans).toEqual([3, 4, 6]);
  });
});
