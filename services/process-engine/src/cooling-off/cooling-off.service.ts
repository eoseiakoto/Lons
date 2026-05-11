import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, ContractStatus, RepaymentScheduleStatus } from '@lons/database';
import { EventBusService, NotFoundError } from '@lons/common';
import { AuditService } from '@lons/entity-service';
import { EventType } from '@lons/event-contracts';

@Injectable()
export class CoolingOffService {
  private readonly logger = new Logger('CoolingOffService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private auditService: AuditService,
  ) {}

  /**
   * Called after disbursement completes. If product has coolingOffHours > 0,
   * sets contract to cooling_off status with an expiry time.
   */
  async activateCoolingOff(tenantId: string, contractId: string): Promise<void> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { product: true },
    });

    if (!contract) {
      throw new NotFoundError('Contract', contractId);
    }

    const coolingOffHours = contract.product.coolingOffHours;
    if (coolingOffHours <= 0) {
      return;
    }

    const coolingOffExpiresAt = new Date(
      Date.now() + coolingOffHours * 60 * 60 * 1000,
    );

    const existingMetadata = (contract.metadata as Record<string, unknown>) || {};

    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        status: ContractStatus.cooling_off,
        metadata: {
          ...existingMetadata,
          coolingOffExpiresAt: coolingOffExpiresAt.toISOString(),
        },
      },
    });

    this.eventBus.emitAndBuild(EventType.CONTRACT_COOLING_OFF_STARTED, tenantId, {
      contractId,
      customerId: contract.customerId,
      coolingOffHours,
      coolingOffExpiresAt: coolingOffExpiresAt.toISOString(),
    });

    this.logger.log(
      `Cooling-off activated for contract ${contractId}, expires at ${coolingOffExpiresAt.toISOString()}`,
    );
  }

  /**
   * Cancel a contract during cooling-off period.
   */
  async cancelDuringCoolingOff(
    tenantId: string,
    contractId: string,
    reason?: string,
    idempotencyKey?: string,
  ): Promise<{ success: boolean; contractId: string; cancelledAt?: Date; error?: string }> {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });

    if (!contract) {
      return { success: false, contractId, error: 'Contract not found' };
    }

    if (contract.status !== ContractStatus.cooling_off) {
      return {
        success: false,
        contractId,
        error: `Contract is not in cooling-off period. Current status: ${contract.status}`,
      };
    }

    const metadata = (contract.metadata as Record<string, unknown>) || {};
    const coolingOffExpiresAt = metadata.coolingOffExpiresAt
      ? new Date(metadata.coolingOffExpiresAt as string)
      : null;

    if (!coolingOffExpiresAt || coolingOffExpiresAt <= new Date()) {
      return {
        success: false,
        contractId,
        error: 'Cooling-off period has expired',
      };
    }

    const cancelledAt = new Date();

    // Update contract status to cancelled
    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        status: ContractStatus.cancelled,
        metadata: {
          ...metadata,
          cancellationReason: 'COOLING_OFF_CANCELLATION',
          cancellationDetails: reason || 'Cancelled during cooling-off period',
          cancelledAt: cancelledAt.toISOString(),
          idempotencyKey,
        },
      },
    });

    // Cancel all repayment schedule entries by setting them to waived
    await this.prisma.repaymentScheduleEntry.updateMany({
      where: {
        contractId,
        tenantId,
        status: { in: [RepaymentScheduleStatus.pending, RepaymentScheduleStatus.partial] },
      },
      data: {
        status: RepaymentScheduleStatus.waived,
      },
    });

    // Zero out outstanding amounts on the contract
    await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        outstandingInterest: 0,
        outstandingFees: 0,
        outstandingPenalties: 0,
        outstandingPrincipal: 0,
        totalOutstanding: 0,
      },
    });

    this.eventBus.emitAndBuild(EventType.CONTRACT_COOLING_OFF_CANCELLED, tenantId, {
      contractId,
      customerId: contract.customerId,
      reason: reason || 'Cancelled during cooling-off period',
      cancelledAt: cancelledAt.toISOString(),
      idempotencyKey,
    });

    this.logger.log(`Contract ${contractId} cancelled during cooling-off period`);

    return { success: true, contractId, cancelledAt };
  }

  /**
   * Transition expired cooling-off contracts to active.
   * Called by scheduler every 15 minutes.
   */
  async expireCoolingOffContracts(tenantId?: string): Promise<number> {
    const now = new Date();

    const whereClause: Record<string, unknown> = {
      status: ContractStatus.cooling_off,
    };

    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    // Find all contracts in cooling_off status
    const coolingOffContracts = await this.prisma.contract.findMany({
      where: whereClause as any,
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        metadata: true,
      },
    });

    let transitionedCount = 0;

    for (const contract of coolingOffContracts) {
      const metadata = (contract.metadata as Record<string, unknown>) || {};
      const coolingOffExpiresAt = metadata.coolingOffExpiresAt
        ? new Date(metadata.coolingOffExpiresAt as string)
        : null;

      if (!coolingOffExpiresAt || coolingOffExpiresAt > now) {
        continue;
      }

      try {
        await this.prisma.contract.update({
          where: { id: contract.id },
          data: {
            status: ContractStatus.active,
            metadata: {
              ...metadata,
              coolingOffExpiredAt: now.toISOString(),
            },
          },
        });

        this.eventBus.emitAndBuild(
          EventType.CONTRACT_COOLING_OFF_EXPIRED,
          contract.tenantId,
          {
            contractId: contract.id,
            customerId: contract.customerId,
            expiredAt: now.toISOString(),
          },
        );

        // S13B-1: system-actor audit entry for automatic state transition.
        await this.auditService.log({
          tenantId: contract.tenantId,
          actorType: 'system',
          action: 'transition.contract',
          resourceType: 'contract',
          resourceId: contract.id,
          beforeValue: { status: ContractStatus.cooling_off },
          afterValue: { status: ContractStatus.active },
          metadata: {
            job: 'cooling-off-expiry',
            reason: 'cooling_off_expired',
            coolingOffExpiresAt:
              metadata.coolingOffExpiresAt as string | undefined,
          },
        });

        transitionedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to expire cooling-off for contract ${contract.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    if (transitionedCount > 0) {
      this.logger.log(`Transitioned ${transitionedCount} contracts from cooling_off to active`);
    }

    return transitionedCount;
  }
}
