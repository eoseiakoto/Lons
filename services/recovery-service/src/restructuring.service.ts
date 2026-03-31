import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import {
  EventBusService,
  NotFoundError,
  ValidationError,
  bankersRound,
  subtract,
  compare,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { ScheduleService } from '@lons/repayment-service';
import { IRestructuringParams } from '@lons/shared-types';

export interface RestructuringResult {
  contractId: string;
  success: boolean;
  originalTenorDays: number;
  newTenorDays: number;
  originalInterestRate: string;
  newInterestRate: string;
  originalOutstanding: string;
  newOutstanding: string;
  restructureCount: number;
  newScheduleEntries: number;
  restructuredAt: Date;
}

@Injectable()
export class RestructuringService {
  private readonly logger = new Logger('RestructuringService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private scheduleService: ScheduleService,
  ) {}

  async restructureLoan(
    tenantId: string,
    contractId: string,
    params: IRestructuringParams,
  ): Promise<RestructuringResult> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { product: true },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    if (contract.status === 'settled' || contract.status === 'cancelled') {
      throw new ValidationError('Cannot restructure a settled or cancelled contract');
    }

    if (contract.status === 'written_off') {
      throw new ValidationError('Cannot restructure a written-off contract');
    }

    const originalTenorDays = contract.tenorDays ?? 30;
    const originalInterestRate = bankersRound(String(contract.interestRate), 4);
    const originalOutstanding = bankersRound(String(contract.totalOutstanding ?? 0), 4);

    // Determine new terms
    const newTenorDays = params.newTenorDays ?? originalTenorDays;
    const newInterestRate = params.newInterestRate ?? originalInterestRate;

    // Validate new terms
    if (newTenorDays <= 0) {
      throw new ValidationError('New tenor must be positive');
    }

    // Calculate new outstanding after penalty waiver
    let newOutstanding = originalOutstanding;
    if (params.penaltyWaiver) {
      const penalties = bankersRound(String(contract.outstandingPenalties ?? 0), 4);
      newOutstanding = bankersRound(subtract(newOutstanding, penalties), 4);
      if (compare(newOutstanding, '0') < 0) {
        newOutstanding = '0.0000';
      }
    }

    // Apply payment holiday by extending maturity
    let effectiveNewTenorDays = newTenorDays;
    if (params.paymentHolidayDays && params.paymentHolidayDays > 0) {
      effectiveNewTenorDays = newTenorDays + params.paymentHolidayDays;
    }

    // Update contract in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Snapshot original terms in metadata
      const existingMetadata = (contract.metadata as Record<string, unknown>) ?? {};
      const restructureHistory = (existingMetadata.restructureHistory as any[]) ?? [];
      restructureHistory.push({
        restructuredAt: new Date().toISOString(),
        reason: params.reason,
        originalTenorDays,
        originalInterestRate,
        originalOutstanding,
        newTenorDays: effectiveNewTenorDays,
        newInterestRate,
        penaltyWaiver: params.penaltyWaiver ?? false,
        paymentHolidayDays: params.paymentHolidayDays ?? 0,
      });

      // Update contract
      const newMaturityDate = new Date(contract.startDate);
      newMaturityDate.setDate(newMaturityDate.getDate() + effectiveNewTenorDays);

      await tx.contract.update({
        where: { id: contractId },
        data: {
          tenorDays: effectiveNewTenorDays,
          interestRate: new Prisma.Decimal(newInterestRate),
          maturityDate: newMaturityDate,
          restructured: true,
          restructureCount: { increment: 1 },
          totalOutstanding: new Prisma.Decimal(newOutstanding),
          ...(params.penaltyWaiver
            ? { outstandingPenalties: new Prisma.Decimal('0') }
            : {}),
          metadata: {
            ...existingMetadata,
            restructureHistory,
          },
        },
      });

      // Delete existing pending schedule entries
      await tx.repaymentScheduleEntry.deleteMany({
        where: {
          contractId,
          tenantId,
          status: 'pending',
        },
      });

      return {
        restructureCount: (contract.restructureCount ?? 0) + 1,
        newMaturityDate,
      };
    });

    // Generate new repayment schedule using the repayment service
    const newSchedule = await this.scheduleService.createSchedule(tenantId, contractId);

    const restructuredAt = new Date();

    this.logger.log(
      `Restructured contract ${contractId}: tenor ${originalTenorDays} -> ${effectiveNewTenorDays}, rate ${originalInterestRate} -> ${newInterestRate}`,
    );

    this.eventBus.emitAndBuild(EventType.LOAN_RESTRUCTURED, tenantId, {
      contractId,
      originalTenorDays,
      newTenorDays: effectiveNewTenorDays,
      originalInterestRate,
      newInterestRate,
      penaltyWaiver: params.penaltyWaiver ?? false,
      paymentHolidayDays: params.paymentHolidayDays ?? 0,
      restructureCount: result.restructureCount,
      reason: params.reason,
    });

    return {
      contractId,
      success: true,
      originalTenorDays,
      newTenorDays: effectiveNewTenorDays,
      originalInterestRate,
      newInterestRate,
      originalOutstanding,
      newOutstanding,
      restructureCount: result.restructureCount,
      newScheduleEntries: newSchedule.length,
      restructuredAt,
    };
  }
}
