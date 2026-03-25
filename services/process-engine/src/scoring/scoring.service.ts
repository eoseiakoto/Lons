import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma, ScoringModelType, ScoringContext, ContractStatus } from '@lons/database';

import { calculateScore, ScorecardConfig, ScoringInput } from './scorecard/scorecard-engine';

const DEFAULT_SCORECARD: ScorecardConfig = {
  version: '1.0',
  scoreRange: { min: 0, max: 1000 },
  factors: [
    { name: 'account_age_days', weight: 15, bands: [{ min: 365, max: null, points: 100 }, { min: 180, max: 364, points: 70 }, { min: 90, max: 179, points: 40 }, { min: 0, max: 89, points: 10 }] },
    { name: 'kyc_level', weight: 10, bands: [{ min: 3, max: null, points: 100 }, { min: 2, max: 2, points: 75 }, { min: 1, max: 1, points: 50 }, { min: 0, max: 0, points: 10 }] },
    { name: 'payment_history_pct', weight: 30, bands: [{ min: 90, max: null, points: 100 }, { min: 70, max: 89, points: 70 }, { min: 50, max: 69, points: 40 }, { min: 0, max: 49, points: 10 }] },
    { name: 'transaction_frequency', weight: 15, bands: [{ min: 20, max: null, points: 100 }, { min: 10, max: 19, points: 70 }, { min: 5, max: 9, points: 40 }, { min: 0, max: 4, points: 10 }] },
    { name: 'existing_debt_ratio', weight: 15, bands: [{ min: 0, max: 20, points: 100 }, { min: 21, max: 50, points: 70 }, { min: 51, max: 80, points: 30 }, { min: 81, max: null, points: 0 }] },
    { name: 'income_consistency', weight: 15, bands: [{ min: 80, max: null, points: 100 }, { min: 60, max: 79, points: 70 }, { min: 40, max: 59, points: 40 }, { min: 0, max: 39, points: 10 }] },
  ],
  riskTiers: [{ tier: 'low', minScore: 750 }, { tier: 'medium', minScore: 500 }, { tier: 'high', minScore: 300 }, { tier: 'critical', minScore: 0 }],
  limitBands: [{ minScore: 800, maxScore: 1000, limitMultiplier: '5.0' }, { minScore: 600, maxScore: 799, limitMultiplier: '3.0' }, { minScore: 400, maxScore: 599, limitMultiplier: '1.5' }, { minScore: 0, maxScore: 399, limitMultiplier: '0' }],
};

const KYC_NUMERIC: Record<string, number> = { none: 0, tier_1: 1, tier_2: 2, tier_3: 3 };

@Injectable()
export class ScoringService {
  constructor(private prisma: PrismaService) {}

  async scoreCustomer(
    tenantId: string,
    customerId: string,
    productId: string,
    context: 'application' | 'review' | 'renewal' | 'monitoring',
    requestedAmount: string,
  ) {
    const customer = await this.prisma.customer.findFirstOrThrow({
      where: { id: customerId, tenantId },
    });

    const inputFeatures = await this.gatherFeatures(tenantId, customerId, customer);

    const scorecard = DEFAULT_SCORECARD; // In production, load from product config

    const result = calculateScore(scorecard, inputFeatures, requestedAmount);

    const scoringResult = await this.prisma.scoringResult.create({
      data: {
        tenantId,
        modelType: ScoringModelType.rule_based,
        modelVersion: scorecard.version,
        score: Number(result.score),
        scoreRangeMin: scorecard.scoreRange.min,
        scoreRangeMax: scorecard.scoreRange.max,
        probabilityDefault: null,
        riskTier: result.riskTier as 'low' | 'medium' | 'high' | 'critical',
        recommendedLimit: Number(result.recommendedLimit),
        contributingFactors: result.contributingFactors as unknown as Prisma.InputJsonValue,
        inputFeatures: inputFeatures as unknown as Prisma.InputJsonValue,
        confidence: Number(result.confidence),
        context: context as ScoringContext,
        customer: { connect: { id: customerId } },
        product: { connect: { id: productId } },
      },
    });

    return scoringResult;
  }

  private async gatherFeatures(
    tenantId: string,
    customerId: string,
    customer: { createdAt: Date; kycLevel: string },
  ): Promise<ScoringInput> {
    const accountAgeDays = Math.floor(
      (Date.now() - customer.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Payment history: % of on-time payments from past contracts
    const completedContracts = await this.prisma.contract.findMany({
      where: { tenantId, customerId, status: ContractStatus.settled },
      select: { id: true },
    });

    let paymentHistoryPct = 50; // Neutral for new customers
    if (completedContracts.length > 0) {
      const totalScheduleEntries = await this.prisma.repaymentScheduleEntry.count({
        where: { contractId: { in: completedContracts.map((c) => c.id) }, tenantId },
      });
      const onTimeEntries = await this.prisma.repaymentScheduleEntry.count({
        where: { contractId: { in: completedContracts.map((c) => c.id) }, tenantId, status: 'paid' },
      });
      paymentHistoryPct = totalScheduleEntries > 0 ? Math.round((onTimeEntries / totalScheduleEntries) * 100) : 50;
    }

    // Existing debt: count active contracts
    const activeContracts = await this.prisma.contract.count({
      where: { tenantId, customerId, status: { in: ['active', 'performing', 'due', 'overdue'] } },
    });
    const existingDebtRatio = Math.min(activeContracts * 25, 100); // Simple proxy

    return {
      account_age_days: accountAgeDays,
      kyc_level: KYC_NUMERIC[customer.kycLevel] ?? 0,
      payment_history_pct: paymentHistoryPct,
      transaction_frequency: 15, // Default neutral (no transaction data in Phase 2)
      existing_debt_ratio: existingDebtRatio,
      income_consistency: 60, // Default neutral (no income data in Phase 2)
    };
  }
}
