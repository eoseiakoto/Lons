import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@lons/database';
import { REDIS_CLIENT, add, subtract } from '@lons/common';
import type Redis from 'ioredis';

/**
 * S17-10 / FR-CM-003.1 — customer credit summary.
 *
 * One-shot view for the admin portal customer header. Aggregates credit
 * exposure across two product surfaces:
 *
 *   - Installment / BNPL products via `Subscription.creditLimit` and
 *     `Subscription.availableLimit`.
 *   - Overdraft via `CreditLine.approvedLimit`,
 *     `CreditLine.availableBalance`, and `CreditLine.outstandingAmount`.
 *
 * Plus the latest scoring result and contract delinquency state.
 *
 * **Money rules.** Every monetary operation goes through `add` /
 * `subtract` from `@lons/common`, which delegate to `decimal.js` with
 * banker's rounding. Inputs are converted from `Prisma.Decimal` to
 * string with `.toString()`. The response shape is all strings —
 * never raw numbers — to keep precision intact through the JSON
 * boundary.
 *
 * **Caching.** TTL 5 minutes (shorter than the financial profile's 15
 * minutes because credit summary is what's shown in the contract
 * approval flow and stale data there has real cost). Key:
 * `credit_summary:{tenantId}:{customerId}`. Invalidation on the same
 * events as the financial profile plus subscription / credit-line
 * changes.
 */

const CACHE_KEY_PREFIX = 'credit_summary';
const CACHE_TTL_SECONDS = 5 * 60;

const ACTIVE_CONTRACT_STATUSES = [
  'active',
  'performing',
  'due',
] as const;

const ACTIVE_OR_OVERDUE_CONTRACT_STATUSES = [
  'active',
  'performing',
  'due',
  'overdue',
  'delinquent',
] as const;

const DELINQUENT_CONTRACT_STATUSES = [
  'overdue',
  'delinquent',
  'default_status',
  'written_off',
] as const;

export type DelinquencyTier =
  | 'current'
  | 'overdue'
  | '30_dpd'
  | '60_dpd'
  | '90_dpd';

export interface CustomerCreditSummary {
  customerId: string;
  /** Latest score (string-encoded Decimal) or null when never scored. */
  currentScore: string | null;
  scoreModelVersion: string | null;
  riskTier: string | null;
  /** Sum of all credit limits (subscriptions + credit lines), string. */
  totalCreditLimit: string;
  /** Same number as totalCreditLimit — kept separate for spec parity. */
  totalExposure: string;
  /** Credit currently used (limit - available). */
  totalUtilizedCredit: string;
  totalAvailableCredit: string;
  activeContracts: number;
  overdueContracts: number;
  worstDelinquency: DelinquencyTier;
  /** Outstanding balance on active contracts + outstanding on credit lines. */
  totalOutstandingBalance: string;
  lastScoreDate: Date | null;
}

