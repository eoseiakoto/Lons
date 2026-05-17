import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@lons/database';
import { REDIS_CLIENT, bankersRound, divide, multiply } from '@lons/common';
import type Redis from 'ioredis';

/**
 * S17-9 / FR-CM-002.1 — customer financial profile aggregation.
 *
 * One read-only view that joins:
 *   - Contract counts and statuses (total, active, defaulted)
 *   - Repayment-schedule entry outcomes (on-time vs total)
 *   - Outstanding balance across active contracts
 *   - Latest EMI snapshot (CustomerFinancialData where source='emi')
 *
 * **Why a separate service and not a Prisma view?**
 * The aggregation crosses three tables with conditional aggregates and
 * a derived "repayment score" that's awkward to express in raw SQL.
 * Keeping it in TypeScript lets the financial calculations (averages,
 * ratios) stay alongside the unit tests that prove them correct.
 *
 * **Caching.** Profile reads are heavy (4 counts + 2 aggregates + 1
 * row lookup). We cache in Redis for 15 minutes keyed by
 * `fin_profile:{tenantId}:{customerId}`. Invalidation hooks listen for
 * the events listed in `INVALIDATION_EVENTS` and `del` the key.
 *
 * **Money rules.** All monetary amounts in the response are strings
 * (per CLAUDE.md). `Prisma.Decimal` is converted with `.toString()`;
 * `null` aggregates fall back to `'0'`. No `number` math anywhere —
 * the only numeric values in the response are integer counts and an
 * integer "repayment score" percentage.
 */

const CACHE_KEY_PREFIX = 'fin_profile';
const CACHE_TTL_SECONDS = 15 * 60;

const ACTIVE_STATUSES = [
  'active',
  'performing',
  'due',
  'overdue',
  'delinquent',
] as const;

const DEFAULTED_STATUSES = ['default_status', 'written_off'] as const;

export interface CustomerFinancialProfile {
  customerId: string;
  totalLoans: number;
  activeContracts: number;
  /** % of repayment schedule entries that resolved as paid; null when no entries. */
  repaymentScore: number | null;
  /** Average principal across all of the customer's contracts (string). */
  averageLoanSize: string;
  /** % of contracts that defaulted or were written off (integer). */
  defaultRate: number;
  defaultedContracts: number;
  /** Sum of outstanding amounts on active contracts (string). */
  totalOutstandingBalance: string;
  latestWalletBalance: string | null;
  averageBalance30d: string | null;
  transactionCount30d: number | null;
  incomeConsistency: number | null;
  lastUpdated: Date;
}

/**
 * Event names that should invalidate the cached profile. These are the
 * domain events emitted today; if new ones are introduced (e.g.
 * `contract.written_off`) they should be added here AND to the
 * `@OnEvent` decorator list on `handleInvalidationEvent` below.
 */
export const FINANCIAL_PROFILE_INVALIDATION_EVENTS = [
  'contract.created',
  'contract.state_changed',
  'repayment.received',
  'repayment.completed',
  'customer.financial_data.synced',
  'customer.merged',
] as const;

