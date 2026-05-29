import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * Redis-backed ThrottlerStorage implementation.
 *
 * Uses Redis INCR + PEXPIRE for atomic increment with TTL, ensuring that
 * rate-limit state is shared across all application instances (horizontal
 * scaling).
 *
 * Falls back to an in-memory Map when no Redis connection is available
 * (e.g. local development without Redis running).  The fallback logs a
 * warning on first use so operators can detect the degraded state.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis | null;
  private readonly fallback = new Map<string, { totalHits: number; expiresAt: number }>();
  private fallbackWarned = false;

  constructor(redisUrl?: string) {
    const url = redisUrl ?? process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      // Suppress unhandled error events — we handle failures in increment().
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis throttler connection error: ${err.message}`);
      });

      // Connect eagerly but do not block construction.
      this.redis.connect().catch(() => {
        this.logger.warn('Redis throttler: initial connect failed, will retry on demand');
      });
    } else {
      this.redis = null;
      this.logger.warn(
        'No REDIS_URL configured — RedisThrottlerStorage will use in-memory fallback',
      );
    }
  }

  /**
   * Atomically increment the hit count for `key`.
   *
   * Uses a Lua script executed via EVAL to ensure INCR + PEXPIRE happen in a
   * single round-trip (atomic on the Redis side).
   *
   * @param key  Unique throttler key (tenant + route + tracker).
   * @param ttl  Window duration in **milliseconds**.
   * @returns    ThrottlerStorageRecord with totalHits and timeToExpire (ms).
   */
  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    if (this.redis) {
      try {
        return await this.redisIncrement(key, ttl);
      } catch (err) {
        this.logger.warn(
          `Redis throttler increment failed, falling back to in-memory: ${(err as Error).message}`,
        );
      }
    }

    return this.memoryIncrement(key, ttl);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => {
        /* swallow — shutting down */
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Redis path
  // ---------------------------------------------------------------------------

  /**
   * S19-11: TRUE SLIDING-WINDOW Lua script via Redis sorted sets.
   *
   * Replaces the prior fixed-window INCR+PEXPIRE approach, which
   * allowed a 2x burst at window boundaries (e.g. 100 requests in
   * the last second of one minute + 100 requests in the first
   * second of the next minute = 200 requests in 2 seconds).
   *
   * Algorithm:
   *   1. ZREMRANGEBYSCORE — drop entries older than (now - window).
   *   2. ZADD — record current request with timestamp as score.
   *      Member value is `<ts>:<random>` to keep members unique
   *      (sorted sets dedupe on member value).
   *   3. ZCARD — count entries in the window = totalHits.
   *   4. PEXPIRE — keep the key alive for window+1ms so idle
   *      tenants don't bloat the keyspace.
   *
   * KEYS[1] = throttler key
   * ARGV[1] = window length in milliseconds
   * ARGV[2] = current timestamp in milliseconds (passed from
   *           Node — avoids relying on Redis clock skew across
   *           a cluster)
   * ARGV[3] = unique member suffix (random; required because
   *           Redis Lua has no math.random in scripts that
   *           cluster-replicate deterministically)
   *
   * Returns: [totalHits, timeToExpire-ms]
   *
   * Cost per call: O(log N) for ZADD + O(M) for ZREMRANGEBYSCORE
   * where M is the number of expired entries. For sensibly sized
   * windows (60s, hundreds of requests) this is negligible.
   */
  private static readonly LUA_SLIDING_WINDOW = `
    local key = KEYS[1]
    local window = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])
    local member = tostring(now) .. ':' .. ARGV[3]
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
    redis.call('ZADD', key, now, member)
    local hits = redis.call('ZCARD', key)
    redis.call('PEXPIRE', key, window + 1)
    return {hits, window}
  `;

  private async redisIncrement(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    // Random suffix — keeps the ZSET member unique within the same
    // millisecond. 16 bits is plenty for de-dup at sub-ms granularity.
    const suffix = Math.floor(Math.random() * 65536).toString(36);
    const result = (await this.redis!.eval(
      RedisThrottlerStorage.LUA_SLIDING_WINDOW,
      1,
      key,
      ttl.toString(),
      now.toString(),
      suffix,
    )) as [number, number];

    const [totalHits, timeToExpire] = result;
    return { totalHits, timeToExpire: Math.max(0, timeToExpire) };
  }

  // ---------------------------------------------------------------------------
  // In-memory fallback
  // ---------------------------------------------------------------------------

  private memoryIncrement(key: string, ttl: number): ThrottlerStorageRecord {
    if (!this.fallbackWarned) {
      this.fallbackWarned = true;
      this.logger.warn('RedisThrottlerStorage: using in-memory fallback (not shared across instances)');
    }

    const now = Date.now();
    const existing = this.fallback.get(key);

    if (!existing || existing.expiresAt <= now) {
      this.fallback.set(key, { totalHits: 1, expiresAt: now + ttl });
      return { totalHits: 1, timeToExpire: ttl };
    }

    existing.totalHits += 1;
    const timeToExpire = Math.max(0, existing.expiresAt - now);
    return { totalHits: existing.totalHits, timeToExpire };
  }
}
