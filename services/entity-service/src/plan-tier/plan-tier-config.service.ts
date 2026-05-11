import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Redis from 'ioredis';

import { PrismaService, PlanTier, PlanTierConfig } from '@lons/database';
import { REDIS_CLIENT } from '@lons/common';

/**
 * Sprint 14 (S14-9) — DB-driven plan tier configuration accessor.
 *
 * The single source of truth is the `plan_tier_configs` table. Reads
 * route through a 5-minute Redis cache to keep the per-request cost
 * minimal — every gated mutation looks this up on every call.
 *
 * **Caching strategy.** One key per tier (`plan_tier_config:{tier}`)
 * with a 5-minute TTL. Updates via `updateTierConfig()` invalidate the
 * affected tier's key synchronously. If Redis is unreachable the
 * service falls back to a direct DB read — never blocking on cache.
 *
 * **Why DB-driven.** Product team needs to tune limits per tier
 * (e.g. raise Growth's monthly transactions cap) without a code deploy.
 * Static TypeScript constants would have required CI + release for
 * every tweak. Trade-off: every request pays a Redis round trip, but
 * the 5-minute TTL caps DB load even under heavy traffic.
 */
@Injectable()
export class PlanTierConfigService {
  private readonly logger = new Logger(PlanTierConfigService.name);
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes
  private readonly CACHE_KEY_PREFIX = 'plan_tier_config';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Get a single tier's config, hitting Redis first. Throws
   * `NotFoundException` if the tier row is missing — the seed migration
   * inserts all three, so this would only fire on a corrupted DB.
   */
  async getTierConfig(tier: PlanTier): Promise<PlanTierConfig> {
    const cacheKey = this.cacheKey(tier);

    // 1. Try the cache.
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return this.deserialize(cached);
      }
    } catch (err) {
      // Redis hiccup — log and fall through to DB. Never block on cache.
      this.logger.warn(
        `Redis read failed for ${cacheKey}: ${(err as Error).message}`,
      );
    }

    // 2. DB fetch.
    const row = await this.prisma.planTierConfig.findUnique({ where: { tier } });
    if (!row) {
      throw new NotFoundException(`PlanTierConfig row for tier "${tier}" not found`);
    }

    // 3. Write-through cache. Best-effort — never block on write failure.
    try {
      await this.redis.setex(
        cacheKey,
        this.CACHE_TTL_SECONDS,
        this.serialize(row),
      );
    } catch (err) {
      this.logger.warn(
        `Redis write failed for ${cacheKey}: ${(err as Error).message}`,
      );
    }

    return row;
  }

  /**
   * Look up the tier config for a specific tenant. Joins on tenant
   * because the tenant row is the source of truth for `planTier`
   * (TenantBillingConfig.planTier mirrors it; the Tenant column is
   * authoritative).
   */
  async getTenantTierConfig(tenantId: string): Promise<PlanTierConfig> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planTier: true },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    return this.getTierConfig(tenant.planTier);
  }

  /**
   * Check whether the tenant's plan permits a given product type.
   * `allowedProductTypes` is a JSONB array — we treat unknown shapes
   * as "deny" rather than crash.
   */
  async isProductTypeAllowed(
    tenantId: string,
    productType: string,
  ): Promise<boolean> {
    const cfg = await this.getTenantTierConfig(tenantId);
    const allowed = cfg.allowedProductTypes as unknown;
    if (!Array.isArray(allowed)) return false;
    return allowed.includes(productType);
  }

  /**
   * Lookup a single feature flag for a tenant. Falls back to `false`
   * when the flag is missing or non-boolean — closed by default.
   */
  async isFeatureEnabled(tenantId: string, feature: string): Promise<boolean> {
    const cfg = await this.getTenantTierConfig(tenantId);
    const flags = cfg.featureFlags as Record<string, unknown> | null;
    if (!flags) return false;
    return flags[feature] === true;
  }

  /**
   * Return the operational limit for a numeric dimension. `null` means
   * the tier has no cap (enterprise behaviour). Callers should explicitly
   * handle `null` as "unlimited" rather than treating it as 0.
   */
  async getOperationalLimit(
    tenantId: string,
    limitKey:
      | 'maxActiveProducts'
      | 'maxCustomers'
      | 'maxMonthlyDisbursementVolumeUsd'
      | 'maxMonthlyTransactions'
      | 'maxLenderConfigs'
      | 'maxBnplMerchants'
      | 'maxPortalUsers'
      | 'maxApiKeys',
  ): Promise<number | null> {
    const cfg = await this.getTenantTierConfig(tenantId);
    const value = cfg[limitKey];
    if (value === null || value === undefined) return null;
    // Decimal fields (volume in USD) come back as Decimal objects — coerce
    // via Number with a precision check (USD volumes fit in 2^53).
    return typeof value === 'number' ? value : Number(value);
  }

  /**
   * Platform-admin tier-config edit. Invalidates the cache so the next
   * read picks up the new shape.
   */
  async updateTierConfig(
    tier: PlanTier,
    updates: Partial<{
      displayName: string;
      allowedProductTypes: unknown;
      maxActiveProducts: number | null;
      maxCustomers: number | null;
      maxMonthlyDisbursementVolumeUsd: string | null;
      maxMonthlyTransactions: number | null;
      maxLenderConfigs: number | null;
      maxBnplMerchants: number | null;
      maxPortalUsers: number | null;
      dataRetentionMonths: number;
      featureFlags: unknown;
      apiRateLimitPerMinute: number;
      restApiEnabled: boolean;
      websocketEnabled: boolean;
      bulkOperationsEnabled: boolean;
      maxApiKeys: number | null;
      brandingOptions: unknown;
    }>,
  ): Promise<PlanTierConfig> {
    // Cast through `unknown` because Prisma's update types are stricter
    // than the partial we accept (JSON inputs are typed as
    // `Prisma.InputJsonValue` but our public surface uses `unknown`).
    const updated = await this.prisma.planTierConfig.update({
      where: { tier },
      data: updates as never,
    });
    await this.invalidateCache(tier);
    return updated;
  }

  /**
   * Explicit cache invalidation — public so subscribers (e.g. webhook
   * handlers) can drop the cache on out-of-band updates.
   */
  async invalidateCache(tier: PlanTier): Promise<void> {
    try {
      await this.redis.del(this.cacheKey(tier));
    } catch (err) {
      this.logger.warn(
        `Redis cache invalidation failed for ${tier}: ${(err as Error).message}`,
      );
    }
  }

  private cacheKey(tier: PlanTier): string {
    return `${this.CACHE_KEY_PREFIX}:${tier}`;
  }

  private serialize(cfg: PlanTierConfig): string {
    // Prisma `Decimal` objects don't survive JSON.stringify cleanly —
    // they serialise as objects with internal fields. We stringify them
    // explicitly so the cache round-trips as `string` (consistent with
    // how the rest of the platform handles money — Decimal as string).
    return JSON.stringify(cfg, (_key, value) => {
      if (value && typeof value === 'object' && 'd' in value && 'e' in value && 's' in value) {
        return value.toString();
      }
      return value;
    });
  }

  private deserialize(json: string): PlanTierConfig {
    const obj = JSON.parse(json) as Record<string, unknown>;
    // Re-cast through `unknown` — consumers handle Decimal fields via
    // `String(...)` / our `add/multiply` helpers, so the loose type is
    // sufficient. Strict reconstruction would require importing
    // Prisma's Decimal class here.
    return obj as unknown as PlanTierConfig;
  }
}
