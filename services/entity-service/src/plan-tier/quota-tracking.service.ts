import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { EventBusService, REDIS_CLIENT } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { PlanTierConfigService } from './plan-tier-config.service';

/**
 * Sprint 14 (S14-14a) — Redis-backed quota counters.
 *
 * Tracks monthly disbursement count + volume and daily API calls per
 * tenant. Redis is the source of truth for the *rolling* counters
 * (5-minute resolution would be too coarse; per-disbursement increment
 * needs sub-second writes). The hard limits live in `PlanTierConfig`.
 *
 * **Key naming.**
 *   - `quota:{tenantId}:disbursements:count:{YYYY-MM}` — txn count
 *   - `quota:{tenantId}:disbursements:volume:{YYYY-MM}` — USD volume
 *   - `quota:{tenantId}:api_calls:{YYYY-MM-DD}` — daily API calls
 *
 * Date-suffixed keys give us free per-period buckets and a clean
 * expiry path (Redis TTL set on first increment). The next month's
 * counter starts at zero automatically.
 *
 * **Limit enforcement.** `incrementDisbursement` returns
 * `{ allowed, warning }`:
 *   - `allowed=false` → caller must reject the disbursement.
 *   - `warning=true` → soft warning at 80% of cap; caller proceeds but
 *     emits a `USAGE_THRESHOLD_WARNING` event for the operator dashboard.
 *
 * **Soft-fail on Redis outage.** If Redis is down (the stub from
 * `RedisClientModule` returns no-op values), every check resolves to
 * `allowed=true`. We log the failure and let the disbursement through
 * — a billing platform that refuses payouts on cache outage is worse
 * than one that bills the tenant on the next reconciliation pass.
 */
