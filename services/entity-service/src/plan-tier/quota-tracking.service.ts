import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { EventBusService, REDIS_CLIENT } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { PlanTierConfigService } from './plan-tier-config.service';
import { QUOTA_INCREMENT_SCRIPT } from './quota-lua-scripts';

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

    // Tier config first — the Lua script needs limits as ARGV. The
    // config is Redis-cached at 5min, so this is usually a single GET.
    let config;
    try {
      config = await this.planTierConfigService.getTenantTierConfig(tenantId);
    } catch (err) {
      this.logger.warn(
        `Tier config lookup failed for tenant ${tenantId}: ${(err as Error).message}. Admitting disbursement.`,
      );
      // Counters never get incremented in this branch — without limits
      // we can't enforce, and double-incrementing on the next call would
      // be wrong. Fail-open with zero count.
      return { allowed: true, currentCount: 0 };
    }

    const txnLimit = config.maxMonthlyTransactions;
    const volumeLimit = config.maxMonthlyDisbursementVolumeUsd;
    const ttl = this.secondsUntilNextMonth();

    // S15-FIX-1: atomic increment-and-check via Lua. Replaces the
    // sequential INCR + INCRBYFLOAT + per-attribute check pattern.
    // Concurrent callers can no longer both pass a hard limit at the
    // single-counter step — Redis runs the script atomically per key.
    let newCount = 0;
    let newVolume = '0';
    let countExceeded = false;
    let volumeExceeded = false;
    let countWarning = false;
    let volumeWarning = false;
    try {
      const result = (await this.redis.eval(
        QUOTA_INCREMENT_SCRIPT,
        2,
        countKey,
        volumeKey,
        amountUsd,
        String(txnLimit ?? -1),
        volumeLimit !== null && volumeLimit !== undefined
          ? String(volumeLimit)
          : '-1',
        String(ttl),
      )) as [number, string, number, number, number, number];
      newCount = Number(result[0]);
      newVolume = result[1];
      countExceeded = result[2] === 1;
      volumeExceeded = result[3] === 1;
      countWarning = result[4] === 1;
      volumeWarning = result[5] === 1;
    } catch (err) {
      this.logger.warn(
        `Redis quota Lua eval failed for tenant ${tenantId}: ${(err as Error).message}. Admitting disbursement.`,
      );
      return { allowed: true, currentCount: 0 };
    }

    // Hard caps fire first — they're rejection events. The warnings
    // never co-occur with their respective exceeded flag (Lua handles
    // the elseif).
    if (countExceeded) {
      this.eventBus.emitAndBuild(EventType.QUOTA_EXCEEDED, tenantId, {
        limitType: 'monthly_transactions',
        current: newCount,
        limit: txnLimit ?? -1,
        tier: config.tier,
      });
      return { allowed: false, currentCount: newCount };
    }
    if (volumeExceeded) {
      this.eventBus.emitAndBuild(EventType.QUOTA_EXCEEDED, tenantId, {
        limitType: 'monthly_volume_usd',
        current: newVolume,
        limit:
          volumeLimit !== null && volumeLimit !== undefined
            ? String(volumeLimit)
            : '-1',
        tier: config.tier,
      });
      return { allowed: false, currentCount: newCount };
    }

    // S15-FIX-3: emit USAGE_THRESHOLD_WARNING for BOTH count and volume
    // at the 80% line. Multiple events can fire on a single call if the
    // tenant is simultaneously close to both caps.
    let warning = false;
    if (countWarning && txnLimit !== null) {
      this.eventBus.emitAndBuild(EventType.USAGE_THRESHOLD_WARNING, tenantId, {
        limitType: 'monthly_transactions',
        current: newCount,
        limit: txnLimit,
        percentUsed: Math.round((newCount / txnLimit) * 100),
      });
      warning = true;
    }
    if (volumeWarning && volumeLimit !== null && volumeLimit !== undefined) {
      const limitNumber = Number(volumeLimit);
      const currentVolume = parseFloat(newVolume);
      this.eventBus.emitAndBuild(EventType.USAGE_THRESHOLD_WARNING, tenantId, {
        limitType: 'monthly_volume_usd',
        current: newVolume,
        limit: String(limitNumber),
        percentUsed: Math.round((currentVolume / limitNumber) * 100),
      });
      warning = true;
    }

    return warning
      ? { allowed: true, warning: true, currentCount: newCount }
      : { allowed: true, currentCount: newCount };
  }

  /**
   * S18-FIX-3 — Inverse of {@link incrementDisbursement}. Called from
   * the disbursement-failure rollback path after a permanent transfer
   * failure so the tenant's monthly counters don't carry phantom usage
   * from a disbursement that didn't actually happen.
   *
   * Best-effort: counters are unsigned in Lua but Redis itself allows
   * negative values, so we clamp at zero. Failures are logged and
   * swallowed (the rollback must not be blocked by a Redis hiccup).
   */
  async decrementDisbursement(tenantId: string, amountUsd: string): Promise<void> {
    const countKey = this.monthlyKey(tenantId, 'disbursements:count');
    const volumeKey = this.monthlyKey(tenantId, 'disbursements:volume');
    try {
      // Count: DECR with a floor-at-zero guard. We read first to avoid
      // negative counters from a race where the increment was lost but
      // the decrement still fires.
      const currentCount = Number((await this.redis.get(countKey)) ?? '0');
      if (currentCount > 0) {
        await this.redis.decr(countKey);
      }

      // Volume: INCRBYFLOAT with a negated amount, then clamp at zero
      // if we crossed it. Redis INCRBYFLOAT preserves Decimal precision
      // up to its internal long-double resolution.
      const currentVolumeStr = (await this.redis.get(volumeKey)) ?? '0';
      const currentVolume = parseFloat(currentVolumeStr);
      const amountNum = parseFloat(amountUsd);
      const newVolume = Math.max(0, currentVolume - amountNum);
      await this.redis.set(volumeKey, newVolume.toFixed(4));
    } catch (err) {
      this.logger.warn(
        `Quota decrement failed for tenant ${tenantId}: ${(err as Error).message}`,
      );
    }
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
