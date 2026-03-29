import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { AlertSeverity, AlertStatus } from '@lons/shared-types';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { NotificationService } from '@lons/notification-service';
import { decodeCursor } from '@lons/common';

export interface AlertFilters {
  status?: AlertStatus;
  severity?: AlertSeverity;
  contractId?: string;
  customerId?: string;
}

export interface AlertPaginationArgs {
  first?: number;
  after?: string;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger('AlertService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private notificationService: NotificationService,
  ) {}

  async createAlert(
    tenantId: string,
    contractId: string,
    customerId: string,
    alertRuleId: string | null,
    severity: AlertSeverity,
    riskScore: number,
    riskLevel: string,
    factors: string[],
  ) {
    const alert = await (this.prisma as any).monitoringAlert.create({
      data: {
        tenantId,
        contractId,
        customerId,
        alertRuleId,
        severity,
        riskScore,
        riskLevel,
        factors: factors as any,
      },
      include: {
        contract: { select: { contractNumber: true } },
        customer: { select: { id: true } },
        alertRule: { select: { name: true } },
      },
    });

    // Emit event
    this.eventBus.emitAndBuild(
      EventType.MONITORING_ALERT_TRIGGERED,
      tenantId,
      {
        alertId: alert.id,
        contractId,
        customerId,
        severity,
        riskScore,
        riskLevel,
        factors,
        alertRuleId,
      },
    );

    // Notify via notification service (best-effort)
    try {
      await this.notificationService.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'monitoring.alert_triggered',
        variables: {
          severity,
          riskLevel,
          riskScore: String(riskScore),
          contractNumber: (alert as any).contract?.contractNumber || contractId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send alert notification for alert ${alert.id}: ${error instanceof Error ? error.message : error}`,
      );
    }

    return alert;
  }

  async getAlerts(
    tenantId: string,
    filters: AlertFilters = {},
    pagination: AlertPaginationArgs = {},
  ) {
    const limit = pagination.first || 20;
    const where: any = {
      tenantId,
      ...(filters.status && { status: filters.status }),
      ...(filters.severity && { severity: filters.severity }),
      ...(filters.contractId && { contractId: filters.contractId }),
      ...(filters.customerId && { customerId: filters.customerId }),
    };

    if (pagination.after) {
      const cursorId = decodeCursor(pagination.after);
      where.id = { gt: cursorId };
    }

    const [items, totalCount] = await Promise.all([
      (this.prisma as any).monitoringAlert.findMany({
        where,
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        include: {
          alertRule: { select: { name: true, conditionType: true } },
        },
      }),
      (this.prisma as any).monitoringAlert.count({ where }),
    ]);

    const hasNextPage = items.length > limit;
    const sliced = hasNextPage ? items.slice(0, limit) : items;

    return {
      items: sliced,
      totalCount,
      hasNextPage,
    };
  }

  async acknowledgeAlert(alertId: string, tenantId: string, acknowledgedBy: string) {
    const existing = await (this.prisma as any).monitoringAlert.findFirst({
      where: { id: alertId, tenantId },
    });
    if (!existing) {
      throw new Error(`Alert ${alertId} not found for tenant`);
    }
    if (existing.status !== AlertStatus.active) {
      throw new Error(`Alert ${alertId} is not in active status`);
    }

    const updated = await (this.prisma as any).monitoringAlert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.acknowledged,
        acknowledgedBy,
        acknowledgedAt: new Date(),
      },
    });

    this.eventBus.emitAndBuild(
      EventType.MONITORING_ALERT_ACKNOWLEDGED,
      tenantId,
      {
        alertId,
        acknowledgedBy,
        contractId: updated.contractId,
        customerId: updated.customerId,
      },
    );

    return updated;
  }

  async resolveAlert(alertId: string, tenantId: string) {
    const existing = await (this.prisma as any).monitoringAlert.findFirst({
      where: { id: alertId, tenantId },
    });
    if (!existing) {
      throw new Error(`Alert ${alertId} not found for tenant`);
    }

    return (this.prisma as any).monitoringAlert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.resolved,
        resolvedAt: new Date(),
      },
    });
  }
}
