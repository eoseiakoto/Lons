import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import { Roles } from '@lons/entity-service';
import { PrismaService } from '@lons/database';
import { Prisma } from '@lons/database';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

import {
  TenantInsightsType,
  PortfolioHealthBucket,
  MonthlyDisbursement,
  RevenueBreakdown,
  ProductPerformanceRow,
} from '../types/tenant-insights.type';

@Resolver()
export class TenantInsightsResolver {
  constructor(private prisma: PrismaService) {}

  @Query(() => TenantInsightsType)
  @AuditAction(AuditActionType.READ, AuditResourceType.TENANT)
  @Roles('platform_admin', 'tenant:read')
  async tenantInsights(
    @Args('tenantId', { type: () => ID }) tenantId: string,
    @Args('startDate', { nullable: true }) _startDate?: string,
    @Args('endDate', { nullable: true }) _endDate?: string,
  ): Promise<TenantInsightsType> {
    const [
      activeContracts,
      totalOutstandingResult,
      defaultRate,
      avgCreditScore,
      portfolioHealth,
      monthlyDisbursements,
      revenueBreakdown,
      productPerformance,
      anonymizationCount,
      anonymizationBlockedCount,
      coolingOffContracts,
      avgCustomerExposure,
      customersNearExposureLimit,
    ] = await Promise.all([
      this.getActiveContracts(tenantId),
      this.getTotalOutstanding(tenantId),
      this.getDefaultRate(tenantId),
      this.getAvgCreditScore(tenantId),
      this.getPortfolioHealth(tenantId),
      this.getMonthlyDisbursements(tenantId),
      this.getRevenueBreakdown(tenantId),
      this.getProductPerformance(tenantId),
      this.getAnonymizationCount(tenantId),
      this.getAnonymizationBlockedCount(tenantId),
      this.getCoolingOffContracts(tenantId),
      this.getAvgCustomerExposure(tenantId),
      this.getCustomersNearExposureLimit(tenantId),
    ]);

    return {
      activeContracts,
      totalOutstanding: totalOutstandingResult,
      defaultRate,
      avgCreditScore,
      portfolioHealth,
      monthlyDisbursements,
      revenueBreakdown: revenueBreakdown ?? undefined,
      productPerformance,
      anonymizationCount,
      anonymizationBlockedCount,
      coolingOffContracts,
      avgCustomerExposure,
      customersNearExposureLimit,
    };
  }

  private async getActiveContracts(tenantId: string): Promise<number> {
    return this.prisma.contract.count({
      where: { tenantId, status: 'active' },
    });
  }

  private async getTotalOutstanding(tenantId: string): Promise<string> {
    const result = await this.prisma.contract.aggregate({
      where: { tenantId, status: 'active' },
      _sum: { totalOutstanding: true },
    });
    return result._sum.totalOutstanding?.toString() ?? '0';
  }

  private async getDefaultRate(tenantId: string): Promise<string> {
    const [totalContracts, defaultedContracts] = await Promise.all([
      this.prisma.contract.count({ where: { tenantId } }),
      this.prisma.contract.count({
        where: {
          tenantId,
          status: { in: ['default_status', 'written_off'] },
        },
      }),
    ]);

    if (totalContracts === 0) return '0';
    return ((defaultedContracts / totalContracts) * 100).toFixed(2);
  }

  private async getAvgCreditScore(tenantId: string): Promise<string> {
    const result = await this.prisma.scoringResult.aggregate({
      where: { tenantId },
      _avg: { score: true },
    });
    return result._avg.score?.toString() ?? '0';
  }

  private async getPortfolioHealth(tenantId: string): Promise<PortfolioHealthBucket[]> {
    const classifications = ['performing', 'special_mention', 'substandard', 'doubtful', 'loss'] as const;

    const results = await Promise.all(
      classifications.map(async (classification) => {
        const [countResult, sumResult] = await Promise.all([
          this.prisma.contract.count({
            where: { tenantId, classification },
          }),
          this.prisma.contract.aggregate({
            where: { tenantId, classification },
            _sum: { totalOutstanding: true },
          }),
        ]);
        return {
          classification,
          count: countResult,
          amount: sumResult._sum.totalOutstanding?.toString() ?? '0',
        };
      }),
    );

    return results;
  }

