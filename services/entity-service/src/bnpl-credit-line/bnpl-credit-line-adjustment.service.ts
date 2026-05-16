import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  BnplCreditLine,
  BnplCreditLineAdjustment,
  BnplCreditLineStatus,
  InstallmentStatus,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  add,
  bankersRound,
  compare,
  divide,
  multiply,
  subtract,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { BnplCreditLineService } from './bnpl-credit-line.service';

export enum AdjustmentTrigger {
  PURCHASE_HISTORY = 'purchase_history',
  REPAYMENT_BEHAVIOUR = 'repayment_behaviour',
  CREDIT_SCORE_CHANGE = 'credit_score_change',
  SCHEDULED_REVIEW = 'scheduled_review',
  MANUAL = 'manual',
}

export interface IBnplCreditLimitRules {
  maxIncreasePercent: number;
  maxDecreasePercent: number;
  reviewFrequencyDays: number;
  minCompletedTransactionsForIncrease: number;
  onTimeRepaymentRatioThreshold: number;
  latePaymentsForDecrease: number;
}

export const DEFAULT_LIMIT_RULES: IBnplCreditLimitRules = {
  maxIncreasePercent: 0.2,
  maxDecreasePercent: 0.3,
  reviewFrequencyDays: 90,
  minCompletedTransactionsForIncrease: 3,
  onTimeRepaymentRatioThreshold: 0.9,
  latePaymentsForDecrease: 2,
};

export interface IAdjustmentInput {
  adjustmentType: 'increase' | 'decrease' | 'reset';
  reasonCode: string;
  reasonDetail?: string;
  /** `system`, `operator:<userId>`, or one of the trigger enum values. */
  triggeredBy: string;
  /**
   * FIX-3: replay key for manual adjustments. When set, a duplicate call
   * with the same `(tenantId, idempotencyKey)` returns the existing
   * adjustment row instead of double-applying. System-triggered
   * adjustments leave this NULL (cooldown handles their dedupe).
   */
  idempotencyKey?: string;
}

/**
 * Sprint 15 (S15-2) — dynamic credit limit adjustment service.
 *
 * Evaluates configurable triggers against a credit line and applies an
 * adjustment if the rules allow. Each adjustment is recorded as a
 * `BnplCreditLineAdjustment` (append-only) and emits
 * `BNPL_CREDIT_LIMIT_ADJUSTED` for downstream notifications.
 *
 * Rules are stored as `product.bnplConfig.creditLimitRules` (JSON). The
 * service falls back to `DEFAULT_LIMIT_RULES` when the field is missing
 * or malformed — never throws on bad config; degraded gracefully is
 * preferred over breaking a customer's credit line on a stale product.
 *
 * **Idempotency / cooldown.** `reviewFrequencyDays` enforces a minimum
 * gap between auto-triggered adjustments. Manual operator adjustments
 * bypass the cooldown — operators see the full state and can override.
 */
@Injectable()
export class BnplCreditLineAdjustmentService {
  private readonly logger = new Logger(BnplCreditLineAdjustmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly creditLineService: BnplCreditLineService,
  ) {}

