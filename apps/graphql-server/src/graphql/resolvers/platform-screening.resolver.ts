import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  ObjectType,
  Field,
  Int,
  Float,
} from '@nestjs/graphql';
import { Roles, CurrentUser, IAuthenticatedUser } from '@lons/entity-service';
import { PrismaService } from '@lons/database';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

// ── GraphQL Types ────────────────────────────────────────────────────────

@ObjectType()
class PlatformScreeningEntry {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  customerId!: string;

  @Field()
  screenedAt!: Date;

  @Field()
  status!: string;

  @Field()
  riskLevel!: string;

  @Field()
  provider!: string;

  @Field({ nullable: true })
  reviewDecision?: string;

  @Field({ nullable: true })
  reviewedBy?: string;

  @Field({ nullable: true })
  reviewedAt?: Date;

  @Field({ nullable: true })
  tenantName?: string;

  @Field({ nullable: true })
  customerName?: string;
}

@ObjectType()
class PlatformScreeningStats {
  @Field(() => Int)
  totalScreenings!: number;

  @Field(() => Int)
  pendingReviewCount!: number;

  @Field(() => Int)
  escalatedCount!: number;

  @Field(() => Float)
  matchRate!: number;

  @Field(() => [PlatformScreeningEntry])
  recentScreenings!: PlatformScreeningEntry[];
}

// ── Resolver ─────────────────────────────────────────────────────────────

@Resolver()
export class PlatformScreeningResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => PlatformScreeningStats)
  @Roles('platform_admin')
  async platformScreeningStats(): Promise<PlatformScreeningStats> {
    const [
      totalScreenings,
      pendingReviewCount,
      escalatedCount,
      matchAndPotentialCount,
      recentScreenings,
    ] = await Promise.all([
      // Total screenings across all tenants
      this.prisma.screeningResult.count(),

      // Pending reviews: POTENTIAL_MATCH with no review yet
      this.prisma.screeningResult.count({
        where: {
          status: 'POTENTIAL_MATCH',
          reviewedAt: null,
        },
      }),

      // Escalated cases
      this.prisma.screeningResult.count({
        where: {
          reviewDecision: 'ESCALATE',
        },
      }),

      // Match + Potential match count for match rate calculation
      this.prisma.screeningResult.count({
        where: {
          status: { in: ['MATCH', 'POTENTIAL_MATCH'] },
        },
      }),

      // Recent 50 screenings across all tenants
      this.prisma.screeningResult.findMany({
        orderBy: { screenedAt: 'desc' },
        take: 50,
        include: { customer: { select: { fullName: true } } },
      }),
    ]);

    const tenantIds = [...new Set(recentScreenings.map((r: any) => r.tenantId))];
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true },
    });
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    const matchRate =
      totalScreenings > 0
        ? (matchAndPotentialCount / totalScreenings) * 100
        : 0;

    return {
      totalScreenings,
      pendingReviewCount,
      escalatedCount,
      matchRate: Math.round(matchRate * 100) / 100,
      recentScreenings: recentScreenings.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        customerId: r.customerId,
        screenedAt: r.screenedAt,
        status: r.status,
        riskLevel: r.riskLevel,
        provider: r.provider,
        reviewDecision: r.reviewDecision ?? undefined,
        reviewedBy: r.reviewedBy ?? undefined,
        reviewedAt: r.reviewedAt ?? undefined,
        tenantName: tenantMap.get(r.tenantId) ?? undefined,
        customerName: (r as any).customer?.fullName ?? undefined,
      })),
    };
  }

  @Query(() => [PlatformScreeningEntry])
  @Roles('platform_admin')
  async platformEscalatedScreenings(
    @Args('first', { type: () => Int, nullable: true, defaultValue: 50 }) first: number,
  ): Promise<PlatformScreeningEntry[]> {
    const records = await this.prisma.screeningResult.findMany({
      where: {
        reviewDecision: 'ESCALATE',
      },
      orderBy: { screenedAt: 'desc' },
      take: first,
      include: { customer: { select: { fullName: true } } },
    });

    const tenantIds = [...new Set(records.map((r) => r.tenantId))];
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true },
    });
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    return records.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      customerId: r.customerId,
      screenedAt: r.screenedAt,
      status: r.status,
      riskLevel: r.riskLevel,
      provider: r.provider,
      reviewDecision: r.reviewDecision ?? undefined,
      reviewedBy: r.reviewedBy ?? undefined,
      reviewedAt: r.reviewedAt ?? undefined,
      tenantName: tenantMap.get(r.tenantId) ?? undefined,
      customerName: (r as any).customer?.fullName ?? undefined,
    }));
  }

  @Mutation(() => PlatformScreeningEntry)
  @Roles('platform_admin')
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CUSTOMER)
  async platformScreeningDecision(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('screeningId', { type: () => ID }) screeningId: string,
    @Args('decision') decision: string,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<PlatformScreeningEntry> {
    const updated = await this.prisma.screeningResult.update({
      where: { id: screeningId },
      data: {
        reviewedBy: user.userId,
        reviewedAt: new Date(),
        reviewDecision: decision,
      },
      include: { customer: { select: { fullName: true } } },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: updated.tenantId },
      select: { name: true },
    });

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      customerId: updated.customerId,
      screenedAt: updated.screenedAt,
      status: updated.status,
      riskLevel: updated.riskLevel,
      provider: updated.provider,
      reviewDecision: updated.reviewDecision ?? undefined,
      reviewedBy: updated.reviewedBy ?? undefined,
      reviewedAt: updated.reviewedAt ?? undefined,
      tenantName: tenant?.name ?? undefined,
      customerName: (updated as any).customer?.fullName ?? undefined,
    };
  }
}
