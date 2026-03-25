import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma, RepaymentStatus, SettlementStatus } from '@lons/database';
import { EventBusService, NotFoundError, ValidationError, add, multiply, divide, bankersRound, percentage } from '@lons/common';
import { EventType } from '@lons/event-contracts';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger('SettlementService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async calculateSettlement(tenantId: string, periodStart: Date, periodEnd: Date) {
    // Get all completed repayments in period
    const repayments = await this.prisma.repayment.findMany({
      where: {
        tenantId,
        status: RepaymentStatus.completed,
        completedAt: { gte: periodStart, lte: periodEnd },
      },
      include: { contract: { include: { product: true } } },
    });

    if (repayments.length === 0) {
      throw new ValidationError('No completed repayments found in the specified period');
    }

    // Aggregate revenue by type
    let totalInterestRevenue = '0.0000';
    let totalFeeRevenue = '0.0000';
    let totalPenaltyRevenue = '0.0000';

    for (const repayment of repayments) {
      totalInterestRevenue = add(totalInterestRevenue, String(repayment.allocatedInterest || 0));
      totalFeeRevenue = add(totalFeeRevenue, String(repayment.allocatedFees || 0));
      totalPenaltyRevenue = add(totalPenaltyRevenue, String(repayment.allocatedPenalties || 0));
    }

    const totalRevenue = add(add(totalInterestRevenue, totalFeeRevenue), totalPenaltyRevenue);

    // Create settlement run
    const settlementRun = await this.prisma.settlementRun.create({
      data: {
        tenantId,
        periodStart,
        periodEnd,
        status: SettlementStatus.calculated,
        totalRevenue: Number(totalRevenue),
      },
    });

    // Get unique products and their revenue sharing configs
    const productRevenueMap = new Map<string, { revenueSharing: Record<string, number>; revenue: string; lenderId: string }>();

    for (const repayment of repayments) {
      const product = repayment.contract.product;
      const existing = productRevenueMap.get(product.id);
      const repRevenue = add(
        add(String(repayment.allocatedInterest || 0), String(repayment.allocatedFees || 0)),
        String(repayment.allocatedPenalties || 0),
      );

      if (existing) {
        existing.revenue = add(existing.revenue, repRevenue);
      } else {
        productRevenueMap.set(product.id, {
          revenueSharing: (product.revenueSharing as Record<string, number>) || { lender: 60, sp: 25, emi: 10, platform: 5 },
          revenue: repRevenue,
          lenderId: product.lenderId || tenantId,
        });
      }
    }

    // Create settlement lines per party
    const lines: { partyType: string; partyId: string; grossRevenue: string; sharePercentage: string; shareAmount: string }[] = [];

    const partyTotals = new Map<string, { gross: string; share: string; pct: number }>();

    for (const [, productData] of productRevenueMap) {
      const sharing = productData.revenueSharing;
      for (const [partyType, pct] of Object.entries(sharing)) {
        const shareAmount = bankersRound(percentage(productData.revenue, String(pct)), 4);
        const key = `${partyType}:${partyType === 'lender' ? productData.lenderId : tenantId}`;
        const existing = partyTotals.get(key);
        if (existing) {
          existing.gross = add(existing.gross, productData.revenue);
          existing.share = add(existing.share, shareAmount);
        } else {
          partyTotals.set(key, { gross: productData.revenue, share: shareAmount, pct });
        }
      }
    }

    for (const [key, data] of partyTotals) {
      const [partyType, partyId] = key.split(':');
      await this.prisma.settlementLine.create({
        data: {
          tenantId,
          partyType,
          partyId,
          grossRevenue: Number(data.gross),
          sharePercentage: data.pct,
          shareAmount: Number(data.share),
          deductions: 0,
          netAmount: Number(data.share),
          settlementRun: { connect: { id: settlementRun.id } },
        },
      });
    }

    this.eventBus.emitAndBuild(EventType.SETTLEMENT_CALCULATED, tenantId, {
      settlementRunId: settlementRun.id,
      totalRevenue,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    this.logger.log(`Settlement calculated: ${totalRevenue} total revenue for period ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);

    return this.prisma.settlementRun.findUniqueOrThrow({
      where: { id: settlementRun.id },
      include: { lines: true },
    });
  }

  async approveSettlement(tenantId: string, runId: string, approverId: string) {
    const run = await this.prisma.settlementRun.findFirst({
      where: { id: runId, tenantId },
    });
    if (!run) throw new NotFoundError('SettlementRun', runId);
    if (run.status !== SettlementStatus.calculated) {
      throw new ValidationError('Settlement must be in calculated status to approve');
    }

    const updated = await this.prisma.settlementRun.update({
      where: { id: runId },
      data: { status: SettlementStatus.approved, approvedBy: approverId, approvedAt: new Date() },
      include: { lines: true },
    });

    this.eventBus.emitAndBuild(EventType.SETTLEMENT_APPROVED, tenantId, {
      settlementRunId: runId,
      approvedBy: approverId,
    });

    return updated;
  }

  async getSettlementRun(tenantId: string, runId: string) {
    const run = await this.prisma.settlementRun.findFirst({
      where: { id: runId, tenantId },
      include: { lines: true },
    });
    if (!run) throw new NotFoundError('SettlementRun', runId);
    return run;
  }

  async listSettlementRuns(tenantId: string, take: number = 20, cursor?: string) {
    const items = await this.prisma.settlementRun.findMany({
      where: { tenantId },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { lines: true },
    });
    return { items: items.slice(0, take), hasMore: items.length > take };
  }
}
