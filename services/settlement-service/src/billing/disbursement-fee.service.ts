import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { PrismaService, Prisma } from '@lons/database';
import {
  EventBusService,
  REDIS_CLIENT,
  add,
  bankersRound,
  divide,
  multiply,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

/**
 * Sprint 14 (S14-13) — per-disbursement metered fee recording.
 *
 * Listener-driven: invoked by `DisbursementFeeListener` on every
 * `DISBURSEMENT_COMPLETED` event. The rate formula:
 *
 *   adjusted_bps  = base_bps + product_modifier_bps
 *   effective_bps = adjusted_bps * volume_multiplier
 *   fee_rate      = effective_bps                                  (kept for human inspection)
 *   fee_amount    = bankersRound(gross_amount * effective_bps / 10000, 4)
 *   fee_amount_usd = fee_amount * exchange_rate   (1:1 same-currency)
 *
 * Volume discounts read from the tenant's `volumeDiscountTiers` JSON
 * (sorted descending by threshold) using the Redis-tracked monthly
 * disbursement count. If Redis is unavailable the multiplier defaults
 * to 1.0 — the SP gets the base rate, which is conservative.
 *
 * **Idempotency.** Pre-check on `(tenantId, disbursementId)` returns
 * early when the fee already exists. The unique constraint in the
 * Prisma model is the backstop.
 */
@Injectable()
export class DisbursementFeeService {
  private readonly logger = new Logger(DisbursementFeeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async recordFee(
    tenantId: string,
    data: {
      disbursementId: string;
      contractId: string;
      amount: string;
      currency: string;
      productType: string;
    },
  ): Promise<void> {
    // Idempotency — the listener may retry on transient failures.
    const existing = await this.prisma.disbursementFee.findUnique({
      where: { disbursementId: data.disbursementId },
    });
    if (existing) {
      this.logger.debug(
        `Skipping fee for disbursement ${data.disbursementId} — already recorded`,
      );
      return;
    }

    const config = await this.prisma.tenantBillingConfig.findUnique({
      where: { tenantId },
    });
    if (!config) {
      this.logger.warn(
        `No TenantBillingConfig for tenant ${tenantId} — fee not recorded for disbursement ${data.disbursementId}`,
      );
      return;
    }
    if (!config.perDisbursementBps) {
      this.logger.warn(
        `TenantBillingConfig.perDisbursementBps is null for tenant ${tenantId} — fee not recorded`,
      );
      return;
    }

    // Base + product modifier.
    const baseBps = String(config.perDisbursementBps);
    const productModifierBps = this.getProductModifier(config, data.productType);
    const adjustedBps = add(baseBps, productModifierBps);

    // Volume discount lookup. Reads the Redis monthly count *before*
    // this disbursement was added — the QuotaTrackingService increments
    // it separately. We accept a 1-disbursement drift at bracket
    // boundaries: it's negligible vs. operational complexity of locking.
    const monthlyCount = await this.getMonthlyDisbursementCount(tenantId);
    const volumeMultiplier = this.getVolumeDiscountMultiplier(
      this.parseVolumeDiscountTiers(config.volumeDiscountTiers),
      monthlyCount,
    );
    const volumeTier = this.getVolumeTierLabel(
      this.parseVolumeDiscountTiers(config.volumeDiscountTiers),
      monthlyCount,
    );

    // effective = adjusted_bps * multiplier. Both Decimal-as-string.
    const effectiveBps = bankersRound(
      multiply(adjustedBps, volumeMultiplier),
      2,
    );

    // fee = gross * effective_bps / 10000
    //
    // **Precision note.** `divide` in @lons/common rounds to 4dp, so a
    // naive `multiply(gross, divide(effective_bps, 10000))` loses
    // precision on small rates: 56.25 bps → 0.0056 → fee = 56.0000
    // instead of 56.2500 on a $10,000 disbursement (a 0.4% error per
    // transaction — material on a real ledger). Multiplying first
    // preserves the full numerator (562500), then dividing once at the
    // end gives the correct 56.2500.
    //
    // `feeRate` is persisted alongside `effectiveBps` for audit clarity
    // — operators reading a fee row should see both the basis-point
    // figure and the same value re-stated as a percentage rate.
    const feeRate = effectiveBps;
    const feeAmount = bankersRound(
      divide(multiply(data.amount, effectiveBps), '10000'),
      4,
    );

    // USD conversion. Placeholder 1:1 — proper FX deferred to a later
    // sprint. `exchangeRate = null` indicates same-currency (USD).
    const exchangeRate = data.currency === 'USD' ? null : '1.000000';
    const feeAmountUsd = exchangeRate
      ? bankersRound(multiply(feeAmount, exchangeRate), 4)
      : feeAmount;

    await this.prisma.disbursementFee.create({
      data: {
        tenantId,
        disbursementId: data.disbursementId,
        contractId: data.contractId,
        productType: data.productType,
        grossAmount: data.amount,
        currency: data.currency,
        baseBps,
        productModifierBps,
        effectiveBps,
        volumeDiscountMultiplier: volumeMultiplier,
        feeRate: effectiveBps,
        feeAmount,
        feeAmountUsd,
        exchangeRate,
        volumeTier,
      },
    });

    this.eventBus.emitAndBuild(EventType.BILLING_FEE_RECORDED, tenantId, {
      disbursementId: data.disbursementId,
      feeAmount,
      feeAmountUsd,
      effectiveBps,
      productType: data.productType,
    });
  }

  /**
   * Map the product type to the tenant's per-product rate adjustment.
   * Unknown product types return `0` (no adjustment).
   */
  private getProductModifier(
    config: {
      microLoanRateModifier: Prisma.Decimal;
      overdraftRateModifier: Prisma.Decimal;
      bnplRateModifier: Prisma.Decimal;
      factoringRateModifier: Prisma.Decimal;
    },
    productType: string,
  ): string {
    const map: Record<string, Prisma.Decimal> = {
      micro_loan: config.microLoanRateModifier,
      overdraft: config.overdraftRateModifier,
      bnpl: config.bnplRateModifier,
      invoice_financing: config.factoringRateModifier,
    };
    return String(map[productType] ?? 0);
  }

  /**
   * Parse the JSONB `volumeDiscountTiers` into a typed array, defensively
   * filtering out malformed entries (which would otherwise crash sort).
   */
  private parseVolumeDiscountTiers(
    raw: Prisma.JsonValue | null,
  ): Array<{ threshold: number; multiplier: string }> {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (t): t is { threshold: number; multiplier: string } =>
          typeof t === 'object' &&
          t !== null &&
          'threshold' in t &&
          'multiplier' in t &&
          typeof (t as Record<string, unknown>).threshold === 'number',
      )
      .map((t) => ({
        threshold: t.threshold,
        multiplier: String(t.multiplier),
      }));
  }

  private getVolumeDiscountMultiplier(
    tiers: Array<{ threshold: number; multiplier: string }>,
    count: number,
  ): string {
    if (tiers.length === 0) return '1.0000';
    const sorted = [...tiers].sort((a, b) => b.threshold - a.threshold);
    for (const tier of sorted) {
      if (count >= tier.threshold) return tier.multiplier;
    }
    return '1.0000';
  }

  private getVolumeTierLabel(
    tiers: Array<{ threshold: number; multiplier: string }>,
    count: number,
  ): string {
    if (tiers.length === 0) return 'base';
    const sorted = [...tiers].sort((a, b) => b.threshold - a.threshold);
    for (const tier of sorted) {
      if (count >= tier.threshold) return `${tier.threshold}+`;
    }
    return 'base';
  }

  private async getMonthlyDisbursementCount(tenantId: string): Promise<number> {
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `quota:${tenantId}:disbursements:count:${ym}`;
    try {
      const val = await this.redis.get(key);
      return val ? parseInt(val, 10) : 0;
    } catch (err) {
      this.logger.debug(
        `Redis read failed for ${key}: ${(err as Error).message}. Defaulting to count=0.`,
      );
      return 0;
    }
  }
}
