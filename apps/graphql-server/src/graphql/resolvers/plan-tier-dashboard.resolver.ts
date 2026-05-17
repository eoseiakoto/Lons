import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';
import { PrismaService, PlanTier } from '@lons/database';
import {
  CurrentTenant,
  CurrentUser,
  IAuthenticatedUser,
  Roles,
  UpgradeRequestService,
  UsageMetricsService,
} from '@lons/entity-service';

import {
  CurrentUsageType,
  PlanTierComparisonType,
  PlanTierSummaryType,
  UpgradeRequestType,
  UsageLimitsType,
} from '../types/plan-tier-dashboard.type';

/**
 * Sprint 18 (S18-11) — Plan Tier Dashboard, Usage Display, Upgrade Request.
 *
 * Three GraphQL surfaces:
 *   - `planTierSummary` — calling tenant's plan + usage + limits.
 *   - `planTierComparison` — full tier matrix for the comparison modal.
 *   - `requestPlanUpgrade` — mutation tenants call to submit an upgrade.
 *
 * Authorization: `billing:read` for the queries (operator who manages
 * billing); `admin` for the upgrade mutation (only owners should be
 * spending more money).
 */
@Resolver()
export class PlanTierDashboardResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageMetricsService: UsageMetricsService,
    private readonly upgradeRequestService: UpgradeRequestService,
  ) {}

  @Query(() => PlanTierSummaryType)
  @Roles('billing:read')
  async planTierSummary(
    @CurrentTenant() tenantId: string,
  ): Promise<PlanTierSummaryType> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { billingConfig: true },
    });

    const tierConfig = await this.prisma.planTierConfig.findUnique({
      where: { tier: tenant.planTier },
    });

    const usageSnapshot = await this.usageMetricsService.getCurrentUsage(tenantId);

    const usage: CurrentUsageType = {
      activeProducts: Number(usageSnapshot.activeProducts.current),
      totalCustomers: Number(usageSnapshot.activeCustomers.current),
      monthlyDisbursementVolumeUsd: String(usageSnapshot.monthlyDisbursementVolumeUsd.current ?? '0'),
      monthlyTransactions: Number(usageSnapshot.monthlyDisbursementCount.current),
      activeLenderConfigs: Number(usageSnapshot.lenders.current),
      activeBnplMerchants: Number(usageSnapshot.merchants.current),
      portalUsers: Number(usageSnapshot.portalUsers.current),
      activeApiKeys: Number(usageSnapshot.apiKeys.current),
    };

    const limits: UsageLimitsType = {
      maxActiveProducts: tierConfig?.maxActiveProducts ?? null,
      maxCustomers: tierConfig?.maxCustomers ?? null,
      maxMonthlyDisbursementVolumeUsd:
        tierConfig?.maxMonthlyDisbursementVolumeUsd != null
          ? String(tierConfig.maxMonthlyDisbursementVolumeUsd)
          : null,
      maxMonthlyTransactions: tierConfig?.maxMonthlyTransactions ?? null,
      maxLenderConfigs: tierConfig?.maxLenderConfigs ?? null,
      maxBnplMerchants: tierConfig?.maxBnplMerchants ?? null,
      maxPortalUsers: tierConfig?.maxPortalUsers ?? null,
      maxApiKeys: tierConfig?.maxApiKeys ?? null,
      apiRateLimitPerMinute: tierConfig?.apiRateLimitPerMinute ?? 60,
    };

    return {
      currentTier: tenant.planTier,
      tierDisplayName: tierConfig?.displayName ?? tenant.planTier,
      billingModel: tenant.billingConfig?.billingModel ?? 'per_disbursement',
      subscriptionAmount:
        tenant.billingConfig?.subscriptionAmountUsd != null
          ? String(tenant.billingConfig.subscriptionAmountUsd)
          : '0',
      billingCurrency: tenant.billingConfig?.billingCurrency ?? 'USD',
      contractStartDate: tenant.billingConfig?.contractStartDate
        ? tenant.billingConfig.contractStartDate.toISOString()
        : null,
      contractEndDate: tenant.billingConfig?.contractEndDate
        ? tenant.billingConfig.contractEndDate.toISOString()
        : null,
      usage,
      limits,
      featureFlags: (tierConfig?.featureFlags as Record<string, unknown>) ?? {},
    };
  }

  @Query(() => [PlanTierComparisonType])
  @Roles('billing:read')
  async planTierComparison(): Promise<PlanTierComparisonType[]> {
    const tiers = await this.prisma.planTierConfig.findMany({
      orderBy: { apiRateLimitPerMinute: 'asc' },
    });
    return tiers.map((t) => ({
      tier: t.tier,
      displayName: t.displayName,
      maxActiveProducts: t.maxActiveProducts,
      maxCustomers: t.maxCustomers,
      maxMonthlyDisbursementVolumeUsd:
        t.maxMonthlyDisbursementVolumeUsd != null
          ? String(t.maxMonthlyDisbursementVolumeUsd)
          : null,
      maxMonthlyTransactions: t.maxMonthlyTransactions,
      maxLenderConfigs: t.maxLenderConfigs,
      maxPortalUsers: t.maxPortalUsers,
      apiRateLimitPerMinute: t.apiRateLimitPerMinute,
      restApiEnabled: t.restApiEnabled,
      websocketEnabled: t.websocketEnabled,
      bulkOperationsEnabled: t.bulkOperationsEnabled,
      featureFlags: (t.featureFlags as Record<string, unknown>) ?? {},
      allowedProductTypes: t.allowedProductTypes,
    }));
  }

  @Query(() => [UpgradeRequestType])
  @Roles('billing:read')
  async upgradeRequests(
    @CurrentTenant() tenantId: string,
  ): Promise<UpgradeRequestType[]> {
    const rows = await this.upgradeRequestService.listForTenant(tenantId);
    return rows.map((r) => ({
      id: r.id,
      currentTier: r.currentTier,
      requestedTier: r.requestedTier,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
    }));
  }

  @Mutation(() => UpgradeRequestType)
  @Roles('admin')
  @AuditAction(AuditActionType.PLAN_UPGRADE_REQUESTED, AuditResourceType.TENANT)
  async requestPlanUpgrade(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('targetTier') targetTier: string,
    @Args('reason', { nullable: true }) reason?: string,
    @Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,
  ): Promise<UpgradeRequestType> {
    const request = await this.upgradeRequestService.requestUpgrade(tenantId, {
      targetTier: targetTier as PlanTier,
      reason,
      requestedBy: user.userId,
    });
    return {
      id: request.id,
      currentTier: request.currentTier,
      requestedTier: request.requestedTier,
      status: request.status,
      reason: request.reason,
      createdAt: request.createdAt,
    };
  }
}
