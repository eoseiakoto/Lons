import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { EventBusService, NotFoundError, multiply, divide, bankersRound, add, subtract, min as decMin, percentage } from '@lons/common';
import { EventType } from '@lons/event-contracts';

export interface PenaltyConfig {
  type: 'flat' | 'percentage';
  rate: number;
  cap?: number;
  compound?: boolean;
}

@Injectable()
export class PenaltyService {
  private readonly logger = new Logger('PenaltyService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async applyPenalty(tenantId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { product: true },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    const penaltyConfig = contract.product.penaltyConfig as PenaltyConfig | null;
    if (!penaltyConfig) {
      this.logger.log(`No penalty config for contract ${contractId}`);
      return null;
    }

    const penaltyAmount = this.calculatePenalty(contract, penaltyConfig);
    if (penaltyAmount === '0.0000') return null;

    const newOutstandingPenalties = add(String(contract.outstandingPenalties || 0), penaltyAmount);
    const newTotalOutstanding = add(
      add(String(contract.outstandingPrincipal || 0), String(contract.outstandingInterest || 0)),
      add(String(contract.outstandingFees || 0), newOutstandingPenalties),
    );

    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        outstandingPenalties: Number(newOutstandingPenalties),
        totalOutstanding: Number(newTotalOutstanding),
      },
    });

    await this.prisma.ledgerEntry.create({
      data: {
        tenantId,
        entryType: 'penalty',
        debitCredit: 'debit',
        amount: Number(penaltyAmount),
        currency: contract.currency,
        runningBalance: Number(newTotalOutstanding),
        effectiveDate: new Date(),
        valueDate: new Date(),
        description: `Late payment penalty: ${penaltyAmount} ${contract.currency}`,
        contract: { connect: { id: contractId } },
      },
    });

    this.eventBus.emitAndBuild(EventType.PENALTY_APPLIED, tenantId, {
      contractId,
      amount: penaltyAmount,
      type: penaltyConfig.type,
    });

    this.logger.log(`Penalty applied to contract ${contractId}: ${penaltyAmount} ${contract.currency}`);
    return { contractId, penaltyAmount, currency: contract.currency };
  }

  calculatePenalty(
    contract: { outstandingPrincipal: any; outstandingPenalties: any; principalAmount: any },
    config: PenaltyConfig,
  ): string {
    let penalty: string;

    if (config.type === 'flat') {
      penalty = bankersRound(String(config.rate), 4);
    } else {
      // Percentage of outstanding principal
      penalty = bankersRound(percentage(String(contract.outstandingPrincipal || 0), String(config.rate)), 4);
    }

    // Apply cap
    if (config.cap !== undefined && config.cap > 0) {
      const capAmount = bankersRound(percentage(String(contract.principalAmount), String(config.cap)), 4);
      const currentPenalties = String(contract.outstandingPenalties || 0);
      const totalAfterNew = add(currentPenalties, penalty);
      if (Number(totalAfterNew) > Number(capAmount)) {
        penalty = bankersRound(subtract(capAmount, currentPenalties), 4);
        if (Number(penalty) < 0) penalty = '0.0000';
      }
    }

    return penalty;
  }

  async waivePenalty(tenantId: string, contractId: string, amount: string, reason: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    const waiveAmount = decMin(amount, String(contract.outstandingPenalties || 0));
    const newOutstandingPenalties = bankersRound(subtract(String(contract.outstandingPenalties || 0), waiveAmount), 4);
    const newTotalOutstanding = add(
      add(String(contract.outstandingPrincipal || 0), String(contract.outstandingInterest || 0)),
      add(String(contract.outstandingFees || 0), newOutstandingPenalties),
    );

    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        outstandingPenalties: Number(newOutstandingPenalties),
        totalOutstanding: Number(newTotalOutstanding),
      },
    });

    await this.prisma.ledgerEntry.create({
      data: {
        tenantId,
        entryType: 'reversal',
        debitCredit: 'credit',
        amount: Number(waiveAmount),
        currency: contract.currency,
        runningBalance: Number(newTotalOutstanding),
        effectiveDate: new Date(),
        valueDate: new Date(),
        description: `Penalty waiver: ${waiveAmount} ${contract.currency}. Reason: ${reason}`,
        contract: { connect: { id: contractId } },
      },
    });

    this.eventBus.emitAndBuild(EventType.PENALTY_WAIVED, tenantId, {
      contractId,
      amount: waiveAmount,
      reason,
    });

    return { contractId, waivedAmount: waiveAmount };
  }
}