  private async getMonthlyDisbursements(tenantId: string): Promise<MonthlyDisbursement[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const disbursements = await this.prisma.disbursement.findMany({
      where: {
        tenantId,
        status: 'completed',
        completedAt: { gte: twelveMonthsAgo },
      },
      select: { amount: true, completedAt: true },
    });

    const grouped = new Map<string, { totalAmount: Prisma.Decimal; count: number }>();
    for (const d of disbursements) {
      if (!d.completedAt) continue;
      const monthKey = `${d.completedAt.getFullYear()}-${String(d.completedAt.getMonth() + 1).padStart(2, '0')}`;
      const existing = grouped.get(monthKey);
      if (existing) {
        existing.totalAmount = existing.totalAmount.add(d.amount);
        existing.count += 1;
      } else {
        grouped.set(monthKey, { totalAmount: d.amount, count: 1 });
      }
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        totalAmount: data.totalAmount.toString(),
        count: data.count,
      }));
  }

  private async getRevenueBreakdown(tenantId: string): Promise<RevenueBreakdown | null> {
    const runs = await this.prisma.settlementRun.findMany({
      where: { tenantId },
      include: { lines: true },
    });

    if (runs.length === 0) return null;

    let totalRevenue = new Prisma.Decimal(0);
    let platformShare = new Prisma.Decimal(0);
    let lenderShare = new Prisma.Decimal(0);

    for (const run of runs) {
      totalRevenue = totalRevenue.add(run.totalRevenue);
      for (const line of run.lines) {
        if (line.partyType === 'platform') {
          platformShare = platformShare.add(line.shareAmount);
        } else if (line.partyType === 'lender') {
          lenderShare = lenderShare.add(line.shareAmount);
        }
      }
    }

    const netSPRevenue = totalRevenue.sub(platformShare).sub(lenderShare);

    return {
      totalRevenue: totalRevenue.toString(),
      platformShare: platformShare.toString(),
      lenderShare: lenderShare.toString(),
      netSPRevenue: netSPRevenue.toString(),
    };
  }

  private async getProductPerformance(tenantId: string): Promise<ProductPerformanceRow[]> {
    const products = await this.prisma.product.findMany({
      where: { tenantId, status: 'active' },
      select: { id: true, name: true },
    });

    if (products.length === 0) return [];

    const results = await Promise.all(
      products.map(async (product) => {
        const [contractCount, defaultCount, disbursedSum, avgScore] = await Promise.all([
          this.prisma.contract.count({
            where: { tenantId, productId: product.id },
          }),
          this.prisma.contract.count({
            where: {
              tenantId,
              productId: product.id,
              status: { in: ['default_status', 'written_off'] },
            },
          }),
          this.prisma.contract.aggregate({
            where: { tenantId, productId: product.id },
            _sum: { principalAmount: true },
          }),
          this.prisma.scoringResult.aggregate({
            where: { tenantId },
            _avg: { score: true },
          }),
        ]);

        const rate = contractCount > 0 ? ((defaultCount / contractCount) * 100).toFixed(2) : '0';

        return {
          productId: product.id,
          productName: product.name,
          contracts: contractCount,
          disbursed: disbursedSum._sum.principalAmount?.toString() ?? '0',
          defaultRate: rate,
          avgScore: avgScore._avg.score?.toString() ?? '0',
        };
      }),
    );

    return results;
  }

  private async getAnonymizationCount(tenantId: string): Promise<number> {
    return this.prisma.customer.count({
      where: { tenantId, status: 'anonymized' },
    });
  }

  private async getAnonymizationBlockedCount(tenantId: string): Promise<number> {
    return this.prisma.auditLog.count({
      where: {
        tenantId,
        action: 'anonymization_blocked',
      },
    });
  }

  private async getCoolingOffContracts(tenantId: string): Promise<number> {
    return this.prisma.contract.count({
      where: { tenantId, status: 'cooling_off' },
    });
  }

  private async getAvgCustomerExposure(tenantId: string): Promise<string> {
    const result = await this.prisma.contract.aggregate({
      where: { tenantId, status: 'active' },
      _avg: { totalOutstanding: true },
    });
    return result._avg.totalOutstanding?.toString() ?? '0';
  }

  private async getCustomersNearExposureLimit(tenantId: string): Promise<number> {
    // Count customers with active exposure above 80% of max
    // For now return 0 — full implementation requires tenant settings lookup
    return 0;
  }
}
