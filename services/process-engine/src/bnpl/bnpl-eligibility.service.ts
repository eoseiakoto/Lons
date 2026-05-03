import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  CustomerStatus,
  MerchantStatus,
  ProductStatus,
  ProductType,
  KycLevel,
  BnplTransactionStatus,
} from '@lons/database';
import {
  bankersRound,
  compare,
  divide,
  isPositive,
  multiply,
  toDecimal,
  ValidationError,
} from '@lons/common';

const KYC_LEVEL_ORDER: Record<string, number> = {
  none: 0,
  tier_1: 1,
  tier_2: 2,
  tier_3: 3,
};

export interface EligibilityCheckInput {
  merchantCode: string;
  customerId: string;
  /** Decimal string. Required. */
  amount: string;
  currency: string;
}

export interface EligibilityCheckResult {
  eligible: boolean;
  /** Set when ineligible. */
  reason?: string;
  /** Decimal string — product `maxAmount` (or 0 when ineligible). */
  maxAmount: string;
  /** Decimal string — `min(amount, maxAmount)` capped offer. */
  approvedAmount: string;
  /** Number of installments offered to the customer at checkout. */
  availableInstallmentPlans: number[];
  /** Decimal string. */
  interestRate: string;
  /**
   * Decimal string — single per-installment amount for the *default* plan
   * (first entry in `availableInstallmentPlans`). The merchant-side UI
   * uses this for the "X / month" snippet.
   */
  monthlyAmount: string;
}

/**
 * BNPL pre-qualification at checkout (Sprint 11 Track B / B5).
 *
 * Per FR-BN-001.3, this must answer in under 2 seconds. The current
 * implementation hits a few indexed DB rows (merchant, customer,
 * product, last-N transactions) — well under the SLA at typical
 * portfolio size. A Redis cache layer is the natural follow-up
 * optimization once we have telemetry showing the latency budget is
 * actually constrained.
 *
 * Eligibility checks (in order):
 *   1. Merchant is active in this tenant.
 *   2. Customer is active and not blacklisted.
 *   3. KYC level meets the BNPL product's minimum.
 *   4. No outstanding defaulted BNPL on record (any merchant).
 *   5. `amount` is within product `[minAmount, maxAmount]`.
 */
@Injectable()
export class BnplEligibilityService {
  private readonly logger = new Logger('BnplEligibilityService');