  /**
   * Evaluate all configured triggers and adjust if warranted. Returns the
   * adjustment record or null when no change was needed.
   */
  async evaluateAndAdjust(
    tenantId: string,
    creditLineId: string,
    trigger: AdjustmentTrigger,
  ): Promise<BnplCreditLineAdjustment | null> {
    const line = await this.creditLineService.findByIdOrThrow(
      tenantId,
      creditLineId,
    );

    // S16-FIX-1: expiry sweep — if `expiresAt` has passed, transition
    // the line to `expired` and short-circuit. The status check below
    // then no-ops for any subsequent evaluation (lines stay in their
    // terminal state). Emits BNPL_CREDIT_LINE_EXPIRED for ops dashboards.
    if (
      line.status === BnplCreditLineStatus.active &&
      line.expiresAt &&
      line.expiresAt.getTime() <= Date.now()
    ) {
      this.logger.debug(
        `Expiring credit line ${creditLineId} — expiresAt ${line.expiresAt.toISOString()}`,
      );
      await this.creditLineService.updateStatus(
        tenantId,
        creditLineId,
        BnplCreditLineStatus.expired,
        `Auto-expired at ${line.expiresAt.toISOString()}`,
      );
      this.eventBus.emitAndBuild(
        EventType.BNPL_CREDIT_LINE_EXPIRED,
        tenantId,
        {
          creditLineId,
          customerId: line.customerId,
          subscriptionId: line.subscriptionId,
          expiresAt: line.expiresAt.toISOString(),
        },
      );
      return null;
    }

    if (line.status !== BnplCreditLineStatus.active) {
      this.logger.debug(
        `Skipping evaluation: credit line ${creditLineId} is ${line.status}`,
      );
      return null;
    }

    const rules = await this.loadRules(tenantId, line.productId);

    // Cooldown: skip auto-triggered evaluations within reviewFrequencyDays
    // of the last review. MANUAL bypasses this check.
    if (
      trigger !== AdjustmentTrigger.MANUAL &&
      line.lastReviewedAt &&
      this.daysSince(line.lastReviewedAt) < rules.reviewFrequencyDays
    ) {
      this.logger.debug(
        `Cooldown: credit line ${creditLineId} last reviewed ${line.lastReviewedAt.toISOString()}`,
      );
      return null;
    }

    let evaluation: {
      action: 'increase' | 'decrease' | 'none';
      reasonCode: string;
      reasonDetail?: string;
    } = { action: 'none', reasonCode: 'no_change' };

    switch (trigger) {
      case AdjustmentTrigger.PURCHASE_HISTORY:
        evaluation = await this.evaluatePurchaseHistory(tenantId, line, rules);
        break;
      case AdjustmentTrigger.REPAYMENT_BEHAVIOUR:
        evaluation = await this.evaluateRepaymentBehaviour(
          tenantId,
          line,
          rules,
        );
        break;
      case AdjustmentTrigger.CREDIT_SCORE_CHANGE:
        evaluation = await this.evaluateCreditScoreChange(tenantId, line);
        break;
      case AdjustmentTrigger.SCHEDULED_REVIEW: {
        // Holistic — try all three; first hit wins. Decrease takes
        // precedence over increase to be conservative.
        const repayment = await this.evaluateRepaymentBehaviour(
          tenantId,
          line,
          rules,
        );
        if (repayment.action === 'decrease') {
          evaluation = repayment;
          break;
        }
        const score = await this.evaluateCreditScoreChange(tenantId, line);
        if (score.action === 'decrease') {
          evaluation = score;
          break;
        }
        const purchase = await this.evaluatePurchaseHistory(
          tenantId,
          line,
          rules,
        );
        if (purchase.action === 'increase') {
          evaluation = purchase;
          break;
        }
        if (repayment.action === 'increase') evaluation = repayment;
        else if (score.action === 'increase') evaluation = score;
        break;
      }
      case AdjustmentTrigger.MANUAL:
        // Manual adjustments use `adjustCreditLimit` directly; the
        // evaluateAndAdjust path is a no-op for MANUAL.
        return null;
    }

    if (evaluation.action === 'none') {
      // Stamp lastReviewedAt anyway so the cooldown moves forward.
      await this.prisma.bnplCreditLine.update({
        where: { id: line.id },
        data: { lastReviewedAt: new Date() },
      });
      return null;
    }

    const newLimit = this.computeBoundedLimit(
      line.approvedLimit,
      evaluation.action,
      rules,
    );

    return this.adjustCreditLimit(tenantId, creditLineId, newLimit, {
      adjustmentType: evaluation.action,
      reasonCode: evaluation.reasonCode,
      reasonDetail: evaluation.reasonDetail,
      triggeredBy: trigger,
    });
  }

