/**
 * Sprint 16 fixes (FIX-2) — unit tests for `MicroLoanOriginationService`.
 *
 * Pinned behaviour for the three pre-validation gates:
 *   1. MICRO_LOAN_NO_ACTIVE_SUBSCRIPTION — no active subscription
 *   2. MICRO_LOAN_INSUFFICIENT_CREDIT_LIMIT — amount > availableLimit
 *   3. MICRO_LOAN_MAX_ACTIVE_LOANS_REACHED — contract count >= maxActiveLoans
 *
 * Each rejection carries a structured `code` so the GraphQL exception
 * filter can surface stable identifiers to clients.
 *
 * All amount comparisons go through `@lons/common.compare()` — never
 * JS `>` / `<` on strings (CLAUDE.md money rule).
 */
import {
  ContractStatus,
  SubscriptionStatus,
} from '@lons/database';
import { ValidationError } from '@lons/common';

import { MicroLoanOriginationService } from '../micro-loan-origination.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const PRODUCT_ID = '33333333-3333-3333-3333-333333333333';

function makeService(opts: {
  // Use `undefined` (omitted) → default subscription; pass `null` →
  // simulate "no active subscription".
  subscription?: any;
  product?: { maxActiveLoans?: number };
  activeContractCount?: number;
} = {}) {
  const subscriptionValue =
    'subscription' in opts
      ? opts.subscription
      : {
          id: 'sub-1',
          tenantId: TENANT_ID,
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          status: SubscriptionStatus.active,
          creditLimit: '1000.0000',
          availableLimit: '1000.0000',
        };
  const subscription = {
    findFirst: jest.fn().mockResolvedValue(subscriptionValue),
  };
  const product = {
    findFirst: jest.fn().mockResolvedValue(
      opts.product === undefined
        ? { maxActiveLoans: 1 }
        : opts.product,
    ),
  };
  const contract = {
    count: jest.fn().mockResolvedValue(opts.activeContractCount ?? 0),
  };
  const prisma = { subscription, product, contract } as any;
  return {
    service: new MicroLoanOriginationService(prisma),
    subscription,
    product,
    contract,
  };
}

describe('MicroLoanOriginationService.validateLoanRequest', () => {
  describe('happy path', () => {
    it('passes when active sub + amount within limit + no active contracts', async () => {
      const { service } = makeService();
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '500.0000',
        }),
      ).resolves.toBeUndefined();
    });

    it('amount EQUAL to availableLimit passes (<= check)', async () => {
      const { service } = makeService();
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '1000.0000',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('Gate 1 — MICRO_LOAN_NO_ACTIVE_SUBSCRIPTION', () => {
    it('rejects when subscription is missing', async () => {
      const { service } = makeService({ subscription: null });
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '100.0000',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('does not have an active'),
      });
    });

    it('error carries structured code', async () => {
      const { service } = makeService({ subscription: null });
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '100.0000',
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '100.0000',
        }),
      ).rejects.toMatchObject({
        details: { code: 'MICRO_LOAN_NO_ACTIVE_SUBSCRIPTION' },
      });
    });
  });

  describe('Gate 2 — MICRO_LOAN_INSUFFICIENT_CREDIT_LIMIT', () => {
    it('rejects when amount > availableLimit', async () => {
      const { service } = makeService({
        subscription: {
          id: 'sub-1',
          status: SubscriptionStatus.active,
          creditLimit: '500.0000',
          availableLimit: '500.0000',
        },
      });
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '500.0001',
        }),
      ).rejects.toMatchObject({
        details: { code: 'MICRO_LOAN_INSUFFICIENT_CREDIT_LIMIT' },
      });
    });

    it('lexicographic-bug regression: "9" vs "1000" handled correctly', async () => {
      // CLAUDE.md money rule: native JS `>` would return "9" > "1000"
      // = true (lexicographic). Decimal compare must return false.
      const { service } = makeService({
        subscription: {
          id: 'sub-1',
          status: SubscriptionStatus.active,
          creditLimit: '1000.0000',
          availableLimit: '1000.0000',
        },
      });
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '9',
        }),
      ).resolves.toBeUndefined();
    });

    it('falls back to creditLimit when availableLimit is null (legacy rows)', async () => {
      const { service } = makeService({
        subscription: {
          id: 'sub-1',
          status: SubscriptionStatus.active,
          creditLimit: '500.0000',
          availableLimit: null,
        },
      });
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '400.0000',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('Gate 3 — MICRO_LOAN_MAX_ACTIVE_LOANS_REACHED', () => {
    it('rejects when 1 active contract + maxActiveLoans=1', async () => {
      const { service } = makeService({ activeContractCount: 1 });
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '100.0000',
        }),
      ).rejects.toMatchObject({
        details: { code: 'MICRO_LOAN_MAX_ACTIVE_LOANS_REACHED' },
      });
    });

    it('passes with 0 active contracts + maxActiveLoans=1', async () => {
      const { service } = makeService({ activeContractCount: 0 });
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '100.0000',
        }),
      ).resolves.toBeUndefined();
    });

    it('respects custom maxActiveLoans > 1', async () => {
      const { service } = makeService({
        product: { maxActiveLoans: 3 },
        activeContractCount: 2,
      });
      await expect(
        service.validateLoanRequest(TENANT_ID, {
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          requestedAmount: '100.0000',
        }),
      ).resolves.toBeUndefined();
    });

    it('uses notIn filter for the contract count query', async () => {
      const { service, contract } = makeService({ activeContractCount: 0 });
      await service.validateLoanRequest(TENANT_ID, {
        customerId: CUSTOMER_ID,
        productId: PRODUCT_ID,
        requestedAmount: '100.0000',
      });
      const where = contract.count.mock.calls[0][0].where;
      expect(where.status.notIn).toEqual(
        expect.arrayContaining([
          ContractStatus.settled,
          ContractStatus.cancelled,
          ContractStatus.written_off,
        ]),
      );
    });
  });
});
