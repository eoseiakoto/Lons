import { Resolver, Query, Args, ID, Int } from '@nestjs/graphql';
import { CurrentTenant, Roles } from '@lons/entity-service';
import { PrismaService } from '@lons/database';

import { ScoringResultType } from '../types/scoring-result.type';

@Resolver(() => ScoringResultType)
export class ScoringResolver {
  constructor(private prisma: PrismaService) {}

  @Query(() => [ScoringResultType])
  @Roles('customer:read')
  async customerScoringHistory(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 20 }) first: number,
  ): Promise<ScoringResultType[]> {
    const results = await this.prisma.scoringResult.findMany({
      where: { customerId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: first,
    });

    return results.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      customerId: r.customerId,
      productId: r.productId,
      modelType: r.modelType,
      modelVersion: r.modelVersion ?? undefined,
      score: r.score.toString(),
      scoreRangeMin: r.scoreRangeMin.toString(),
      scoreRangeMax: r.scoreRangeMax.toString(),
      probabilityDefault: r.probabilityDefault?.toString(),
      riskTier: r.riskTier,
      recommendedLimit: r.recommendedLimit?.toString(),
      contributingFactors: r.contributingFactors as Record<string, unknown> | undefined,
      inputFeatures: r.inputFeatures as Record<string, unknown> | undefined,
      confidence: r.confidence?.toString(),
      context: r.context,
      createdAt: r.createdAt,
    }));
  }
}
