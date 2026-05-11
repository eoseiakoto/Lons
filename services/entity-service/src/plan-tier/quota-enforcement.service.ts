import { ForbiddenException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@lons/database';

import { PlanTierConfigService } from './plan-tier-config.service';

/**
 * Sprint 14 (S14-10) — enforce per-tenant operational limits at the
 * boundary of entity-creating services.
 *
 * Call `checkEntityLimit(tenantId, type)` at the top of every `create()`
 * method. If the tenant's tier caps the entity type and the current
 * non-deleted/active count is at or above the cap, throw a structured
 * `QUOTA_EXCEEDED` ForbiddenException — the GraphQL exception filter
 * surfaces the code/details to the client unchanged.
 *
 * **Why server-side count over a cached counter.** Hard quotas need
 * exact numbers; a stale Redis cache would let a tenant create one
 * extra product on a cache miss/hit edge. We pay the DB count() on every
 * create — these are tenant-scoped, indexed queries with bounded
 * cardinality (no tenant has >100k of any of these), so it's a cheap
 * read.
 */
export type EntityType =
  | 'products'
  | 'customers'
  | 'users'
  | 'lenders'
  | 'merchants'
  | 'api_keys';

@Injectable()
export class QuotaEnforcementService {
  private readonly logger = new Logger(QuotaEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planTierConfigService: PlanTierConfigService,
  ) {}

  /**
   * Throws `ForbiddenException({ code: 'QUOTA_EXCEEDED', ... })` if
   * creating one more entity of the given type would breach the
   * tenant's plan limit. No-op for tiers with `null` (unlimited).
   */
  async checkEntityLimit(tenantId: string, entityType: EntityType): Promise<void> {
    const config = await this.planTierConfigService.getTenantTierConfig(tenantId);

    const limitMap: Record<EntityType, number | null | undefined> = {
      products: config.maxActiveProducts,
      customers: config.maxCustomers,
      users: config.maxPortalUsers,
      lenders: config.maxLenderConfigs,
      merchants: config.maxBnplMerchants,
      api_keys: config.maxApiKeys,
    };

    const limit = limitMap[entityType];
    // null / undefined → unlimited (enterprise behaviour).
    if (limit === null || limit === undefined) return;

    const currentCount = await this.countEntities(tenantId, entityType);
    if (currentCount >= limit) {
      // Structured error — the GraphQL filter and REST exception filter
      // pass `extensions`/`response` through unchanged so the client
      // sees the `code`, current count, and upgrade hint.
      throw new ForbiddenException({
        code: 'QUOTA_EXCEEDED',
        message: `Your ${config.tier} plan allows a maximum of ${limit} ${entityType}. Current: ${currentCount}.`,
        entityType,
        currentCount,
        limit,
        currentTier: config.tier,
        upgradeUrl: '/settings/plan',
      });
    }
  }

  /**
   * Count non-deleted (and where relevant, active) entities for the
   * tenant. The filters mirror what the admin portal shows as "active"
   * so quota math matches operator expectations.
   */
  private async countEntities(tenantId: string, entityType: EntityType): Promise<number> {
    switch (entityType) {
      case 'products':
        // Discontinued products don't consume a slot — they're tombstones.
        return this.prisma.product.count({
          where: { tenantId, deletedAt: null, status: { not: 'discontinued' } },
        });
      case 'customers':
        return this.prisma.customer.count({
          where: { tenantId, deletedAt: null },
        });
      case 'users':
        // Only active portal users count — deactivated seats are free.
        return this.prisma.user.count({
          where: { tenantId, deletedAt: null, status: 'active' },
        });
      case 'lenders':
        return this.prisma.lender.count({
          where: { tenantId, deletedAt: null },
        });
      case 'merchants':
        // BNPL merchants — count all non-deleted regardless of status.
        return this.prisma.merchant.count({
          where: { tenantId, deletedAt: null },
        });
      case 'api_keys':
        // Revoked keys still count against the slot until rotated out
        // — that's the contract operators expect ("3 keys means 3 keys,
        // active or paused").
        return (this.prisma as unknown as { apiKey: { count: (args: unknown) => Promise<number> } }).apiKey.count(
          { where: { tenantId } },
        );
    }
  }
}