@Injectable()
export class QuotaTrackingService {
  private readonly logger = new Logger(QuotaTrackingService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly planTierConfigService: PlanTierConfigService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Increment the monthly disbursement counters atomically. Emits
   * `USAGE_THRESHOLD_WARNING` at 80% and `QUOTA_EXCEEDED` at 100%.
   *
   * `amountUsd` is a Decimal-as-string per CLAUDE.md — we forward it
   * verbatim to Redis (`incrbyfloat`). Volume tracking is informational
   * (the volume cap is enforced separately when the volume key passes
   * the limit).
   */
  async incrementDisbursement(
    tenantId: string,
    amountUsd: string,
  ): Promise<{ allowed: boolean; warning?: boolean; currentCount: number }> {
    const countKey = this.monthlyKey(tenantId, 'disbursements:count');
    const volumeKey = this.monthlyKey(tenantId, 'disbursements:volume');

    let newCount = 0;
    let newVolume = '0';

    try {
      newCount = await this.redis.incr(countKey);
      // ioredis returns string for incrbyfloat — keep as string for
      // Decimal compatibility downstream.
      const v = await this.redis.incrbyfloat(volumeKey, parseFloat(amountUsd));
      newVolume = typeof v === 'string' ? v : String(v);

      // Set TTL on the first increment of the month. We bound the call
      // to once-per-key with `newCount === 1` so we don't churn the
      // expiry on every increment.
      if (newCount === 1) {
        const ttl = this.secondsUntilNextMonth();
        await this.redis.expire(countKey, ttl);
        await this.redis.expire(volumeKey, ttl);
      }
    } catch (err) {
      // Soft-fail: see the class docstring. Log and admit the call.
      this.logger.warn(
        `Redis quota increment failed for tenant ${tenantId}: ${(err as Error).message}. Admitting disbursement.`,
      );
      return { allowed: true, currentCount: 0 };
    }

    let config;
    try {
      config = await this.planTierConfigService.getTenantTierConfig(tenantId);
    } catch (err) {
      // No tier config → admit (same fail-open posture as Redis outage).
      this.logger.warn(
        `Tier config lookup failed for tenant ${tenantId}: ${(err as Error).message}. Admitting disbursement.`,
      );
      return { allowed: true, currentCount: newCount };
    }

    const txnLimit = config.maxMonthlyTransactions;
    const volumeLimit = config.maxMonthlyDisbursementVolumeUsd;

    // Hard limit on transaction count.
    if (txnLimit !== null && newCount > txnLimit) {
      this.eventBus.emitAndBuild(EventType.QUOTA_EXCEEDED, tenantId, {
        limitType: 'monthly_transactions',
        current: newCount,
        limit: txnLimit,
        tier: config.tier,
      });
      return { allowed: false, currentCount: newCount };
    }

    // Hard limit on USD volume.
    if (volumeLimit !== null && volumeLimit !== undefined) {
      const limitNumber = Number(volumeLimit);
      if (parseFloat(newVolume) > limitNumber) {
        this.eventBus.emitAndBuild(EventType.QUOTA_EXCEEDED, tenantId, {
          limitType: 'monthly_volume_usd',
          current: newVolume,
          limit: String(limitNumber),
          tier: config.tier,
        });
        return { allowed: false, currentCount: newCount };
      }
    }

    // Soft warning at 80% of transaction cap.
    if (txnLimit !== null && newCount >= Math.floor(txnLimit * 0.8)) {
      this.eventBus.emitAndBuild(EventType.USAGE_THRESHOLD_WARNING, tenantId, {
        limitType: 'monthly_transactions',
        current: newCount,
        limit: txnLimit,
        percentUsed: Math.round((newCount / txnLimit) * 100),
      });
      return { allowed: true, warning: true, currentCount: newCount };
    }

    return { allowed: true, currentCount: newCount };
  }

  /**
   * Increment the daily API call counter. The per-minute rate limit is
   * enforced separately by `TenantThrottlerGuard`; this counter is
   * purely informational for the admin portal "API calls today" tile.
   */
  async incrementApiCall(tenantId: string): Promise<void> {
    const key = this.dailyKey(tenantId, 'api_calls');
    try {
      const newCount = await this.redis.incr(key);
      if (newCount === 1) {
        await this.redis.expire(key, this.secondsUntilMidnightUtc());
      }
    } catch (err) {
      this.logger.debug(
        `Redis api-call increment failed for tenant ${tenantId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Read-only snapshot used by `UsageMetricsService` to build the
   * admin-portal usage panel. Returns zeros when keys are missing.
   */
  async getCurrentUsage(tenantId: string): Promise<{
    monthlyDisbursementCount: number;
    monthlyDisbursementVolumeUsd: string;
    dailyApiCalls: number;
  }> {
    try {
      const [countStr, volumeStr, apiCallsStr] = await Promise.all([
        this.redis.get(this.monthlyKey(tenantId, 'disbursements:count')),
        this.redis.get(this.monthlyKey(tenantId, 'disbursements:volume')),
        this.redis.get(this.dailyKey(tenantId, 'api_calls')),
      ]);

      return {
        monthlyDisbursementCount: countStr ? parseInt(countStr, 10) : 0,
        // Preserve as string (CLAUDE.md — money flows as strings).
        monthlyDisbursementVolumeUsd: volumeStr ?? '0.0000',
        dailyApiCalls: apiCallsStr ? parseInt(apiCallsStr, 10) : 0,
      };
    } catch (err) {
      this.logger.warn(
        `Redis read failed in getCurrentUsage for tenant ${tenantId}: ${(err as Error).message}`,
      );
      return {
        monthlyDisbursementCount: 0,
        monthlyDisbursementVolumeUsd: '0.0000',
        dailyApiCalls: 0,
      };
    }
  }

  // ─── Key + TTL helpers ───────────────────────────────────────────

  private monthlyKey(tenantId: string, suffix: string): string {
    const now = new Date();
    const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return `quota:${tenantId}:${suffix}:${ym}`;
  }

  private dailyKey(tenantId: string, suffix: string): string {
    const ymd = new Date().toISOString().slice(0, 10);
    return `quota:${tenantId}:${suffix}:${ymd}`;
  }

  /** Seconds until 00:00:00 UTC on the 1st of next month. */
  private secondsUntilNextMonth(): number {
    const now = new Date();
    const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    return Math.ceil((nextMonth - now.getTime()) / 1000);
  }

  /** Seconds until 00:00:00 UTC tomorrow. */
  private secondsUntilMidnightUtc(): number {
    const now = new Date();
    const tomorrow = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    );
    return Math.ceil((tomorrow - now.getTime()) / 1000);
  }
}
