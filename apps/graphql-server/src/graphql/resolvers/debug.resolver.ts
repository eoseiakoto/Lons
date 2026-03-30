import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { ForbiddenException } from '@nestjs/common';
import { Roles } from '@lons/entity-service';
import { PrismaService } from '@lons/database';

import {
  DebugApiLog,
  DebugAdapterLog,
  DebugEvent,
  DebugStateTransition,
  DebugScoringBreakdown,
} from '../types/debug.type';
import { DebugLogService } from '../services/debug-log.service';

@Resolver()
export class DebugResolver {
  constructor(
    private readonly debugLogService: DebugLogService,
    private readonly prisma: PrismaService,
  ) {}

  private assertDebugMode(): void {
    if (process.env.ALLOW_MOCK_ADAPTERS !== 'true') {
      throw new ForbiddenException('Debug mode not available in this environment');
    }
  }

  @Query(() => [DebugApiLog])
  @Roles('admin')
  async debugApiLogs(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ): Promise<DebugApiLog[]> {
    this.assertDebugMode();
    return this.debugLogService.getApiLogs(limit) as unknown as DebugApiLog[];
  }

  @Query(() => [DebugAdapterLog])
  @Roles('admin')
  async debugAdapterLogs(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ): Promise<DebugAdapterLog[]> {
    this.assertDebugMode();
    return this.debugLogService.getAdapterLogs(limit) as unknown as DebugAdapterLog[];
  }

  @Query(() => [DebugEvent])
  @Roles('admin')
  async debugEvents(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ): Promise<DebugEvent[]> {
    this.assertDebugMode();
    return this.debugLogService.getEvents(limit) as unknown as DebugEvent[];
  }

  @Query(() => [DebugStateTransition])
  @Roles('admin')
  async debugStateTransitions(
    @Args('entityId', { type: () => String }) entityId: string,
  ): Promise<DebugStateTransition[]> {
    this.assertDebugMode();
    return this.debugLogService.getStateTransitions(entityId) as unknown as DebugStateTransition[];
  }

  @Query(() => [DebugScoringBreakdown])
  @Roles('admin')
  async debugScoringBreakdowns(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ): Promise<DebugScoringBreakdown[]> {
    this.assertDebugMode();

    const results = await this.prisma.scoringResult.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        customer: {
          select: {
            id: true,
            loanRequests: {
              select: { id: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    return results.map((r) => {
      const factors = (r.contributingFactors as any[]) ?? [];
      const score = Number(r.score);
      const decision =
        r.riskTier === 'low'
          ? 'APPROVED'
          : r.riskTier === 'high' || r.riskTier === 'critical'
            ? 'DECLINED'
            : 'MANUAL_REVIEW';

      return {
        id: r.id,
        customerId: r.customerId,
        loanRequestId: r.customer?.loanRequests?.[0]?.id ?? r.productId,
        scoringModel: `${r.modelType}${r.modelVersion ? ` v${r.modelVersion}` : ''}`,
        finalScore: score,
        decision,
        rules: factors.map((f: any) => ({
          ruleName: f.name ?? f.ruleName ?? 'unknown',
          passed: f.passed ?? (f.score ?? 0) > 0,
          score: Number(f.score ?? 0),
          weight: Number(f.weight ?? 1),
          weightedScore: Number(f.weightedScore ?? f.score ?? 0),
          reason: f.reason ?? f.description ?? null,
        })),
        executedAt: r.createdAt,
      };
    }) as unknown as DebugScoringBreakdown[];
  }
}