  /**
   * Direct adjustment with reason tracking. Used by `evaluateAndAdjust`
   * and also callable for manual operator adjustments.
   */
  async adjustCreditLimit(
    tenantId: string,
    creditLineId: string,
    newLimit: string,
    adjustment: IAdjustmentInput,
  ): Promise<BnplCreditLineAdjustment> {
    if (compare(newLimit, '0') < 0) {
      throw new ValidationError(`newLimit must be non-negative (got ${newLimit})`);
    }

    // FIX-3: idempotency check. The DB enforces uniqueness on
    // (tenantId, idempotencyKey) via a partial unique index; we look up
    // first to return the existing row gracefully instead of relying on
    // a P2002 catch.
    if (adjustment.idempotencyKey) {
      const replay = await this.prisma.bnplCreditLineAdjustment.findFirst({
        where: { tenantId, idempotencyKey: adjustment.idempotencyKey },
      });
      if (replay) {
        this.logger.debug(
          `Idempotency hit on adjustCreditLimit — returning adjustment ${replay.id}`,
        );
        return replay;
      }
    }

    const line = await this.creditLineService.findByIdOrThrow(
      tenantId,
      creditLineId,
    );

    const previousLimit = String(line.approvedLimit);
    if (compare(previousLimit, newLimit) === 0) {
      throw new ValidationError(
        `newLimit (${newLimit}) equals previous limit — no change to apply`,
      );
    }

    // Run the update + adjustment record in a single transaction so the
    // append-only audit log never disagrees with the live state.
    const result = await this.prisma.$transaction(async (tx) => {
      // When decreasing, scale availableLimit proportionally so customers
      // don't suddenly have an "available > approved" situation. When
      // increasing, leave availableLimit untouched (customer earned the
      // headroom but hasn't spent into it).
      const currentAvailable = String(line.availableLimit);
      const newAvailable =
        compare(newLimit, previousLimit) < 0
          ? this.scaleAvailable(currentAvailable, previousLimit, newLimit)
          : currentAvailable;

      await tx.bnplCreditLine.update({
        where: { id: creditLineId },
        data: {
          approvedLimit: newLimit,
          availableLimit: newAvailable,
          lastReviewedAt: new Date(),
        },
      });

      return tx.bnplCreditLineAdjustment.create({
        data: {
          tenantId,
          creditLineId,
          previousLimit,
          newLimit,
          adjustmentType: adjustment.adjustmentType,
          reasonCode: adjustment.reasonCode,
          reasonDetail: adjustment.reasonDetail,
          triggeredBy: adjustment.triggeredBy,
          idempotencyKey: adjustment.idempotencyKey,
        },
      });
    });

    this.eventBus.emitAndBuild(
      EventType.BNPL_CREDIT_LIMIT_ADJUSTED,
      tenantId,
      {
        creditLineId,
        customerId: line.customerId,
        subscriptionId: line.subscriptionId,
        previousLimit,
        newLimit,
        adjustmentType: adjustment.adjustmentType,
        reasonCode: adjustment.reasonCode,
        triggeredBy: adjustment.triggeredBy,
      },
    );

    return result;
  }

  // ─── Trigger evaluation helpers ─────────────────────────────────────

