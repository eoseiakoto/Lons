import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { NotFoundError, bankersRound, divide, multiply, add, compare, maskPhone } from '@lons/common';

export interface RiskFactor {
  factor: string;
  impact: string; // 'high' | 'medium' | 'low'
  description: string;
}

export interface DefaultRiskAssessment {
  contractId: string;
  probabilityOfDefault: string; // 0-100 as Decimal string
  predictedDaysToDefault: number;
  confidence: string; // 0-1 as Decimal string
  topRiskFactors: RiskFactor[];
  assessedAt: Date;
}

@Injectable()
export class PredictiveRiskService {
  private readonly logger = new Logger('PredictiveRiskService');

  constructor(private prisma: PrismaService) {}

  async predictDefaultRisk(tenantId: string, contractId: string): Promise<DefaultRiskAssessment> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: {
        customer: true,
        product: true,
        repayments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        repaymentSchedule: {
          orderBy: { dueDate: 'asc' },
        },
      },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    this.logger.debug(
      `Assessing default risk for contract ${contractId}, customer ${maskPhone(contract.customer?.phonePrimary ?? '')}`,
    );

    // Weighted scoring model
    const paymentHistoryScore = this.analyzePaymentHistory(contract);
    const dpdScore = this.analyzeDaysPastDue(contract.daysPastDue);
    const balanceScore = this.analyzeOutstandingBalance(contract);
    const behaviorScore = this.analyzePaymentBehavior(contract);

    // Weights sum to 1.0
    const weights = {
      paymentHistory: '0.35',
      dpd: '0.30',
      balance: '0.20',
      behavior: '0.15',
    };

    const weightedScore = add(
      add(
        multiply(String(paymentHistoryScore.score), weights.paymentHistory),
        multiply(String(dpdScore.score), weights.dpd),
      ),
      add(
        multiply(String(balanceScore.score), weights.balance),
        multiply(String(behaviorScore.score), weights.behavior),
      ),
    );

    // Clamp probability between 0 and 100
    const rawProbability = bankersRound(multiply(weightedScore, '100'), 4);
    const probabilityOfDefault = compare(rawProbability, '100') > 0
      ? '100.0000'
      : compare(rawProbability, '0') < 0
        ? '0.0000'
        : rawProbability;

    const predictedDaysToDefault = this.estimateDaysToDefault(
      Number(probabilityOfDefault),
      contract.daysPastDue,
    );

    // Confidence based on data availability
    const dataPoints = (contract.repayments?.length ?? 0) + (contract.repaymentSchedule?.length ?? 0);
    const confidence = dataPoints >= 10
      ? '0.8500'
      : dataPoints >= 5
        ? '0.7000'
        : dataPoints >= 1
          ? '0.5500'
          : '0.3000';

    const topRiskFactors = this.collectRiskFactors(
      paymentHistoryScore,
      dpdScore,
      balanceScore,
      behaviorScore,
    );

