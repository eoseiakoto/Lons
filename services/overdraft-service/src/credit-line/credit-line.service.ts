import { Injectable, Logger } from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  CreditLineStatus,
  ProductType,
  CustomerStatus,
  ProductStatus,
  KycLevel,
} from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  isZero,
  compare,
  isPositive,
  subtract,
  max as decMax,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { CreditLineCacheService } from '../cache/credit-line-cache.service';

/**
 * Allowed status transitions for a credit line. Mirrors SPEC §3.2.
 *
 * `closed` requires every monetary balance to be zero — the service enforces
 * that invariant in addition to the from-state check.
 */
/**
 * Ordering of KYC levels for "meets-minimum" comparisons. Mirrors the
 * `KycLevel` enum in the Prisma schema; higher ordinal = stricter KYC.
 */
const KYC_LEVEL_ORDER: Record<string, number> = {
  none: 0,
  tier_1: 1,
  tier_2: 2,
  tier_3: 3,
};

const ALLOWED_TRANSITIONS: Record<CreditLineStatus, CreditLineStatus[]> = {
  pending_activation: [CreditLineStatus.active],
  active: [
    CreditLineStatus.frozen,
    CreditLineStatus.suspended,
    CreditLineStatus.closed,
    CreditLineStatus.expired,
  ],
  frozen: [CreditLineStatus.active, CreditLineStatus.closed],
  suspended: [CreditLineStatus.active],
  expired: [CreditLineStatus.closed],
  closed: [],
};

export interface ActivateCreditLineInput {
  customerId: string;
  productCode: string;
  /** Limit recommended by the scoring engine; may be capped by product.maxAmount. */
  recommendedLimit: string;
  /** Optional override — falls back to product.interestRate. */
  interestRateOverride?: string;
  /** Audit trail: which subsystem produced this activation. */
  triggeredBy?: string;
}

@Injectable()
export class CreditLineService {
  private readonly logger = new Logger('CreditLineService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly cache: CreditLineCacheService,
  ) {}

