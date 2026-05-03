import { Resolver, Query, Args } from '@nestjs/graphql';
import { Roles } from '@lons/entity-service';
import { PrismaService } from '@lons/database';

import {
  PlatformScoringAnalyticsType,
  ScoreDistributionBucket,
  RiskTierBreakdown,
  ScoringVolumePoint,
  TenantScoringRow,
} from '../types/scoring-analytics.type';

@Resolver()
export class ScoringAnalyticsResolver {
  constructor(private prisma: PrismaService) {}

  @Query(() => PlatformScoringAnalyticsType)
  @Roles('platform_admin')
  async platformScoringAnalytics(
    @Args('days', { nullable: true, defaultValue: 30 }) days: number,
  ): Promise<PlatformScoringAnalyticsType> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [scoreDistribution, riskTierBreakdown, scoringVolume, tenantComparison] =
      await Promise.all([
        this.getScoreDistribution(since),
        this.getRiskTierBreakdown(since),
        this.getScoringVolume(since),
        this.getTenantComparison(since),
      ]);

    return {
      scoreDistribution,
      riskTierBreakdown,
      scoringVolume,
      tenantComparison,
    };
  }

  private async getScoreDistribution(since: Date): Promise<ScoreDistributionBucket[]> {
    const buckets = [
      { label: '0-300', min: 0, max: 300 },
      { label: '300-500', min: 300, max: 500 },
      { label: '500-700', min: 500, max: 700 },
      { label: '700-850', min: 700, max: 850 },
      { label: '850+', min: 850, max: 1000 },
    ];

    const results = await Promise.all(
      buckets.map(async (b) => {
        const count = await this.prisma.scoringResult.count({
          where: {
            createdAt: { gte: since },
            score: { gte: b.min, lt: b.max === 1000 ? undefined : b.max },
          },
        });
        return { ...b, count };
      }),
    );

    return results;
  }

  private async getRiskTierBreakdown(since: Date): Promise<RiskTierBreakdown[]> {
    const groups = await this.prisma.scoringResult.groupBy({
      by: ['riskTier'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    });

    return groups.map((g) => ({
      riskTier: g.riskTier,
      count: g._count.id,
    }));
  }

  private async getScoringVolume(since: Date): Promise<ScoringVolumePoint[]> {
    const results = await this.prisma.scoringResult.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, modelType: true },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = new Map<string, number>();
    for (const r of results) {
      const dateKey = r.createdAt.toISOString().split('T')[0];
      const key = `${dateKey}|${r.modelType}`;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }

    return Array.from(grouped.entries()).map(([key, count]) => {
      const [date, modelType] = key.split('|');
      return { date, modelType, count };
    });
  }

  private async getTenantComparison(since: Date): Promise<TenantScoringRow[]> {
    const groups = await this.prisma.scoringResult.groupBy({
      by: ['tenantId'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      _avg: { score: true },
    });

    const tenantIds = groups.map((g) => g.tenantId);
    const tenants = tenantIds.length > 0
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        })
      : [];
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    const riskCounts = await Promise.all(
      groups.map(async (g) => {
        const [lowCount, highCount] = await Promise.all([
          this.prisma.scoringResult.count({
            where: { tenantId: g.tenantId, createdAt: { gte: since }, riskTier: 'low' },
          }),
          this.prisma.scoringResult.count({
            where: {
              tenantId: g.tenantId,
              createdAt: { gte: since },
              riskTier: { in: ['high', 'critical'] },
            },
          }),
        ]);
        return { tenantId: g.tenantId, lowCount, highCount };
      }),
    );

    const riskMap = new Map(riskCounts.map((r) => [r.tenantId, r]));

    return groups.map((g) => {
      const risk = riskMap.get(g.tenantId);
      return {
        tenantId: g.tenantId,
        tenantName: tenantMap.get(g.tenantId) ?? undefined,
        totalScorings: g._count.id,
        avgScore: (g._avg.score?.toString() ?? '0'),
        lowRiskCount: risk?.lowCount ?? 0,
        highRiskCount: risk?.highCount ?? 0,
      };
    });
  }
}
