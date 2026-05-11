import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Sprint 14 (S14-9, S14-14a) — shared Redis client provider.
 *
 * DI token for the Redis client. Several services in Sprint 14
 * (`PlanTierConfigService`, `QuotaTrackingService`,
 * `DisbursementFeeService`) need a Redis connection; without a shared
 * provider every service would open its own connection and double the
 * connection count.
 *
 * Usage:
 *   - Register `RedisClientModule.forRoot()` once in the app composition
 *     root (app.module.ts).
 *   - Inject the token elsewhere: `@Inject(REDIS_CLIENT) redis: Redis`.
 *
 * The provider returns an `ioredis` client connected to `REDIS_URL`.
 * If the env var is absent we still return a client — it logs the
 * connection failure but otherwise behaves like a real client (which
 * lets services handle Redis-down gracefully rather than crashing on
 * boot).
 *
 * Tests should override the `REDIS_CLIENT` provider with an in-memory
 * fake (`ioredis-mock`) or a hand-rolled mock that exposes `incr`,
 * `incrbyfloat`, `expire`, `get`, `set`.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({})
export class RedisClientModule {
  private static readonly logger = new Logger(RedisClientModule.name);

  static forRoot(): DynamicModule {
    const provider = {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const url = process.env.REDIS_URL;
        if (!url) {
          RedisClientModule.logger.warn(
            'REDIS_URL is not set — RedisClient will not connect. ' +
              'Services depending on Redis (plan tier cache, quota tracking) ' +
              'will degrade to no-cache behaviour.',
          );
          // Return a stub that swallows operations rather than throwing
          // — keeps the boot path resilient when Redis is intentionally
          // unavailable (local dev without Redis, CI sanity tests).
          return makeStubRedisClient();
        }
        const client = new Redis(url, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
          retryStrategy: (times: number) => Math.min(50 * times, 2000),
        });
        client.on('error', (err: Error) => {
          RedisClientModule.logger.warn(
            `Redis connection error: ${err.message}`,
          );
        });
        client.on('connect', () => {
          RedisClientModule.logger.log(`Redis connected: ${url}`);
        });
        return client;
      },
    };

    return {
      module: RedisClientModule,
      providers: [provider],
      exports: [provider],
    };
  }
}

/**
 * Minimal stand-in for an ioredis client when REDIS_URL is unset.
 * Every method is a no-op that returns sensible empty values, so a
 * caller that cache-misses just falls through to its DB source of truth.
 */
function makeStubRedisClient(): Redis {
  const noop = async () => null;
  const numNoop = async () => 0;
  const stub = {
    get: noop,
    set: async () => 'OK',
    incr: numNoop,
    incrby: numNoop,
    incrbyfloat: async () => '0',
    decr: numNoop,
    expire: async () => 1,
    ttl: async () => -2,
    del: numNoop,
    setex: async () => 'OK',
    mget: async () => [],
    on: () => stub,
    quit: async () => 'OK',
    disconnect: () => undefined,
  } as unknown as Redis;
  return stub;
}