  /**
   * Activate a new credit line for `customerId` against the overdraft product
   * with code `productCode`. Implements SPEC §5.1 steps 2 and 6 (validation
   * and credit line creation). Pre-qualification, scoring, and approval
   * decisions are expected to have run upstream — this service trusts the
   * caller's `recommendedLimit`.
   */
  async activateCreditLine(
    tenantId: string,
    input: ActivateCreditLineInput,
  ): Promise<{ creditLineId: string; approvedLimit: string }> {
    // 2a — customer exists and is active
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, tenantId, deletedAt: null },
    });
    if (!customer) throw new NotFoundError('Customer', input.customerId);
    if (customer.status !== CustomerStatus.active) {
      throw new ValidationError(`Customer is not active (status: ${customer.status})`);
    }

    // 2c — product exists, is active, and is OVERDRAFT type
    const product = await this.prisma.product.findFirst({
      where: { tenantId, code: input.productCode, deletedAt: null },
    });
    if (!product) throw new NotFoundError('Product', input.productCode);
    if (product.type !== ProductType.overdraft) {
      throw new ValidationError(
        `Product ${input.productCode} is type ${product.type}, expected overdraft`,
      );
    }
    if (product.status !== ProductStatus.active) {
      throw new ValidationError(`Product ${input.productCode} is not active`);
    }
    if (!product.lenderId) {
      throw new ValidationError(`Overdraft product ${input.productCode} has no funding lender`);
    }

    // 2b — customer KYC level meets product minimum (SPEC §5.1 step 2b).
    // Product KYC requirement is stored in `eligibilityRules.minKycLevel`
    // (defaults to `none` when unset). Customer's level lives on `kycLevel`.
    const eligibilityRules =
      (product.eligibilityRules as Record<string, unknown> | null) ?? {};
    const minKycLevel = (eligibilityRules.minKycLevel as string | undefined) ?? KycLevel.none;
    const customerKycLevel = customer.kycLevel ?? KycLevel.none;
    if ((KYC_LEVEL_ORDER[customerKycLevel] ?? 0) < (KYC_LEVEL_ORDER[minKycLevel] ?? 0)) {
      throw new ValidationError(
        `Customer KYC level '${customerKycLevel}' is below product minimum '${minKycLevel}'`,
      );
    }

    // 2d — no existing active overdraft credit line for this customer + product
    const existing = await this.prisma.creditLine.findUnique({
      where: {
        tenantId_customerId_productId: {
          tenantId,
          customerId: input.customerId,
          productId: product.id,
        },
      },
    });
    if (existing && existing.status !== CreditLineStatus.closed) {
      throw new ValidationError(
        `Customer already has a ${existing.status} credit line for this product`,
      );
    }

    // 6 — credit line creation. Cap by product.maxAmount and floor by
    // product.minAmount so the assigned limit always falls within the
    // product's configured bounds.
    const productMax = product.maxAmount ? String(product.maxAmount) : input.recommendedLimit;
    const productMin = product.minAmount ? String(product.minAmount) : '0';
    const capped =
      compare(input.recommendedLimit, productMax) > 0 ? productMax : input.recommendedLimit;
    const approvedLimit = decMax(capped, productMin);
    const interestRate =
      input.interestRateOverride ??
      (product.interestRate ? String(product.interestRate) : '0');
    const overdraftConfig = (product.overdraftConfig as Record<string, unknown> | null) ?? {};
    const cycleStartDay = Number((overdraftConfig.billingCycleStartDay as number | undefined) ?? 1);
    const cycleDays = Number((overdraftConfig.billingCycleDays as number | undefined) ?? 30);
    const lifecycleDays = Number(
      (overdraftConfig.contractLifecycleDays as number | undefined) ?? 365,
    );

    const now = new Date();
    const cycleStart = new Date(now);
    cycleStart.setHours(0, 0, 0, 0);
    const cycleEnd = new Date(cycleStart);
    cycleEnd.setDate(cycleEnd.getDate() + cycleDays);
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + lifecycleDays);

    const creditLine = await this.prisma.creditLine.create({
      data: {
        tenantId,
        customerId: input.customerId,
        productId: product.id,
        lenderId: product.lenderId,
        currency: product.currency,
        approvedLimit,
        availableBalance: approvedLimit,
        outstandingAmount: '0',
        interestRate,
        interestAccrued: '0',
        feesOutstanding: '0',
        penaltiesAccrued: '0',
        status: CreditLineStatus.active,
        billingCycleDay: cycleStartDay,
        currentCycleStart: cycleStart,
        currentCycleEnd: cycleEnd,
        activatedAt: now,
        expiresAt,
      },
    });

    // 6c — initial CreditLimitChange audit record
    await this.prisma.creditLimitChange.create({
      data: {
        tenantId,
        creditLineId: creditLine.id,
        previousLimit: '0',
        newLimit: approvedLimit,
        reasonCode: 'initial_assignment',
        triggeredBy: input.triggeredBy ?? 'scoring_engine',
      },
    });

    // 6e — populate the wallet→customer mapping (FIX 3 / Sprint 11 A10).
    // Inbound wallet webhooks resolve via this table instead of the legacy
    // O(n) `customer.metadata.walletId` scan. We do this in the service
    // (not just the GraphQL resolver) so every activation path — REST,
    // future programmatic callers, scheduler — populates the mapping.
    // Idempotent via upsert: re-activations or backfill races are safe.
    const customerMetadata = (customer.metadata as Record<string, unknown> | null) ?? {};
    const walletId = customerMetadata.walletId as string | undefined;
    const walletProvider = customerMetadata.walletProvider as string | undefined;
    if (walletId && walletProvider) {
      await this.prisma.walletAccountMapping.upsert({
        where: {
          provider_walletId: { provider: walletProvider, walletId },
        },
        create: {
          tenantId,
          customerId: input.customerId,
          walletId,
          provider: walletProvider,
          isPrimary: true,
        },
        update: {},
      });
    }

    // 6d — populate Redis cache (write-through)
    await this.cache.put({
      tenantId,
      customerId: input.customerId,
      productId: product.id,
      creditLine: {
        id: creditLine.id,
        status: creditLine.status,
        currency: creditLine.currency,
        approvedLimit,
        availableBalance: approvedLimit,
        outstandingAmount: '0',
        interestRate,
      },
    });

    // 7a — emit activation event
    this.eventBus.emitAndBuild(EventType.CREDITLINE_ACTIVATED, tenantId, {
      creditLineId: creditLine.id,
      customerId: input.customerId,
      productId: product.id,
      approvedLimit,
      interestRate,
      expiresAt: expiresAt.toISOString(),
    });

    this.logger.log(
      `Activated credit line ${creditLine.id} for customer ${input.customerId.slice(0, 8)}… limit=${approvedLimit} ${product.currency}`,
    );
    return { creditLineId: creditLine.id, approvedLimit };
  }

  /**
   * Deactivate (close) a credit line. SPEC §5.2: requires all four monetary
   * balances at zero, then transitions to `closed`. Subscriptions are NOT
   * touched here — caller should deactivate the subscription separately if
   * required.
   */
  async deactivateCreditLine(
    tenantId: string,
    creditLineId: string,
    closedReason: string = 'customer_deactivation',
  ) {
    const cl = await this.prisma.creditLine.findFirst({
      where: { id: creditLineId, tenantId },
    });
    if (!cl) throw new NotFoundError('CreditLine', creditLineId);

    const balanceFields: Array<keyof typeof cl> = [
      'outstandingAmount',
      'interestAccrued',
      'feesOutstanding',
      'penaltiesAccrued',
    ];
    for (const f of balanceFields) {
      if (!isZero(String(cl[f]))) {
        throw new ValidationError(
          `Cannot close credit line: ${String(f)} is ${String(cl[f])} (must be zero)`,
        );
      }
    }

    return this.transitionStatus(tenantId, creditLineId, CreditLineStatus.closed, {
      closedAt: new Date(),
      closedReason,
    });
  }

  /**
   * Freeze a credit line (e.g. fraud, manual SP action). New drawdowns are
   * blocked but interest continues to accrue on outstanding balance.
   */
  async freeze(tenantId: string, creditLineId: string, reason: string) {
    const cl = await this.requireCreditLine(tenantId, creditLineId);
    this.assertTransitionAllowed(cl.status, CreditLineStatus.frozen);

    const updated = await this.prisma.creditLine.update({
      where: { id: creditLineId },
      data: {
        status: CreditLineStatus.frozen,
        frozenAt: new Date(),
        frozenReason: reason,
      },
    });
    await this.cache.invalidate(tenantId, cl.customerId, cl.productId);

    this.eventBus.emitAndBuild(EventType.CREDITLINE_FROZEN, tenantId, {
      creditLineId,
      customerId: cl.customerId,
      reason,
    });
    return updated;
  }

  async unfreeze(tenantId: string, creditLineId: string) {
    const cl = await this.requireCreditLine(tenantId, creditLineId);
    if (cl.status !== CreditLineStatus.frozen) {
      throw new ValidationError(`Credit line is ${cl.status}, not frozen`);
    }
    const updated = await this.prisma.creditLine.update({
      where: { id: creditLineId },
      data: {
        status: CreditLineStatus.active,
        frozenAt: null,
        frozenReason: null,
      },
    });
    await this.cache.invalidate(tenantId, cl.customerId, cl.productId);

    this.eventBus.emitAndBuild(EventType.CREDITLINE_UNFROZEN, tenantId, {
      creditLineId,
      customerId: cl.customerId,
    });
    return updated;
  }

  /**
   * Adjust the approved limit. Records a `CreditLimitChange` audit row and
   * recomputes `availableBalance` so the customer's headroom equals
   * `newLimit - outstandingAmount`. Refuses limits below current outstanding.
   */
  async adjustLimit(
    tenantId: string,
    creditLineId: string,
    input: {
      newLimit: string;
      reasonCode: string;
      reasonDetail?: string;
      triggeredBy: string;
    },
  ) {
    const cl = await this.requireCreditLine(tenantId, creditLineId);
    if (!isPositive(input.newLimit) && !isZero(input.newLimit)) {
      throw new ValidationError(`newLimit must be non-negative (got ${input.newLimit})`);
    }
    // SPEC §10.4: a limit decrease below outstanding is allowed — it does
    // not reduce the outstanding balance, but available headroom is clamped
    // to zero by computeAvailableBalance below.

    const previousLimit = String(cl.approvedLimit);
    const newAvailable = this.computeAvailableBalance(input.newLimit, String(cl.outstandingAmount));

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.creditLimitChange.create({
        data: {
          tenantId,
          creditLineId,
          previousLimit,
          newLimit: input.newLimit,
          reasonCode: input.reasonCode,
          reasonDetail: input.reasonDetail,
          triggeredBy: input.triggeredBy,
        },
      });
      return tx.creditLine.update({
        where: { id: creditLineId },
        data: {
          approvedLimit: input.newLimit,
          availableBalance: newAvailable,
          lastLimitReviewAt: new Date(),
        },
      });
    });

    await this.cache.put({
      tenantId,
      customerId: cl.customerId,
      productId: cl.productId,
      creditLine: {
        id: cl.id,
        status: updated.status,
        currency: cl.currency,
        approvedLimit: input.newLimit,
        availableBalance: newAvailable,
        outstandingAmount: String(cl.outstandingAmount),
        interestRate: String(cl.interestRate),
      },
    });

    this.eventBus.emitAndBuild(EventType.CREDITLINE_LIMIT_CHANGED, tenantId, {
      creditLineId,
      customerId: cl.customerId,
      previousLimit,
      newLimit: input.newLimit,
      reasonCode: input.reasonCode,
      triggeredBy: input.triggeredBy,
    });
    return updated;
  }

  /**
   * Waive accrued penalties on a credit line. SPEC §9.2 / FR-DM-002.3:
   * operator action with documented reason. Supports partial waiver — the
   * `amount` may be less than the current `penaltiesAccrued`. Records a
   * `CreditLimitChange` audit row with `reasonCode: 'penalty_waiver'` so
   * the financial event is traceable; emits `PENALTY_WAIVED` for downstream
   * consumers (statements, reporting). Does NOT touch `outstandingAmount`
   * or `availableBalance` — penalties are tracked separately from principal.
   */
  async waivePenalties(
    tenantId: string,
    creditLineId: string,
    input: { amount: string; reason: string; operatorId: string; idempotencyKey?: string },
  ) {
    // F-OD-1: log idempotency key for traceability. Full dedup will land with
    // the broader idempotency table; for now the penaltiesAccrued bounds-check
    // below is the safety net for replays of the same waiver.
    if (input.idempotencyKey) {
      this.logger.debug(`Waiver idempotencyKey: ${input.idempotencyKey}`);
    }
    const cl = await this.requireCreditLine(tenantId, creditLineId);
    if (!isPositive(input.amount)) {
      throw new ValidationError(`Waiver amount must be positive (got ${input.amount})`);
    }
    const currentPenalties = String(cl.penaltiesAccrued);
    if (compare(input.amount, currentPenalties) > 0) {
      throw new ValidationError(
        `Waiver amount ${input.amount} exceeds penaltiesAccrued ${currentPenalties}`,
      );
    }
    const newPenalties = subtract(currentPenalties, input.amount);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.creditLimitChange.create({
        data: {
          tenantId,
          creditLineId,
          previousLimit: currentPenalties,
          newLimit: newPenalties,
          reasonCode: 'penalty_waiver',
          reasonDetail: input.reason,
          triggeredBy: input.operatorId,
        },
      });
      return tx.creditLine.update({
        where: { id: creditLineId },
        data: { penaltiesAccrued: newPenalties },
      });
    });

    await this.cache.invalidate(tenantId, cl.customerId, cl.productId);

    this.eventBus.emitAndBuild(EventType.PENALTY_WAIVED, tenantId, {
      creditLineId,
      customerId: cl.customerId,
      waivedAmount: input.amount,
      previousPenalties: currentPenalties,
      remainingPenalties: newPenalties,
      reason: input.reason,
      operatorId: input.operatorId,
    });
    return updated;
  }

  /**
   * Suspend a credit line (SPEC §10.2 step 1 — periodic limit review).
   * Mirrors `freeze()` but for the limit-review lifecycle. Emits
   * `CREDITLINE_SUSPENDED`.
   */
  async suspend(tenantId: string, creditLineId: string, reason: string) {
    const cl = await this.requireCreditLine(tenantId, creditLineId);
    this.assertTransitionAllowed(cl.status, CreditLineStatus.suspended);

    const updated = await this.prisma.creditLine.update({
      where: { id: creditLineId },
      data: { status: CreditLineStatus.suspended },
    });
    await this.cache.invalidate(tenantId, cl.customerId, cl.productId);

    this.eventBus.emitAndBuild(EventType.CREDITLINE_SUSPENDED, tenantId, {
      creditLineId,
      customerId: cl.customerId,
      reason,
    });
    return updated;
  }

  /**
   * Reinstate a suspended credit line back to active (SPEC §10.2 step 6).
   * Counterpart to `suspend()`. Emits `CREDITLINE_REINSTATED`.
   */
  async reinstate(tenantId: string, creditLineId: string) {
    const cl = await this.requireCreditLine(tenantId, creditLineId);
    if (cl.status !== CreditLineStatus.suspended) {
      throw new ValidationError(`Credit line is ${cl.status}, not suspended`);
    }
    const updated = await this.prisma.creditLine.update({
      where: { id: creditLineId },
      data: { status: CreditLineStatus.active },
    });
    await this.cache.invalidate(tenantId, cl.customerId, cl.productId);

    this.eventBus.emitAndBuild(EventType.CREDITLINE_REINSTATED, tenantId, {
      creditLineId,
      customerId: cl.customerId,
    });
    return updated;
  }

  /**
   * Schedule a periodic limit review for a credit line (SPEC §10.2). The
   * full review pipeline (suspend → score → adjust → reinstate) lands in
   * Sprint 12; for Sprint 11 we exercise the event contract so downstream
   * consumers (notification, ops dashboard) can be wired now.
   */
  async scheduleLimitReview(
    tenantId: string,
    creditLineId: string,
    scheduledFor: Date,
    reasonCode: string = 'periodic_review',
  ) {
    const cl = await this.requireCreditLine(tenantId, creditLineId);
    this.eventBus.emitAndBuild(EventType.CREDITLINE_LIMIT_REVIEW_SCHEDULED, tenantId, {
      creditLineId,
      customerId: cl.customerId,
      scheduledFor: scheduledFor.toISOString(),
      reasonCode,
    });
    return { creditLineId, scheduledFor: scheduledFor.toISOString() };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /** Read or throw. Used everywhere we need a typed credit line + tenant guard. */
  async requireCreditLine(tenantId: string, creditLineId: string) {
    const cl = await this.prisma.creditLine.findFirst({
      where: { id: creditLineId, tenantId },
    });
    if (!cl) throw new NotFoundError('CreditLine', creditLineId);
    return cl;
  }

  /**
   * Refuses transitions that aren't on the SPEC §3.2 graph. Throws
   * ValidationError with a precise from→to message.
   */
  assertTransitionAllowed(from: CreditLineStatus, to: CreditLineStatus): void {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Invalid credit line status transition: ${from} → ${to}`,
      );
    }
  }

  /** Internal helper used by deactivateCreditLine + expire flows. */
  private async transitionStatus(
    tenantId: string,
    creditLineId: string,
    to: CreditLineStatus,
    extra: Prisma.CreditLineUpdateInput = {},
  ) {
    const cl = await this.requireCreditLine(tenantId, creditLineId);
    this.assertTransitionAllowed(cl.status, to);

    const updated = await this.prisma.creditLine.update({
      where: { id: creditLineId },
      data: { status: to, ...extra },
    });
    await this.cache.invalidate(tenantId, cl.customerId, cl.productId);

    if (to === CreditLineStatus.closed) {
      this.eventBus.emitAndBuild(EventType.CREDITLINE_CLOSED, tenantId, {
        creditLineId,
        customerId: cl.customerId,
        reason: extra.closedReason ?? 'unspecified',
      });
    }
    return updated;
  }

  /** approvedLimit - outstandingAmount, clamped at zero. */
  private computeAvailableBalance(approvedLimit: string, outstanding: string): string {
    return decMax(subtract(approvedLimit, outstanding), '0');
  }
}
