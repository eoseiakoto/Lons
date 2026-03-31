import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { NotFoundError } from '@lons/common';

export interface RecoveryStrategy {
  type: 'restructure' | 'grace_period' | 'partial_settlement' | 'escalation' | 'fee_recovery';
  description: string;
  successProbability: number; // 0-1
  estimatedRecovery: string; // amount
  priority: number;
}

@Injectable()
export class RecoveryStrategyService {
  private readonly logger = new Logger('RecoveryStrategyService');

  constructor(private prisma: PrismaService) {}

  async getRecommendations(tenantId: string, contractId: string): Promise<RecoveryStrategy[]> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { customer: true, product: true },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    const dpd = contract.daysPastDue;
    const outstanding = Number(contract.totalOutstanding || 0);
    const strategies: RecoveryStrategy[] = [];

    // Early overdue (1-30 DPD): gentle reminder + grace period
    if (dpd <= 30) {
      strategies.push({
        type: 'grace_period',
        description: `Extend grace period by 7 days. Customer may be experiencing temporary cash flow issues.`,
        successProbability: 0.75,
        estimatedRecovery: String(outstanding),
        priority: 1,
      });
    }

    // Moderate overdue (8-60 DPD): restructure
    if (dpd >= 8 && dpd <= 60) {
      strategies.push({
        type: 'restructure',
        description: `Restructure loan: extend tenor by 30 days with reduced installments.`,
        successProbability: 0.6,
        estimatedRecovery: String(outstanding * 0.95),
        priority: 2,
      });
    }

    // Significant overdue (31-90 DPD): partial settlement
    if (dpd >= 31) {
      const settlementAmount = outstanding * 0.7;
      strategies.push({
        type: 'partial_settlement',
        description: `Offer partial settlement at 70% of outstanding (${settlementAmount.toFixed(2)}).`,
        successProbability: 0.45,
        estimatedRecovery: String(settlementAmount),
        priority: 3,
      });
    }

    // Fee recovery (any overdue with auto-deduction)
    if (contract.product.repaymentMethod === 'auto_deduction') {
      strategies.push({
        type: 'fee_recovery',
        description: `Enable micro-deductions from wallet transactions (2% per transaction, max 50/day).`,
        successProbability: 0.55,
        estimatedRecovery: String(outstanding * 0.8),
        priority: 4,
      });
    }

    // Severe default (90+ DPD): escalation
    if (dpd >= 90) {
      strategies.push({
        type: 'escalation',
        description: `Escalate to external collections agency. Internal recovery options exhausted.`,
        successProbability: 0.2,
        estimatedRecovery: String(outstanding * 0.3),
        priority: 5,
      });
    }

    return strategies.sort((a, b) => a.priority - b.priority);
  }
}