  /**
   * FIX 14: process-local TTL cache to honour the FR-BN-001.3 sub-2s
   * SLA on hot checkout-widget polling. Each entry expires 60s after
   * insertion. Cross-instance consistency is not a concern — small
   * per-instance divergence during the cache window is acceptable for
   * eligibility (it's recomputed every minute anyway).
   *
   * Sprint 12+: when Redis is wired into process-engine generally,
   * swap this Map for an `ioredis` GET/SETEX pattern matching
   * `services/overdraft-service/src/cache/credit-line-cache.service.ts`.
   * Call sites do not need to change — only the cache primitive.
   */
  private readonly cache = new Map<string, { value: EligibilityCheckResult; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async check(
    tenantId: string,
    input: EligibilityCheckInput,
  ): Promise<EligibilityCheckResult> {
    if (!isPositive(input.amount)) {
      throw new ValidationError(`amount must be positive (got ${input.amount})`);
    }

    const cacheKey = `${tenantId}:${input.customerId}:${input.merchantCode}:${input.amount}:${input.currency}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const result = await this.computeCheck(tenantId, input);
    this.cache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + BnplEligibilityService.CACHE_TTL_MS,
    });
    // Best-effort eviction so the Map doesn't grow unbounded under
    // very-high traffic. Cheap because we only evict when set is called.
    if (this.cache.size > 10_000) {
      const now = Date.now();
      for (const [k, entry] of this.cache) {
        if (entry.expiresAt <= now) this.cache.delete(k);
      }
    }
    return result;
  }

  private async computeCheck(
    tenantId: string,
    input: EligibilityCheckInput,
  ): Promise<EligibilityCheckResult> {
    const merchant = await this.prisma.merchant.findFirst({
      where: { tenantId, code: input.merchantCode, deletedAt: null },
    });
    if (!merchant || merchant.status !== MerchantStatus.active) {
      return ineligible('merchant_not_active');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, tenantId, deletedAt: null },
    });
    if (!customer) return ineligible('customer_not_found');
    if (customer.status !== CustomerStatus.active) {
      return ineligible(`customer_status_${customer.status}`);
    }

    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        type: ProductType.bnpl,
        status: ProductStatus.active,
        deletedAt: null,
      },
    });
    if (!product) return ineligible('no_active_bnpl_product');

    const eligibilityRules =
      (product.eligibilityRules as Record<string, unknown> | null) ?? {};
    const minKycLevel = (eligibilityRules.minKycLevel as string | undefined) ?? KycLevel.none;
    const customerKycLevel = customer.kycLevel ?? KycLevel.none;
    if ((KYC_LEVEL_ORDER[customerKycLevel] ?? 0) < (KYC_LEVEL_ORDER[minKycLevel] ?? 0)) {
      return ineligible('kyc_below_minimum');
    }

    // Outstanding default check — any defaulted/accelerated BNPL on
    // record across any merchant in this tenant blocks new purchases.
    const blocked = await this.prisma.bnplTransaction.findFirst({
      where: {
        tenantId,
        customerId: input.customerId,
        status: {
          in: [BnplTransactionStatus.defaulted, BnplTransactionStatus.accelerated],
        },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (blocked) return ineligible('existing_default');

    const minAmount = product.minAmount ? String(product.minAmount) : '0';
    const maxAmount = product.maxAmount ? String(product.maxAmount) : input.amount;
    if (compare(input.amount, minAmount) < 0) {
      return { ...ineligible('amount_below_min'), maxAmount };
    }
    if (compare(input.amount, maxAmount) > 0) {
      return { ...ineligible('amount_above_max'), maxAmount };
    }

    // Build the available installment plans from product config, falling
    // back to a sensible default. Merchants commonly offer 3 or 4 plans.
    // Sprint 12 G5: prefer bnplConfig, fall back to overdraftConfig for
    // un-migrated products, then to defaults below.
    const bnplConfig =
      (product.bnplConfig as Record<string, unknown> | null) ??
      (product.overdraftConfig as Record<string, unknown> | null) ??
      {};
    const availableInstallmentPlans =
      (bnplConfig.availableInstallmentPlans as number[] | undefined) ?? [3, 4, 6];
    const defaultPlan = availableInstallmentPlans[0];

    const interestRate = product.interestRate ? String(product.interestRate) : '0';
    const intervalDays = Number((bnplConfig.installmentIntervalDays as number | undefined) ?? 30);
    const tenorDays = defaultPlan * intervalDays;
    const totalRepayable = computeTotalRepayable(input.amount, interestRate, tenorDays);
    const monthlyAmount = bankersRound(divide(totalRepayable, String(defaultPlan)), 4);

    return {
      eligible: true,
      maxAmount,
      approvedAmount: input.amount,
      availableInstallmentPlans,
      interestRate,
      monthlyAmount,
    };
  }
}

function ineligible(reason: string): EligibilityCheckResult {
  return {
    eligible: false,
    reason,
    maxAmount: '0',
    approvedAmount: '0',
    availableInstallmentPlans: [],
    interestRate: '0',
    monthlyAmount: '0',
  };
}

function computeTotalRepayable(amount: string, annualRate: string, tenorDays: number): string {
  if (compare(annualRate, '0') === 0) return bankersRound(amount, 4);
  // amount + (amount × rate × tenorDays / 365)
  const interest = toDecimal(amount).times(annualRate).times(tenorDays).dividedBy(365);
  return bankersRound(toDecimal(amount).plus(interest).toString(), 4);
}

void multiply; // kept for future fee-aware total-repayable computation
