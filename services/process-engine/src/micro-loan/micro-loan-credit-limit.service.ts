import { Injectable, Logger } from '@nestjs/common';

import {
  ContractStatus,
  PrismaService,
  Product,
  ProductType,
  SubscriptionStatus,
} from '@lons/database';
import {
  EventBusService,
  add,
  bankersRound,
  compare,
  divide,
  multiply,
  subtract,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { MicroLoanCreditLimitAuditService } from './micro-loan-credit-limit-audit.service';

interface IReviewConfig {
  minSuccessfulRepayments: number;
  /** Decimal-as-string percentage, e.g. `'10'` for 10%. */
  increasePercent: string;
}

interface IDefaultConfig {
  /** Decimal-as-string percentage, e.g. `'50'` for 50%. */
  reductionPercent: string;
  maxDefaultsBeforeSuspension: number;
}

/**
 * Sprint 16 (S16-4 + S16-5) — micro-loan credit limit lifecycle service.
 *
 * Two public entry points:
 *   - `reviewOnRepayment(...)`: called by REPAYMENT_RECEIVED listener.
 *     If the customer has met the configured on-time-repayment threshold,
 *     increase their credit limit by `increasePercent` (capped at the
 *     product's `maxAmount`).
 *   - `reduceOnDefault(...)`: called by CONTRACT_STATE_CHANGED listener
 *     when a contract enters `default_status`. First default →
 *     `reductionPercent` decrease (default 50%). Repeated defaults
 *     (>= `maxDefaultsBeforeSuspension`) → suspend the line (limit = 0).
 *
 * Both paths write to `Subscription.creditLimit` + `availableLimit` AND
 * append a `MicroLoanCreditLimitChange` audit row in the SAME prisma
 * `$transaction`. That atomicity matters: a credit-limit change without
 * an audit row, or vice versa, would be a regulatory finding.
 *
 * Money math is Decimal-as-string per CLAUDE.md — never `Number()` /
 * native arithmetic on percentages, never floats on credit decisions.
 * The bankers-round-to-4dp pattern matches the rest of the codebase
 * (Sprint 14 billing, Sprint 15 credit-line adjustments).
 *
 * Config lives on `product.eligibilityRules` JSON. When the relevant
 * keys are missing the service falls back to sane defaults rather than
 * throwing — a stale product config should never break a customer's
 * credit lifecycle.
 */
@Injectable()
export class MicroLoanCreditLimitService {
  private readonly logger = new Logger(MicroLoanCreditLimitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly auditService: MicroLoanCreditLimitAuditService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────
  // S16-4 — review on repayment
  // ───────────────────────────────────────────────────────────────────────

  async reviewOnRepayment(
    tenantId: string,
    contractId: string,
    repaymentId: string,
  ): Promise<void> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { product: true, customer: { select: { id: true } } },
    });
    if (!contract || contract.product.type !== ProductType.micro_loan) return;

    // Only review on a CLEAN repayment — `settled` (full payoff) or
    // a contract still in good standing (no days past due).
    if (contract.status !== ContractStatus.settled && contract.daysPastDue > 0) {
      return;
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        customerId: contract.customerId,
        productId: contract.productId,
        status: SubscriptionStatus.active,
      },
    });
    if (!subscription) return;

    // FIX-1: idempotency guard. A duplicate REPAYMENT_RECEIVED for the
    // same repaymentId would otherwise compound the percentage increase
    // (each delivery reads the already-bumped creditLimit and applies
    // another 10%). The check matches `(tenantId, subscriptionId,
    // sourceId, changeType=increase)` so:
    //   - re-delivery of the same event → no-op (returns early)
    //   - a SEPARATE repayment on the same subscription → still triggers
    //   - manual operator increases with sourceId=null are not dedup'd
    //     against repayments (correct — they're operator overrides)
    if (repaymentId) {
      const alreadyReviewed =
        await this.prisma.microLoanCreditLimitChange.findFirst({
          where: {
            tenantId,
            subscriptionId: subscription.id,
            sourceId: repaymentId,
            changeType: 'increase',
          },
        });
      if (alreadyReviewed) {
        this.logger.debug(
          `Credit limit review already processed for repayment ${repaymentId} on subscription ${subscription.id.slice(0, 8)}…; skipping`,
        );
        return;
      }
    }

    const config = this.getReviewConfig(contract.product);

    // Count successful (completed) repayments across all this customer's
    // contracts for this product — this is the trust signal.
    const onTimeRepayments = await this.prisma.repayment.count({
      where: {
        tenantId,
        contract: {
          customerId: contract.customerId,
          productId: contract.productId,
        },
        status: 'completed',
      },
    });

    if (onTimeRepayments < config.minSuccessfulRepayments) {
      this.logger.debug(
        `reviewOnRepayment: ${onTimeRepayments} < ${config.minSuccessfulRepayments} for customer ${contract.customerId.slice(0, 8)}…; no change`,
      );
      return;
    }

    // currentLimit + (currentLimit * pct/100), banker's-rounded.
    const currentLimit = String(subscription.creditLimit ?? '0');
    const increaseAmount = bankersRound(
      divide(multiply(currentLimit, config.increasePercent), '100'),
      4,
    );
    let newLimit = add(currentLimit, increaseAmount);

    // Cap at product max — never exceed.
    const productMax = contract.product.maxAmount
      ? String(contract.product.maxAmount)
      : null;
    if (productMax && compare(newLimit, productMax) > 0) {
      newLimit = productMax;
    }

    // No actual increase → no-op (don't audit a non-change).
    if (compare(newLimit, currentLimit) <= 0) return;

    const newAvailable = add(
      String(subscription.availableLimit ?? '0'),
      subtract(newLimit, currentLimit),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          creditLimit: newLimit,
          availableLimit: newAvailable,
          lastLimitReview: new Date(),
        },
      });
      await this.auditService.record(
        tenantId,
        {
          customerId: contract.customerId,
          subscriptionId: subscription.id,
          previousLimit: currentLimit,
          newLimit,
          changeType: 'increase',
          reason: `Auto review on repayment. On-time repayments: ${onTimeRepayments}`,
          triggeredBy: 'system',
          // FIX-1: stamp the triggering repayment so re-delivery is a no-op.
          sourceId: repaymentId,
        },
        tx,
      );
    });

    this.eventBus.emitAndBuild(
      EventType.MICRO_LOAN_CREDIT_LIMIT_REVIEWED,
      tenantId,
      {
        customerId: contract.customerId,
        subscriptionId: subscription.id,
        previousLimit: currentLimit,
        newLimit,
        changeType: 'increase',
        repaymentId,
      },
    );
  }

  // ───────────────────────────────────────────────────────────────────────
  // S16-5 — reduce on default
  // ───────────────────────────────────────────────────────────────────────

  async reduceOnDefault(
    tenantId: string,
    contractId: string,
  ): Promise<void> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { product: true },
    });
    if (!contract || contract.product.type !== ProductType.micro_loan) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        customerId: contract.customerId,
        productId: contract.productId,
        status: SubscriptionStatus.active,
      },
    });
    if (!subscription) return;

    // FIX-1 (symmetry): same idempotency guard as reviewOnRepayment.
    // A re-delivered CONTRACT_STATE_CHANGED for the same default
    // would otherwise compound the reduction (each delivery reads
    // the already-reduced limit and applies another 50%).
    const alreadyReduced =
      await this.prisma.microLoanCreditLimitChange.findFirst({
        where: {
          tenantId,
          subscriptionId: subscription.id,
          sourceId: contractId,
          changeType: { in: ['decrease', 'suspension'] },
        },
      });
    if (alreadyReduced) {
      this.logger.debug(
        `Default reduction already processed for contract ${contractId.slice(0, 8)}…; skipping`,
      );
      return;
    }

    const currentLimit = String(subscription.creditLimit ?? '0');
    if (compare(currentLimit, '0') <= 0) return; // already zeroed.

    // Count prior defaults across this customer's contracts on this
    // product. Inclusive of the current one (which is already in
    // `default_status` by the time we get here) — that matches the
    // "second default = suspension" intent.
    const previousDefaults = await this.prisma.contract.count({
      where: {
        tenantId,
        customerId: contract.customerId,
        productId: contract.productId,
        status: ContractStatus.default_status,
      },
    });

    const config = this.getDefaultConfig(contract.product);
    let newLimit: string;
    let changeType: 'decrease' | 'suspension';

    if (previousDefaults >= config.maxDefaultsBeforeSuspension) {
      // Repeated default → suspend borrowing entirely.
      newLimit = '0.0000';
      changeType = 'suspension';
    } else {
      const reductionAmount = bankersRound(
        divide(multiply(currentLimit, config.reductionPercent), '100'),
        4,
      );
      const candidate = subtract(currentLimit, reductionAmount);
      newLimit = compare(candidate, '0') < 0 ? '0.0000' : bankersRound(candidate, 4);
      changeType = 'decrease';
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          creditLimit: newLimit,
          // On default, no available headroom regardless of math — the
          // customer cannot borrow until the default is resolved.
          availableLimit: '0.0000',
          lastLimitReview: new Date(),
        },
      });
      await this.auditService.record(
        tenantId,
        {
          customerId: contract.customerId,
          subscriptionId: subscription.id,
          previousLimit: currentLimit,
          newLimit,
          changeType,
          reason:
            `Auto reduction on default. Contract: ${contract.contractNumber}. ` +
            `Previous defaults: ${previousDefaults}`,
          triggeredBy: 'system',
          // FIX-1: sourceId = contractId so a re-delivered
          // CONTRACT_STATE_CHANGED for the same contract doesn't
          // compound the reduction.
          sourceId: contractId,
        },
        tx,
      );
    });

    this.eventBus.emitAndBuild(
      EventType.MICRO_LOAN_CREDIT_LIMIT_REDUCED,
      tenantId,
      {
        customerId: contract.customerId,
        subscriptionId: subscription.id,
        previousLimit: currentLimit,
        newLimit,
        changeType,
        contractId,
      },
    );
  }

  // ───────────────────────────────────────────────────────────────────────
  // Config helpers
  // ───────────────────────────────────────────────────────────────────────

  private getReviewConfig(product: Product): IReviewConfig {
    const raw = (product.eligibilityRules as Record<string, unknown> | null) ?? {};
    return {
      minSuccessfulRepayments:
        typeof raw.minSuccessfulRepayments === 'number' &&
        raw.minSuccessfulRepayments > 0
          ? Math.floor(raw.minSuccessfulRepayments)
          : 3,
      increasePercent:
        typeof raw.creditLimitIncreasePercent === 'string'
          ? raw.creditLimitIncreasePercent
          : typeof raw.creditLimitIncreasePercent === 'number'
            ? String(raw.creditLimitIncreasePercent)
            : '10',
    };
  }

  private getDefaultConfig(product: Product): IDefaultConfig {
    const raw = (product.eligibilityRules as Record<string, unknown> | null) ?? {};
    return {
      reductionPercent:
        typeof raw.creditLimitReductionPercent === 'string'
          ? raw.creditLimitReductionPercent
          : typeof raw.creditLimitReductionPercent === 'number'
            ? String(raw.creditLimitReductionPercent)
            : '50',
      maxDefaultsBeforeSuspension:
        typeof raw.maxDefaultsBeforeSuspension === 'number' &&
        raw.maxDefaultsBeforeSuspension > 0
          ? Math.floor(raw.maxDefaultsBeforeSuspension)
          : 2,
    };
  }
}
