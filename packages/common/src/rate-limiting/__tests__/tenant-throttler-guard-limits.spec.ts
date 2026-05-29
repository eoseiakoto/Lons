import { TenantThrottlerGuard } from '../tenant-throttler.guard';
import { RateLimitConfigService } from '../rate-limit-config.service';

/**
 * F-ABC-1: regression tests for the DB-driven limit resolution.
 *
 * We exercise the protected `getLimitsForTenant` method directly via
 * a thin subclass so the test stays focused on the resolution logic
 * (the parent ThrottlerGuard's handleRequest IO path is covered
 * separately by the storage spec).
 *
 * Coverage:
 *   - Growth tier (500/min) returns the right per-category limits.
 *   - Enterprise tier (2000/min) returns higher per-category limits.
 *   - No tenant config falls back to starter (100/min × multiplier).
 *   - Without the service injected → starter-tier DEFAULT_LIMITS.
 *   - Service throwing returns starter-tier DEFAULT_LIMITS (fail closed).
 */

class TestableGuard extends TenantThrottlerGuard {
  public callGetLimits(tenantId: string, category: any) {
    return this.getLimitsForTenant(tenantId, category);
  }
}

function makeGuard(opts: {
  configForTenant?: any;
  configThrows?: boolean;
  noConfigService?: boolean;
}) {
  const baseOptions: any = { throttlers: [{ ttl: 60_000, limit: 100 }] };
  const storage: any = { increment: jest.fn() };
  const reflector: any = { getAllAndOverride: jest.fn(() => 'read') };

  let configService: RateLimitConfigService | undefined;
  if (!opts.noConfigService) {
    configService = {
      getConfigForTenant: opts.configThrows
        ? jest.fn().mockRejectedValue(new Error('db down'))
        : jest.fn().mockResolvedValue(opts.configForTenant ?? null),
      applyCategory: jest.fn().mockImplementation((config, category) => {
        // Mirror the real implementation closely enough for the test.
        const multipliers: Record<string, number> = { read: 1.0, write: 0.2, scoring: 0.1 };
        if (!config) {
          return { ttl: 60_000, limit: Math.max(1, Math.ceil(100 * (multipliers[category] ?? 1))) };
        }
        return {
          ttl: 60_000,
          limit: Math.max(1, Math.ceil(config.perMinute * (multipliers[category] ?? 1))),
        };
      }),
    } as any;
  }

  return new TestableGuard(baseOptions, storage, reflector, configService);
}

describe('TenantThrottlerGuard.getLimitsForTenant', () => {
  it('Growth tier read → 500/min', async () => {
    const guard = makeGuard({ configForTenant: { perMinute: 500, tier: 'growth' } });
    expect(await guard.callGetLimits('t-1', 'read')).toEqual({ ttl: 60_000, limit: 500 });
  });

  it('Growth tier write → 100/min (500 × 0.2)', async () => {
    const guard = makeGuard({ configForTenant: { perMinute: 500, tier: 'growth' } });
    expect(await guard.callGetLimits('t-1', 'write')).toEqual({ ttl: 60_000, limit: 100 });
  });

  it('Growth tier scoring → 50/min (500 × 0.1)', async () => {
    const guard = makeGuard({ configForTenant: { perMinute: 500, tier: 'growth' } });
    expect(await guard.callGetLimits('t-1', 'scoring')).toEqual({ ttl: 60_000, limit: 50 });
  });

  it('Enterprise tier read → 2000/min', async () => {
    const guard = makeGuard({ configForTenant: { perMinute: 2000, tier: 'enterprise' } });
    expect(await guard.callGetLimits('t-1', 'read')).toEqual({ ttl: 60_000, limit: 2000 });
  });

  it('Enterprise tier scoring → 200/min (2000 × 0.1)', async () => {
    const guard = makeGuard({ configForTenant: { perMinute: 2000, tier: 'enterprise' } });
    expect(await guard.callGetLimits('t-1', 'scoring')).toEqual({ ttl: 60_000, limit: 200 });
  });

  it('No tenant config falls back to starter tier (100/min × multiplier)', async () => {
    const guard = makeGuard({ configForTenant: null });
    expect(await guard.callGetLimits('t-1', 'read')).toEqual({ ttl: 60_000, limit: 100 });
    expect(await guard.callGetLimits('t-1', 'write')).toEqual({ ttl: 60_000, limit: 20 });
    expect(await guard.callGetLimits('t-1', 'scoring')).toEqual({ ttl: 60_000, limit: 10 });
  });

  it('Service not injected → starter-tier DEFAULT_LIMITS', async () => {
    const guard = makeGuard({ noConfigService: true });
    expect(await guard.callGetLimits('t-1', 'read')).toEqual({ ttl: 60_000, limit: 100 });
    expect(await guard.callGetLimits('t-1', 'write')).toEqual({ ttl: 60_000, limit: 20 });
    expect(await guard.callGetLimits('t-1', 'scoring')).toEqual({ ttl: 60_000, limit: 10 });
  });

  it('Service throwing → starter-tier DEFAULT_LIMITS (fail closed)', async () => {
    const guard = makeGuard({ configThrows: true });
    expect(await guard.callGetLimits('t-1', 'read')).toEqual({ ttl: 60_000, limit: 100 });
  });
});
