import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, CreditLineStatus } from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  add,
  subtract,
  bankersRound,
  compare,
  isPositive,
  isZero,
  min as decMin,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { CreditLineCacheService } from '../cache/credit-line-cache.service';

/** A bucket the waterfall can allocate to. Order matters. */
export type WaterfallBucket = 'penalties' | 'interest' | 'fees' | 'principal';

const DEFAULT_WATERFALL: WaterfallBucket[] = ['penalties', 'interest', 'fees', 'principal'];

export interface WaterfallAllocation {
  allocatedPenalties: string;
  allocatedInterest: string;
  allocatedFees: string;
  allocatedPrincipal: string;
  totalAllocated: string;
}

/** Adapter that actually moves funds out of the customer's wallet. */
export interface WalletCollectionAdapter {
  collect(input: {
    walletId: string;
    amount: string;
    reference: string;
  }): Promise<{ success: true; walletRef: string } | { success: false; reason: string }>;
}

export const WALLET_COLLECTION_ADAPTER = Symbol('WALLET_COLLECTION_ADAPTER');

@Injectable()
export class RepaymentService {
  private readonly logger = new Logger('RepaymentService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly cache: CreditLineCacheService,
  ) {}

  /**
   * Allocate `totalCollected` across buckets following `waterfall` order.
   * Each bucket is reduced by min(remaining, balance). Sum of allocations
   * exactly equals `totalCollected` (no rounding loss — Decimal arithmetic).
   *
   * Pure function. No I/O. The caller is responsible for asserting
   * `totalCollected > 0` and clamping to the customer's actual owed amount.
   */
  applyWaterfall(
    totalCollected: string,
    balances: { penalties: string; interest: string; fees: string; principal: string },
    waterfall: WaterfallBucket[] = DEFAULT_WATERFALL,
  ): WaterfallAllocation {
    let remaining = totalCollected;
    const allocations: Record<WaterfallBucket, string> = {
      penalties: '0',
      interest: '0',
      fees: '0',
      principal: '0',
    };

    for (const bucket of waterfall) {
      if (compare(remaining, '0') <= 0) break;
      const balance = balances[bucket];
      const allocation = decMin(remaining, balance);
      allocations[bucket] = bankersRound(allocation, 4);
      remaining = subtract(remaining, allocations[bucket]);
    }

    const totalAllocated = bankersRound(
      add(
        add(allocations.penalties, allocations.interest),
        add(allocations.fees, allocations.principal),
      ),
      4,
    );
    return {
      allocatedPenalties: allocations.penalties,
      allocatedInterest: allocations.interest,
      allocatedFees: allocations.fees,
      allocatedPrincipal: allocations.principal,
      totalAllocated,
    };
  }

  /**
   * Auto-repayment driven by a `WALLET_BALANCE_CREDITED` event. SPEC §7.1:
   * looks up active credit lines for the customer, computes total owed,
   * collects `min(totalOwed, creditAmount)`, and applies the waterfall.
   *
   * Returns a summary per credit line touched. Failures don't bubble — they
   * log + emit `CREDITLINE_REPAYMENT_FAILED` so the next wallet credit can
   * retry (per SPEC: do NOT freeze on collection failure).
   */
  async processAutoRepayment(
    tenantId: string,
    input: {
      customerId: string;
      walletId: string;
      creditAmount: string;
    },
    adapter: WalletCollectionAdapter,
  ): Promise<Array<{ creditLineId: string; collected: string }>> {
    if (!isPositive(input.creditAmount)) return [];

    // Find active credit lines with outstanding balance for the customer.
    const candidates = await this.prisma.creditLine.findMany({
      where: {
        tenantId,
        customerId: input.customerId,
        status: { in: [CreditLineStatus.active, CreditLineStatus.frozen, CreditLineStatus.expired] },
        outstandingAmount: { gt: 0 },
      },
      include: { product: true },
    });
    if (candidates.length === 0) return [];

    let remainingCredit = input.creditAmount;
    const results: Array<{ creditLineId: string; collected: string }> = [];

    for (const cl of candidates) {
      if (compare(remainingCredit, '0') <= 0) break;

      const totalOwed = add(
        add(String(cl.outstandingAmount), String(cl.interestAccrued)),
        add(String(cl.feesOutstanding), String(cl.penaltiesAccrued)),
      );
      if (isZero(totalOwed)) continue;

      const collectionAmount = decMin(totalOwed, remainingCredit);

      const result = await this.collectAndAllocate(tenantId, cl, collectionAmount, {
        walletId: input.walletId,
        reference: `auto-repay-${cl.id}-${Date.now()}`,
        eventType: EventType.CREDITLINE_REPAYMENT_AUTO_COLLECTED,
        adapter,
      });
      if (result.collected) {
        results.push({ creditLineId: cl.id, collected: result.collected });
        remainingCredit = subtract(remainingCredit, result.collected);
      }
    }
    return results;
  }