    return {
      contractId,
      probabilityOfDefault,
      predictedDaysToDefault,
      confidence,
      topRiskFactors,
      assessedAt: new Date(),
    };
  }

  private analyzePaymentHistory(contract: any): { score: number; factors: RiskFactor[] } {
    const repayments = contract.repayments ?? [];
    const schedule = contract.repaymentSchedule ?? [];
    const factors: RiskFactor[] = [];

    if (repayments.length === 0 && schedule.length > 0) {
      factors.push({
        factor: 'no_payment_history',
        impact: 'high',
        description: 'No repayments recorded despite active schedule',
      });
      return { score: 0.7, factors };
    }

    if (schedule.length === 0) {
      return { score: 0.3, factors };
    }

    // Calculate on-time payment rate
    const now = new Date();
    const dueEntries = schedule.filter((s: any) => new Date(s.dueDate) <= now);
    const paidEntries = dueEntries.filter((s: any) => s.status === 'paid' || s.status === 'completed');
    const onTimeRate = dueEntries.length > 0 ? paidEntries.length / dueEntries.length : 1;

    if (onTimeRate < 0.5) {
      factors.push({
        factor: 'poor_payment_history',
        impact: 'high',
        description: `Only ${bankersRound(String(onTimeRate * 100), 2)}% of due installments paid on time`,
      });
      return { score: 0.8, factors };
    }

    if (onTimeRate < 0.8) {
      factors.push({
        factor: 'inconsistent_payments',
        impact: 'medium',
        description: `${bankersRound(String(onTimeRate * 100), 2)}% on-time payment rate indicates inconsistency`,
      });
      return { score: 0.5, factors };
    }

    return { score: 0.15, factors };
  }

  private analyzeDaysPastDue(dpd: number): { score: number; factors: RiskFactor[] } {
    const factors: RiskFactor[] = [];

    if (dpd >= 90) {
      factors.push({
        factor: 'severe_delinquency',
        impact: 'high',
        description: `Contract is ${dpd} days past due, indicating severe default risk`,
      });
      return { score: 0.95, factors };
    }

    if (dpd >= 60) {
      factors.push({
        factor: 'significant_delinquency',
        impact: 'high',
        description: `Contract is ${dpd} days past due, approaching default threshold`,
      });
      return { score: 0.8, factors };
    }

    if (dpd >= 30) {
      factors.push({
        factor: 'moderate_delinquency',
        impact: 'medium',
        description: `Contract is ${dpd} days past due`,
      });
      return { score: 0.55, factors };
    }

    if (dpd > 0) {
      factors.push({
        factor: 'early_delinquency',
        impact: 'low',
        description: `Contract is ${dpd} days past due, early stage overdue`,
      });
      return { score: 0.3, factors };
    }

    return { score: 0.05, factors };
  }

  private analyzeOutstandingBalance(contract: any): { score: number; factors: RiskFactor[] } {
    const factors: RiskFactor[] = [];
    const totalOutstanding = bankersRound(String(contract.totalOutstanding ?? 0), 4);
    const principalAmount = bankersRound(String(contract.principalAmount ?? 0), 4);

    if (compare(principalAmount, '0') <= 0) {
      return { score: 0.3, factors };
    }

    const outstandingRatio = divide(totalOutstanding, principalAmount);

    // If outstanding exceeds original principal (interest/penalties accumulated)
    if (compare(outstandingRatio, '1.2') > 0) {
      factors.push({
        factor: 'balance_exceeds_principal',
        impact: 'high',
        description: `Outstanding balance (${totalOutstanding}) exceeds 120% of original principal`,
      });
      return { score: 0.75, factors };
    }

    if (compare(outstandingRatio, '0.8') > 0) {
      factors.push({
        factor: 'high_outstanding_ratio',
        impact: 'medium',
        description: `Outstanding balance remains at ${bankersRound(multiply(outstandingRatio, '100'), 2)}% of principal`,
      });
      return { score: 0.5, factors };
    }

    return { score: 0.2, factors };
  }

  private analyzePaymentBehavior(contract: any): { score: number; factors: RiskFactor[] } {
    const factors: RiskFactor[] = [];
    const repayments = contract.repayments ?? [];

    if (repayments.length < 2) {
      return { score: 0.4, factors };
    }

    // Analyze payment amounts trend (are they declining?)
    const amounts = repayments.map((r: any) => Number(String(r.amount)));
    const recentAvg = amounts.slice(0, Math.min(3, amounts.length)).reduce((a: number, b: number) => a + b, 0) / Math.min(3, amounts.length);
    const olderAvg = amounts.slice(3).length > 0
      ? amounts.slice(3).reduce((a: number, b: number) => a + b, 0) / amounts.slice(3).length
      : recentAvg;

    if (olderAvg > 0 && recentAvg < olderAvg * 0.7) {
      factors.push({
        factor: 'declining_payment_amounts',
        impact: 'medium',
        description: 'Recent payment amounts are significantly lower than earlier payments',
      });
      return { score: 0.65, factors };
    }

    // Check for gaps between payments
    if (repayments.length >= 2) {
      const dates = repayments.map((r: any) => new Date(r.createdAt).getTime());
      const gaps = [];
      for (let i = 0; i < dates.length - 1; i++) {
        gaps.push(Math.abs(dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24));
      }
      const maxGap = Math.max(...gaps);
      if (maxGap > 45) {
        factors.push({
          factor: 'irregular_payment_frequency',
          impact: 'medium',
          description: `Maximum gap between payments is ${Math.round(maxGap)} days`,
        });
        return { score: 0.55, factors };
      }
    }

    return { score: 0.2, factors };
  }

  private estimateDaysToDefault(probabilityPercent: number, currentDpd: number): number {
    if (probabilityPercent >= 90) return Math.max(0, 90 - currentDpd);
    if (probabilityPercent >= 70) return Math.max(7, 120 - currentDpd);
    if (probabilityPercent >= 50) return Math.max(14, 180 - currentDpd);
    if (probabilityPercent >= 30) return Math.max(30, 270 - currentDpd);
    return 365;
  }

  private collectRiskFactors(
    ...analyses: { score: number; factors: RiskFactor[] }[]
  ): RiskFactor[] {
    const allFactors: RiskFactor[] = [];
    for (const analysis of analyses) {
      allFactors.push(...analysis.factors);
    }
    // Sort by impact severity, return top 5
    const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return allFactors
      .sort((a, b) => (impactOrder[a.impact] ?? 3) - (impactOrder[b.impact] ?? 3))
      .slice(0, 5);
  }
}