  private async evaluatePurchaseHistory(
    tenantId: string,
    line: BnplCreditLine,
    rules: IBnplCreditLimitRules,
  ): Promise<{ action: 'increase' | 'none'; reasonCode: string; reasonDetail?: string }> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);

    const completed = await this.prisma.bnplTransaction.count({
      where: {
        tenantId,
        customerId: line.customerId,
        productId: line.productId,
        status: 'completed',
        completedAt: { gte: sixMonthsAgo },
        deletedAt: null,
      },
    });

    if (completed < rules.minCompletedTransactionsForIncrease) {
      return { action: 'none', reasonCode: 'insufficient_transactions' };
    }

    // Check whether ALL of those completed transactions hit no overdue
    // installments. A clean repayment streak earns the increase.
    const anyOverdue = await this.prisma.installmentSchedule.findFirst({
      where: {
        tenantId,
        transaction: {
          customerId: line.customerId,
          productId: line.productId,
          status: 'completed',
          completedAt: { gte: sixMonthsAgo },
        },
        daysPastDue: { gt: 0 },
      },
      select: { id: true },
    });
    if (anyOverdue) {
      return { action: 'none', reasonCode: 'repayment_history_imperfect' };
    }

    return {
      action: 'increase',
      reasonCode: 'purchase_history_clean',
      reasonDetail: `${completed} completed transactions in last 6 months, no overdues`,
    };
  }

  private async evaluateRepaymentBehaviour(
    tenantId: string,
    line: BnplCreditLine,
    rules: IBnplCreditLimitRules,
  ): Promise<{
    action: 'increase' | 'decrease' | 'none';
    reasonCode: string;
    reasonDetail?: string;
  }> {
    const paid = await this.prisma.installmentSchedule.findMany({
      where: {
        tenantId,
        transaction: { customerId: line.customerId, productId: line.productId },
        status: InstallmentStatus.paid,
      },
      select: { dueDate: true, paidAt: true },
    });

    if (paid.length === 0) {
      return { action: 'none', reasonCode: 'no_repayment_history' };
    }

    const onTime = paid.filter(
      (i) => i.paidAt && i.paidAt <= this.endOfUtcDay(i.dueDate),
    ).length;
    // FIX-6 (Sprint 16 fixes): Decimal-as-string ratio so the
    // threshold comparison at line ~442 runs through `compare()`
    // — matches the rest of the credit-decision pipeline. Native
    // JS division is banned for any value that drives a credit
    // decision (CLAUDE.md "Money & Financial Calculations").
    const ratio = bankersRound(
      divide(String(onTime), String(paid.length)),
      4,
    );

    // Late-payment-streak decrease check: count recent consecutive late
    // payments. Order by paidAt DESC and stop counting on the first
    // on-time payment.
    const recent = await this.prisma.installmentSchedule.findMany({
      where: {
        tenantId,
        transaction: { customerId: line.customerId, productId: line.productId },
        status: InstallmentStatus.paid,
      },
      orderBy: { paidAt: 'desc' },
      take: rules.latePaymentsForDecrease,
      select: { dueDate: true, paidAt: true },
    });
    const consecutiveLate = recent.every(
      (i) => i.paidAt && i.paidAt > this.endOfUtcDay(i.dueDate),
    );

    if (
      consecutiveLate &&
      recent.length >= rules.latePaymentsForDecrease
    ) {
      return {
        action: 'decrease',
        reasonCode: 'late_payment_streak',
        reasonDetail: `${recent.length} consecutive late payments`,
      };
    }

    // FIX-6: Decimal-aware threshold comparison. `rules.onTimeRepaymentRatioThreshold`
    // is a JS number (config-driven, e.g. 0.7); coerce to string so
    // `compare()` operates in Decimal space.
    if (
      compare(ratio, String(rules.onTimeRepaymentRatioThreshold)) >= 0 &&
      paid.length >= 3
    ) {
      return {
        action: 'increase',
        reasonCode: 'on_time_repayment_ratio',
        // Display the ratio as a percentage. `formatPct` was added in
        // S16-FIX-2 — same display helper used by score-change logic.
        reasonDetail: `${formatPct(ratio)} on-time over ${paid.length} installments`,
      };
    }

    return { action: 'none', reasonCode: 'no_signal' };
  }

  private async evaluateCreditScoreChange(
    tenantId: string,
    line: BnplCreditLine,
  ): Promise<{
    action: 'increase' | 'decrease' | 'none';
    reasonCode: string;
    reasonDetail?: string;
  }> {
    const recent = await this.prisma.scoringResult.findMany({
      where: { tenantId, customerId: line.customerId },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { score: true, createdAt: true },
    });
    if (recent.length < 2) {
      return { action: 'none', reasonCode: 'insufficient_scoring_history' };
    }
    // S16-FIX-2: Decimal-as-string arithmetic — never JS float on
    // credit-decision math. `compare(a, b)` returns -1/0/1; thresholds
    // expressed as bankers'-rounded 4dp fractions.
    const latest = String(recent[0].score);
    const previous = String(recent[1].score);
    if (compare(latest, '0') <= 0 || compare(previous, '0') <= 0) {
      return { action: 'none', reasonCode: 'missing_credit_score' };
    }
    // pctChange = (latest - previous) / previous, kept as Decimal-string.
    const delta = subtract(latest, previous);
    const pctChange = bankersRound(divide(delta, previous), 4);
    // -20% drop = `-0.2000`. compare(pctChange, '-0.2') <= 0 means
    // pctChange is at or below the decrease threshold.
    if (compare(pctChange, '-0.2') <= 0) {
      return {
        action: 'decrease',
        reasonCode: 'score_drop',
        // Format for display only — Decimal math drives the decision.
        reasonDetail: `Score dropped ${formatPct(pctChange)}`,
      };
    }
    if (compare(pctChange, '0.1') >= 0) {
      return {
        action: 'increase',
        reasonCode: 'score_improved',
        reasonDetail: `Score improved ${formatPct(pctChange)}`,
      };
    }
    return { action: 'none', reasonCode: 'score_stable' };
  }

  // ─── Math + config helpers ──────────────────────────────────────────

  /**
   * Apply the configured cap to the limit change. Decimal-as-string per
   * CLAUDE.md — the percentage math goes through `@lons/common` helpers
   * to avoid float drift.
   */
  private computeBoundedLimit(
    currentLimit: string | { toString(): string },
    action: 'increase' | 'decrease',
    rules: IBnplCreditLimitRules,
  ): string {
    const current = String(currentLimit);
    if (action === 'increase') {
      // Precision-preserving order — same pattern as Sprint 14 billing.
      const delta = bankersRound(
        divide(multiply(current, String(rules.maxIncreasePercent)), '1'),
        4,
      );
      return bankersRound(add(current, delta), 4);
    }
    // decrease
    const delta = bankersRound(
      divide(multiply(current, String(rules.maxDecreasePercent)), '1'),
      4,
    );
    const next = subtract(current, delta);
    return compare(next, '0') < 0 ? '0.0000' : bankersRound(next, 4);
  }

  /**
   * Proportional rescaling of availableLimit when approvedLimit drops.
   * Example: was approved=1000/available=600, new approved=800 →
   * new available = 600 * (800/1000) = 480. Keeps utilisation ratio
   * constant.
   */
  private scaleAvailable(
    available: string,
    previousApproved: string,
    newApproved: string,
  ): string {
    if (compare(previousApproved, '0') === 0) return '0.0000';
    // available * newApproved / previousApproved — multiply first.
    const scaled = bankersRound(
      divide(multiply(available, newApproved), previousApproved),
      4,
    );
    return compare(scaled, '0') < 0 ? '0.0000' : scaled;
  }

  private async loadRules(
    tenantId: string,
    productId: string,
  ): Promise<IBnplCreditLimitRules> {
    try {
      const product = await this.prisma.product.findFirst({
        where: { id: productId, tenantId },
        select: { bnplConfig: true },
      });
      const config = product?.bnplConfig as Record<string, unknown> | null;
      const raw = config?.creditLimitRules as
        | Partial<IBnplCreditLimitRules>
        | undefined;
      if (!raw) return DEFAULT_LIMIT_RULES;
      return {
        maxIncreasePercent:
          typeof raw.maxIncreasePercent === 'number'
            ? raw.maxIncreasePercent
            : DEFAULT_LIMIT_RULES.maxIncreasePercent,
        maxDecreasePercent:
          typeof raw.maxDecreasePercent === 'number'
            ? raw.maxDecreasePercent
            : DEFAULT_LIMIT_RULES.maxDecreasePercent,
        reviewFrequencyDays:
          typeof raw.reviewFrequencyDays === 'number'
            ? raw.reviewFrequencyDays
            : DEFAULT_LIMIT_RULES.reviewFrequencyDays,
        minCompletedTransactionsForIncrease:
          typeof raw.minCompletedTransactionsForIncrease === 'number'
            ? raw.minCompletedTransactionsForIncrease
            : DEFAULT_LIMIT_RULES.minCompletedTransactionsForIncrease,
        onTimeRepaymentRatioThreshold:
          typeof raw.onTimeRepaymentRatioThreshold === 'number'
            ? raw.onTimeRepaymentRatioThreshold
            : DEFAULT_LIMIT_RULES.onTimeRepaymentRatioThreshold,
        latePaymentsForDecrease:
          typeof raw.latePaymentsForDecrease === 'number'
            ? raw.latePaymentsForDecrease
            : DEFAULT_LIMIT_RULES.latePaymentsForDecrease,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to load credit-limit rules for product ${productId}: ${(err as Error).message}. Using defaults.`,
      );
      return DEFAULT_LIMIT_RULES;
    }
  }

  private daysSince(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  }

  private endOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
  }
}

/**
 * S16-FIX-2: Decimal-as-string → `±N.N%` for human-readable reasonDetail.
 * Multiplies by 100 (Decimal) then rounds to 1dp. Only used for the
 * display string; the decision itself is made in Decimal space.
 */
function formatPct(pctDecimal: string): string {
  const asPercent = bankersRound(multiply(pctDecimal, '100'), 1);
  // Strip trailing `.0` for terse display, prefix sign for clarity.
  const signed = compare(asPercent, '0') > 0 ? `+${asPercent}` : asPercent;
  return `${signed}%`;
}
