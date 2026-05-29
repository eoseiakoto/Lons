import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../cache/redis-client.module';
import { RATE_LIMIT_TIERS, RateLimitTier } from './rate-limit-tiers';

/**
 * S19-11 / NFR-SC-004 — DB-driven per-tenant rate-limit resolver.
 *
 * Resolution chain for `getConfigForTenant(tenantId)`:
 *   1. Redis cache (`rate_limit_config:<tenantId>`, 5-minute TTL).
 *   2. DB lookup: tenant_billing_configs.planTier → plan_tier_configs
 *      (apiRateLimitPerMinute).
 *   3. Fallback: static RATE_LIMIT_TIERS by tier name.
 *   4. Final fallback: starter tier.
 *
 * Category multipliers (per RateCategory):
 *   - read:    1.0x  (full per-minute limit)
 *   - write:   0.2x  (writes are 20% of the read budget)
 *   - scoring: 0.1x  (scoring is the most expensive call)
 *
 * Cache invalidation: TTL-only. A tenant's billing-tier change takes
 * effect within 5 minutes. If immediate invalidation is needed later,
 * add a Redis pub/sub hook here that the billing service publishes
 * to on tier change.
 */
export type RateCategory = 'read' | 'write' | 'scoring';

export interface TenantRateLimitConfig {
  /** Base per-minute limit from the tenant's plan tier. */
  perMinute: number;
  /** Tier name (for debug + headers). */
  tier: string;
}

const CATEGORY_MULTIPLIERS: Record<RateCategory, number> = {
  read: 1.0,
  write: 0.2,
  scoring: 0.1,
};

const CACHE_TTL_SECONDS = 300;

/**
 * Minimal shape we need from the Prisma client. We accept any object
 * exposing these two model accessors so this module doesn't depend
 * on `@lons/database` (which would create a circular dep — database
 * depends on common). Structural typing keeps the contract honest:
 * the consumer wires in `PrismaService` at composition time.
 */
interface RateLimitPrisma {
  tenantBillingConfig: {
    findUnique(args: { where: { tenantId: string } }): Promise<{
      tenantId: string;
      planTier: string;
    } | null>;
  };
  planTierConfig: {
    findUnique(args: { where: { tier: string } }): Promise<{
      tier: string;
      apiRateLimitPerMinute: number;
    } | null>;
  };
}

@Injectable()
export class RateLimitConfigService {
  private readonly logger = new Logger(RateLimitConfigService.name);

  constructor(
    @Inject('PRISMA_SERVICE') private readonly prisma: RateLimitPrisma,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /**
   * Resolve the effective base config for a tenant. Returns `null`
   * only when the tenant has no billing config AND no plan tier
   * config is found — callers should fall back to a static tier.
   */
  async getConfigForTenant(tenantId: string): Promise<TenantRateLimitConfig | null> {
    if (this.redis) {
      try {
        const cached = await this.redis.get(`rate_limit_config:${tenantId}`);
        if (cached) return JSON.parse(cached) as TenantRateLimitConfig;
      } catch (err) {
        this.logger.warn(`rate-limit cache read failed: ${(err as Error).message}`);
      }
    }

    const billing = await this.prisma.tenantBillingConfig.findUnique({
      where: { tenantId },
    });
    if (!billing) return null;

    const planConfig = await this.prisma.planTierConfig.findUnique({
      where: { tier: billing.planTier },
    });
    if (!planConfig) return null;

    const config: TenantRateLimitConfig = {
      perMinute: planConfig.apiRateLimitPerMinute,
      tier: billing.planTier as string,
    };

    if (this.redis) {
      try {
        await this.redis.setex(
          `rate_limit_config:${tenantId}`,
          CACHE_TTL_SECONDS,
          JSON.stringify(config),
        );
      } catch (err) {
        this.logger.warn(`rate-limit cache write failed: ${(err as Error).message}`);
      }
    }

    return config;
  }

  /**
   * Compute the (ttl, limit) for a request category. Applies the
   * category multiplier; falls back to the static `starter` tier
   * when no config is available.
   */
  applyCategory(
    config: TenantRateLimitConfig | null,
    category: RateCategory,
  ): { ttl: number; limit: number } {
    const multiplier = CATEGORY_MULTIPLIERS[category] ?? 1.0;
    if (!config) {
      // Fallback: starter tier from static map.
      return {
        ttl: RATE_LIMIT_TIERS.starter.ttl,
        limit: Math.max(1, Math.ceil(RATE_LIMIT_TIERS.starter.limit * multiplier)),
      };
    }
    return {
      ttl: 60_000, // 1-minute window — matches PlanTierConfig.apiRateLimitPerMinute semantics
      limit: Math.max(1, Math.ceil(config.perMinute * multiplier)),
    };
  }

  /**
   * Cache-bust hook. Call after writing TenantBillingConfig or
   * PlanTierConfig so the change takes effect immediately rather
   * than waiting for the 5-minute TTL.
   */
  async invalidate(tenantId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(`rate_limit_config:${tenantId}`);
    } catch (err) {
      this.logger.warn(`rate-limit cache invalidate failed: ${(err as Error).message}`);
    }
  }

  /**
   * Resolve via the static tier map. Useful for callers that don't
   * have DB access (e.g. unit tests) but know the tier by name.
   */
  staticTier(tier: RateLimitTier, category: RateCategory): { ttl: number; limit: number } {
    const t = RATE_LIMIT_TIERS[tier];
    const multiplier = CATEGORY_MULTIPLIERS[category] ?? 1.0;
    return { ttl: t.ttl, limit: Math.max(1, Math.ceil(t.limit * multiplier)) };
  }
}
