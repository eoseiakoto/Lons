import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { NotFoundError, bankersRound, multiply, maskPhone } from '@lons/common';
import { RecoveryStrategyType } from '@lons/shared-types';

import { PredictiveRiskService } from './predictive-risk.service';

export interface RankedRecoveryStrategy {
  type: RecoveryStrategyType;
  description: string;
  successProbability: number; // 0-1
  estimatedRecovery: string; // Decimal string
  priority: number;
  confidence?: number;
  reasoning?: string;
}

@Injectable()
export class StrategyRecommenderService {
  private readonly logger = new Logger('StrategyRecommenderService');

  constructor(
    private prisma: PrismaService,
    private predictiveRiskService: PredictiveRiskService,
  ) {}

  async recommend(tenantId: string, contractId: string): Promise<RankedRecoveryStrategy[]> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { customer: true, product: true },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    this.logger.debug(
      `Recommending recovery strategies for contract ${contractId}, customer phone ${maskPhone(contract.customer?.phonePrimary ?? '')}`,
    );

    const riskAssessment = await this.predictiveRiskService.predictDefaultRisk(tenantId, contractId);

    // Fetch prior outcomes for this tenant to calibrate success probabilities
    const priorOutcomes = await (this.prisma as any).recoveryOutcome.findMany({
      where: { tenantId },
    });

    const effectivenessMap = this.buildEffectivenessMap(priorOutcomes);

    const dpd = contract.daysPastDue;
    const outstanding = bankersRound(String(contract.totalOutstanding ?? 0), 4);
    const productType = contract.product.type;
    const repaymentMethod = contract.product.repaymentMethod;

    const strategies: RankedRecoveryStrategy[] = [];

    // Grace period: best for early overdue, low-risk customers
    if (dpd <= 30) {
      const baseProb = 0.75;
      const calibrated = this.calibrateSuccessRate(
        RecoveryStrategyType.GRACE_PERIOD,
        baseProb,
        effectivenessMap,
      );
      strategies.push({
        type: RecoveryStrategyType.GRACE_PERIOD,
        description: `Extend grace period by 7 days. DPD is ${dpd}, probability of default is ${riskAssessment.probabilityOfDefault}%.`,
        successProbability: calibrated,
        estimatedRecovery: outstanding,
        priority: 1,
        confidence: Number(riskAssessment.confidence),
        reasoning: `Low DPD (${dpd}) suggests temporary cash flow issue. Grace period has ${bankersRound(String(calibrated * 100), 2)}% historical success rate.`,
      });
    }

    // Payment holiday: for customers showing income instability
    if (dpd <= 45 && Number(riskAssessment.probabilityOfDefault) < 70) {
      const baseProb = 0.6;
      const calibrated = this.calibrateSuccessRate(
        RecoveryStrategyType.PAYMENT_HOLIDAY,
        baseProb,
        effectivenessMap,
      );
      strategies.push({
        type: RecoveryStrategyType.PAYMENT_HOLIDAY,
        description: `Grant 14-day payment holiday to allow income stabilization.`,
        successProbability: calibrated,
        estimatedRecovery: outstanding,
        priority: 2,
        confidence: Number(riskAssessment.confidence),
        reasoning: `Payment holiday preserves full recovery while giving the customer breathing room.`,
      });
    }

    // Restructure: moderate overdue, viable income
    if (dpd >= 8 && dpd <= 90) {
      const baseProb = 0.6;
      const calibrated = this.calibrateSuccessRate(
        RecoveryStrategyType.RESTRUCTURE,
        baseProb,
        effectivenessMap,
      );
      const estimatedRecovery = bankersRound(multiply(outstanding, '0.95'), 4);
      strategies.push({
        type: RecoveryStrategyType.RESTRUCTURE,
        description: `Restructure loan: extend tenor, reduce installments. Outstanding: ${outstanding}.`,
        successProbability: calibrated,
        estimatedRecovery,
        priority: 3,
        confidence: Number(riskAssessment.confidence),
        reasoning: `DPD ${dpd} with ${productType} product. Restructuring preserves 95% of outstanding while making payments manageable.`,
      });
    }

