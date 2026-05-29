import { RateLimitConfigService } from '../rate-limit-config.service';

/**
 * S19-11 — DB-driven rate-limit resolver tests.
 *
 * Coverage:
 *   - Cache hit short-circuits DB.
 *   - DB lookup: billing → planTierConfig → config object.
 *   - Cache miss writes back to Redis.
 *   - Missing billing or plan config returns null.
 *   - Cache errors are non-fatal (fall through to DB).
 *   - Category multipliers: read=1x, write=0.2x, scoring=0.1x.
 *   - Null config falls back to static starter tier.
 *   - Static-tier helper for tests that bypass DB entirely.
 *   - invalidate() removes the cache entry.
 */

function makeService(opts: {
  billing?: any;
  planConfig?: any;
  cacheGet?: string | null;
  cacheError?: 'get' | 'set';
}) {
  const prisma: any = {
    tenantBillingConfig: {
      findUnique: jest.fn().mockResolvedValue(opts.billing ?? null),
    },
    planTierConfig: {
      findUnique: jest.fn().mockResolvedValue(opts.planConfig ?? null),
    },
  };
  const redis: any = {
    get: opts.cacheError === 'get'
      ? jest.fn().mockRejectedValue(new Error('redis down'))
      : jest.fn().mockResolvedValue(opts.cacheGet ?? null),
    setex: opts.cacheError === 'set'
      ? jest.fn().mockRejectedValue(new Error('redis down'))
      : jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  const service = new RateLimitConfigService(prisma, redis);
  return { service, prisma, redis };
}

describe('RateLimitConfigService.getConfigForTenant', () => {
  it('returns null when no tenant billing config exists', async () => {
    const { service } = makeService({ billing: null });
    expect(await service.getConfigForTenant('t-1')).toBeNull();
  });

  it('returns null when plan tier config is missing', async () => {
    const { service } = makeService({
      billing: { planTier: 'growth' },
      planConfig: null,
    });
    expect(await service.getConfigForTenant('t-1')).toBeNull();
  });

  it('returns the resolved config from DB on cache miss', async () => {
    const { service } = makeService({
      billing: { planTier: 'growth' },
      planConfig: { apiRateLimitPerMinute: 500 },
    });
    const config = await service.getConfigForTenant('t-1');
    expect(config).toEqual({ perMinute: 500, tier: 'growth' });
  });

  it('writes the resolved config to Redis after DB miss', async () => {
    const { service, redis } = makeService({
      billing: { planTier: 'starter' },
      planConfig: { apiRateLimitPerMinute: 100 },
    });
    await service.getConfigForTenant('t-1');
    expect(redis.setex).toHaveBeenCalledWith(
      'rate_limit_config:t-1',
      300,
      JSON.stringify({ perMinute: 100, tier: 'starter' }),
    );
  });

  it('returns cached value without hitting DB', async () => {
    const cached = JSON.stringify({ perMinute: 2000, tier: 'enterprise' });
    const { service, prisma } = makeService({ cacheGet: cached });
    const config = await service.getConfigForTenant('t-1');
    expect(config).toEqual({ perMinute: 2000, tier: 'enterprise' });
    expect(prisma.tenantBillingConfig.findUnique).not.toHaveBeenCalled();
  });

  it('falls through to DB when cache GET throws (non-fatal)', async () => {
    const { service, prisma } = makeService({
      billing: { planTier: 'growth' },
      planConfig: { apiRateLimitPerMinute: 500 },
      cacheError: 'get',
    });
    const config = await service.getConfigForTenant('t-1');
    expect(prisma.tenantBillingConfig.findUnique).toHaveBeenCalled();
    expect(config).toEqual({ perMinute: 500, tier: 'growth' });
  });

  it('swallows cache SET errors (non-fatal)', async () => {
    const { service } = makeService({
      billing: { planTier: 'starter' },
      planConfig: { apiRateLimitPerMinute: 100 },
      cacheError: 'set',
    });
    await expect(service.getConfigForTenant('t-1')).resolves.not.toThrow();
  });
});

describe('RateLimitConfigService.applyCategory', () => {
  const svc = new RateLimitConfigService({} as any);

  it('read multiplier = 1.0 (full per-minute limit)', () => {
    const r = svc.applyCategory({ perMinute: 500, tier: 'growth' }, 'read');
    expect(r.limit).toBe(500);
    expect(r.ttl).toBe(60_000);
  });

  it('write multiplier = 0.2 (20% of base)', () => {
    const r = svc.applyCategory({ perMinute: 500, tier: 'growth' }, 'write');
    expect(r.limit).toBe(100); // 500 * 0.2
  });

  it('scoring multiplier = 0.1 (10% of base)', () => {
    const r = svc.applyCategory({ perMinute: 500, tier: 'growth' }, 'scoring');
    expect(r.limit).toBe(50); // 500 * 0.1
  });

  it('falls back to static starter tier on null config', () => {
    const r = svc.applyCategory(null, 'read');
    expect(r.limit).toBe(100); // RATE_LIMIT_TIERS.starter.limit
  });

  it('limit is clamped to minimum 1 (never zero)', () => {
    // 1 perMinute × 0.1 scoring multiplier = 0.1 → ceil(1) = 1
    const r = svc.applyCategory({ perMinute: 1, tier: 'tiny' }, 'scoring');
    expect(r.limit).toBe(1);
  });
});

describe('RateLimitConfigService.staticTier', () => {
  const svc = new RateLimitConfigService({} as any);

  it('returns starter tier limit for read', () => {
    expect(svc.staticTier('starter', 'read')).toEqual({ ttl: 60_000, limit: 100 });
  });

  it('returns enterprise tier limit for read', () => {
    expect(svc.staticTier('enterprise', 'read')).toEqual({ ttl: 60_000, limit: 2_000 });
  });

  it('applies category multiplier on top of tier limit', () => {
    expect(svc.staticTier('growth', 'write')).toEqual({ ttl: 60_000, limit: 100 });
  });
});

describe('RateLimitConfigService.invalidate', () => {
  it('deletes the cache key', async () => {
    const { service, redis } = makeService({});
    await service.invalidate('t-1');
    expect(redis.del).toHaveBeenCalledWith('rate_limit_config:t-1');
  });

  it('is a no-op without Redis', async () => {
    const svc = new RateLimitConfigService({} as any);
    await expect(svc.invalidate('t-1')).resolves.not.toThrow();
  });
});
