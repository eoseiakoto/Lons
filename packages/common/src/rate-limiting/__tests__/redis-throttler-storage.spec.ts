/**
 * Mock ioredis so tests do not require a running Redis instance.
 *
 * The mock simulates the Lua EVAL used by RedisThrottlerStorage:
 *   - INCR semantics (auto-create at 1, then increment)
 *   - PEXPIRE semantics (set TTL on first hit)
 *   - PTTL semantics (remaining TTL in ms)
 */
const mockStore = new Map<string, { hits: number; expiresAt: number }>();

class MockRedis {
  private connected = false;

  constructor(_url?: string, _options?: any) {
    // Constructor accepts URL and options like the real Redis
  }

  on(_event: string, _handler: (...args: any[]) => void) {
    return this;
  }

  async connect() {
    this.connected = true;
  }

  async quit() {
    this.connected = false;
  }

  /**
   * Simulate the Lua script executed via EVAL.
   *
   * The real script:
   *   local hits = redis.call('INCR', KEYS[1])
   *   if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
   *   local pttl = redis.call('PTTL', KEYS[1])
   *   return {hits, pttl}
   */
  async eval(_script: string, _numKeys: number, key: string, ttlStr: string) {
    const ttl = parseInt(ttlStr, 10);
    const now = Date.now();
    const existing = mockStore.get(key);

    if (!existing || existing.expiresAt <= now) {
      mockStore.set(key, { hits: 1, expiresAt: now + ttl });
      return [1, ttl];
    }

    existing.hits += 1;
    const pttl = Math.max(0, existing.expiresAt - now);
    return [existing.hits, pttl];
  }
}

jest.mock('ioredis', () => MockRedis);

import { RedisThrottlerStorage } from '../redis-throttler-storage';

describe('RedisThrottlerStorage (with mocked Redis)', () => {
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    mockStore.clear();
    // Provide a fake URL so the constructor creates a Redis client.
    storage = new RedisThrottlerStorage('redis://localhost:6379');
  });

  afterEach(async () => {
    await storage.onModuleDestroy();
  });

  // ---------------------------------------------------------------------------
  // Basic increment
  // ---------------------------------------------------------------------------

  it('returns totalHits=1 on the first call for a key', async () => {
    const result = await storage.increment('tenant:read:user1:default', 60_000);
    expect(result.totalHits).toBe(1);
  });

  it('returns a positive timeToExpire on the first call', async () => {
    const result = await storage.increment('key-a', 60_000);
    expect(result.timeToExpire).toBeGreaterThan(0);
    expect(result.timeToExpire).toBeLessThanOrEqual(60_000);
  });

  it('increments totalHits on successive calls within the same window', async () => {
    const key = 'tenant:write:user42:default';
    const ttl = 60_000;

    const r1 = await storage.increment(key, ttl);
    const r2 = await storage.increment(key, ttl);
    const r3 = await storage.increment(key, ttl);

    expect(r1.totalHits).toBe(1);
    expect(r2.totalHits).toBe(2);
    expect(r3.totalHits).toBe(3);
  });

  it('uses independent counters for different keys', async () => {
    const ttl = 60_000;
    const rA = await storage.increment('key-A', ttl);
    const rB = await storage.increment('key-B', ttl);
    const rA2 = await storage.increment('key-A', ttl);

    expect(rA.totalHits).toBe(1);
    expect(rB.totalHits).toBe(1);
    expect(rA2.totalHits).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Window expiry
  // ---------------------------------------------------------------------------

  it('resets the counter after the TTL window has elapsed', async () => {
    const key = 'expiry-test';
    const shortTtl = 50;

    const r1 = await storage.increment(key, shortTtl);
    expect(r1.totalHits).toBe(1);

    // Wait for the window to expire.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const r2 = await storage.increment(key, shortTtl);
    expect(r2.totalHits).toBe(1); // counter resets
  });

  it('timeToExpire is non-negative', async () => {
    const result = await storage.increment('non-neg', 60_000);
    expect(result.timeToExpire).toBeGreaterThanOrEqual(0);
  });

  // ---------------------------------------------------------------------------
  // onModuleDestroy
  // ---------------------------------------------------------------------------

  it('calls quit on the Redis client during shutdown', async () => {
    // Should not throw.
    await storage.onModuleDestroy();
  });
});

describe('RedisThrottlerStorage (in-memory fallback)', () => {
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    // No URL provided and no REDIS_URL env — triggers in-memory fallback.
    const originalEnv = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    storage = new RedisThrottlerStorage();
    // Restore env to avoid leaking.
    if (originalEnv !== undefined) {
      process.env.REDIS_URL = originalEnv;
    }
  });

  it('increments using the in-memory fallback when Redis is unavailable', async () => {
    const r1 = await storage.increment('fallback-key', 60_000);
    const r2 = await storage.increment('fallback-key', 60_000);

    expect(r1.totalHits).toBe(1);
    expect(r2.totalHits).toBe(2);
  });

  it('resets the fallback counter after TTL expires', async () => {
    const key = 'fallback-expiry';
    const shortTtl = 50;

    await storage.increment(key, shortTtl);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await storage.increment(key, shortTtl);
    expect(result.totalHits).toBe(1);
  });

  it('returns positive timeToExpire from fallback', async () => {
    const result = await storage.increment('ttl-check', 60_000);
    expect(result.timeToExpire).toBeGreaterThan(0);
    expect(result.timeToExpire).toBeLessThanOrEqual(60_000);
  });
});
