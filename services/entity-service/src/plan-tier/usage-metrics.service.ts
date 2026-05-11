import { Injectable } from '@nestjs/common';

import { PrismaService } from '@lons/database';

import { PlanTierConfigService } from './plan-tier-config.service';
import { QuotaTrackingService } from './quota-tracking.service';

/**
 * Sprint 14 (S14-14b) — read-only API surface for the admin portal
 * plan/usage page and the platform-portal tenant management page.
 *
 * Combines three sources:
 *   - DB counts for "static" entity slots (products, customers, etc.)
 *   - Redis counters for monthly disbursements + daily API calls
 *   - PlanTierConfig for the per-tier limits
 *
 * Returns a normalised `UsageSnapshot` shape — every dimension is a
 * `{ current, limit }` pair where `limit: null` means unlimited.
 */

/** Monetary fields flow as Decimal-as-string per CLAUDE.md. */
export interface UsageDimension {
  current: number | string;
  limit: number | string | null;
}

export interface UsageSnapshot {
  tenantId: string;
  currentPlanTier: string;
  activeProducts: UsageDimension;
  activeCustomers: UsageDimension;
  monthlyDisbursementCount: UsageDimension;
  monthlyDisbursementVolumeUsd: UsageDimension;
  portalUsers: UsageDimension;
  apiKeys: UsageDimension;
  lenders: UsageDimension;
  merchants: UsageDimension;
  dailyApiCalls: number;
  apiRateLimitPerMinute: number;
  billingPeriod: { start: string; end: string };
}

@Injectable()
export class UsageMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotaTrackingService: QuotaTrackingService,
    private readonly planTierConfigService: PlanTierConfigService,
  ) {}

  async getCurrentUsage(tenantId: string): Promise<UsageSnapshot> {
    const [config, redisUsage, dbCounts] = await Promise.all([
      this.planTierConfigService.getTenantTierConfig(tenantId),
      this.quotaTrackingService.getCurrentUsage(tenantId),
      this.getDbCounts(tenantId),
    ]);

    // `unknown` accepts Prisma's `Decimal` runtime objects without
    // forcing the @lons/common money helpers into this file. Decimal
    // serialises through `String(...)` cleanly (it has a `toString`
    // method), so the cast is safe.
    const limitNum = (v: unknown): number | null =>
      v === null || v === undefined ? null : typeof v === 'number' ? v : Number(v as string);

    const limitStr = (v: unknown): string | null =>
      v === null || v === undefined ? null : String(v);

    return {
      tenantId,
      currentPlanTier: config.tier,
      activeProducts: { current: dbCounts.activeProducts, limit: limitNum(config.maxActiveProducts) },
      activeCustomers: { current: dbCounts.activeCustomers, limit: limitNum(config.maxCustomers) },
      monthlyDisbursementCount: {
        current: redisUsage.monthlyDisbursementCount,
        limit: limitNum(config.maxMonthlyTransactions),
      },
      monthlyDisbursementVolumeUsd: {
        current: redisUsage.monthlyDisbursementVolumeUsd,
        limit: limitStr(config.maxMonthlyDisbursementVolumeUsd),
      },
      portalUsers: { current: dbCounts.portalUsers, limit: limitNum(config.maxPortalUsers) },
      apiKeys: { current: dbCounts.apiKeys, limit: limitNum(config.maxApiKeys) },
      lenders: { current: dbCounts.lenders, limit: limitNum(config.maxLenderConfigs) },
      merchants: { current: dbCounts.merchants, limit: limitNum(config.maxBnplMerchants) },
      dailyApiCalls: redisUsage.dailyApiCalls,
      apiRateLimitPerMinute: config.apiRateLimitPerMinute,
      billingPeriod: this.getCurrentBillingPeriod(),
    };
  }

  private async getDbCounts(tenantId: string): Promise<{
    activeProducts: number;
    activeCustomers: number;
    portalUsers: number;
    apiKeys: number;
    lenders: number;
    merchants: number;
  }> {
    const [activeProducts, activeCustomers, portalUsers, apiKeys, lenders, merchants] =
      await Promise.all([
        this.prisma.product.count({
          where: { tenantId, deletedAt: null, status: { not: 'discontinued' } },
        }),
        this.prisma.customer.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.user.count({ where: { tenantId, deletedAt: null, status: 'active' } }),
        (this.prisma as unknown as { apiKey: { count: (args: unknown) => Promise<number> } })
          .apiKey.count({ where: { tenantId } }),
        this.prisma.lender.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.merchant.count({ where: { tenantId, deletedAt: null } }),
      ]);
    return { activeProducts, activeCustomers, portalUsers, apiKeys, lenders, merchants };
  }

  private getCurrentBillingPeriod(): { start: string; end: string } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }
}
