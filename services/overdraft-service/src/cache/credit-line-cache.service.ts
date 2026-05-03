import { Injectable, Logger, Optional } from '@nestjs/common';
import Redis from 'ioredis';

import { compare, subtract, add } from '@lons/common';

/**
 * Snapshot of the credit line state that the drawdown hot path needs. Kept
 * intentionally small — we only cache the fields that affect a drawdown
 * decision (limit, available balance, status) plus identifiers. Interest /
 * fees / penalties / billing-cycle metadata are NOT cached because they
 * don't gate the hot path and would invalidate too often.
 */
export interface CreditLineCacheEntry {
  id: string;
  status: string;
  currency: string;
  /** Decimal string. */
  approvedLimit: string;
  availableBalance: string;
  outstandingAmount: string;
  interestRate: string;
}

export interface PutEntry {
  tenantId: string;
  customerId: string;
  productId: string;
  creditLine: CreditLineCacheEntry;
}

const TTL_SECONDS = 300; // 5 minutes — refreshed on every drawdown / repayment

/**
 * Redis-backed credit line cache. Designed for the hot drawdown path:
 *   - O(1) lookup keyed by `(tenantId, customerId, productId)`
 *   - Atomic balance check + update via `tryReserve` (Lua script)
 *   - Write-through pattern — services update both Postgres and Redis,
 *     and on cache miss we re-populate from Postgres.
 *
 * The `redis` parameter is `@Optional()` so the service can be instantiated
 * in test environments without a live Redis instance — operations degrade
 * to a no-op miss when redis is undefined.
 */
@Injectable()
export class CreditLineCacheService {
  private readonly logger = new Logger('CreditLineCacheService');
  private readonly redis?: Redis;

  constructor(@Optional() redis?: Redis) {
    this.redis = redis;
    if (!redis) {
      this.logger.warn(
        'CreditLineCacheService instantiated without Redis — operating in degraded (cache-bypass) mode',
      );
    }
  }

  /** Build the cache key. Tenant in the key prevents cross-tenant collisions. */
  static keyFor(tenantId: string, customerId: string, productId: string): string {
    return `creditline:${tenantId}:${customerId}:${productId}`;
  }

  /** Read; returns undefined on miss. */
  async get(tenantId: string, customerId: string, productId: string): Promise<CreditLineCacheEntry | undefined> {
    if (!this.redis) return undefined;
    const raw = await this.redis.get(CreditLineCacheService.keyFor(tenantId, customerId, productId));
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as CreditLineCacheEntry;
    } catch (e) {
      this.logger.warn(`Cache deserialize failed for ${customerId.slice(0, 8)}…: ${e instanceof Error ? e.message : e}`);
      return undefined;
    }
  }

  /** Write-through put. */
  async put(entry: PutEntry): Promise<void> {
    if (!this.redis) return;
    const key = CreditLineCacheService.keyFor(entry.tenantId, entry.customerId, entry.productId);
    await this.redis.set(key, JSON.stringify(entry.creditLine), 'EX', TTL_SECONDS);
  }

  /** Drop the cached entry. Used on freeze/close/expire/limit-change. */
  async invalidate(tenantId: string, customerId: string, productId: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(CreditLineCacheService.keyFor(tenantId, customerId, productId));
  }

  /**
   * Atomic balance reservation for the drawdown hot path. Runs inside a
   * WATCH/MULTI/EXEC transaction so the GET+CHECK+SET sequence executes
   * without interleaving with concurrent drawdowns.
   *
   *   - If the cache entry is missing, returns `{ ok: false, reason: 'cache_miss' }`
   *     and the caller falls back to a database-side `SELECT FOR UPDATE`.
   *   - If the entry exists but availableBalance < (shortfall + feeAmount),
   *     returns `{ ok: false, reason: 'insufficient_limit' }`.
   *   - If the entry is not active, returns `{ ok: false, reason: 'inactive' }`.
   *   - Otherwise debits the cache and returns the post-drawdown snapshot.
   *
   * `shortfall` is the principal portion (the amount actually disbursed);
   * `feeAmount` is the per-transaction fee. They must be passed separately
   * because `outstandingAmount` only includes principal — the fee accrues
   * to `feesOutstanding` on the Postgres row but is not cached here.
   * `availableBalance` is debited by the full charge (shortfall + fee).
   */
  async tryReserve(
    tenantId: string,
    customerId: string,
    productId: string,
    shortfall: string,
    feeAmount: string,
  ): Promise<
    | { ok: true; entry: CreditLineCacheEntry }
    | { ok: false; reason: 'cache_miss' | 'insufficient_limit' | 'inactive' }
  > {
    if (!this.redis) return { ok: false, reason: 'cache_miss' };
    const key = CreditLineCacheService.keyFor(tenantId, customerId, productId);
    const requiredAmount = add(shortfall, feeAmount);

    // We can't run Decimal arithmetic inside Redis Lua, so we do the
    // arithmetic in JavaScript inside a WATCH/MULTI/EXEC transaction. If the
    // key changes between WATCH and EXEC, EXEC returns null and we retry.
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.redis.watch(key);
      const raw = await this.redis.get(key);
      if (!raw) {
        await this.redis.unwatch();
        return { ok: false, reason: 'cache_miss' };
      }
      let entry: CreditLineCacheEntry;
      try {
        entry = JSON.parse(raw) as CreditLineCacheEntry;
      } catch {
        await this.redis.unwatch();
        return { ok: false, reason: 'cache_miss' };
      }
      if (entry.status !== 'active') {
        await this.redis.unwatch();
        return { ok: false, reason: 'inactive' };
      }
      if (compare(entry.availableBalance, requiredAmount) < 0) {
        await this.redis.unwatch();
        return { ok: false, reason: 'insufficient_limit' };
      }

      const updated: CreditLineCacheEntry = {
        ...entry,
        availableBalance: subtract(entry.availableBalance, requiredAmount),
        outstandingAmount: add(entry.outstandingAmount, shortfall),
      };
      const result = await this.redis
        .multi()
        .set(key, JSON.stringify(updated), 'EX', TTL_SECONDS)
        .exec();

      // EXEC returns null if WATCH detected a concurrent modification.
      if (result !== null) {
        return { ok: true, entry: updated };
      }
      // Otherwise loop and retry.
    }

    // Exhausted retries — caller will fall back to DB-side locking.
    return { ok: false, reason: 'cache_miss' };
  }
}