@Injectable()
export class CustomerCreditSummaryService implements OnModuleInit {
  private readonly logger = new Logger(CustomerCreditSummaryService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  onModuleInit(): void {
    if (!this.redis) {
      this.logger.warn(
        'Redis client not injected — credit summary cache disabled',
      );
    }
  }

  async getSummary(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerCreditSummary> {
    const cached = await this.readFromCache(tenantId, customerId);
    if (cached) return cached;
    const summary = await this.computeSummary(tenantId, customerId);
    await this.writeToCache(tenantId, customerId, summary);
    return summary;
  }

  async invalidate(tenantId: string, customerId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.cacheKey(tenantId, customerId));
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate credit_summary cache for ${customerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  @OnEvent('contract.created')
  @OnEvent('contract.state_changed')
  @OnEvent('repayment.received')
  @OnEvent('repayment.completed')
  @OnEvent('scoring.completed')
  @OnEvent('subscription.created')
  @OnEvent('subscription.updated')
  @OnEvent('credit_line.created')
  @OnEvent('credit_line.updated')
  @OnEvent('customer.merged')
  async handleInvalidationEvent(event: unknown): Promise<void> {
    const payload = this.extractCustomerContext(event);
    if (!payload) return;
    await this.invalidate(payload.tenantId, payload.customerId);
  }

  // ── private ──────────────────────────────────────────────────────────

  private cacheKey(tenantId: string, customerId: string): string {
    return `${CACHE_KEY_PREFIX}:${tenantId}:${customerId}`;
  }

  private async readFromCache(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerCreditSummary | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(this.cacheKey(tenantId, customerId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CustomerCreditSummary;
      if (parsed.lastScoreDate) {
        parsed.lastScoreDate = new Date(
          parsed.lastScoreDate as unknown as string,
        );
      }
      return parsed;
    } catch (err) {
      this.logger.warn(
        `Cache read failed (${customerId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private async writeToCache(
    tenantId: string,
    customerId: string,
    summary: CustomerCreditSummary,
  ): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(
        this.cacheKey(tenantId, customerId),
        JSON.stringify(summary),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `Cache write failed (${customerId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async computeSummary(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerCreditSummary> {
    const [
      latestScore,
      subscriptions,
      activeContracts,
      overdueContracts,
      worstContract,
      outstandingResult,
      creditLines,
    ] = await Promise.all([
      this.prisma.scoringResult.findFirst({
        where: { tenantId, customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.subscription.findMany({
        where: { tenantId, customerId, status: 'active' },
        select: { creditLimit: true, availableLimit: true },
      }),
      this.prisma.contract.count({
        where: {
          tenantId,
          customerId,
          status: {
            in: ACTIVE_CONTRACT_STATUSES as unknown as string[],
          } as never,
        },
      }),
      this.prisma.contract.count({
        where: { tenantId, customerId, status: 'overdue' },
      }),
      this.prisma.contract.findFirst({
        where: {
          tenantId,
          customerId,
          status: {
            in: DELINQUENT_CONTRACT_STATUSES as unknown as string[],
          } as never,
        },
        orderBy: { daysPastDue: 'desc' },
        select: { status: true, daysPastDue: true },
      }),
      this.prisma.contract.aggregate({
        where: {
          tenantId,
          customerId,
          status: {
            in: ACTIVE_OR_OVERDUE_CONTRACT_STATUSES as unknown as string[],
          } as never,
        },
        _sum: { totalOutstanding: true },
      }),
      this.prisma.creditLine.findMany({
        where: {
          tenantId,
          customerId,
          status: { in: ['active', 'performing'] as never },
        },
        select: {
          approvedLimit: true,
          availableBalance: true,
          outstandingAmount: true,
        },
      }),
    ]);

    // Subscription rollup — string-decimal math throughout.
    const totalSubscriptionCreditLimit = subscriptions.reduce(
      (sum, s) => add(sum, s.creditLimit?.toString() ?? '0'),
      '0',
    );
    const totalSubscriptionAvailable = subscriptions.reduce(
      (sum, s) => add(sum, s.availableLimit?.toString() ?? '0'),
      '0',
    );
    const totalSubscriptionUtilized = subtract(
      totalSubscriptionCreditLimit,
      totalSubscriptionAvailable,
    );

    // Credit line rollup.
    const creditLineLimits = creditLines.reduce(
      (sum, cl) => add(sum, cl.approvedLimit.toString()),
      '0',
    );
    const creditLineAvailable = creditLines.reduce(
      (sum, cl) => add(sum, cl.availableBalance.toString()),
      '0',
    );
    const creditLineOutstanding = creditLines.reduce(
      (sum, cl) => add(sum, cl.outstandingAmount.toString()),
      '0',
    );

    // Combined totals. We treat creditLineLimits as already-issued
    // exposure: a customer's overdraft headroom counts toward their
    // total credit limit even though it isn't drawn.
    const totalCreditLimit = add(totalSubscriptionCreditLimit, creditLineLimits);
    const totalAvailableCredit = add(
      totalSubscriptionAvailable,
      creditLineAvailable,
    );
    const totalUtilizedCredit = subtract(totalCreditLimit, totalAvailableCredit);

    // Outstanding balance: active contract outstanding + credit line
    // outstanding. The contract aggregate already covers BNPL and
    // factoring through their parent contracts; credit lines stand on
    // their own.
    const totalOutstandingBalance = add(
      outstandingResult._sum?.totalOutstanding?.toString() ?? '0',
      creditLineOutstanding,
    );

    const worstDelinquency = this.classifyDelinquency(worstContract);

    return {
      customerId,
      currentScore: latestScore?.score?.toString() ?? null,
      scoreModelVersion: latestScore?.modelVersion ?? null,
      riskTier: latestScore?.riskTier ?? null,
      totalCreditLimit,
      totalExposure: totalCreditLimit, // spec parity
      totalUtilizedCredit,
      totalAvailableCredit,
      activeContracts,
      overdueContracts,
      worstDelinquency,
      totalOutstandingBalance,
      lastScoreDate: latestScore?.createdAt ?? null,
    };
  }

  /**
   * Bucket the worst delinquent contract into a DPD tier. Pulled out of
   * the main aggregate flow so the thresholds are visible (matches the
   * standard 30/60/90 DPD bands used by the recovery service).
   */
  private classifyDelinquency(
    contract: { status: unknown; daysPastDue: number } | null,
  ): DelinquencyTier {
    if (!contract) return 'current';
    const days = contract.daysPastDue ?? 0;
    if (days >= 90) return '90_dpd';
    if (days >= 60) return '60_dpd';
    if (days >= 30) return '30_dpd';
    return 'overdue';
  }

  private extractCustomerContext(
    event: unknown,
  ): { tenantId: string; customerId: string } | null {
    if (!event || typeof event !== 'object') return null;
    const e = event as Record<string, unknown>;
    const tenantId =
      typeof e.tenantId === 'string' ? e.tenantId : undefined;
    const data = (e.data as Record<string, unknown>) ?? {};
    const customerId =
      typeof data.customerId === 'string' ? data.customerId : undefined;
    if (!tenantId || !customerId) return null;
    return { tenantId, customerId };
  }
}
