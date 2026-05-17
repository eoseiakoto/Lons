import { Field, Int, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from '@lons/database';
import { CurrentTenant, Roles } from '@lons/entity-service';
import { add, bankersRound, divide, multiply } from '@lons/common';

/**
 * Sprint 18 (S18-4) — top-of-dashboard summary metrics for the
 * Settlement & Reconciliation page.
 *
 * Reuses existing data — no new tables. The dashboard page consumes
 * this query for the metric-card row, then falls through to the
 * existing `settlementRuns` / `reconciliationRuns` / unresolved
 * exceptions queries for the body.
 */

@ObjectType()
export class SettlementDashboardSummary {
  /** Count of settlement runs created in the current calendar month. */
  @Field(() => Int)
  monthlySettlementCount!: number;

  /** Sum of `totalRevenue` over the current month — Decimal string. */
  @Field()
  monthlyRevenue!: string;

  @Field()
  monthlyRevenueCurrency!: string;

  /** Sum of `totalRevenue` for runs that are still in `calculated` / `approved`. */
  @Field()
  pendingSettlementAmount!: string;

  /** Match rate percentage from the latest reconciliation run; 0 if none. */
  @Field()
  latestMatchRatePct!: string;

  /** Count of unresolved reconciliation exceptions. */
  @Field(() => Int)
  unresolvedExceptionCount!: number;
}

@Resolver()
export class SettlementDashboardResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => SettlementDashboardSummary)
  @Roles('analytics:read')
  async settlementDashboardSummary(
    @CurrentTenant() tenantId: string,
  ): Promise<SettlementDashboardSummary> {
    const monthStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );

    const [monthRuns, pendingRuns, latestRecon, unresolvedExceptions] = await Promise.all([
      this.prisma.settlementRun.findMany({
        where: { tenantId, createdAt: { gte: monthStart } },
        select: { totalRevenue: true },
      }),
      this.prisma.settlementRun.findMany({
        where: { tenantId, status: { in: ['calculated', 'approved'] } },
        select: { totalRevenue: true },
      }),
      this.prisma.reconciliationRun.findFirst({
        where: { tenantId },
        orderBy: { runDate: 'desc' },
        select: { matchedTxns: true, totalTxns: true, matchRate: true },
      }),
      this.prisma.reconciliationException.count({
        where: { tenantId, resolved: false },
      }),
    ]);

    const monthlyRevenue = monthRuns.reduce(
      (s, r) => add(s, String(r.totalRevenue ?? '0')),
      '0',
    );
    // SettlementRun doesn't carry currency directly — settlement lines
    // are denominated per-line. We surface USD as the platform reporting
    // currency for the dashboard metric card; per-run currency is shown
    // in the detail expansion.
    const monthlyRevenueCurrency = 'USD';
    const pendingSettlementAmount = pendingRuns.reduce(
      (s, r) => add(s, String(r.totalRevenue ?? '0')),
      '0',
    );

    let latestMatchRatePct = '0';
    if (latestRecon) {
      if (latestRecon.matchRate != null) {
        // matchRate is stored as a percentage (0-100) already.
        latestMatchRatePct = bankersRound(String(latestRecon.matchRate), 2);
      } else if (latestRecon.totalTxns > 0) {
        latestMatchRatePct = bankersRound(
          multiply(divide(String(latestRecon.matchedTxns), String(latestRecon.totalTxns)), '100'),
          2,
        );
      }
    }

    return {
      monthlySettlementCount: monthRuns.length,
      monthlyRevenue: bankersRound(monthlyRevenue, 2),
      monthlyRevenueCurrency,
      pendingSettlementAmount: bankersRound(pendingSettlementAmount, 2),
      latestMatchRatePct,
      unresolvedExceptionCount: unresolvedExceptions,
    };
  }
}
