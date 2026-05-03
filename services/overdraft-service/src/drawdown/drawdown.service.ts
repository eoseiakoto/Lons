import { Injectable, Logger } from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  CreditLineStatus,
  DrawdownStatus,
} from '@lons/database';
import {
  EventBusService,
  add,
  subtract,
  bankersRound,
  compare,
  isPositive,
  multiply,
  isZero,
} from '@lons/common';
import { EventType, IWalletBalanceInsufficientEvent } from '@lons/event-contracts';

import { CreditLineCacheService, CreditLineCacheEntry } from '../cache/credit-line-cache.service';

/**
 * The decision portion of the drawdown flow can return one of these
 * outcomes. The wallet disbursement happens after `approved` but before
 * the drawdown is marked `completed` — see `processDrawdown` for the full
 * flow.
 */
export type DrawdownDecision =
  | { status: 'approved'; drawdownId: string; amount: string; feeAmount: string }
  | { status: 'declined'; reason: DrawdownDeclineReason };

export type DrawdownDeclineReason =
  | 'no_credit_line'
  | 'inactive_credit_line'
  | 'insufficient_limit'
  | 'invalid_amount';

/**
 * Adapter contract the drawdown service uses to actually disburse funds.
 * The integration-service supplies a real implementation; tests use stubs.
 */
export interface WalletDisbursementAdapter {
  disburse(input: {
    walletId: string;
    amount: string;
    transactionRef: string;
  }): Promise<{ success: true; walletRef: string } | { success: false; reason: string }>;
}

export const WALLET_DISBURSEMENT_ADAPTER = Symbol('WALLET_DISBURSEMENT_ADAPTER');

@Injectable()
export class DrawdownService {
  private readonly logger = new Logger('DrawdownService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly cache: CreditLineCacheService,
  ) {}

  /**
   * Real-time drawdown flow (SPEC §6.1). Driven by an
   * `IWalletBalanceInsufficientEvent` consumed from BullMQ. Returns the
   * decision so the calling consumer can ack the wallet provider — for the
   * REST SP-mediated path the resolver returns this same shape.
   *
   * The contract:
   *   - On `approved`: a Drawdown row exists in `completed` (after wallet
   *     disbursement) or `failed` (with rolled-back balances). Either way,
   *     the credit line has been updated.
   *   - On `declined`: no Drawdown row is created. A
   *     WALLET_OVERDRAFT_DECLINED event is emitted for analytics.
   */
  async processDrawdown(
    tenantId: string,
    event: IWalletBalanceInsufficientEvent,
    productId: string,
    adapter: WalletDisbursementAdapter,
  ): Promise<DrawdownDecision> {
    if (!isPositive(event.shortfall)) {
      this.declineEvent(tenantId, event, 'invalid_amount');
      return { status: 'declined', reason: 'invalid_amount' };
    }

    // 4 — eligibility (cache-first; falls back to DB on miss)
    const cl = await this.lookupCreditLine(tenantId, event.customerId, productId);
    if (!cl) {
      this.declineEvent(tenantId, event, 'no_credit_line');
      return { status: 'declined', reason: 'no_credit_line' };
    }

    if (cl.status !== CreditLineStatus.active) {
      this.declineEvent(tenantId, event, 'inactive_credit_line');
      return { status: 'declined', reason: 'inactive_credit_line' };
    }

    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) {
      this.declineEvent(tenantId, event, 'no_credit_line');
      return { status: 'declined', reason: 'no_credit_line' };
    }

    // 4d — fee
    const feeAmount = this.calculateTransactionFee(product, event.shortfall);
    const partialEnabled = Boolean((product.overdraftConfig as Record<string, unknown> | null)?.partialDrawdownEnabled);

    // Determine the final disbursement amount (handles partial-drawdown policy)
    const fullCharge = add(event.shortfall, feeAmount);
    let disburseAmount = event.shortfall;
    let chargeAmount = fullCharge;

    if (compare(fullCharge, String(cl.availableBalance)) > 0) {
      if (!partialEnabled) {
        this.declineEvent(tenantId, event, 'insufficient_limit');
        return { status: 'declined', reason: 'insufficient_limit' };
      }
      // Partial: reduce shortfall to whatever the credit line can cover after fee.
      disburseAmount = bankersRound(subtract(String(cl.availableBalance), feeAmount), 4);
      if (!isPositive(disburseAmount)) {
        this.declineEvent(tenantId, event, 'insufficient_limit');
        return { status: 'declined', reason: 'insufficient_limit' };
      }
      chargeAmount = add(disburseAmount, feeAmount);
    }

