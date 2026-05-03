import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, RepaymentStatus, SettlementStatus } from '@lons/database';
import { EventBusService, NotFoundError, ValidationError, add, bankersRound, percentage, subtract } from '@lons/common';
import { EventType } from '@lons/event-contracts';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger('SettlementService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async calculateSettlement(tenantId: string, periodStart: Date, periodEnd: Date) {
    // Step 1: Get all completed repayments in period
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

    // Step 2: Aggregate revenue by category
    let totalInterestRevenue = '0.0000';
    let totalFeeRevenue = '0.0000';
    let totalPenaltyRevenue = '0.0000';

    for (const repayment of repayments) {
      totalInterestRevenue = add(totalInterestRevenue, String(repayment.allocatedInterest || 0));
      totalFeeRevenue = add(totalFeeRevenue, String(repayment.allocatedFees || 0));
      totalPenaltyRevenue = add(totalPenaltyRevenue, String(repayment.allocatedPenalties || 0));
    }

    const totalRevenue = add(add(totalInterestRevenue, totalFeeRevenue), totalPenaltyRevenue);

    // Step 3: Get tenant's platform fee configuration
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { platformFeePercent: true },
    });
    const platformFeePercent = String(tenant?.platformFeePercent ?? '0');

    // Step 4: Calculate Lōns platform fee (% of interest income ONLY)
    const platformFeeAmount = bankersRound(percentage(totalInterestRevenue, platformFeePercent), 4);

    // Step 5: Create SettlementRun. Prisma's Decimal columns accept string —
    // never cast money to Number() (precision loss past ~15 sig digits).
    const settlementRun = await this.prisma.settlementRun.create({
      data: {
        tenantId,
        periodStart,
        periodEnd,
        status: SettlementStatus.calculated,
        totalRevenue: totalRevenue,
      },
    });

    // Step 6: Create settlement lines. sharePercentage is also Decimal(5,2)
    // in the schema, so we keep it as a string end-to-end for consistency.
    const lines: {
      tenantId: string;
      settlementRunId: string;
      partyType: string;
      partyId: string;
      grossRevenue: string;
      sharePercentage: string;
      shareAmount: string;
      deductions: string;
      netAmount: string;
    }[] = [];

    // Line 1: Platform fee (Lōns revenue) — % of interest income
    lines.push({
      tenantId,
      settlementRunId: settlementRun.id,
      partyType: 'platform',
      partyId: 'lons-platform',
      grossRevenue: totalInterestRevenue,
      sharePercentage: platformFeePercent,
      shareAmount: platformFeeAmount,
      deductions: '0',
      netAmount: platformFeeAmount,
    });

    // Line 2: SP net revenue (everything minus platform fee)
    const spNetRevenue = add(totalRevenue, `-${platformFeeAmount}`);
    const spSharePercentage = subtract('100', platformFeePercent);
    lines.push({
      tenantId,
      settlementRunId: settlementRun.id,
      partyType: 'sp',
      partyId: tenantId,
      grossRevenue: totalRevenue,
      sharePercentage: spSharePercentage,
      shareAmount: spNetRevenue,
      deductions: '0',
      netAmount: spNetRevenue,
    });

    // Step 7: SP internal splits (optional, per-product)
    // Group repayments by product
    const productGroups = new Map<string, typeof repayments>();
    for (const repayment of repayments) {
      const productId = repayment.contract.product.id;
      const group = productGroups.get(productId);
      if (group) {
        group.push(repayment);
      } else {
        productGroups.set(productId, [repayment]);
      }
    }

    for (const [productId, productRepayments] of productGroups) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { revenueSharing: true, lenderId: true },
      });

      if (!product?.revenueSharing || !product.lenderId) continue;

      const sharing = product.revenueSharing as Record<string, unknown>;
      const lenderSharePercent = String(sharing.lenderSharePercent ?? sharing.lender ?? 0);
      if (lenderSharePercent === '0') continue;

      // Aggregate this product's revenue
      let productInterest = '0.0000';
      let productFees = '0.0000';
      let productPenalties = '0.0000';
      for (const r of productRepayments) {
        productInterest = add(productInterest, String(r.allocatedInterest || 0));
        productFees = add(productFees, String(r.allocatedFees || 0));
        productPenalties = add(productPenalties, String(r.allocatedPenalties || 0));
      }
      const productTotal = add(add(productInterest, productFees), productPenalties);

      // Deduct platform fee from this product's interest
      const productPlatformFee = bankersRound(percentage(productInterest, platformFeePercent), 4);
      const productNetAfterPlatform = add(productTotal, `-${productPlatformFee}`);

      // Lender share (% of product net revenue after platform fee)
      const lenderShare = bankersRound(percentage(productNetAfterPlatform, String(lenderSharePercent)), 4);

      lines.push({
        tenantId,
        settlementRunId: settlementRun.id,
        partyType: 'lender',
        partyId: product.lenderId,
        grossRevenue: productNetAfterPlatform,
        sharePercentage: lenderSharePercent,
        shareAmount: lenderShare,
        deductions: '0',
        netAmount: lenderShare,
      });

      // SP remainder for this product (after platform + lender)
      const spProductRemainder = add(productNetAfterPlatform, `-${lenderShare}`);
      lines.push({
        tenantId,
        settlementRunId: settlementRun.id,
        partyType: 'sp_product',
        partyId: tenantId,
        grossRevenue: productNetAfterPlatform,
        sharePercentage: subtract('100', lenderSharePercent),
        shareAmount: spProductRemainder,
        deductions: '0',
        netAmount: spProductRemainder,
      });
    }

    // Step 8: Persist all lines
    for (const line of lines) {
      await this.prisma.settlementLine.create({
        data: {
          tenantId: line.tenantId,
          partyType: line.partyType,
          partyId: line.partyId,
          grossRevenue: line.grossRevenue,
          sharePercentage: line.sharePercentage,
          shareAmount: line.shareAmount,
          deductions: line.deductions,
          netAmount: line.netAmount,
          settlementRun: { connect: { id: line.settlementRunId } },
        },
      });
    }

    // Step 9: Emit event
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

  async getRevenueBreakdown(tenantId: string, periodStart: Date, periodEnd: Date) {
    const entries = await this.prisma.ledgerEntry.groupBy({
      by: ['entryType'],
      where: {
        tenantId,
        debitCredit: 'credit',
        effectiveDate: { gte: periodStart, lte: periodEnd },
        entryType: {
          in: ['interest_accrual', 'fee', 'penalty'],
        },
      },
      _sum: { amount: true },
    });

    const entryMap = new Map<string, string>();
    for (const entry of entries) {
      entryMap.set(entry.entryType, String(entry._sum.amount ?? '0'));
    }

    const interestIncome = entryMap.get('interest_accrual') ?? '0';
    const processingFees = entryMap.get('fee') ?? '0';
    const latePenalties = entryMap.get('penalty') ?? '0';
    const insurancePremium = '0';
    const otherFees = '0';
    const total = add(add(add(add(interestIncome, processingFees), latePenalties), insurancePremium), otherFees);

    return {
      interestIncome,
      processingFees,
      latePenalties,
      insurancePremium,
      otherFees,
      total,
    };
  }
}
