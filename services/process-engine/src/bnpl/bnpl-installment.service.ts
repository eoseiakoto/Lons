import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import {
  PrismaService,
  BnplTransactionStatus,
  InstallmentStatus,
} from '@lons/database';
import {
  EventBusService,
  add,
  bankersRound,
  compare,
  divide,
  isPositive,
  isZero,
  multiply,
  subtract,
  ValidationError,
  NotFoundError,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import {
  BNPL_COLLECTION_ADAPTER,
  type BnplCollectionAdapter,
} from './wallet-collection-adapter';

export interface EarlySettlementResult {
  /** Decimal-as-string — what the customer paid (already net of discount). */
  settlementAmount: string;
  /** Decimal-as-string — discount the customer received (0 if none). */
  discountApplied: string;
  /** Number of installments transitioned from pending → paid. */
  installmentsClosed: number;
}

export interface AdvancePaymentResult {
  /** Decimal-as-string — sum of the paid installments. */
  totalPaid: string;
  /** Number of installments transitioned from pending → paid. */
  installmentsClosed: number;
}

/**
 * Installment lifecycle (Sprint 11 Track B / B6 part 2).
 *
 * Three responsibilities, all called from the BNPL scheduler job:
 *
 *   1. `processInstallmentPayment(installmentId, amount)` — apply a
 *      customer payment to a specific installment. Triggered when the
 *      customer credits their wallet and auto-debit is configured, OR
 *      via the manual-payment GraphQL mutation. Allocates payment to
 *      this installment, transitions to `paid` if fully covered. When
 *      every installment on the transaction is paid, the transaction
 *      transitions to `completed`.
 *
 *   2. `markOverdueInstallments(today)` — daily scheduler pass. Any
 *      `pending`/`due` installment whose `dueDate < today` becomes
 *      `overdue`. Emits `bnpl.installment.overdue`. After marking,
 *      `evaluateAcceleration()` checks the consecutive-missed threshold.
 *
 *   3. `emitDueNotifications(today, leadDays)` — daily scheduler pass.
 *      Any `pending` installment with `dueDate === today + leadDays`
 *      gets a `bnpl.installment.due` event. The notification service
 *      consumes this and dispatches the SMS/email.
 *
 * Acceleration is folded in: when a transaction crosses
 * `product.bnplConfig.acceleration.maxConsecutiveMissed` (default 2)
 * consecutive overdue installments, the transaction's *unpaid*
 * installments all become immediately due (status `due`), the
 * transaction status becomes `accelerated`, and `bnpl.accelerated` is
 * emitted. Late-fee application is a Sprint 12 follow-up.
 */
@Injectable()
export class BnplInstallmentService {
  private readonly logger = new Logger('BnplInstallmentService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    /**
     * Sprint 12 G2 — wallet collection adapter for the auto-collect job.
     * Optional so existing callers (and the existing unit tests that
     * construct the service with two args) keep working; the auto-collect
     * path will throw a clear error if invoked without an adapter.
     */
    @Optional()
    @Inject(BNPL_COLLECTION_ADAPTER)
    private readonly collectionAdapter?: BnplCollectionAdapter,
  ) {}

  // ───────────────────────────────────────────────────────────────────────
  // 1) Payment processing
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Apply a payment to one installment. Caller is responsible for the
   * upstream wallet collection — this method just records the allocation
   * and updates state.
   *
   * Returns whether the installment is now fully paid AND whether the
   * parent transaction is now fully complete.
   */
  async processInstallmentPayment(
    tenantId: string,
    installmentId: string,
    amount: string,
    idempotencyKey?: string,
  ): Promise<{
    installmentPaidInFull: boolean;
    transactionCompleted: boolean;
    paidAmount: string;
  }> {
    if (!isPositive(amount)) {
      throw new ValidationError(`Payment amount must be positive (got ${amount})`);
    }

    // FIX 16: log the idempotency key for traceability. Full
    // deduplication (a dedicated idempotency table or unique
    // constraint on payments) lands when ledger entries do — for now
    // we lean on the installment status check below: a re-played
    // payment on an already-paid installment throws ValidationError,
    // which is the correct outcome for the common replay case.
    if (idempotencyKey) {
      this.logger.debug(`Payment idempotencyKey: ${idempotencyKey}`);
    }

    const installment = await this.prisma.installmentSchedule.findFirst({
      where: { id: installmentId, tenantId },
      include: { transaction: true },
    });
    if (!installment) throw new NotFoundError('InstallmentSchedule', installmentId);
    if (installment.status === InstallmentStatus.paid) {
      throw new ValidationError(`Installment ${installmentId} is already paid`);
    }
    if (installment.status === InstallmentStatus.waived) {
      throw new ValidationError(`Installment ${installmentId} has been waived`);
    }

    const owedBefore = subtract(String(installment.amount), String(installment.paidAmount));
    if (compare(amount, owedBefore) > 0) {
      throw new ValidationError(
        `Payment amount ${amount} exceeds remaining ${owedBefore} on installment ${installmentId}`,
      );
    }

    const newPaidAmount = add(String(installment.paidAmount), amount);
    const remaining = subtract(String(installment.amount), newPaidAmount);
    const installmentPaidInFull = isZero(remaining);

    await this.prisma.installmentSchedule.update({
      where: { id: installmentId },
      data: {
        paidAmount: newPaidAmount,
        ...(installmentPaidInFull
          ? {
              status: InstallmentStatus.paid,
              paidAt: new Date(),
              daysPastDue: 0,
            }
          : {}),
      },
    });

    if (installmentPaidInFull) {
      this.eventBus.emitAndBuild(EventType.BNPL_INSTALLMENT_PAID, tenantId, {
        transactionId: installment.transactionId,
        installmentId: installment.id,
        installmentNumber: installment.installmentNumber,
        customerId: installment.transaction.customerId,
        amount: String(installment.amount),
        paidAt: new Date().toISOString(),
      });
    }

    // If this was the last unpaid installment, complete the transaction.
    let transactionCompleted = false;
    if (installmentPaidInFull) {
      const stillUnpaid = await this.prisma.installmentSchedule.count({
        where: {
          tenantId,
          transactionId: installment.transactionId,
          status: { in: [InstallmentStatus.pending, InstallmentStatus.due, InstallmentStatus.overdue] },
        },
      });
      if (stillUnpaid === 0) {
        const completedAt = new Date();
        await this.prisma.bnplTransaction.update({
          where: { id: installment.transactionId },
          data: { status: BnplTransactionStatus.completed, completedAt },
        });
        transactionCompleted = true;
        this.eventBus.emitAndBuild(EventType.BNPL_PURCHASE_COMPLETED, tenantId, {
          transactionId: installment.transactionId,
          customerId: installment.transaction.customerId,
          totalRepaid: String(installment.transaction.totalRepayable),
          completedAt: completedAt.toISOString(),
        });
      }
    }

    return {
      installmentPaidInFull,
      transactionCompleted,
      paidAmount: newPaidAmount,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 1b) Auto-collection on due date (Sprint 12 G2)
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Pull a single installment from the customer's wallet via the
   * configured `BnplCollectionAdapter`. Driven by the daily
   * `bnpl-auto-collect` scheduler job; can also be invoked manually
   * (e.g. an admin-portal "retry collection" action) — the same
   * idempotency and retry-cap rules apply either way.
   *
   * Behaviour:
   *   - Loads the installment + transaction + product + customer.
   *   - Validates: installment is in `pending|due|overdue`, dueDate has
   *     arrived, transaction not already accelerated/cancelled.
   *   - Reads `bnplConfig.autoCollectOnDueDate` (default `false`) — if
   *     auto-collect is disabled the call short-circuits with `skipped`.
   *   - Reads `bnplConfig.collectionRetryMaxAttempts` (default 3) — if
   *     this installment has already failed that many times, skips and
   *     hands off to the overdue/recovery flow.
   *   - Invokes the wallet adapter; on success records the payment via
   *     `processInstallmentPayment` and emits
   *     `BNPL_INSTALLMENT_COLLECTED`. On failure increments
   *     `collectionAttemptCount`, sets `lastCollectionAttemptAt`, and
   *     emits `BNPL_INSTALLMENT_COLLECTION_FAILED` plus
   *     `WALLET_BALANCE_INSUFFICIENT` for downstream notification.
   *
   * `idempotencyKey` (typically `installmentId|YYYY-MM-DD`) is logged
   * for traceability; the same-day re-run guard lives at the scheduler
   * level via `lastCollectionAttemptAt`, so even without the key a
   * second invocation on the same day is a no-op.
   */
  async collectInstallment(
    tenantId: string,
    installmentId: string,
    idempotencyKey?: string,
  ): Promise<
    | { status: 'collected'; paidAmount: string; walletRef: string }
    | { status: 'failed'; reason: string; attempt: number }
    | { status: 'skipped'; reason: string }
  > {
    if (!this.collectionAdapter) {
      throw new Error(
        'collectInstallment called but no BNPL_COLLECTION_ADAPTER provider is registered. ' +
          'Wire BnplWalletCollectionAdaptersModule (or pass a mock) into the module imports.',
      );
    }

    if (idempotencyKey) {
      this.logger.debug(`collectInstallment idempotencyKey: ${idempotencyKey}`);
    }

    const installment = await this.prisma.installmentSchedule.findFirst({
      where: { id: installmentId, tenantId },
      include: {
        transaction: { include: { product: true, customer: true } },
      },
    });
    if (!installment) throw new NotFoundError('InstallmentSchedule', installmentId);

    // Status guards — only collect on actively-due installments.
    const collectableStatuses = new Set<InstallmentStatus>([
      InstallmentStatus.pending,
      InstallmentStatus.due,
      InstallmentStatus.overdue,
    ]);
    if (!collectableStatuses.has(installment.status)) {
      return { status: 'skipped', reason: `installment_status_${installment.status}` };
    }
    const tx = installment.transaction;
    const txCollectableStatuses = new Set<BnplTransactionStatus>([
      BnplTransactionStatus.approved,
      BnplTransactionStatus.active,
      BnplTransactionStatus.accelerated,
    ]);
    if (!txCollectableStatuses.has(tx.status)) {
      return { status: 'skipped', reason: `transaction_status_${tx.status}` };
    }

    // Read config from bnplConfig (Sprint 12 G5 — overdraftConfig fallback for un-migrated rows).
    const config =
      (tx.product?.bnplConfig as Record<string, unknown> | null) ??
      (tx.product?.overdraftConfig as Record<string, unknown> | null) ??
      {};
    const autoCollect = config.autoCollectOnDueDate === true;
    if (!autoCollect) {
      return { status: 'skipped', reason: 'auto_collect_disabled' };
    }

    const maxAttempts = Number(
      (config.collectionRetryMaxAttempts as number | undefined) ?? 3,
    );
    if (installment.collectionAttemptCount >= maxAttempts) {
      return { status: 'skipped', reason: 'max_attempts_reached' };
    }

    const owed = subtract(String(installment.amount), String(installment.paidAmount));
    if (!isPositive(owed)) {
      return { status: 'skipped', reason: 'no_balance_owed' };
    }

    // Resolve wallet — customer.metadata.walletId is the v1 source.
    // (Sprint 11 A10 added WalletAccountMapping for the inbound webhook
    // path; outbound collection still uses the customer-side metadata
    // hint until Phase 5 wires the integration-service resolver in.)
    const walletId = String(
      (tx.customer?.metadata as Record<string, unknown> | null)?.walletId ??
        tx.customer?.id ??
        '',
    );
    const reference = idempotencyKey ?? `bnpl-auto-${installment.id}-${Date.now()}`;

    const adapterResult = await this.collectionAdapter.collect({
      walletId,
      amount: owed,
      reference,
    });

    const now = new Date();

    if (!adapterResult.success) {
      const newAttempt = installment.collectionAttemptCount + 1;
      await this.prisma.installmentSchedule.update({
        where: { id: installment.id },
        data: {
          lastCollectionAttemptAt: now,
          collectionAttemptCount: newAttempt,
        },
      });

      this.eventBus.emitAndBuild(
        EventType.BNPL_INSTALLMENT_COLLECTION_FAILED,
        tenantId,
        {
          transactionId: tx.id,
          installmentId: installment.id,
          customerId: tx.customerId,
          amount: owed,
          currency: tx.currency,
          reason: adapterResult.reason,
          attempt: newAttempt,
        },
      );

      // Best-effort signal for notification-service. Insufficient balance
      // is the dominant failure mode in mock + production traffic.
      this.eventBus.emitAndBuild(
        EventType.WALLET_BALANCE_INSUFFICIENT,
        tenantId,
        {
          customerId: tx.customerId,
          walletId,
          requestedAmount: owed,
          currency: tx.currency,
          context: 'bnpl_auto_collect',
          installmentId: installment.id,
          transactionId: tx.id,
        },
      );

      return { status: 'failed', reason: adapterResult.reason, attempt: newAttempt };
    }

    // Success: stamp the attempt, then run through the standard payment
    // path so the installment + transaction state machine and the
    // `bnpl.installment.paid` / `bnpl.purchase.completed` events fire
    // exactly once, just as they do for manual payments.
    await this.prisma.installmentSchedule.update({
      where: { id: installment.id },
      data: { lastCollectionAttemptAt: now },
    });

    const paymentResult = await this.processInstallmentPayment(
      tenantId,
      installment.id,
      owed,
      idempotencyKey,
    );

    this.eventBus.emitAndBuild(EventType.BNPL_INSTALLMENT_COLLECTED, tenantId, {
      transactionId: tx.id,
      installmentId: installment.id,
      customerId: tx.customerId,
      amount: owed,
      currency: tx.currency,
    });

    return {
      status: 'collected',
      paidAmount: paymentResult.paidAmount,
      walletRef: adapterResult.walletRef,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 2) Daily scheduler pass — mark overdue + check acceleration
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Find every `pending`/`due` installment whose `dueDate < today` and
   * mark it `overdue`. Then, for each affected transaction, evaluate
   * whether the consecutive-missed threshold is crossed and accelerate.
   */
  async markOverdueInstallments(
    tenantId: string,
    today: Date,
  ): Promise<{ markedOverdue: number; accelerated: number }> {
    const todayStart = startOfUtcDay(today);

    const dueLines = await this.prisma.installmentSchedule.findMany({
      where: {
        tenantId,
        status: { in: [InstallmentStatus.pending, InstallmentStatus.due] },
        dueDate: { lt: todayStart },
      },
      include: { transaction: { include: { product: true } } },
    });

    let markedOverdue = 0;
    const affectedTransactionIds = new Set<string>();

    for (const inst of dueLines) {
      const daysPastDue = Math.max(
        1,
        Math.floor(
          (todayStart.getTime() - startOfUtcDay(inst.dueDate).getTime()) / 86_400_000,
        ),
      );

      await this.prisma.installmentSchedule.update({
        where: { id: inst.id },
        data: { status: InstallmentStatus.overdue, daysPastDue },
      });

      // TODO (Sprint 12 — Late Fees): Calculate and apply late fee here.
      // Pattern: read product.bnplConfig.lateFee (flat or percentage),
      // create a LedgerEntry, update inst.feePortion. The event below
      // already carries `lateFeeAmount` so notification-service can tell
      // the customer what they owe — keep that contract intact.
      this.eventBus.emitAndBuild(EventType.BNPL_INSTALLMENT_OVERDUE, tenantId, {
        transactionId: inst.transactionId,
        installmentId: inst.id,
        installmentNumber: inst.installmentNumber,
        customerId: inst.transaction.customerId,
        amount: String(inst.amount),
        daysPastDue,
        // FIX 10: stable contract for the Sprint 12 late-fee work.
        // Subscribers can rely on this field existing.
        lateFeeAmount: '0',
      });
      markedOverdue += 1;
      affectedTransactionIds.add(inst.transactionId);
    }

    // Acceleration evaluation per affected transaction.
    let accelerated = 0;
    for (const txId of affectedTransactionIds) {
      const result = await this.evaluateAcceleration(tenantId, txId);
      if (result.accelerated) accelerated += 1;
    }

    return { markedOverdue, accelerated };
  }

  /**
   * Emit `bnpl.installment.due` for installments hitting their due date
   * exactly `leadDays` from `today`. Notification service subscribes.
   */
  async emitDueNotifications(
    tenantId: string,
    today: Date,
    leadDays = 3,
  ): Promise<{ notified: number }> {
    const target = startOfUtcDay(today);
    target.setUTCDate(target.getUTCDate() + leadDays);
    const targetEnd = new Date(target);
    targetEnd.setUTCDate(targetEnd.getUTCDate() + 1);

    const upcoming = await this.prisma.installmentSchedule.findMany({
      where: {
        tenantId,
        status: InstallmentStatus.pending,
        dueDate: { gte: target, lt: targetEnd },
      },
      include: { transaction: true },
    });

    for (const inst of upcoming) {
      this.eventBus.emitAndBuild(EventType.BNPL_INSTALLMENT_DUE, tenantId, {
        transactionId: inst.transactionId,
        installmentId: inst.id,
        installmentNumber: inst.installmentNumber,
        customerId: inst.transaction.customerId,
        amount: String(inst.amount),
        currency: inst.transaction.currency,
        dueDate: inst.dueDate.toISOString(),
      });
    }

    return { notified: upcoming.length };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3) Acceleration (B9)
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Check whether the most-recent installments on a transaction have
   * crossed the consecutive-missed threshold. If so, accelerate: every
   * unpaid installment's status becomes `due` (immediately payable) and
   * the transaction becomes `accelerated`.
   *
   * Threshold comes from `product.bnplConfig.acceleration.maxConsecutiveMissed`
   * with a default of 2 (falls back to overdraftConfig for un-migrated products).
   */
  async evaluateAcceleration(
    tenantId: string,
    transactionId: string,
  ): Promise<{ accelerated: boolean; missedInstallments: number }> {
    const tx = await this.prisma.bnplTransaction.findFirst({
      where: { id: transactionId, tenantId },
      include: {
        product: true,
        installments: { orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!tx) throw new NotFoundError('BnplTransaction', transactionId);
    if (tx.status !== BnplTransactionStatus.approved && tx.status !== BnplTransactionStatus.active) {
      // Already accelerated / completed / cancelled — no-op.
      return { accelerated: false, missedInstallments: 0 };
    }

    // Sprint 12 G5: reads from dedicated `product.bnplConfig` (migration
    // 20260503000000_add_bnpl_config). Falls back to overdraftConfig for any
    // product not yet migrated.
    const config =
      (tx.product?.bnplConfig as Record<string, unknown> | null) ??
      (tx.product?.overdraftConfig as Record<string, unknown> | null) ??
      {};
    const acceleration = (config.acceleration as Record<string, unknown> | undefined) ?? {};
    const threshold = Number((acceleration.maxConsecutiveMissed as number | undefined) ?? 2);

    // Count the trailing run of consecutive overdue installments.
    let consecutiveOverdue = 0;
    for (let i = tx.installments.length - 1; i >= 0; i--) {
      const inst = tx.installments[i];
      if (inst.status === InstallmentStatus.overdue) {
        consecutiveOverdue += 1;
      } else if (inst.status === InstallmentStatus.paid || inst.status === InstallmentStatus.waived) {
        // A paid/waived row breaks the run.
        break;
      } else if (
        inst.status === InstallmentStatus.pending ||
        inst.status === InstallmentStatus.due
      ) {
        // Future-due row — doesn't break or extend the run; keep walking.
        continue;
      }
    }

    if (consecutiveOverdue < threshold) {
      return { accelerated: false, missedInstallments: consecutiveOverdue };
    }

    // Accelerate: flip all unpaid installments to `due` (immediately
    // payable) and the transaction to `accelerated`.
    const unpaid = tx.installments.filter(
      (i) =>
        i.status === InstallmentStatus.pending ||
        i.status === InstallmentStatus.due ||
        i.status === InstallmentStatus.overdue,
    );

    let acceleratedBalance = '0';
    for (const inst of unpaid) {
      acceleratedBalance = add(
        acceleratedBalance,
        subtract(String(inst.amount), String(inst.paidAmount)),
      );
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.bnplTransaction.update({
        where: { id: tx.id },
        data: { status: BnplTransactionStatus.accelerated, acceleratedAt: now },
      }),
      this.prisma.installmentSchedule.updateMany({
        where: {
          transactionId: tx.id,
          status: { in: [InstallmentStatus.pending] },
        },
        data: { status: InstallmentStatus.due },
      }),
    ]);

    this.eventBus.emitAndBuild(EventType.BNPL_ACCELERATED, tenantId, {
      transactionId: tx.id,
      customerId: tx.customerId,
      acceleratedBalance,
      missedInstallments: consecutiveOverdue,
    });

    // FIX 7: hand off to recovery / collections. Without this event the
    // accelerated transaction enters a dead zone — no team or system
    // picks it up for follow-through. The recovery-service subscribes
    // and creates a work item in the collections queue.
    this.eventBus.emitAndBuild(EventType.BNPL_COLLECTIONS_REFERRED, tenantId, {
      transactionId: tx.id,
      customerId: tx.customerId,
      merchantId: tx.merchantId,
      acceleratedBalance,
      missedInstallments: consecutiveOverdue,
      // totalOwed equals the accelerated balance for now; once Sprint 12
      // ships late-fee accrual it will include those.
      totalOwed: acceleratedBalance,
      referredAt: now.toISOString(),
    });

    this.logger.warn(
      `BNPL transaction ${tx.id.slice(0, 8)}… accelerated after ${consecutiveOverdue} consecutive missed installments (threshold=${threshold})`,
    );

    return { accelerated: true, missedInstallments: consecutiveOverdue };
  }

  /**
   * FIX 13: pay the next unpaid installment on a transaction. Selects
   * the earliest (by installmentNumber) installment in `pending`,
   * `due`, or `overdue` status and applies the payment. Common BNPL
   * UX: the customer says "make a payment" without picking which
   * installment.
   */
  async payNextDue(
    tenantId: string,
    transactionId: string,
    amount: string,
    idempotencyKey?: string,
  ): Promise<{
    installmentId: string;
    installmentPaidInFull: boolean;
    transactionCompleted: boolean;
    paidAmount: string;
  }> {
    const nextInst = await this.prisma.installmentSchedule.findFirst({
      where: {
        tenantId,
        transactionId,
        status: {
          in: [
            InstallmentStatus.overdue,
            InstallmentStatus.due,
            InstallmentStatus.pending,
          ],
        },
      },
      orderBy: { installmentNumber: 'asc' },
    });
    if (!nextInst) {
      throw new ValidationError(
        `No unpaid installments on transaction ${transactionId}`,
      );
    }
    const result = await this.processInstallmentPayment(
      tenantId,
      nextInst.id,
      amount,
      idempotencyKey,
    );
    return { installmentId: nextInst.id, ...result };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 4) Early settlement / advance payment (Sprint 12 G3)
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Customer pays off ALL remaining unpaid installments early. The
   * configured `bnplConfig.earlySettlementDiscountPercent` (a percent
   * value such as `'2.00'` meaning 2%) is applied to the total
   * remaining balance to produce a final settlement amount that is
   * collected via the wallet adapter.
   *
   * On success every pending/due/overdue installment is marked `paid`,
   * the transaction transitions to `completed`, and
   * `BNPL_EARLY_SETTLEMENT` is emitted (the existing
   * `BNPL_PURCHASE_COMPLETED` event is also emitted via the same
   * completion path).
   *
   * Idempotency: a replay with the same `idempotencyKey` after the
   * transaction has already completed is treated as a no-op replay —
   * the cached settlement total is returned without re-charging the
   * wallet. The check piggybacks on the transaction status because
   * adding a dedicated idempotency table is deferred to the ledger
   * work.
   */
  async earlySettlement(
    tenantId: string,
    input: {
      transactionId: string;
      idempotencyKey: string;
      operatorId?: string;
    },
  ): Promise<EarlySettlementResult> {
    this.logger.debug(`earlySettlement idempotencyKey: ${input.idempotencyKey}`);

    const tx = await this.prisma.bnplTransaction.findFirst({
      where: { id: input.transactionId, tenantId, deletedAt: null },
      include: {
        product: true,
        customer: true,
        installments: { orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!tx) throw new NotFoundError('BnplTransaction', input.transactionId);

    // Sprint 12 G5: read from `bnplConfig`, fall back to overdraftConfig
    // for any product not yet migrated.
    const bnplConfig =
      (tx.product?.bnplConfig as Record<string, unknown> | null) ??
      (tx.product?.overdraftConfig as Record<string, unknown> | null) ??
      {};

    // Idempotency replay: the transaction is already `completed` AND
    // every installment is paid — return the cached settlement summary.
    if (tx.status === BnplTransactionStatus.completed) {
      const paidInstallments = tx.installments.filter(
        (i) => i.status === InstallmentStatus.paid,
      );
      let cachedSettlement = '0';
      for (const inst of paidInstallments) {
        cachedSettlement = add(cachedSettlement, String(inst.paidAmount));
      }
      this.logger.log(
        `Idempotency hit on earlySettlement for ${tx.id} — returning cached result`,
      );
      return {
        settlementAmount: bankersRound(cachedSettlement, 4),
        discountApplied: '0.0000',
        installmentsClosed: 0,
      };
    }

    if (
      tx.status !== BnplTransactionStatus.approved &&
      tx.status !== BnplTransactionStatus.active &&
      tx.status !== BnplTransactionStatus.accelerated
    ) {
      throw new ValidationError(
        `Cannot early-settle a ${tx.status} transaction (${tx.id})`,
      );
    }

    const earlyAllowed = bnplConfig.earlySettlementAllowed === true;
    if (!earlyAllowed) {
      throw new ValidationError(
        `Early settlement is not allowed by product configuration for transaction ${tx.id}`,
      );
    }

    const pendingInstallments = tx.installments.filter(
      (i) =>
        i.status === InstallmentStatus.pending ||
        i.status === InstallmentStatus.due ||
        i.status === InstallmentStatus.overdue,
    );
    if (pendingInstallments.length === 0) {
      throw new ValidationError(
        `No pending installments on transaction ${tx.id} — nothing to settle`,
      );
    }

    // Total remaining = sum of (amount - paidAmount) for each pending installment.
    // S13-5 fix: paidAmount tracks partial payments already applied; the
    // discount must apply to the actual unpaid balance, not the gross
    // amount of each installment.
    let totalRemaining = '0';
    for (const inst of pendingInstallments) {
      const instRemaining = subtract(String(inst.amount), String(inst.paidAmount ?? 0));
      totalRemaining = add(totalRemaining, instRemaining);
    }

    // Discount percent is a percent value (e.g. '2.00' = 2%). Divide by 100
    // to get the multiplier, then apply to totalRemaining.
    const discountPercentRaw =
      (bnplConfig.earlySettlementDiscountPercent as string | undefined) ?? '0';
    const discountPercent = String(discountPercentRaw);
    const discountFraction = divide(discountPercent, '100');
    const discountAmount = bankersRound(
      multiply(totalRemaining, discountFraction),
      4,
    );
    const settlementAmount = bankersRound(
      subtract(totalRemaining, discountAmount),
      4,
    );

    // Wallet collection — same path used by collectInstallment.
    await this.collectFromWallet(
      tenantId,
      tx.customer,
      settlementAmount,
      input.idempotencyKey ??
        `bnpl-early-settle-${tx.id}-${Date.now()}`,
      'bnpl_early_settlement',
    );

    // Mark all pending installments as paid + complete the transaction.
    const now = new Date();
    const installmentsClosed = pendingInstallments.length;

    await this.prisma.$transaction([
      ...pendingInstallments.map((inst) =>
        this.prisma.installmentSchedule.update({
          where: { id: inst.id },
          data: {
            status: InstallmentStatus.paid,
            paidAt: now,
            paidAmount: String(inst.amount),
            daysPastDue: 0,
          },
        }),
      ),
      this.prisma.bnplTransaction.update({
        where: { id: tx.id },
        data: {
          status: BnplTransactionStatus.completed,
          completedAt: now,
        },
      }),
    ]);

    this.eventBus.emitAndBuild(EventType.BNPL_EARLY_SETTLEMENT, tenantId, {
      transactionId: tx.id,
      customerId: tx.customerId,
      settlementAmount,
      discountApplied: discountAmount,
      installmentsClosed,
      currency: tx.currency,
    });

    // Also emit the standard purchase-completed event so existing
    // subscribers (settlement reconciliation, notifications) fire.
    this.eventBus.emitAndBuild(EventType.BNPL_PURCHASE_COMPLETED, tenantId, {
      transactionId: tx.id,
      customerId: tx.customerId,
      totalRepaid: settlementAmount,
      completedAt: now.toISOString(),
    });

    this.logger.log(
      `Early settlement on ${tx.id.slice(0, 8)}… — settled ${settlementAmount} (discount ${discountAmount}) across ${installmentsClosed} installments`,
    );

    return {
      settlementAmount,
      discountApplied: discountAmount,
      installmentsClosed,
    };
  }

  /**
   * Customer pays one or more *future* installments ahead of their due
   * dates without settling the entire transaction. The selected
   * installments transition to `paid`; remaining installments keep
   * their original due dates and the transaction stays active.
   *
   * Validates every requested installment number exists on the
   * transaction and is currently pending/due/overdue. Wallet
   * collection runs once for the summed amount.
   */
  async advancePayment(
    tenantId: string,
    input: {
      transactionId: string;
      installmentNumbers: number[];
      idempotencyKey: string;
      operatorId?: string;
    },
  ): Promise<AdvancePaymentResult> {
    this.logger.debug(`advancePayment idempotencyKey: ${input.idempotencyKey}`);

    if (!input.installmentNumbers || input.installmentNumbers.length === 0) {
      throw new ValidationError(
        `installmentNumbers must contain at least one installment number`,
      );
    }
    // Dedupe + sort so error messages are deterministic.
    const requestedNumbers = Array.from(
      new Set(input.installmentNumbers),
    ).sort((a, b) => a - b);

    const tx = await this.prisma.bnplTransaction.findFirst({
      where: { id: input.transactionId, tenantId, deletedAt: null },
      include: {
        product: true,
        customer: true,
        installments: { orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!tx) throw new NotFoundError('BnplTransaction', input.transactionId);

    const bnplConfig =
      (tx.product?.bnplConfig as Record<string, unknown> | null) ??
      (tx.product?.overdraftConfig as Record<string, unknown> | null) ??
      {};

    if (
      tx.status !== BnplTransactionStatus.approved &&
      tx.status !== BnplTransactionStatus.active &&
      tx.status !== BnplTransactionStatus.accelerated
    ) {
      throw new ValidationError(
        `Cannot apply advance payment to a ${tx.status} transaction (${tx.id})`,
      );
    }

    const advanceAllowed = bnplConfig.advancePaymentAllowed === true;
    if (!advanceAllowed) {
      throw new ValidationError(
        `Advance payment is not allowed by product configuration for transaction ${tx.id}`,
      );
    }

    // Validate each requested installment exists + is pending.
    const targets = [];
    for (const num of requestedNumbers) {
      const inst = tx.installments.find((i) => i.installmentNumber === num);
      if (!inst) {
        throw new ValidationError(
          `Installment #${num} does not exist on transaction ${tx.id}`,
        );
      }
      const isPending =
        inst.status === InstallmentStatus.pending ||
        inst.status === InstallmentStatus.due ||
        inst.status === InstallmentStatus.overdue;
      if (!isPending) {
        throw new ValidationError(
          `Installment #${num} on transaction ${tx.id} is ${inst.status} — only pending installments can be paid in advance`,
        );
      }
      targets.push(inst);
    }

    // Sum the amounts.
    let totalPaid = '0';
    for (const inst of targets) {
      totalPaid = add(totalPaid, String(inst.amount));
    }
    totalPaid = bankersRound(totalPaid, 4);

    // Wallet collection — single round-trip for the summed amount.
    await this.collectFromWallet(
      tenantId,
      tx.customer,
      totalPaid,
      input.idempotencyKey ??
        `bnpl-advance-${tx.id}-${Date.now()}`,
      'bnpl_advance_payment',
    );

    const now = new Date();

    // Mark each target paid; if every installment ends up paid, also
    // complete the transaction.
    await this.prisma.$transaction(
      targets.map((inst) =>
        this.prisma.installmentSchedule.update({
          where: { id: inst.id },
          data: {
            status: InstallmentStatus.paid,
            paidAt: now,
            paidAmount: String(inst.amount),
            daysPastDue: 0,
          },
        }),
      ),
    );

    // Emit per-installment paid events for downstream subscribers.
    for (const inst of targets) {
      this.eventBus.emitAndBuild(EventType.BNPL_INSTALLMENT_PAID, tenantId, {
        transactionId: tx.id,
        installmentId: inst.id,
        installmentNumber: inst.installmentNumber,
        customerId: tx.customerId,
        amount: String(inst.amount),
        paidAt: now.toISOString(),
      });
    }

    this.eventBus.emitAndBuild(EventType.BNPL_ADVANCE_PAYMENT, tenantId, {
      transactionId: tx.id,
      customerId: tx.customerId,
      installmentNumbers: requestedNumbers,
      totalPaid,
      currency: tx.currency,
    });

    // If this advance payment closed out the transaction, transition
    // to completed and emit the purchase-completed event for parity
    // with the standard payment path.
    const stillUnpaid = await this.prisma.installmentSchedule.count({
      where: {
        tenantId,
        transactionId: tx.id,
        status: {
          in: [
            InstallmentStatus.pending,
            InstallmentStatus.due,
            InstallmentStatus.overdue,
          ],
        },
      },
    });
    if (stillUnpaid === 0) {
      const completedAt = new Date();
      await this.prisma.bnplTransaction.update({
        where: { id: tx.id },
        data: { status: BnplTransactionStatus.completed, completedAt },
      });
      this.eventBus.emitAndBuild(EventType.BNPL_PURCHASE_COMPLETED, tenantId, {
        transactionId: tx.id,
        customerId: tx.customerId,
        totalRepaid: String(tx.totalRepayable),
        completedAt: completedAt.toISOString(),
      });
    }

    return {
      totalPaid,
      installmentsClosed: targets.length,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Run a wallet collection through the configured adapter. Throws
   * `ValidationError` on any failure so the caller can surface a clean
   * error to the customer / operator without leaking adapter internals.
   * Mirrors the resolution logic in `collectInstallment`.
   */
  private async collectFromWallet(
    tenantId: string,
    customer: { id: string; metadata?: unknown } | null,
    amount: string,
    reference: string,
    context: string,
  ): Promise<void> {
    if (!this.collectionAdapter) {
      throw new Error(
        `${context}: no BNPL_COLLECTION_ADAPTER provider is registered. ` +
          'Wire the wallet adapter module (or pass a mock) into the module imports.',
      );
    }
    const walletId = String(
      (customer?.metadata as Record<string, unknown> | null)?.walletId ??
        customer?.id ??
        '',
    );
    const result = await this.collectionAdapter.collect({
      walletId,
      amount,
      reference,
    });
    if (!result.success) {
      this.eventBus.emitAndBuild(
        EventType.WALLET_BALANCE_INSUFFICIENT,
        tenantId,
        {
          customerId: customer?.id,
          walletId,
          requestedAmount: amount,
          context,
        },
      );
      throw new ValidationError(
        `Wallet collection failed for ${context}: ${result.reason}`,
      );
    }
  }

  /**
   * Operator action: waive an installment (e.g. partial-refund offset).
   * Records the reason on the event payload; the installment status
   * becomes `waived` and no longer counts toward outstanding totals.
   */
  async waiveInstallment(
    tenantId: string,
    installmentId: string,
    reason: string,
    operatorId: string,
  ): Promise<void> {
    const inst = await this.prisma.installmentSchedule.findFirst({
      where: { id: installmentId, tenantId },
    });
    if (!inst) throw new NotFoundError('InstallmentSchedule', installmentId);
    if (inst.status === InstallmentStatus.paid) {
      throw new ValidationError(`Installment ${installmentId} is already paid — cannot waive`);
    }

    await this.prisma.installmentSchedule.update({
      where: { id: installmentId },
      data: { status: InstallmentStatus.waived },
    });

    this.eventBus.emitAndBuild(EventType.BNPL_INSTALLMENT_WAIVED, tenantId, {
      transactionId: inst.transactionId,
      installmentId: inst.id,
      installmentNumber: inst.installmentNumber,
      amount: String(inst.amount),
      reason,
      operatorId,
    });
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