    // 5 — fast path: optimistically reserve in Redis. The cache is
    // write-through, so when present it reflects Postgres truth from the
    // last successful operation. Atomic WATCH/MULTI/EXEC means concurrent
    // drawdowns can't both win the limit. We still go through the
    // authoritative Postgres path below; on cache miss or fast-path
    // success, the slow path's `cache.put` resyncs at the end. SPEC §6.2
    // (< 200ms decision target) — cache hit + decline saves a DB round-trip.
    const reservation = await this.cache.tryReserve(
      tenantId,
      event.customerId,
      productId,
      disburseAmount,
      feeAmount,
    );
    if (!reservation.ok) {
      if (reservation.reason === 'inactive') {
        this.declineEvent(tenantId, event, 'inactive_credit_line');
        return { status: 'declined', reason: 'inactive_credit_line' };
      }
      if (reservation.reason === 'insufficient_limit') {
        // Cache says no headroom. Honour it for the no-partial case to
        // skip the Postgres round-trip; for partial-drawdown the slow path
        // is authoritative because the partial amount may have been
        // recomputed above against a slightly different cache snapshot.
        if (!partialEnabled) {
          this.declineEvent(tenantId, event, 'insufficient_limit');
          return { status: 'declined', reason: 'insufficient_limit' };
        }
      }
      // 'cache_miss' or insufficient-with-partial: fall through to Postgres.
    }

    // 5a–b: create Drawdown record + reserve balance atomically.
    // We always go through Postgres for the authoritative write; the cache
    // is updated as a write-through after a successful commit.
    const drawdownId = await this.reserveAndPersist(tenantId, {
      creditLineId: cl.id,
      currency: cl.currency,
      walletBalance: event.availableBalance,
      transactionRef: event.transactionRef,
      amount: disburseAmount,
      feeAmount,
      chargeAmount,
    });

    if (!drawdownId) {
      // Race lost — another concurrent drawdown won the limit. If we'd
      // optimistically debited the cache above, it's now out of sync with
      // Postgres truth — drop it so the next read repopulates fresh.
      if (reservation.ok) {
        await this.cache.invalidate(tenantId, event.customerId, productId);
      }
      this.declineEvent(tenantId, event, 'insufficient_limit');
      return { status: 'declined', reason: 'insufficient_limit' };
    }

    this.eventBus.emitAndBuild(EventType.CREDITLINE_DRAWDOWN_INITIATED, tenantId, {
      drawdownId,
      creditLineId: cl.id,
      customerId: event.customerId,
      amount: disburseAmount,
      feeAmount,
      transactionRef: event.transactionRef,
    });

    // 5c — actually disburse via the wallet adapter
    const disburse = await adapter.disburse({
      walletId: event.walletId,
      amount: disburseAmount,
      transactionRef: event.transactionRef,
    });

    if (!disburse.success) {
      // 7 — rollback balances; mark drawdown failed
      await this.rollback(tenantId, cl.id, drawdownId, chargeAmount, feeAmount, disburse.reason);
      return { status: 'declined', reason: 'insufficient_limit' };
    }

    // 5d — mark drawdown completed; emit
    await this.prisma.drawdown.update({
      where: { id: drawdownId },
      data: {
        status: DrawdownStatus.completed,
        walletRef: disburse.walletRef,
        completedAt: new Date(),
      },
    });

    // Refresh cache snapshot (status + new balances)
    const fresh = await this.prisma.creditLine.findUniqueOrThrow({ where: { id: cl.id } });
    await this.cache.put({
      tenantId,
      customerId: event.customerId,
      productId,
      creditLine: this.snapshotFromRow(fresh),
    });

    this.eventBus.emitAndBuild(EventType.CREDITLINE_DRAWDOWN_COMPLETED, tenantId, {
      creditLineId: cl.id,
      drawdownId,
      customerId: event.customerId,
      amount: disburseAmount,
      feeAmount,
      newAvailableBalance: String(fresh.availableBalance),
      newOutstandingAmount: String(fresh.outstandingAmount),
      transactionRef: event.transactionRef,
    });

