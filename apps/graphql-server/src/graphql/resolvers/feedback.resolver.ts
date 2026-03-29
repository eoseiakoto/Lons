import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { PrismaService } from '@lons/database';
import { FeedbackCategory, FeedbackSeverity, FeedbackStatus } from '@lons/shared-types';

import {
  FeedbackType,
  FeedbackConnection,
} from '../types/feedback.type';
import { SubmitFeedbackInput } from '../inputs/feedback.input';

@Resolver(() => FeedbackType)
export class FeedbackResolver {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Queries ─────────────────────────────────────────────────────────────

  @Query(() => FeedbackConnection)
  async feedbacks(
    @Args('tenantId', { type: () => String, nullable: true }) tenantId?: string,
    @Args('status', { type: () => FeedbackStatus, nullable: true }) status?: FeedbackStatus,
    @Args('category', { type: () => FeedbackCategory, nullable: true }) category?: FeedbackCategory,
    @Args('severity', { type: () => FeedbackSeverity, nullable: true }) severity?: FeedbackSeverity,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 20 }) first?: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ): Promise<FeedbackConnection> {
    const take = Math.min(first ?? 20, 100);

    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;
    if (category) where.category = category;
    if (severity) where.severity = severity;

    const totalCount = await (this.prisma as any).feedback.count({ where });

    const items = await (this.prisma as any).feedback.findMany({
      where,
      take: take + 1,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    const hasNextPage = items.length > take;
    const nodes = hasNextPage ? items.slice(0, take) : items;

    const edges = nodes.map((item: any) => ({
      node: item,
      cursor: item.id,
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: !!after,
        startCursor: edges.length > 0 ? edges[0].cursor : undefined,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : undefined,
      },
      totalCount,
    };
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  @Mutation(() => FeedbackType)
  async submitFeedback(
    @Args('input') input: SubmitFeedbackInput,
  ): Promise<FeedbackType> {
    return (this.prisma as any).feedback.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        category: input.category,
        severity: input.severity,
        description: input.description,
        screenshotUrl: input.screenshotUrl,
        pageUrl: input.pageUrl,
        debugContext: input.debugContext ?? undefined,
        status: FeedbackStatus.NEW,
      },
    });
  }

  @Mutation(() => FeedbackType)
  async updateFeedbackStatus(
    @Args('id', { type: () => ID }) id: string,
    @Args('status', { type: () => FeedbackStatus }) status: FeedbackStatus,
  ): Promise<FeedbackType> {
    return (this.prisma as any).feedback.update({
      where: { id },
      data: { status },
    });
  }
}
