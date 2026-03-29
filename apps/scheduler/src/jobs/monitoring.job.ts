import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { AdaptiveActionType } from '@lons/shared-types';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { MonitoringService } from '@lons/process-engine';
import { AlertRulesService } from '@lons/process-engine';
import { AlertService } from '@lons/process-engine';
import { AdaptiveActionsService } from '@lons/process-engine';

const DEFAULT_CHUNK_SIZE = 50;

@Injectable()
export class MonitoringJob {
  private readonly logger = new Logger('MonitoringJob');
  private readonly chunkSize: number;

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private monitoringService: MonitoringService,
    private alertRulesService: AlertRulesService,
    private alertService: AlertService,
    private adaptiveActionsService: AdaptiveActionsService,
  ) {
    this.chunkSize = parseInt(process.env.MONITORING_CHUNK_SIZE || '', 10) || DEFAULT_CHUNK_SIZE;
  }

  @Cron('0 2 * * *') // Daily at 2 AM UTC
  async handleMonitoringRun() {
    this.logger.log('Starting daily monitoring risk assessment run');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        await this.processTenant(tenant.id);
      } catch (error) {
        this.logger.error(
          `Monitoring run failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    this.logger.log('Daily monitoring risk assessment run completed');
  }

  private async processTenant(tenantId: string) {
    let cursor: string | undefined;
    let processedCount = 0;

    while (true) {
      const contracts = await this.prisma.contract.findMany({
        where: {
          tenantId,
          status: { in: ['active', 'overdue', 'delinquent'] },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, customerId: true },
        orderBy: { id: 'asc' },
        take: this.chunkSize,
      });

      if (contracts.length === 0) break;

      for (const contract of contracts) {
        try {
          await this.processContract(tenantId, contract.id, contract.customerId);
          processedCount++;
        } catch (error) {
          this.logger.error(
            `Risk assessment failed for contract ${contract.id}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      cursor = contracts[contracts.length - 1].id;

      if (contracts.length < this.chunkSize) break;
    }

    this.logger.log(
      `Monitoring completed for tenant ${tenantId}: ${processedCount} contracts assessed`,
    );
  }

  private async processContract(
    tenantId: string,
    contractId: string,
    customerId: string,
  ) {
    // Assess current risk
    const riskIndicator = await this.monitoringService.assessContractRisk(tenantId, contractId);

    // Check previous risk level from most recent alert
    const previousAlert = await (this.prisma as any).monitoringAlert.findFirst({
      where: { tenantId, contractId },
      orderBy: { createdAt: 'desc' },
      select: { riskLevel: true },
    });

    // Emit risk changed event if level changed
    if (previousAlert && previousAlert.riskLevel !== riskIndicator.riskLevel) {
      this.eventBus.emitAndBuild(
        EventType.MONITORING_RISK_CHANGED,
        tenantId,
        {
          contractId,
          customerId,
          previousRiskLevel: previousAlert.riskLevel,
          currentRiskLevel: riskIndicator.riskLevel,
          riskScore: riskIndicator.score,
          factors: riskIndicator.factors,
        },
      );
    }

    // Evaluate rules
    const triggeredRules = await this.alertRulesService.evaluateRules(
      tenantId,
      contractId,
      riskIndicator,
    );

    // Create alerts and execute adaptive actions for triggered rules
    for (const triggered of triggeredRules) {
      const alert = await this.alertService.createAlert(
        tenantId,
        contractId,
        customerId,
        triggered.alertRuleId,
        triggered.severity,
        riskIndicator.score,
        riskIndicator.riskLevel,
        riskIndicator.factors,
      );

      // Execute adaptive action if configured and autoExecute is enabled
      if (triggered.actionType) {
        const actionConfig = triggered.actionConfig || {};
        if (actionConfig.autoExecute === true) {
          try {
            const result = await this.adaptiveActionsService.executeAction(
              tenantId,
              contractId,
              triggered.actionType as AdaptiveActionType,
              actionConfig,
            );

            // Update the alert with the action taken
            if (result.success) {
              await (this.prisma as any).monitoringAlert.update({
                where: { id: alert.id },
                data: { actionTaken: triggered.actionType },
              });
            }
          } catch (error) {
            this.logger.error(
              `Adaptive action ${triggered.actionType} failed for contract ${contractId}: ${error instanceof Error ? error.message : error}`,
            );
          }
        }
      }
    }
  }
}
