/**
 * Sprint 14 (S14-9) — PlanTierConfigService tests.
 *
 * Verifies the cache-aside pattern (Redis hit → no DB; Redis miss → DB
 * → Redis write), the feature-flag / product-type lookups, and the
 * invalidation path. Uses an in-memory Redis stub and Prisma stub.
 */
import { NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';

import { PlanTierConfigService } from '../plan-tier-config.service';

function makeRedis(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    setex: jest.fn(async (k: string, _ttl: number, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => {
      store.delete(k);
      return 1;
    }),
    store,
  } as unknown as Redis & { store: Map<string, string> };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    tier: 'starter',
    displayName: 'Starter',
    allowedProductTypes: ['micro_loan'],
    maxActiveProducts: 3,
    maxCustomers: 10000,
    maxMonthlyDisbursementVolumeUsd: '500000.0000',
    maxMonthlyTransactions: 5000,
    maxLenderConfigs: 1,
    maxBnplMerchants: null,
    maxPortalUsers: 5,
    dataRetentionMonths: 12,
    featureFlags: {
      mlScoring: false,
      aiRecovery: false,
      collectionsLevel: 'basic',
    },
    apiRateLimitPerMinute: 60,
    restApiEnabled: false,
    websocketEnabled: false,
    bulkOperationsEnabled: false,
    maxApiKeys: 2,
    brandingOptions: { fullBrandPalette: false },
    ...overrides,
  };
}

describe('PlanTierConfigService (S14-9)', () => {
  it('fetches from DB on cache miss and writes through to Redis', async () => {
    const redis = makeRedis();
    const dbConfig = makeConfig();
    const prisma = {
      planTierConfig: {
        findUnique: jest.fn(async () => dbConfig),
      },
    } as never;
    const service = new PlanTierConfigService(prisma, redis as never);

    const result = await service.getTierConfig('starter' as never);

    expect(result.tier).toBe('starter');
    expect(redis.setex).toHaveBeenCalledWith(
      'plan_tier_config:starter',
      300,
      expect.any(String),
    );
  });

  it('serves from Redis on cache hit (no DB read)', async () => {
    const cachedJson = JSON.stringify(makeConfig({ tier: 'growth' }));
    const redis = makeRedis({ 'plan_tier_config:growth': cachedJson });
    const prismaFindUnique = jest.fn();
    const prisma = {
      planTierConfig: { findUnique: prismaFindUnique },
    } as never;
    const service = new PlanTierConfigService(prisma, redis as never);

    const result = await service.getTierConfig('growth' as never);
    expect(result.tier).toBe('growth');
    expect(prismaFindUnique).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when neither cache nor DB has the tier', async () => {
    const redis = makeRedis();
    const prisma = {
      planTierConfig: { findUnique: jest.fn(async () => null) },
    } as never;
    const service = new PlanTierConfigService(prisma, redis as never);
    await expect(service.getTierConfig('starter' as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('isProductTypeAllowed: starter blocks bnpl, enterprise admits factoring', async () => {
    const redis = makeRedis();
    const starter = makeConfig({ allowedProductTypes: ['micro_loan'] });
    const enterprise = makeConfig({
      tier: 'enterprise',
      allowedProductTypes: [
        'micro_loan',
        'overdraft',
        'bnpl',
        'invoice_financing',
      ],
    });
    const prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ planTier: 'starter' })
          .mockResolvedValueOnce({ planTier: 'enterprise' }),
      },
      planTierConfig: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(starter)
          .mockResolvedValueOnce(enterprise),
      },
    } as never;
    const service = new PlanTierConfigService(prisma, redis as never);

    expect(await service.isProductTypeAllowed('t1', 'bnpl')).toBe(false);
    expect(await service.isProductTypeAllowed('t2', 'invoice_financing')).toBe(true);
  });

  it('isFeatureEnabled returns true / false from featureFlags JSON', async () => {
    const redis = makeRedis();
    const prisma = {
      tenant: { findUnique: jest.fn(async () => ({ planTier: 'growth' })) },
      planTierConfig: {
        findUnique: jest.fn(async () =>
          makeConfig({
            tier: 'growth',
            featureFlags: { mlScoring: true, aiRecovery: false },
          }),
        ),
      },
    } as never;
    const service = new PlanTierConfigService(prisma, redis as never);

    expect(await service.isFeatureEnabled('t1', 'mlScoring')).toBe(true);
    expect(await service.isFeatureEnabled('t1', 'aiRecovery')).toBe(false);
    // Unknown flags → false (closed by default).
    expect(await service.isFeatureEnabled('t1', 'unknownFlag')).toBe(false);
  });

  it('invalidateCache deletes the tier key', async () => {
    const redis = makeRedis({ 'plan_tier_config:starter': '{}' });
    const prisma = {} as never;
    const service = new PlanTierConfigService(prisma, redis as never);

    await service.invalidateCache('starter' as never);
    expect(redis.del).toHaveBeenCalledWith('plan_tier_config:starter');
    expect(redis.store.has('plan_tier_config:starter')).toBe(false);
  });

  it('falls through to DB when Redis read throws', async () => {
    const redis = {
      get: jest.fn(async () => {
        throw new Error('redis down');
      }),
      setex: jest.fn(async () => 'OK'),
      del: jest.fn(),
    } as unknown as Redis;
    const prisma = {
      planTierConfig: { findUnique: jest.fn(async () => makeConfig()) },
    } as never;
    const service = new PlanTierConfigService(prisma, redis);
    const result = await service.getTierConfig('starter' as never);
    expect(result.tier).toBe('starter');
  });
});
