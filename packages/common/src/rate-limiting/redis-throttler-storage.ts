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
   * Lua script that atomically increments a key and sets its TTL only if the
   * key is new (NX semantics via the return value of INCR).  PTTL is returned
   * so the caller knows exactly how much time remains in the window.
   *
   * KEYS[1] = throttler key
   * ARGV[1] = TTL in milliseconds
   *
   * Returns: [totalHits, pttlRemaining]
   */
  private static readonly LUA_INCREMENT = `
    local hits = redis.call('INCR', KEYS[1])
    if hits == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    local pttl = redis.call('PTTL', KEYS[1])
    if pttl < 0 then
      pttl = tonumber(ARGV[1])
    end
    return {hits, pttl}
  `;

  private async redisIncrement(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const result = (await this.redis!.eval(
      RedisThrottlerStorage.LUA_INCREMENT,
      1,
      key,
      ttl.toString(),
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