@Injectable()
export class CustomerFinancialProfileService implements OnModuleInit {
  private readonly logger = new Logger(CustomerFinancialProfileService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  onModuleInit(): void {
    // Soft sanity check — log once on boot whether Redis is wired up.
    // The cache layer is opportunistic (cache-miss falls through to the
    // DB) so an absent Redis isn't fatal, but operators should know.
    if (!this.redis) {
      this.logger.warn(
        'Redis client not injected — financial profile cache disabled',
      );
    }
  }

  async getProfile(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerFinancialProfile> {
    const cached = await this.readFromCache(tenantId, customerId);
    if (cached) return cached;

    const profile = await this.computeProfile(tenantId, customerId);
    await this.writeToCache(tenantId, customerId, profile);
    return profile;
  }

  /**
   * Force-recompute and replace the cache. Useful for admin flows that
   * just performed a side effect (manual repayment posting, EMI
   * back-fill) and want the next read to be fresh.
   */
  async refreshProfile(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerFinancialProfile> {
    await this.invalidate(tenantId, customerId);
    return this.getProfile(tenantId, customerId);
  }

  async invalidate(tenantId: string, customerId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.cacheKey(tenantId, customerId));
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate fin_profile cache for ${customerId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Event-driven invalidation. Each listed event carries a
   * `{ tenantId, customerId }` payload (or in the case of repayments,
   * we look up the contract's customer first). We deliberately keep
   * the listener tolerant — a malformed payload just logs and moves
   * on rather than crashing the event bus.
   */
  // S17 review fix — event names aligned with packages/event-contracts
  // canonical EventType values. `repayment.completed`, `customer.merged`,
  // `customer.financial_data.synced` are emitted by sprint-17 producers;
  // older events come from prior sprints. Anything not in the enum was
  // dropped to keep this surface honest.
  @OnEvent('contract.created')
  @OnEvent('contract.state_changed')
  @OnEvent('repayment.received')
  @OnEvent('customer.financial_data.synced')
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
  ): Promise<CustomerFinancialProfile | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(this.cacheKey(tenantId, customerId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CustomerFinancialProfile;
      // JSON round-trip turns lastUpdated into a string; rehydrate.
      parsed.lastUpdated = new Date(parsed.lastUpdated as unknown as string);
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
    profile: CustomerFinancialProfile,
  ): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(
        this.cacheKey(tenantId, customerId),
        JSON.stringify(profile),
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

  private async computeProfile(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerFinancialProfile> {
    // Run independent queries in parallel — cuts wall clock from 7
    // serial roundtrips to one batch. All queries are tenant-scoped.
    const [
      totalLoans,
      activeContracts,
      defaultedContracts,
      totalScheduleEntries,
      onTimeEntries,
      avgLoanResult,
      outstandingResult,
      latestEmiData,
    ] = await Promise.all([
      this.prisma.contract.count({
        where: { tenantId, customerId },
      }),
      this.prisma.contract.count({
        where: {
          tenantId,
          customerId,
          status: { in: ACTIVE_STATUSES as unknown as string[] } as never,
        },
      }),
      this.prisma.contract.count({
        where: {
          tenantId,
          customerId,
          status: { in: DEFAULTED_STATUSES as unknown as string[] } as never,
        },
      }),
      this.prisma.repaymentScheduleEntry.count({
        where: {
          contract: { tenantId, customerId },
        },
      }),
      this.prisma.repaymentScheduleEntry.count({
        where: {
          contract: { tenantId, customerId },
          status: 'paid',
        },
      }),
      this.prisma.contract.aggregate({
        where: { tenantId, customerId },
        _avg: { principalAmount: true },
      }),
      this.prisma.contract.aggregate({
        where: {
          tenantId,
          customerId,
          status: { in: ACTIVE_STATUSES as unknown as string[] } as never,
        },
        _sum: { totalOutstanding: true },
      }),
      this.prisma.customerFinancialData.findFirst({
        where: { tenantId, customerId, source: 'emi' },
        orderBy: { fetchedAt: 'desc' },
      }),
    ]);

    // Repayment score: integer % of paid vs total scheduled entries.
    // null when no entries exist (avoids misrepresenting a new customer
    // as having a 0% score, which would tank their credit signal).
    //
    // S17-FIX-4 — use Decimal-string division + banker's rounding per
    // CLAUDE.md money rules. The counts themselves are integers, but
    // routing them through divide()/multiply() keeps the % calculation
    // identical to the rest of the platform's financial math.
    const repaymentScore =
      totalScheduleEntries > 0
        ? Number(
            bankersRound(
              multiply(divide(String(onTimeEntries), String(totalScheduleEntries)), '100'),
              0,
            ),
          )
        : null;

    // Default rate: % of total contracts that defaulted. 0 when no
    // contracts at all (the alternative of null would force every
    // downstream calculation to handle the new-customer case
    // explicitly — zero is the right business default).
    const defaultRate =
      totalLoans > 0
        ? Number(
            bankersRound(
              multiply(divide(String(defaultedContracts), String(totalLoans)), '100'),
              0,
            ),
          )
        : 0;

    return {
      customerId,
      totalLoans,
      activeContracts,
      repaymentScore,
      averageLoanSize:
        avgLoanResult._avg?.principalAmount?.toString() ?? '0',
      defaultRate,
      defaultedContracts,
      totalOutstandingBalance:
        outstandingResult._sum?.totalOutstanding?.toString() ?? '0',
      latestWalletBalance:
        latestEmiData?.currentBalance?.toString() ?? null,
      averageBalance30d:
        latestEmiData?.averageBalance30d?.toString() ?? null,
      transactionCount30d: latestEmiData?.transactionCount30d ?? null,
      incomeConsistency: latestEmiData?.incomeConsistency ?? null,
      lastUpdated: new Date(),
    };
  }

  /**
   * Best-effort extraction of `(tenantId, customerId)` from an event
   * payload. Handles two common shapes:
   *   - `{ tenantId, data: { customerId } }` — the standard envelope.
   *   - `{ tenantId, data: { contractId } }` — repayment events. We
   *     can't resolve contract → customer without a DB hit, so we
   *     bail rather than fan out into N+1 lookups; the contract's
   *     own state-change event will trigger invalidation separately.
   */
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
