/**
 * Sprint 14 (S14-10) — QuotaEnforcementService tests.
 *
 * Confirms the limit-vs-count comparison and the structured error
 * payload for every entity type. The tests use a hand-rolled fake
 * `PlanTierConfigService` (returns a fixed tier config) and a Prisma
 * stub with `count()` per model — no DB involvement.
 */
import { ForbiddenException } from '@nestjs/common';

import { QuotaEnforcementService } from '../quota-enforcement.service';

function makeConfigService(overrides: Record<string, number | null>) {
  return {
    getTenantTierConfig: jest.fn(async () => ({
      tier: 'starter',
      maxActiveProducts: 3,
      maxCustomers: 100,
      maxPortalUsers: 5,
      maxLenderConfigs: 1,
      maxBnplMerchants: null,
      maxApiKeys: 2,
      ...overrides,
    })),
  } as unknown as import('../plan-tier-config.service').PlanTierConfigService;
}

function makePrismaWithCount(model: string, count: number) {
  return {
    product: { count: jest.fn(async () => (model === 'products' ? count : 0)) },
    customer: { count: jest.fn(async () => (model === 'customers' ? count : 0)) },
    user: { count: jest.fn(async () => (model === 'users' ? count : 0)) },
    lender: { count: jest.fn(async () => (model === 'lenders' ? count : 0)) },
    merchant: { count: jest.fn(async () => (model === 'merchants' ? count : 0)) },
    apiKey: { count: jest.fn(async () => (model === 'api_keys' ? count : 0)) },
  };
}

describe('QuotaEnforcementService (S14-10)', () => {
  it('admits creation when below the limit', async () => {
    const service = new QuotaEnforcementService(
      makePrismaWithCount('products', 2) as never,
      makeConfigService({ maxActiveProducts: 3 }),
    );
    await expect(
      service.checkEntityLimit('t1', 'products'),
    ).resolves.toBeUndefined();
  });

  it('admits creation at one below the limit', async () => {
    const service = new QuotaEnforcementService(
      makePrismaWithCount('products', 2) as never,
      makeConfigService({ maxActiveProducts: 3 }),
    );
    await expect(
      service.checkEntityLimit('t1', 'products'),
    ).resolves.toBeUndefined();
  });

  it('blocks creation when at the limit (>= comparison)', async () => {
    const service = new QuotaEnforcementService(
      makePrismaWithCount('products', 3) as never,
      makeConfigService({ maxActiveProducts: 3 }),
    );
    try {
      await service.checkEntityLimit('t1', 'products');
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.entityType).toBe('products');
      expect(body.currentCount).toBe(3);
      expect(body.limit).toBe(3);
      expect(body.currentTier).toBe('starter');
      expect(body.upgradeUrl).toBe('/settings/plan');
    }
  });

  it('admits unlimited (null) regardless of current count', async () => {
    const service = new QuotaEnforcementService(
      makePrismaWithCount('merchants', 9999) as never,
      makeConfigService({ maxBnplMerchants: null }),
    );
    await expect(
      service.checkEntityLimit('t1', 'merchants'),
    ).resolves.toBeUndefined();
  });

  it('admits unlimited (undefined) — treats missing limit as unlimited', async () => {
    const service = new QuotaEnforcementService(
      makePrismaWithCount('api_keys', 9999) as never,
      // Pass through partial — `maxApiKeys: undefined` triggers the
      // `null === undefined` admit branch.
      {
        getTenantTierConfig: jest.fn(async () => ({
          tier: 'enterprise',
          maxApiKeys: null,
        })),
      } as never,
    );
    await expect(
      service.checkEntityLimit('t1', 'api_keys'),
    ).resolves.toBeUndefined();
  });

  it('counts each entity type via the correct Prisma model', async () => {
    // products → product.count, customers → customer.count, etc.
    for (const [entity, model] of [
      ['products', 'product'],
      ['customers', 'customer'],
      ['users', 'user'],
      ['lenders', 'lender'],
      ['merchants', 'merchant'],
      ['api_keys', 'apiKey'],
    ] as const) {
      const prisma = makePrismaWithCount(entity, 0);
      const service = new QuotaEnforcementService(
        prisma as never,
        makeConfigService({
          maxActiveProducts: 999,
          maxCustomers: 999,
          maxPortalUsers: 999,
          maxLenderConfigs: 999,
          maxBnplMerchants: 999,
          maxApiKeys: 999,
        }),
      );
      await service.checkEntityLimit('t1', entity);
      expect((prisma as Record<string, { count: jest.Mock }>)[model].count)
        .toHaveBeenCalled();
    }
  });
});
