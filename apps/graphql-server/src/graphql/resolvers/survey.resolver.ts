import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { PrismaService } from '@lons/database';
import { SurveyResponseType, NpsSummary } from '../types/survey.type';

@Resolver(() => SurveyResponseType)
export class SurveyResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Mutation(() => SurveyResponseType)
  async submitSurveyResponse(
    @Args('tenantId') tenantId: string,
    @Args('userId') userId: string,
    @Args('score', { type: () => Int }) score: number,
    @Args('comment', { nullable: true }) comment?: string,
  ): Promise<SurveyResponseType> {
    if (score < 0 || score > 10) {
      throw new Error('NPS score must be between 0 and 10');
    }

    return this.prisma.surveyResponse.create({
      data: { tenantId, userId, score, comment },
    }) as any;
  }

  @Query(() => [SurveyResponseType])
  async surveyResponses(
    @Args('tenantId', { nullable: true }) tenantId?: string,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 50 }) first?: number,
  ): Promise<SurveyResponseType[]> {
    return this.prisma.surveyResponse.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(first ?? 50, 100),
    }) as any;
  }

  @Query(() => NpsSummary)
  async npsSummary(
    @Args('tenantId', { nullable: true }) tenantId?: string,
  ): Promise<NpsSummary> {
    const responses = await this.prisma.surveyResponse.findMany({
      where: tenantId ? { tenantId } : {},
      select: { score: true },
    });

    const totalResponses = responses.length;
    if (totalResponses === 0) {
      return {
        totalResponses: 0,
        npsScore: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        promoterPercentage: 0,
        passivePercentage: 0,
        detractorPercentage: 0,
      };
    }

    const promoters = responses.filter((r) => r.score >= 9).length;
    const passives = responses.filter((r) => r.score >= 7 && r.score <= 8).length;
    const detractors = responses.filter((r) => r.score <= 6).length;

    const promoterPct = (promoters / totalResponses) * 100;
    const detractorPct = (detractors / totalResponses) * 100;

    return {
      totalResponses,
      npsScore: Math.round(promoterPct - detractorPct),
      promoters,
      passives,
      detractors,
      promoterPercentage: Math.round(promoterPct * 10) / 10,
      passivePercentage: Math.round((passives / totalResponses) * 1000) / 10,
      detractorPercentage: Math.round(detractorPct * 10) / 10,
    };
  }
}
