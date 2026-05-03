import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, CreditLineStatus, Prisma } from '@lons/database';
import {
  EventBusService,
  add,
  subtract,
  multiply,
  bankersRound,
  compare,
  isPositive,
  isZero,
  min as decMin,
  toDecimal,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { CreditLineCacheService } from '../cache/credit-line-cache.service';

interface PenaltyConfig {
  /** 'percentage_daily' is the only currently supported type. */
  type: 'percentage_daily';
  /** Decimal string fraction, e.g. "0.005" = 0.5% per day. */
  rate: string;
  /** Decimal string fraction of outstanding to cap total penalties at, e.g. "0.30" = 30%. */
  maxCapPercent?: string;
  /** DPD before penalty starts accruing. */
  startAfterDays?: number;
}

@Injectable()
export class InterestService {
  private readonly logger = new Logger('InterestService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly cache: CreditLineCacheService,
  ) {}

  /**
   * Run daily interest + penalty accrual for a single tenant. SPEC §8.1
   * (interest), §9.2 (penalty). Caller (the scheduled job) is responsible
   * for entering the tenant context — we don't open one here.
   */
  async accrueDaily(
    tenantId: string,
    asOf: Date,
  ): Promise<{ processed: number; totalInterest: string; totalPenalty: string }> {
    const lines = await this.prisma.creditLine.findMany({
      where: {
        tenantId,
        status: { in: [CreditLineStatus.active, CreditLineStatus.frozen, CreditLineStatus.expired] },
        outstandingAmount: { gt: 0 },
      },
      include: { product: true },
    });

    let totalInterest = '0';
    let totalPenalty = '0';
    let processed = 0;

    for (const cl of lines) {
      try {
        const accrued = this.calculateDailyInterest(String(cl.outstandingAmount), String(cl.interestRate));
        const penalty = this.calculateDailyPenalty(cl, asOf);

        const newInterest = add(String(cl.interestAccrued), accrued);
        const newPenalties = add(String(cl.penaltiesAccrued), penalty);

        await this.prisma.creditLine.update({
          where: { id: cl.id },
          data: {
            interestAccrued: newInterest,
            penaltiesAccrued: newPenalties,
          },
        });

        if (isPositive(accrued)) {
          this.eventBus.emitAndBuild(EventType.CREDITLINE_INTEREST_ACCRUED, tenantId, {
            creditLineId: cl.id,
            customerId: cl.customerId,
            amount: accrued,
            newInterestAccrued: newInterest,
            asOf: asOf.toISOString(),
          });
          totalInterest = add(totalInterest, accrued);
        }
        if (isPositive(penalty)) {
          this.eventBus.emitAndBuild(EventType.PENALTY_APPLIED, tenantId, {
            creditLineId: cl.id,
            customerId: cl.customerId,
            amount: penalty,
            newPenaltiesAccrued: newPenalties,
          });
          totalPenalty = add(totalPenalty, penalty);
        }
        processed++;
      } catch (e) {
        this.logger.error(
          `Accrual failed for credit line ${cl.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    this.logger.log(
      `Tenant ${tenantId.slice(0, 8)}…: ${processed} credit lines, interest=${totalInterest}, penalty=${totalPenalty}`,
    );
    return { processed, totalInterest, totalPenalty };
  }

  /**
   * `dailyInterest = outstanding * (annualRate / 365)`. Decimal arithmetic
   * throughout — float division at this scale would round cents per loan
   * per day, multiplied by tens of thousands of loans = real money.
   */
  calculateDailyInterest(outstanding: string, annualRate: string): string {
    if (!isPositive(outstanding) || !isPositive(annualRate)) return '0';
    // Compute outstanding × annualRate ÷ 365 in a single full-precision
    // Decimal expression, then round once at the end. Splitting into a
    // 4dp `divide()` first truncates the daily rate to 0.0001 for any
    // annualRate < ~3.65%, silently losing material interest.
    const dailyInterest = toDecimal(outstanding).times(annualRate).dividedBy(365);
    return bankersRound(dailyInterest.toString(), 4);
  }

  /**
   * Daily penalty respecting `maxCapPercent`. If the cap would be exceeded,
   * the penalty is reduced to whatever still fits under the cap (which may
   * be zero). SPEC §9.2.
   */
  calculateDailyPenalty(
    cl: {
      outstandingAmount: Prisma.Decimal | string;
      penaltiesAccrued: Prisma.Decimal | string;
      product: { overdraftConfig: Prisma.JsonValue | null } | null;
    },
    _asOf: Date,
  ): string {
    const config = (cl.product?.overdraftConfig as Record<string, unknown> | null)?.penaltyConfig as
      | PenaltyConfig
      | undefined;
    if (!config || config.type !== 'percentage_daily') return '0';
    const outstanding = String(cl.outstandingAmount);
    if (!isPositive(outstanding)) return '0';

    const dailyByRate = bankersRound(multiply(outstanding, String(config.rate)), 4);

    if (!config.maxCapPercent) {
      return dailyByRate;
    }
    const cap = bankersRound(multiply(outstanding, String(config.maxCapPercent)), 4);
    const headroom = subtract(cap, String(cl.penaltiesAccrued));
    if (compare(headroom, '0') <= 0) return '0';

    return decMin(dailyByRate, headroom);
  }

  /**
   * Close the active billing cycle for credit lines whose `currentCycleEnd`
   * is on or before `today`. SPEC §8.2 / §9.1: crystallize the cycle's
   * interest + fees + penalties into an append-only `BillingCycleHistory`
   * row, compute the next cycle's `dueDate` (= `cycleEnd + gracePeriodDays`)
   * for the DPD/aging classifier, then roll the cycle forward.
   *
   * Sprint 11 A4 + A6: the previous implementation only rolled cycle
   * dates and emitted events with `openingBalance: '0'`. It now also
   *   - reads `gracePeriodDays` from product config to compute `dueDate`,
   *   - looks up the previous cycle's closing balance for opening balance,
   *   - writes a `BillingCycleHistory` row inside the same transaction,
   *   - persists `dueDate` on the credit line.
   * Statement events now carry the real opening balance.
   */
  async closeCyclesDue(tenantId: string, today: Date): Promise<{ closed: number }> {
    // FIX 5: also require currentCycleStart so the non-null assertion at
    // the top of the loop body is sound. A row with currentCycleEnd set
    // but currentCycleStart null shouldn't exist, but the query is the
    // right place to guarantee it.
    const dueLines = await this.prisma.creditLine.findMany({
      where: {
        tenantId,
        status: CreditLineStatus.active,
        currentCycleEnd: { lte: today },
        currentCycleStart: { not: null },
      },
      include: { product: true },
    });

    let closed = 0;
    for (const cl of dueLines) {
      try {
        const config = (cl.product?.overdraftConfig as Record<string, unknown> | null) ?? {};
        const cycleDays = Number((config.billingCycleDays as number | undefined) ?? 30);
        const gracePeriodDays = Number(
          (config.gracePeriodDays as number | undefined) ??
            cl.product?.gracePeriodDays ??
            0,
        );

        const cycleStart = cl.currentCycleStart!;
        const cycleEnd = cl.currentCycleEnd!;

        const newCycleStart = new Date(cycleEnd);
        newCycleStart.setDate(newCycleStart.getDate() + 1);
        const newCycleEnd = new Date(newCycleStart);
        newCycleEnd.setDate(newCycleEnd.getDate() + cycleDays - 1);

        // dueDate = cycleEnd + gracePeriodDays. Drives the DPD clock (A5).
        const dueDate = new Date(cycleEnd);
        dueDate.setDate(dueDate.getDate() + gracePeriodDays);

        // Opening balance = previous cycle's closing balance, or 0 for
        // the first cycle on this credit line.
        const previousCycle = await this.prisma.billingCycleHistory.findFirst({
          where: { creditLineId: cl.id, tenantId },
          orderBy: { cycleNumber: 'desc' },
        });
        const openingBalance = previousCycle
          ? String(previousCycle.closingBalance)
          : '0';
        const cycleNumber = (previousCycle?.cycleNumber ?? 0) + 1;

        const closingBalance = add(
          add(String(cl.outstandingAmount), String(cl.interestAccrued)),
          add(String(cl.feesOutstanding), String(cl.penaltiesAccrued)),
        );

        await this.prisma.$transaction([
          this.prisma.billingCycleHistory.create({
            data: {
              tenantId,
              creditLineId: cl.id,
              cycleNumber,
              cycleStart,
              cycleEnd,
              dueDate,
              openingBalance,
              closingBalance,
              interestCharged: String(cl.interestAccrued),
              feesCharged: String(cl.feesOutstanding),
              penaltiesCharged: String(cl.penaltiesAccrued),
            },
          }),
          this.prisma.creditLine.update({
            where: { id: cl.id },
            data: {
              currentCycleStart: newCycleStart,
              currentCycleEnd: newCycleEnd,
              dueDate,
              // FIX 1 (P0): the cycle's interest, fees, and penalties have
              // been crystallized into the BillingCycleHistory row above.
              // Reset the live counters to zero so the next cycle starts
              // clean — without this the next accrueDaily run adds new
              // interest on top of already-snapshotted interest, and the
              // next closeCyclesDue snapshots both, double-billing the
              // customer. Principal (`outstandingAmount`) carries forward.
              interestAccrued: '0',
              feesOutstanding: '0',
              penaltiesAccrued: '0',
            },
          }),
        ]);

        this.eventBus.emitAndBuild(EventType.CREDITLINE_CYCLE_CLOSED, tenantId, {
          creditLineId: cl.id,
          customerId: cl.customerId,
          cycleNumber,
          openingBalance,
          cycleStart: cycleStart.toISOString(),
          cycleEnd: cycleEnd.toISOString(),
          dueDate: dueDate.toISOString(),
          closingBalance,
        });
        this.eventBus.emitAndBuild(EventType.CREDITLINE_STATEMENT_GENERATED, tenantId, {
          creditLineId: cl.id,
          customerId: cl.customerId,
          cycleNumber,
          openingBalance,
          closingBalance,
          interest: String(cl.interestAccrued),
          fees: String(cl.feesOutstanding),
          penalties: String(cl.penaltiesAccrued),
          principal: String(cl.outstandingAmount),
          dueDate: dueDate.toISOString(),
        });
        closed++;
      } catch (e) {
        this.logger.error(
          `Cycle close failed for credit line ${cl.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    return { closed };
  }

  /**
   * SPEC §9.3: a credit line whose `expiresAt` is past becomes `expired`,
   * blocking new drawdowns. If the outstanding balance is already zero we
   * jump straight to `closed`.
   */
  async expireDueLines(tenantId: string, today: Date): Promise<{ expired: number; closed: number }> {
    const dueLines = await this.prisma.creditLine.findMany({
      where: {
        tenantId,
        status: { in: [CreditLineStatus.active, CreditLineStatus.frozen] },
        expiresAt: { lte: today },
      },
    });

    let expired = 0;
    let closed = 0;
    for (const cl of dueLines) {
      const hasBalance = !isZero(String(cl.outstandingAmount))
        || !isZero(String(cl.interestAccrued))
        || !isZero(String(cl.feesOutstanding))
        || !isZero(String(cl.penaltiesAccrued));
      const newStatus = hasBalance ? CreditLineStatus.expired : CreditLineStatus.closed;

      await this.prisma.creditLine.update({
        where: { id: cl.id },
        data: {
          status: newStatus,
          ...(newStatus === CreditLineStatus.closed
            ? { closedAt: new Date(), closedReason: 'expired_zero_balance' }
            : {}),
        },
      });
      await this.cache.invalidate(tenantId, cl.customerId, cl.productId);

      if (newStatus === CreditLineStatus.expired) {
        this.eventBus.emitAndBuild(EventType.CREDITLINE_EXPIRED, tenantId, {
          creditLineId: cl.id,
          customerId: cl.customerId,
          outstandingAmount: String(cl.outstandingAmount),
        });
        expired++;
      } else {
        this.eventBus.emitAndBuild(EventType.CREDITLINE_CLOSED, tenantId, {
          creditLineId: cl.id,
          customerId: cl.customerId,
          reason: 'expired_zero_balance',
        });
        closed++;
      }
    }
    return { expired, closed };
  }
}
