import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { AuditAction, EventBusService } from '@lons/common';
import {
  CurrentTenant,
  IAuthenticatedUser,
  CurrentUser,
  PlanTierConfigService,
  Roles,
  UsageMetricsService,
} from '@lons/entity-service';
import { EventType } from '@lons/event-contracts';

import { UsageSnapshotType } from '../types/usage.type';

/**
 * Sprint 14 (S14-14b, S14-15) — read-only usage API + plan upgrade
 * request mutation.
 *
 * Tenants call `currentUsage` to populate their plan/usage page. The
 * `requestPlanUpgrade` mutation emits a platform-admin notification
 * event — no self-service tier change (intentional friction so a
 * commercial conversation happens first).
 */
@Resolver()
export class UsageResolver {
  constructor(
    private readonly usageMetricsService: UsageMetricsService,
    private readonly planTierConfigService: PlanTierConfigService,
    private readonly eventBus: EventBusService,
  ) {}

  @Query(() => UsageSnapshotType)
  @Roles('usage:read')
  async currentUsage(
    @CurrentTenant() tenantId: string,
  ): Promise<UsageSnapshotType> {
    const snap = await this.usageMetricsService.getCurrentUsage(tenantId);
    // The service shape uses `number | string` for some `current`
    // fields (volume USD as string). The GraphQL types narrow these to
    // the right scalar so casting is safe.
    return snap as unknown as UsageSnapshotType;
  }

  /**
   * Tenant requests an upgrade to a higher plan tier. Emits an event
   * for platform admins; no DB state changes here.
   */
  @Mutation(() => Boolean)
  @Roles('usage:read')
  @AuditAction('request.planUpgrade', 'tenant')
  async requestPlanUpgrade(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('targetTier') targetTier: string,
    @Args('notes', { nullable: true }) notes?: string,
  ): Promise<boolean> {
    const current = await this.planTierConfigService.getTenantTierConfig(tenantId);
    this.eventBus.emitAndBuild(EventType.PLAN_UPGRADE_REQUESTED, tenantId, {
      currentTier: current.tier,
      targetTier,
      notes: notes ?? null,
      requestedBy: user.userId,
      requestedAt: new Date().toISOString(),
    });
    return true;
  }
}