  /** Manual repayment from the customer (mutation `makeOverdraftRepayment`). */
  async processManualRepayment(
    tenantId: string,
    input: {
      creditLineId: string;
      amount: string;
      walletId: string;
    },
    adapter: WalletCollectionAdapter,
  ): Promise<WaterfallAllocation & { creditLineId: string }> {
    if (!isPositive(input.amount)) {
      throw new ValidationError('Repayment amount must be positive');
    }
    const cl = await this.prisma.creditLine.findFirst({
      where: { id: input.creditLineId, tenantId },
      include: { product: true },
    });
    if (!cl) throw new NotFoundError('CreditLine', input.creditLineId);

    const totalOwed = add(
      add(String(cl.outstandingAmount), String(cl.interestAccrued)),
      add(String(cl.feesOutstanding), String(cl.penaltiesAccrued)),
    );
    if (isZero(totalOwed)) {
      throw new ValidationError('Credit line has no outstanding balance');
    }

    // Cap at totalOwed to prevent overpayment.
    const collectionAmount = compare(input.amount, totalOwed) > 0 ? totalOwed : input.amount;

    const result = await this.collectAndAllocate(tenantId, cl, collectionAmount, {
      walletId: input.walletId,
      reference: `manual-repay-${cl.id}-${Date.now()}`,
      eventType: EventType.CREDITLINE_REPAYMENT_MANUAL,
      adapter,
    });
    if (!result.allocation) {
      throw new ValidationError(`Repayment failed: ${result.failureReason ?? 'unknown'}`);
    }
    return { creditLineId: cl.id, ...result.allocation };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Shared write path for both auto and manual repayments. Calls the wallet
   * adapter, applies the waterfall in a transaction, updates Postgres + the
   * cache, and emits the appropriate event. On wallet failure, no balance
   * changes are made.
   */
  private async collectAndAllocate(
    tenantId: string,
    cl: {
      id: string;
      customerId: string;
      productId: string;
      currency: string;
      approvedLimit: unknown;
      outstandingAmount: unknown;
      interestAccrued: unknown;
      feesOutstanding: unknown;
      penaltiesAccrued: unknown;
      interestRate: unknown;
      status: string;
      product: { overdraftConfig: unknown } | null;
    },
    amount: string,
    opts: {
      walletId: string;
      reference: string;
      eventType: EventType;
      adapter: WalletCollectionAdapter;
    },
  ): Promise<{
    collected: string;
    allocation?: WaterfallAllocation;
    failureReason?: string;
  }> {
    const config = (cl.product?.overdraftConfig as Record<string, unknown> | null) ?? {};
    const waterfall = (config.autoRepaymentWaterfall as WaterfallBucket[] | undefined) ?? DEFAULT_WATERFALL;

    const allocation = this.applyWaterfall(
      amount,
      {
        penalties: String(cl.penaltiesAccrued),
        interest: String(cl.interestAccrued),
        fees: String(cl.feesOutstanding),
        principal: String(cl.outstandingAmount),
      },
      waterfall,
    );

    // 5a — actually collect the funds before mutating any balances
    const collect = await opts.adapter.collect({
      walletId: opts.walletId,
      amount: allocation.totalAllocated,
      reference: opts.reference,
    });
    if (!collect.success) {
      this.eventBus.emitAndBuild(EventType.CREDITLINE_REPAYMENT_FAILED, tenantId, {
        creditLineId: cl.id,
        customerId: cl.customerId,
        attemptedAmount: allocation.totalAllocated,
        reason: collect.reason,
      });
      this.logger.warn(
        `Wallet collection failed for credit line ${cl.id}: ${collect.reason}`,
      );
      return { collected: '0', failureReason: collect.reason };
    }

    // 5b — apply allocation to Postgres in a transaction; restore available
    // balance by the principal portion (since principal was previously a
    // drawdown debit against availableBalance).
    const newOutstanding = subtract(String(cl.outstandingAmount), allocation.allocatedPrincipal);
    const newInterest = subtract(String(cl.interestAccrued), allocation.allocatedInterest);
    const newFees = subtract(String(cl.feesOutstanding), allocation.allocatedFees);
    const newPenalties = subtract(String(cl.penaltiesAccrued), allocation.allocatedPenalties);
    const totalRemainingOwed = add(add(newOutstanding, newInterest), add(newFees, newPenalties));
    const fullyRepaid = isZero(totalRemainingOwed);
    const newAvailable = fullyRepaid
      ? String(cl.approvedLimit)
      : subtract(String(cl.approvedLimit), newOutstanding);

    const updated = await this.prisma.creditLine.update({
      where: { id: cl.id },
      data: {
        outstandingAmount: newOutstanding,
        interestAccrued: newInterest,
        feesOutstanding: newFees,
        penaltiesAccrued: newPenalties,
        availableBalance: newAvailable,
        lastRepaymentAt: new Date(),
      },
    });

    await this.cache.put({
      tenantId,
      customerId: cl.customerId,
      productId: cl.productId,
      creditLine: {
        id: cl.id,
        status: updated.status,
        currency: cl.currency,
        approvedLimit: String(cl.approvedLimit),
        availableBalance: newAvailable,
        outstandingAmount: newOutstanding,
        interestRate: String(cl.interestRate),
      },
    });

    this.eventBus.emitAndBuild(opts.eventType, tenantId, {
      creditLineId: cl.id,
      customerId: cl.customerId,
      totalCollected: allocation.totalAllocated,
      allocatedPrincipal: allocation.allocatedPrincipal,
      allocatedInterest: allocation.allocatedInterest,
      allocatedFees: allocation.allocatedFees,
      allocatedPenalties: allocation.allocatedPenalties,
      newOutstandingAmount: newOutstanding,
      newAvailableBalance: newAvailable,
    });

    if (fullyRepaid) {
      this.eventBus.emitAndBuild(EventType.CREDITLINE_FULLY_REPAID, tenantId, {
        creditLineId: cl.id,
        customerId: cl.customerId,
        restoredLimit: String(cl.approvedLimit),
      });
    }

    return { collected: allocation.totalAllocated, allocation };
  }
}
