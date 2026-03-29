import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { AdaptiveActionType, AlertSeverity } from '@lons/shared-types';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

export interface ActionResult {
  success: boolean;
  actionType: AdaptiveActionType;
  contractId: string;
  message: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AdaptiveActionsService {
  private readonly logger = new Logger('AdaptiveActionsService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async executeAction(
    tenantId: string,
    contractId: string,
    actionType: AdaptiveActionType,
    config?: Record<string, unknown>,
  ): Promise<ActionResult> {
    // Check SP opt-in: the calling code should have already verified this via the AlertRule's actionConfig.
    // As an extra safeguard, we verify autoExecute is true if config is provided.
    if (config && config.autoExecute === false) {
      return {
        success: false,
        actionType,
        contractId,
        message: 'Adaptive action not authorized: autoExecute is disabled',
      };
    }

    let result: ActionResult;

    switch (actionType) {
      case AdaptiveActionType.credit_freeze:
        result = await this.executeCreditFreeze(tenantId, contractId);
        break;
      case AdaptiveActionType.schedule_adjustment:
        result = await this.executeScheduleAdjustment(tenantId, contractId);
        break;
      case AdaptiveActionType.early_warning:
        result = await this.executeEarlyWarning(tenantId, contractId);
        break;
      case AdaptiveActionType.recovery_escalation:
        result = await this.executeRecoveryEscalation(tenantId, contractId);
        break;
      default:
        result = {
          success: false,
          actionType,
          contractId,
          message: `Unknown action type: ${actionType}`,
        };
    }

    if (result.success) {
      this.eventBus.emitAndBuild(
        EventType.ADAPTIVE_ACTION_EXECUTED,
        tenantId,
        {
          contractId,
          actionType,
          result: result.message,
          details: result.details,
        },
      );
    }

    return result;
  }

  private async executeCreditFreeze(
    tenantId: string,
    contractId: string,
  ): Promise<ActionResult> {
    try {
      // Find the subscription linked to this contract's customer + product
      const contract = await this.prisma.contract.findFirst({
        where: { id: contractId, tenantId },
        select: { customerId: true, productId: true },
      });

      if (!contract) {
        return {
          success: false,
          actionType: AdaptiveActionType.credit_freeze,
          contractId,
          message: 'Contract not found',
        };
      }

      // Set subscription's available limit to 0
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          tenantId,
          customerId: contract.customerId,
          productId: contract.productId,
          status: 'active',
        },
      });

      if (subscription) {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { availableLimit: '0' },
        });
      }

      this.logger.log(
        `Credit freeze executed for contract ${contractId}, tenant ${tenantId}`,
      );

      return {
        success: true,
        actionType: AdaptiveActionType.credit_freeze,
        contractId,
        message: 'Credit limit frozen to 0',
        details: { subscriptionId: subscription?.id },
      };
    } catch (error) {
      this.logger.error(
        `Credit freeze failed for contract ${contractId}: ${error instanceof Error ? error.message : error}`,
      );
      return {
        success: false,
        actionType: AdaptiveActionType.credit_freeze,
        contractId,
        message: `Credit freeze failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }

  private async executeScheduleAdjustment(
    tenantId: string,
    contractId: string,
  ): Promise<ActionResult> {
    // Emit event suggesting SP review; do not auto-adjust
    this.eventBus.emitAndBuild(
      EventType.CONTRACT_STATE_CHANGED,
      tenantId,
      {
        contractId,
        suggestion: 'schedule_adjustment',
        reason: 'Risk monitoring suggests schedule review',
      },
    );

    this.logger.log(
      `Schedule adjustment event emitted for contract ${contractId}, tenant ${tenantId}`,
    );

    return {
      success: true,
      actionType: AdaptiveActionType.schedule_adjustment,
      contractId,
      message: 'Schedule adjustment review event emitted to service provider',
    };
  }

  private async executeEarlyWarning(
    tenantId: string,
    contractId: string,
  ): Promise<ActionResult> {
    // Create a low-severity alert for SP dashboard
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: { customerId: true },
    });

    if (!contract) {
      return {
        success: false,
        actionType: AdaptiveActionType.early_warning,
        contractId,
        message: 'Contract not found',
      };
    }

    await (this.prisma as any).monitoringAlert.create({
      data: {
        tenantId,
        contractId,
        customerId: contract.customerId,
        severity: AlertSeverity.info,
        riskScore: 0,
        riskLevel: 'low',
        factors: ['Early warning: potential risk detected'] as any,
        actionTaken: 'early_warning',
      },
    });

    this.logger.log(
      `Early warning alert created for contract ${contractId}, tenant ${tenantId}`,
    );

    return {
      success: true,
      actionType: AdaptiveActionType.early_warning,
      contractId,
      message: 'Early warning alert created for SP dashboard',
    };
  }

  private async executeRecoveryEscalation(
    tenantId: string,
    contractId: string,
  ): Promise<ActionResult> {
    // Emit event to recovery service
    this.eventBus.emitAndBuild(
      EventType.RECOVERY_STRATEGY_RECOMMENDED,
      tenantId,
      {
        contractId,
        reason: 'Risk monitoring reached critical level',
        escalationType: 'recovery_escalation',
      },
    );

    this.logger.log(
      `Recovery escalation emitted for contract ${contractId}, tenant ${tenantId}`,
    );

    return {
      success: true,
      actionType: AdaptiveActionType.recovery_escalation,
      contractId,
      message: 'Recovery escalation event emitted',
    };
  }
}
