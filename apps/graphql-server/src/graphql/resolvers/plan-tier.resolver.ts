import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ForbiddenException } from '@nestjs/common';

import { AuditAction } from '@lons/common';
import { PlanTier } from '@lons/database';
import {
  CurrentTenant,
  CurrentUser,
  IAuthenticatedUser,
  PlanTierConfigService,
  Roles,
} from '@lons/entity-service';

import { PlanTierConfigType, PlanTierGql } from '../types/plan-tier.type';
import { UpdatePlanTierConfigInput } from '../inputs/update-plan-tier.input';

/**
 * Sprint 14 (S14-9) — GraphQL surface for plan tier configuration.
 *
 * Platform-admin queries/mutations read & write the `PlanTierConfig`
 * table; tenant queries are scoped to the caller's own tier. The
 * service handles caching, so this resolver is a thin pass-through.
 */
@Resolver(() => PlanTierConfigType)
export class PlanTierResolver {
  constructor(private readonly planTierConfigService: PlanTierConfigService) {}

  // ── Platform-admin reads ─────────────────────────────────────────

  @Query(() => [PlanTierConfigType])
  @Roles('platform:admin')
  async planTierConfigs(): Promise<PlanTierConfigType[]> {
    const tiers: PlanTier[] = ['starter', 'growth', 'enterprise'] as PlanTier[];
    const rows = await Promise.all(
      tiers.map((t) => this.planTierConfigService.getTierConfig(t)),
    );
    return rows as unknown as PlanTierConfigType[];
  }

  @Query(() => PlanTierConfigType)
  @Roles('platform:admin')
  async planTierConfig(
    @Args('tier', { type: () => PlanTierGql }) tier: PlanTierGql,
  ): Promise<PlanTierConfigType> {
    return (await this.planTierConfigService.getTierConfig(
      tier as unknown as PlanTier,
    )) as unknown as PlanTierConfigType;
  }

  // ── Tenant self-read ─────────────────────────────────────────────

  /**
   * Returns the calling tenant's own tier config. Platform admins
   * cannot use this query — there's no tenant context for them; they
   * must pass an explicit tier via `planTierConfig(tier)`.
   */
  @Query(() => PlanTierConfigType)
  async myPlanTier(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<PlanTierConfigType> {
    if (user.isPlatformAdmin) {
      throw new ForbiddenException(
        'Platform admins have no tenant tier — use planTierConfig(tier).',
      );
    }
    return (await this.planTierConfigService.getTenantTierConfig(
      tenantId,
    )) as unknown as PlanTierConfigType;
  }

  // ── Platform-admin update ────────────────────────────────────────

  @Mutation(() => PlanTierConfigType)
  @Roles('platform:admin')
  @AuditAction('update.planTierConfig', 'plan_tier_config')
  async updatePlanTierConfig(
    @Args('tier', { type: () => PlanTierGql }) tier: PlanTierGql,
    @Args('input') input: UpdatePlanTierConfigInput,
  ): Promise<PlanTierConfigType> {
    // The service merges these into the existing row and invalidates
    // the Redis cache on success so the next read picks up the new
    // shape immediately.
    const updated = await this.planTierConfigService.updateTierConfig(
      tier as unknown as PlanTier,
      input,
    );
    return updated as unknown as PlanTierConfigType;
  }
}