    this.logger.log(
      `Drawdown ${drawdownId} completed for customer ${event.customerId.slice(0, 8)}… amount=${disburseAmount} ${cl.currency}`,
    );
    return { status: 'approved', drawdownId, amount: disburseAmount, feeAmount };
  }

  /**
   * Reverse a previously completed drawdown — typically because the
   * upstream wallet provider reversed the underlying transaction (e.g.
   * payment failed, dispute upheld). Restores credit-line balances and
   * marks the Drawdown row `reversed`. The reason is preserved on the
   * emitted `CREDITLINE_DRAWDOWN_REVERSED` event since the schema has no
   * dedicated `reversalReason` column.
   *
   * Only `completed` drawdowns can be reversed — `initiated` ones must
   * fail forward through the normal rollback path, and `failed`/`reversed`
   * drawdowns have already returned the reservation.
   */
  async reverseDrawdown(
    tenantId: string,
    drawdownId: string,
    reason: string,
  ): Promise<{ drawdownId: string; creditLineId: string }> {
    const drawdown = await this.prisma.drawdown.findFirst({
      where: { id: drawdownId, tenantId },
    });
    if (!drawdown) {
      throw new Error(`Drawdown ${drawdownId} not found in tenant`);
    }
    if (drawdown.status !== DrawdownStatus.completed) {
      throw new Error(
        `Drawdown ${drawdownId} is ${drawdown.status}, only completed drawdowns can be reversed`,
      );
    }

    const principal = String(drawdown.amount);
    const feeAmount = String(drawdown.feeAmount);
    const restored = add(principal, feeAmount);

    const cl = await this.prisma.$transaction(async (tx) => {
      await tx.drawdown.update({
        where: { id: drawdownId },
        data: { status: DrawdownStatus.reversed },
      });
      return tx.creditLine.update({
        where: { id: drawdown.creditLineId },
        data: {
          availableBalance: { increment: restored as any },
          outstandingAmount: { decrement: principal as any },
          feesOutstanding: { decrement: feeAmount as any },
        },
      });
    });

    await this.cache.put({
      tenantId,
      customerId: cl.customerId,
      productId: cl.productId,
      creditLine: this.snapshotFromRow(cl),
    });

    this.eventBus.emitAndBuild(EventType.CREDITLINE_DRAWDOWN_REVERSED, tenantId, {
      drawdownId,
      creditLineId: drawdown.creditLineId,
      customerId: cl.customerId,
      amount: principal,
      feeAmount,
      transactionRef: drawdown.transactionRef,
      reason,
    });

    this.logger.log(
      `Drawdown ${drawdownId} reversed for credit line ${drawdown.creditLineId.slice(0, 8)}… amount=${principal} reason=${reason}`,
    );
    return { drawdownId, creditLineId: drawdown.creditLineId };
  }

  /**
   * Compute the per-transaction fee from the product config. Supports two
   * shapes per SPEC §4: `{ type: 'flat', amount: '0.50' }` or
   * `{ type: 'percentage', rate: '0.005' }`. Anything else returns '0'.
   */
  calculateTransactionFee(
    product: { overdraftConfig: Prisma.JsonValue | null },
    shortfall: string,
  ): string {
    const config = (product.overdraftConfig as Record<string, unknown> | null)?.transactionFee as
      | { type: 'flat' | 'percentage'; amount?: string; rate?: string }
      | undefined;
    if (!config) return '0';
    if (config.type === 'flat') {
      return bankersRound(String(config.amount ?? '0'), 4);
    }
    if (config.type === 'percentage') {
      return bankersRound(multiply(shortfall, String(config.rate ?? '0')), 4);
    }
    return '0';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Cache-first credit-line lookup. On miss, reads from Postgres and
   * re-populates the cache before returning. The DB read uses
   * `tenantId_customerId_productId` (the unique index) so it's O(log n).
   */
  private async lookupCreditLine(
    tenantId: string,
    customerId: string,
    productId: string,
  ): Promise<CreditLineCacheEntry | null> {
    const cached = await this.cache.get(tenantId, customerId, productId);
    if (cached) return cached;

    const row = await this.prisma.creditLine.findUnique({
      where: { tenantId_customerId_productId: { tenantId, customerId, productId } },
    });
    if (!row) return null;

    const snapshot = this.snapshotFromRow(row);
    await this.cache.put({ tenantId, customerId, productId, creditLine: snapshot });
    return snapshot;
  }

  /**
   * Atomic-ish reserve: opens a transaction with `SELECT ... FOR UPDATE` on
   * the credit line row, re-checks availableBalance, debits the row, and
   * inserts the Drawdown record. Returns the drawdown id on success or
   * `null` if a concurrent drawdown beat us to the limit.
   */
  private async reserveAndPersist(
    tenantId: string,
    input: {
      creditLineId: string;
      currency: string;
      walletBalance: string;
      transactionRef: string;
      amount: string;
      feeAmount: string;
      chargeAmount: string;
    },
  ): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE — Postgres-level row lock for the duration of
      // the transaction. Prevents two concurrent drawdowns from both reading
      // the same availableBalance and double-spending the limit.
      const locked = await tx.$queryRaw<{ available_balance: string; status: string; outstanding_amount: string; fees_outstanding: string }[]>`
        SELECT available_balance, status, outstanding_amount, fees_outstanding
        FROM credit_lines
        WHERE id = ${input.creditLineId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) return null;
      const row = locked[0];
      if (row.status !== CreditLineStatus.active) return null;
      if (compare(String(row.available_balance), input.chargeAmount) < 0) return null;

      const newAvailable = subtract(String(row.available_balance), input.chargeAmount);
      const newOutstanding = add(String(row.outstanding_amount), input.amount);
      const newFees = add(String(row.fees_outstanding), input.feeAmount);

      await tx.creditLine.update({
        where: { id: input.creditLineId },
        data: {
          availableBalance: newAvailable,
          outstandingAmount: newOutstanding,
          feesOutstanding: newFees,
          lastDrawdownAt: new Date(),
        },
      });

      const drawdown = await tx.drawdown.create({
        data: {
          tenantId,
          creditLineId: input.creditLineId,
          amount: input.amount,
          currency: input.currency,
          walletBalance: input.walletBalance,
          transactionRef: input.transactionRef,
          feeAmount: input.feeAmount,
          status: DrawdownStatus.initiated,
        },
      });
      return drawdown.id;
    });
  }

  /**
   * Reverses a reservation made by `reserveAndPersist` when the wallet
   * disbursement failed downstream. Marks the drawdown failed and restores
   * the credit line balances and cache.
   */
  private async rollback(
    tenantId: string,
    creditLineId: string,
    drawdownId: string,
    chargeAmount: string,
    feeAmount: string,
    failureReason: string,
  ): Promise<void> {
    const cl = await this.prisma.$transaction(async (tx) => {
      await tx.drawdown.update({
        where: { id: drawdownId },
        data: {
          status: DrawdownStatus.failed,
          failureReason,
        },
      });
      // Restore balances. The Drawdown amount is the disburse portion
      // (chargeAmount - feeAmount); restoring chargeAmount to availableBalance
      // and removing chargeAmount-feeAmount from outstanding gives us back
      // the pre-reservation state exactly.
      const principal = subtract(chargeAmount, feeAmount);
      return tx.creditLine.update({
        where: { id: creditLineId },
        data: {
          availableBalance: { increment: chargeAmount as any },
          outstandingAmount: { decrement: principal as any },
          feesOutstanding: { decrement: feeAmount as any },
        },
      });
    });

    await this.cache.put({
      tenantId,
      customerId: cl.customerId,
      productId: cl.productId,
      creditLine: this.snapshotFromRow(cl),
    });

    this.eventBus.emitAndBuild(EventType.CREDITLINE_DRAWDOWN_FAILED, tenantId, {
      drawdownId,
      creditLineId,
      reason: failureReason,
    });

    void isZero; // tree-shake guard for future rollback math validation
  }

  private declineEvent(
    tenantId: string,
    event: IWalletBalanceInsufficientEvent,
    reason: DrawdownDeclineReason,
  ): void {
    this.eventBus.emitAndBuild(EventType.WALLET_OVERDRAFT_DECLINED, tenantId, {
      customerId: event.customerId,
      walletId: event.walletId,
      transactionRef: event.transactionRef,
      reason,
    });
  }

  /** Build a cache snapshot from a Prisma `CreditLine` row. */
  private snapshotFromRow(row: {
    id: string;
    status: CreditLineStatus;
    currency: string;
    approvedLimit: Prisma.Decimal | string;
    availableBalance: Prisma.Decimal | string;
    outstandingAmount: Prisma.Decimal | string;
    interestRate: Prisma.Decimal | string;
  }): CreditLineCacheEntry {
    return {
      id: row.id,
      status: row.status,
      currency: row.currency,
      approvedLimit: String(row.approvedLimit),
      availableBalance: String(row.availableBalance),
      outstandingAmount: String(row.outstandingAmount),
      interestRate: String(row.interestRate),
    };
  }
}
