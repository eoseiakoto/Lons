import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lons/database';

export interface RiskIndicator {
  contractId: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: string[];
  score: number; // 0-100
}

@Injectable()
export class MonitoringService {
  constructor(private prisma: PrismaService) {}

  async assessContractRisk(tenantId: string, contractId: string): Promise<RiskIndicator> {
    const contract = await this.prisma.contract.findFirstOrThrow({
      where: { id: contractId, tenantId },
      include: {
        repaymentSchedule: { where: { status: { in: ['pending', 'partial', 'overdue'] } }, orderBy: { dueDate: 'asc' }, take: 1 },
      },
    });

    const factors: string[] = [];
    let score = 0;

    // DPD factor
    if (contract.daysPastDue > 0) {
      score += Math.min(contract.daysPastDue, 50);
      factors.push(`${contract.daysPastDue} days past due`);
    }

    // Outstanding ratio
    const totalCost = Number(contract.totalCostCredit || contract.principalAmount);
    const paid = Number(contract.totalPaid || 0);
    if (totalCost > 0 && paid / totalCost < 0.1 && contract.daysPastDue > 7) {
      score += 20;
      factors.push('Less than 10% of total cost paid');
    }

    // Upcoming payment pressure
    const nextPayment = contract.repaymentSchedule[0];
    if (nextPayment) {
      const daysUntilDue = Math.floor((new Date(nextPayment.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue < 0) {
        score += 15;
        factors.push('Payment is overdue');
      } else if (daysUntilDue <= 3) {
        score += 5;
        factors.push('Payment due within 3 days');
      }
    }

    // Classification factor
    if (contract.classification === 'substandard') { score += 10; factors.push('Substandard classification'); }
    if (contract.classification === 'doubtful') { score += 20; factors.push('Doubtful classification'); }
    if (contract.classification === 'loss') { score += 30; factors.push('Loss classification'); }

    score = Math.min(score, 100);

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (score >= 75) riskLevel = 'critical';
    else if (score >= 50) riskLevel = 'high';
    else if (score >= 25) riskLevel = 'medium';
    else riskLevel = 'low';

    return { contractId, riskLevel, factors, score };
  }
}
