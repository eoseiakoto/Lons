import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { EventBusService, NotFoundError, bankersRound, divide, add } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { RecoveryStrategyType, RecoveryOutcomeStatus } from '@lons/shared-types';

export interface RecordOutcomeParams {
  strategyType: RecoveryStrategyType;
  strategyParams?: Record<string, unknown>;
  notes?: string;
  appliedBy?: string;
}

export interface UpdateOutcomeParams {
  status: RecoveryOutcomeStatus;
  amountRecovered?: string;
  notes?: string;
}

export interface StrategyEffectiveness {
  successRate: number;
  avgRecovery: string;
  avgDaysToResolve: number;
  totalOutcomes: number;
}

@Injectable()
export class OutcomeTrackerService {
  private readonly logger = new Logger('OutcomeTrackerService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async recordOutcome(
    tenantId: string,
    contractId: string,
    params: RecordOutcomeParams,
  ) {
    // Verify contract exists
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    const outcome = await (this.prisma as any).recoveryOutcome.create({
      data: {
        tenantId,
        contractId,
        strategyType: params.strategyType,
        strategyParams: (params.strategyParams as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        status: RecoveryOutcomeStatus.PENDING,
        notes: params.notes,
        appliedBy: params.appliedBy,
        appliedAt: new Date(),
      },
    });

    this.logger.log(
      `Recorded recovery outcome ${outcome.id} for contract ${contractId}, strategy ${params.strategyType}`,
    );

    this.eventBus.emitAndBuild(EventType.RECOVERY_STRATEGY_APPLIED, tenantId, {
      outcomeId: outcome.id,
      contractId,
      strategyType: params.strategyType,
    });

    return outcome;
  }

  async updateOutcome(
    outcomeId: string,
    params: UpdateOutcomeParams,
  ) {
    const existing = await (this.prisma as any).recoveryOutcome.findUnique({
      where: { id: outcomeId },
    });
    if (!existing) throw new NotFoundError('RecoveryOutcome', outcomeId);

    const isResolved = params.status === RecoveryOutcomeStatus.SUCCESS
      || params.status === RecoveryOutcomeStatus.FAILED
      || params.status === RecoveryOutcomeStatus.CANCELLED;

    const resolvedAt = isResolved ? new Date() : undefined;
    const daysToResolution = isResolved && existing.appliedAt
      ? Math.ceil((Date.now() - new Date(existing.appliedAt).getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    const outcome = await (this.prisma as any).recoveryOutcome.update({
      where: { id: outcomeId },
      data: {
        status: params.status,
        amountRecovered: params.amountRecovered
          ? new Prisma.Decimal(params.amountRecovered)
          : undefined,
        notes: params.notes ?? existing.notes,
        resolvedAt,
        daysToResolution,
      },
    });

    this.logger.log(
      `Updated recovery outcome ${outcomeId} to status ${params.status}`,
    );

    this.eventBus.emitAndBuild(EventType.RECOVERY_OUTCOME_RECORDED, existing.tenantId, {
      outcomeId: outcome.id,
      contractId: existing.contractId,
      strategyType: existing.strategyType,
      status: params.status,
      amountRecovered: params.amountRecovered,
    });

    return outcome;
  }

  async getOutcomes(tenantId: string, contractId: string) {
    return (this.prisma as any).recoveryOutcome.findMany({
      where: { tenantId, contractId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStrategyEffectiveness(
    tenantId: string,
    strategyType: RecoveryStrategyType,
  ): Promise<StrategyEffectiveness> {
    const outcomes = await (this.prisma as any).recoveryOutcome.findMany({
      where: {
        tenantId,
        strategyType,
        status: { not: RecoveryOutcomeStatus.PENDING },
      },
    });

    if (outcomes.length === 0) {
      return {
        successRate: 0,
        avgRecovery: '0.0000',
        avgDaysToResolve: 0,
        totalOutcomes: 0,
      };
    }

    const successCount = outcomes.filter(
      (o: any) => o.status === RecoveryOutcomeStatus.SUCCESS || o.status === RecoveryOutcomeStatus.PARTIAL,
    ).length;

    const successRate = Number(bankersRound(divide(String(successCount), String(outcomes.length)), 4));

    let totalRecovery = '0.0000';
    let recoveryCount = 0;
    let totalDays = 0;
    let daysCount = 0;

    for (const outcome of outcomes) {
      if (outcome.amountRecovered) {
        totalRecovery = add(totalRecovery, bankersRound(String(outcome.amountRecovered), 4));
        recoveryCount++;
      }
      if (outcome.daysToResolution != null) {
        totalDays += outcome.daysToResolution;
        daysCount++;
      }
    }

    const avgRecovery = recoveryCount > 0
      ? bankersRound(divide(totalRecovery, String(recoveryCount)), 4)
      : '0.0000';

    const avgDaysToResolve = daysCount > 0
      ? Number(bankersRound(divide(String(totalDays), String(daysCount)), 2))
      : 0;

    return {
      successRate,
      avgRecovery,
      avgDaysToResolve,
      totalOutcomes: outcomes.length,
    };
  }
}
