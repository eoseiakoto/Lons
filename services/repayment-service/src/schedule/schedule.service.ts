import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { NotFoundError } from '@lons/common';

import {
  generateEMISchedule,
  generateReducingBalanceSchedule,
  generateLumpSumSchedule,
  generateBalloonSchedule,
  ScheduleParams,
} from './schedule-generator';

@Injectable()
export class ScheduleService {
  constructor(private prisma: PrismaService) {}

  async createSchedule(tenantId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { product: true },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    const params: ScheduleParams = {
      principalAmount: String(contract.principalAmount),
      interestRate: String(contract.interestRate),
      tenorDays: contract.tenorDays || 30,
      startDate: contract.startDate,
      gracePeriodDays: contract.product.gracePeriodDays,
    };

    let entries;
    switch (contract.repaymentMethod) {
      case 'equal_installments':
        entries = generateEMISchedule(params);
        break;
      case 'reducing':
        entries = generateReducingBalanceSchedule(params);
        break;
      case 'lump_sum':
      case 'auto_deduction':
        entries = generateLumpSumSchedule(params);
        break;
      case 'balloon':
        entries = generateBalloonSchedule(params);
        break;
      default:
        entries = generateEMISchedule(params);
    }

    await this.prisma.repaymentScheduleEntry.createMany({
      data: entries.map((e) => ({
        tenantId,
        contractId,
        installmentNumber: e.installmentNumber,
        dueDate: e.dueDate,
        principalAmount: Number(e.principalAmount),
        interestAmount: Number(e.interestAmount),
        feeAmount: Number(e.feeAmount),
        totalAmount: Number(e.totalAmount),
        paidAmount: 0,
        status: 'pending',
      })),
    });

    return this.prisma.repaymentScheduleEntry.findMany({
      where: { contractId, tenantId },
      orderBy: { installmentNumber: 'asc' },
    });
  }

  async getSchedule(tenantId: string, contractId: string) {
    return this.prisma.repaymentScheduleEntry.findMany({
      where: { contractId, tenantId },
      orderBy: { installmentNumber: 'asc' },
    });
  }
}
