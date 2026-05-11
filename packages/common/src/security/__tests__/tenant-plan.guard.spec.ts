/**
 * Sprint 14 (S14-9) — TenantPlanGuard tests.
 *
 * Verifies the tier hierarchy and the structured ForbiddenException
 * payload. Uses a hand-rolled fake `IPlanTierConfigLike` so the test
 * never touches Prisma / Redis — pure guard logic.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  REQUIRED_PLAN_KEY,
  TenantPlanGuard,
  type IPlanTierConfigLike,
} from '../tenant-plan.guard';

function makeReflector(tier: string | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn(() => tier),
  } as unknown as Reflector;
}

function makeConfigService(tier: string): IPlanTierConfigLike {
  return {
    getTenantTierConfig: jest.fn(async () => ({ tier })),
  };
}

function makeHttpContext(user: Record<string, unknown> = {}): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => () => {},
    getClass: () => function () {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getArgs: () => [],
  } as unknown as ExecutionContext;
}

function makeGqlContext(user: Record<string, unknown> = {}): ExecutionContext {
  return {
    getType: () => 'graphql',
    getHandler: () => () => {},
    getClass: () => function () {},
    getArgs: () => [{}, {}, { req: { user } }, {}],
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('TenantPlanGuard (S14-9)', () => {
  it('admits when no @RequiresPlan decorator is present', async () => {
    const guard = new TenantPlanGuard(
      makeReflector(undefined),
      makeConfigService('starter'),
    );
    await expect(
      guard.canActivate(makeHttpContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
  });

  it('admits a growth tenant for a growth-only mutation', async () => {
    const guard = new TenantPlanGuard(
      makeReflector('growth'),
      makeConfigService('growth'),
    );
    await expect(
      guard.canActivate(makeHttpContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
  });

  it('admits an enterprise tenant for a growth-only mutation', async () => {
    const guard = new TenantPlanGuard(
      makeReflector('growth'),
      makeConfigService('enterprise'),
    );
    await expect(
      guard.canActivate(makeHttpContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
  });

  it('rejects a starter tenant for a growth-only mutation with structured payload', async () => {
    const guard = new TenantPlanGuard(
      makeReflector('growth'),
      makeConfigService('starter'),
    );
    try {
      await guard.canActivate(makeHttpContext({ tenantId: 't1' }));
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe('PLAN_TIER_INSUFFICIENT');
      expect(body.currentTier).toBe('starter');
      expect(body.requiredTier).toBe('growth');
      expect(body.upgradeUrl).toBe('/settings/plan');
    }
  });

  it('rejects a starter tenant for an enterprise-only mutation', async () => {
    const guard = new TenantPlanGuard(
      makeReflector('enterprise'),
      makeConfigService('starter'),
    );
    await expect(
      guard.canActivate(makeHttpContext({ tenantId: 't1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // Platform admins are not on a tenant tier — they bypass.
  it('admits a platform admin regardless of required tier', async () => {
    const guard = new TenantPlanGuard(
      makeReflector('enterprise'),
      makeConfigService('starter'),
    );
    await expect(
      guard.canActivate(
        makeHttpContext({ tenantId: undefined, isPlatformAdmin: true }),
      ),
    ).resolves.toBe(true);
  });

  it('throws when tenant context is missing on a gated endpoint', async () => {
    const guard = new TenantPlanGuard(
      makeReflector('growth'),
      makeConfigService('growth'),
    );
    try {
      await guard.canActivate(makeHttpContext({}));
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe('PLAN_TIER_CHECK_NO_TENANT');
    }
  });

  it('works in a GraphQL execution context', async () => {
    const guard = new TenantPlanGuard(
      makeReflector('growth'),
      makeConfigService('growth'),
    );
    await expect(
      guard.canActivate(makeGqlContext({ tenantId: 't1' })),
    ).resolves.toBe(true);
  });

  it('reports lookup failure with the dedicated error code', async () => {
    const guard = new TenantPlanGuard(makeReflector('growth'), {
      getTenantTierConfig: jest.fn(async () => {
        throw new Error('db down');
      }),
    });
    try {
      await guard.canActivate(makeHttpContext({ tenantId: 't1' }));
      fail('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.code).toBe('PLAN_TIER_LOOKUP_FAILED');
    }
  });
});
