import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import {
  PrismaService,
  Prisma,
  MerchantSettlementStatus,
  SettlementType,
  BnplTransactionStatus,
} from '@lons/database';
import {
  EventBusService,
  multiply,
  subtract,
  bankersRound,
  add,
  ValidationError,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

/**
 * Merchant settlement engine (Sprint 11 Track B / B7).
 *
 * Two flows:
 *
 *   - IMMEDIATE: called inline by the origination service after a purchase
 *     is approved. Creates a single-transaction settlement row with
 *     status `pending`, then `settleNow` is called to dispatch via the
 *     wallet adapter (mocked in dev/CI). Platform takes the credit risk
 *     in this mode — the merchant is paid before the customer pays.
 *
 *   - T_PLUS_1: called by a daily scheduler job. Groups all approved-but-
 *     unsettled transactions for each T+1 merchant in the period and
 *     creates one batched settlement row per merchant. Settlement
 *     dispatch is the same as IMMEDIATE.
 *
 * Net amount is `purchaseAmount × (1 − merchant.discountRate)`. The
 * platform retains `purchaseAmount × discountRate` as its margin.
 */

/** Adapter the settlement engine uses to actually disburse to merchant wallets. */
export interface MerchantSettlementAdapter {
  payout(input: {
    merchantWalletId: string;
    walletProvider: string;
    amount: string;
    reference: string;
  }): Promise<
    | { success: true; walletRef: string }
    | { success: false; reason: string }
  >;
}

export const MERCHANT_SETTLEMENT_ADAPTER = Symbol('MERCHANT_SETTLEMENT_ADAPTER');

@Injectable()
export class MerchantSettlementService {
  private readonly logger = new Logger('MerchantSettlementService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    /**
     * Wallet adapter for dispatching settlements. Optional because dev/CI
     * environments may not have a real adapter wired — in that case the
     * settlement row stays `pending` and ops can retry later.
     */
    @Optional()
    @Inject(MERCHANT_SETTLEMENT_ADAPTER)
    private readonly adapter?: MerchantSettlementAdapter,
  ) {}

  /**
   * Create the IMMEDIATE settlement row for one transaction. Called
   * inline by the origination service after purchase approval. The
   * transaction must be in `approved` status.
   */
  async createImmediateSettlement(
    tenantId: string,
    transactionId: string,
  ): Promise<{ settlementId: string; netAmount: string }> {
    const tx = await this.prisma.bnplTransaction.findFirst({
      where: { id: transactionId, tenantId },
      include: { merchant: true },
    });
    if (!tx) throw new ValidationError(`BnplTransaction ${transactionId} not found`);
    if (tx.merchant.settlementType !== SettlementType.IMMEDIATE) {
      throw new ValidationError(
        `Merchant ${tx.merchantId} is not on IMMEDIATE settlement (got ${tx.merchant.settlementType})`,
      );
    }
    if (tx.status !== BnplTransactionStatus.approved) {
      throw new ValidationError(
        `Transaction ${transactionId} is ${tx.status}, only approved transactions can be settled`,
      );
    }

    const { gross, fee, net } = computeAmounts(
      String(tx.purchaseAmount),
      String(tx.merchant.discountRate),
    );

    const today = startOfUtcDay(new Date());

    const settlement = await this.prisma.merchantSettlement.create({
      data: {
        tenantId,
        merchantId: tx.merchantId,
        currency: tx.currency,
        grossAmount: gross,
        discountFee: fee,
        netAmount: net,
        transactionCount: 1,
        periodStart: today,
        periodEnd: today,
        status: MerchantSettlementStatus.pending,
      },
    });

    // FIX 5: link the transaction to the settlement via settlementId on
    // the BnplTransaction side (was: transactionId on the settlement
    // side, which couldn't accommodate T+1 batches).
    await this.prisma.bnplTransaction.update({
      where: { id: tx.id },
      data: { settlementId: settlement.id },
    });

    this.eventBus.emitAndBuild(EventType.BNPL_MERCHANT_SETTLEMENT_GENERATED, tenantId, {
      settlementId: settlement.id,
      merchantId: tx.merchantId,
      grossAmount: gross,
      discountFee: fee,
      netAmount: net,
      currency: tx.currency,
      transactionCount: 1,
      periodStart: today.toISOString(),
      periodEnd: today.toISOString(),
    });

    // FIX 6: auto-dispatch the settlement if a wallet adapter is
    // registered. Failure here doesn't roll back the settlement row —
    // it stays `pending`/`failed` for ops retry.
    if (this.adapter) {
      try {
        await this.settleNow(tenantId, settlement.id, this.adapter);
      } catch (e) {
        this.logger.error(
          `IMMEDIATE settlement dispatch failed for ${settlement.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    return { settlementId: settlement.id, netAmount: net };
  }

  /**
   * T+1 daily batch. For every T_PLUS_1 merchant with approved-but-
   * unsettled transactions in the period, create one settlement row that
   * groups them. The transactions remain unchanged — the settlement row
   * itself is the link.
   */
  async runDailyBatch(
    tenantId: string,
    today: Date = new Date(),
  ): Promise<{ batches: number; transactions: number }> {
    const periodEnd = startOfUtcDay(today);
    const periodStart = addDays(periodEnd, -1);

    // Find all T+1 merchants with eligible transactions.
    const merchants = await this.prisma.merchant.findMany({
      where: {
        tenantId,
        settlementType: SettlementType.T_PLUS_1,
        deletedAt: null,
        status: 'active',
      },
    });

    let batches = 0;
    let transactions = 0;

    for (const merchant of merchants) {
      const eligible = await this.prisma.bnplTransaction.findMany({
        where: {
          tenantId,
          merchantId: merchant.id,
          status: BnplTransactionStatus.approved,
          settlement: null,
          createdAt: { gte: periodStart, lt: periodEnd },
        },
        select: {
          id: true,
          purchaseAmount: true,
          currency: true,
        },
      });
      if (eligible.length === 0) continue;

      const currency = eligible[0].currency;
      let gross = '0';
      for (const t of eligible) {
        if (t.currency !== currency) {
          // T+1 batch is per-currency. Skip non-matching txs — they'll
          // pick up in their currency's batch (future enhancement).
          continue;
        }
        gross = add(gross, String(t.purchaseAmount));
      }
      const { fee, net } = computeAmounts(gross, String(merchant.discountRate));

      const settlement = await this.prisma.merchantSettlement.create({
        data: {
          tenantId,
          merchantId: merchant.id,
          currency,
          grossAmount: gross,
          discountFee: fee,
          netAmount: net,
          transactionCount: eligible.length,
          periodStart,
          periodEnd,
          status: MerchantSettlementStatus.pending,
        },
      });

      // FIX 5: link every transaction in the batch to this settlement
      // via settlementId. Without this, the transactions remain
      // orphaned — no audit trail from a tx to its settlement run.
      await this.prisma.bnplTransaction.updateMany({
        where: { id: { in: eligible.map((t) => t.id) }, tenantId },
        data: { settlementId: settlement.id },
      });

      this.eventBus.emitAndBuild(EventType.BNPL_MERCHANT_SETTLEMENT_GENERATED, tenantId, {
        settlementId: settlement.id,
        merchantId: merchant.id,
        grossAmount: gross,
        discountFee: fee,
        netAmount: net,
        currency,
        transactionCount: eligible.length,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });

      // FIX 6: auto-dispatch the batched settlement if an adapter is
      // registered. Failure stays in `pending`/`failed` for ops retry.
      if (this.adapter) {
        try {
          await this.settleNow(tenantId, settlement.id, this.adapter);
        } catch (e) {
          this.logger.error(
            `Failed to dispatch settlement ${settlement.id}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }

      batches += 1;
      transactions += eligible.length;
    }

    this.logger.log(
      `T+1 batch run: ${batches} settlements covering ${transactions} transactions`,
    );
    return { batches, transactions };
  }

  /**
   * Dispatch a pending settlement via the wallet adapter and update its
   * status. Idempotent — calling twice on a settled row is a no-op.
   */
  async settleNow(
    tenantId: string,
    settlementId: string,
    adapter: MerchantSettlementAdapter,
  ): Promise<{ ok: boolean; reason?: string }> {
    const settlement = await this.prisma.merchantSettlement.findFirst({
      where: { id: settlementId, tenantId },
      include: { merchant: true },
    });
    if (!settlement) throw new ValidationError(`MerchantSettlement ${settlementId} not found`);
    if (settlement.status === MerchantSettlementStatus.settled) {
      return { ok: true };
    }
    if (settlement.status === MerchantSettlementStatus.failed) {
      // Allow retry of failed dispatches.
    }
    if (!settlement.merchant.walletId || !settlement.merchant.walletProvider) {
      const reason = 'Merchant has no wallet configured for settlement';
      await this.prisma.merchantSettlement.update({
        where: { id: settlement.id },
        data: { status: MerchantSettlementStatus.failed, failureReason: reason },
      });
      this.eventBus.emitAndBuild(EventType.BNPL_MERCHANT_SETTLEMENT_FAILED, tenantId, {
        settlementId: settlement.id,
        merchantId: settlement.merchantId,
        netAmount: String(settlement.netAmount),
        reason,
      });
      return { ok: false, reason };
    }

    await this.prisma.merchantSettlement.update({
      where: { id: settlement.id },
      data: { status: MerchantSettlementStatus.processing },
    });

    const result = await adapter.payout({
      merchantWalletId: settlement.merchant.walletId,
      walletProvider: settlement.merchant.walletProvider,
      amount: String(settlement.netAmount),
      reference: `merchant-settlement-${settlement.id}`,
    });

    if (!result.success) {
      await this.prisma.merchantSettlement.update({
        where: { id: settlement.id },
        data: {
          status: MerchantSettlementStatus.failed,
          failureReason: result.reason,
        },
      });
      this.eventBus.emitAndBuild(EventType.BNPL_MERCHANT_SETTLEMENT_FAILED, tenantId, {
        settlementId: settlement.id,
        merchantId: settlement.merchantId,
        netAmount: String(settlement.netAmount),
        reason: result.reason,
      });
      return { ok: false, reason: result.reason };
    }

    const settledAt = new Date();
    await this.prisma.merchantSettlement.update({
      where: { id: settlement.id },
      data: {
        status: MerchantSettlementStatus.settled,
        settledAt,
        walletRef: result.walletRef,
      },
    });

    this.eventBus.emitAndBuild(EventType.BNPL_MERCHANT_SETTLEMENT_COMPLETED, tenantId, {
      settlementId: settlement.id,
      merchantId: settlement.merchantId,
      netAmount: String(settlement.netAmount),
      walletRef: result.walletRef,
      settledAt: settledAt.toISOString(),
    });

    return { ok: true };
  }
}

// ───────────────────────────────────────────────────────────────────────
// Internals
// ───────────────────────────────────────────────────────────────────────

interface SettlementAmounts {
  gross: string;
  fee: string;
  net: string;
}

/** `gross` minus `discountRate × gross`. All Decimal-string. */
function computeAmounts(gross: string, discountRate: string): SettlementAmounts {
  const fee = bankersRound(multiply(gross, discountRate), 4);
  const net = subtract(gross, fee);
  return { gross: bankersRound(gross, 4), fee, net };
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

// `Prisma` import is for future extension (raw query usage in batch).
void Prisma;