    // Fee recovery: auto-deduction products
    if (repaymentMethod === 'auto_deduction') {
      const baseProb = 0.55;
      const calibrated = this.calibrateSuccessRate(
        RecoveryStrategyType.FEE_RECOVERY,
        baseProb,
        effectivenessMap,
      );
      strategies.push({
        type: RecoveryStrategyType.FEE_RECOVERY,
        description: `Enable micro-deductions from wallet transactions (2% per transaction, capped daily).`,
        successProbability: calibrated,
        estimatedRecovery: bankersRound(multiply(outstanding, '0.80'), 4),
        priority: 4,
        confidence: Number(riskAssessment.confidence),
        reasoning: `Auto-deduction method allows passive recovery through wallet activity.`,
      });
    }

    // Partial settlement: significant overdue
    if (dpd >= 31) {
      const discountRate = dpd >= 90 ? '0.60' : dpd >= 60 ? '0.65' : '0.70';
      const settlementAmount = bankersRound(multiply(outstanding, discountRate), 4);
      const baseProb = dpd >= 90 ? 0.35 : 0.45;
      const calibrated = this.calibrateSuccessRate(
        RecoveryStrategyType.PARTIAL_SETTLEMENT,
        baseProb,
        effectivenessMap,
      );
      strategies.push({
        type: RecoveryStrategyType.PARTIAL_SETTLEMENT,
        description: `Offer partial settlement at ${bankersRound(multiply(discountRate, '100'), 0)}% of outstanding (${settlementAmount}).`,
        successProbability: calibrated,
        estimatedRecovery: settlementAmount,
        priority: 5,
        confidence: Number(riskAssessment.confidence),
        reasoning: `At ${dpd} DPD, partial recovery is preferable to continued aging. Discount calibrated to DPD severity.`,
      });
    }

    // Escalation: severe default
    if (dpd >= 90) {
      const baseProb = 0.2;
      const calibrated = this.calibrateSuccessRate(
        RecoveryStrategyType.ESCALATION,
        baseProb,
        effectivenessMap,
      );
      strategies.push({
        type: RecoveryStrategyType.ESCALATION,
        description: `Escalate to external collections agency. Internal recovery options exhausted.`,
        successProbability: calibrated,
        estimatedRecovery: bankersRound(multiply(outstanding, '0.30'), 4),
        priority: 6,
        confidence: Number(riskAssessment.confidence),
        reasoning: `${dpd} DPD exceeds internal recovery threshold. External agency may recover 30% of outstanding.`,
      });
    }

    // Sort by priority (lowest number = highest priority)
    return strategies.sort((a, b) => a.priority - b.priority);
  }

  private buildEffectivenessMap(
    outcomes: any[],
  ): Map<string, { successCount: number; totalCount: number }> {
    const map = new Map<string, { successCount: number; totalCount: number }>();

    for (const outcome of outcomes) {
      const key = outcome.strategyType;
      const current = map.get(key) || { successCount: 0, totalCount: 0 };
      current.totalCount++;
      if (outcome.status === 'success' || outcome.status === 'partial') {
        current.successCount++;
      }
      map.set(key, current);
    }

    return map;
  }

  private calibrateSuccessRate(
    strategyType: RecoveryStrategyType,
    baseRate: number,
    effectivenessMap: Map<string, { successCount: number; totalCount: number }>,
  ): number {
    const stats = effectivenessMap.get(strategyType);
    if (!stats || stats.totalCount < 5) {
      // Not enough historical data, use base rate
      return baseRate;
    }

    const historicalRate = stats.successCount / stats.totalCount;
    // Blend: 60% historical, 40% base (Bayesian-ish approach)
    const blended = historicalRate * 0.6 + baseRate * 0.4;
    return Number(bankersRound(String(blended), 4));
  }
}
