import { AlertService } from '../alert.service';
import { AlertSeverity, AlertStatus } from '@lons/shared-types';
import { EventType } from '@lons/event-contracts';

describe('AlertService', () => {
  let service: AlertService;
  let prisma: any;
  let eventBus: any;
  let notificationService: any;

  const tenantId = 'tenant-001';
  const contractId = 'contract-001';
  const customerId = 'customer-001';

  const mockAlert = {
    id: 'alert-001',
    tenantId,
    contractId,
    customerId,
    alertRuleId: 'rule-001',
    severity: AlertSeverity.warning,
    status: AlertStatus.active,
    riskScore: 65,
    riskLevel: 'high',
    factors: ['30 days past due'],
    actionTaken: null,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: new Date(),
    contract: { contractNumber: 'LN-001' },
    customer: { id: customerId },
    alertRule: { name: 'High Risk' },
  };

  beforeEach(() => {
    prisma = {
      monitoringAlert: {
        create: jest.fn().mockResolvedValue(mockAlert),
        findMany: jest.fn().mockResolvedValue([mockAlert]),
        findFirst: jest.fn().mockResolvedValue(mockAlert),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    eventBus = {
      emitAndBuild: jest.fn(),
    };

    notificationService = {
      sendNotification: jest.fn().mockResolvedValue(null),
    };

    service = new AlertService(prisma, eventBus, notificationService);
  });

  describe('createAlert', () => {
    it('should create alert and emit event', async () => {
      const result = await service.createAlert(
        tenantId,
        contractId,
        customerId,
        'rule-001',
        AlertSeverity.warning,
        65,
        'high',
        ['30 days past due'],
      );

      expect(prisma.monitoringAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            contractId,
            customerId,
            alertRuleId: 'rule-001',
            severity: AlertSeverity.warning,
            riskScore: 65,
            riskLevel: 'high',
          }),
        }),
      );

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.MONITORING_ALERT_TRIGGERED,
        tenantId,
        expect.objectContaining({
          alertId: 'alert-001',
          contractId,
          customerId,
          severity: AlertSeverity.warning,
        }),
      );

      expect(result).toEqual(mockAlert);
    });

    it('should send notification on alert creation', async () => {
      await service.createAlert(
        tenantId,
        contractId,
        customerId,
        'rule-001',
        AlertSeverity.critical,
        85,
        'critical',
        ['60 days past due'],
      );

      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          customerId,
          contractId,
          eventType: 'monitoring.alert_triggered',
        }),
      );
    });

    it('should not throw if notification fails', async () => {
      notificationService.sendNotification.mockRejectedValue(new Error('Notification error'));

      await expect(
        service.createAlert(
          tenantId,
          contractId,
          customerId,
          null,
          AlertSeverity.info,
          20,
          'low',
          ['Payment due within 3 days'],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('getAlerts', () => {
    it('should return paginated alerts for tenant', async () => {
      const result = await service.getAlerts(tenantId);

      expect(prisma.monitoringAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          take: 21,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });

    it('should filter by status', async () => {
      await service.getAlerts(tenantId, { status: AlertStatus.active });

      expect(prisma.monitoringAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: AlertStatus.active }),
        }),
      );
    });

    it('should filter by severity', async () => {
      await service.getAlerts(tenantId, { severity: AlertSeverity.critical });

      expect(prisma.monitoringAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ severity: AlertSeverity.critical }),
        }),
      );
    });

    it('should filter by contractId', async () => {
      await service.getAlerts(tenantId, { contractId });

      expect(prisma.monitoringAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ contractId }),
        }),
      );
    });

    it('should support cursor pagination', async () => {
      // encodeCursor uses base64
      const cursor = Buffer.from('some-id').toString('base64');
      await service.getAlerts(tenantId, {}, { after: cursor });

      expect(prisma.monitoringAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { gt: 'some-id' },
          }),
        }),
      );
    });

    it('should indicate hasNextPage when more items exist', async () => {
      // Return 21 items when limit is 20 (default)
      const items = Array.from({ length: 21 }, (_, i) => ({
        ...mockAlert,
        id: `alert-${i}`,
      }));
      prisma.monitoringAlert.findMany.mockResolvedValue(items);
      prisma.monitoringAlert.count.mockResolvedValue(25);

      const result = await service.getAlerts(tenantId);

      expect(result.hasNextPage).toBe(true);
      expect(result.items).toHaveLength(20);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an active alert and emit event', async () => {
      const acknowledged = {
        ...mockAlert,
        status: AlertStatus.acknowledged,
        acknowledgedBy: 'user-001',
        acknowledgedAt: new Date(),
      };
      prisma.monitoringAlert.update.mockResolvedValue(acknowledged);

      await service.acknowledgeAlert('alert-001', tenantId, 'user-001');

      expect(prisma.monitoringAlert.update).toHaveBeenCalledWith({
        where: { id: 'alert-001' },
        data: expect.objectContaining({
          status: AlertStatus.acknowledged,
          acknowledgedBy: 'user-001',
          acknowledgedAt: expect.any(Date),
        }),
      });

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.MONITORING_ALERT_ACKNOWLEDGED,
        tenantId,
        expect.objectContaining({
          alertId: 'alert-001',
          acknowledgedBy: 'user-001',
        }),
      );
    });

    it('should throw if alert not found for tenant', async () => {
      prisma.monitoringAlert.findFirst.mockResolvedValue(null);

      await expect(
        service.acknowledgeAlert('alert-999', tenantId, 'user-001'),
      ).rejects.toThrow('not found for tenant');
    });

    it('should throw if alert is not in active status', async () => {
      prisma.monitoringAlert.findFirst.mockResolvedValue({
        ...mockAlert,
        status: AlertStatus.resolved,
      });

      await expect(
        service.acknowledgeAlert('alert-001', tenantId, 'user-001'),
      ).rejects.toThrow('not in active status');
    });
  });

  describe('resolveAlert', () => {
    it('should resolve an alert', async () => {
      const resolved = {
        ...mockAlert,
        status: AlertStatus.resolved,
        resolvedAt: new Date(),
      };
      prisma.monitoringAlert.update.mockResolvedValue(resolved);

      await service.resolveAlert('alert-001', tenantId);

      expect(prisma.monitoringAlert.update).toHaveBeenCalledWith({
        where: { id: 'alert-001' },
        data: expect.objectContaining({
          status: AlertStatus.resolved,
          resolvedAt: expect.any(Date),
        }),
      });
    });

    it('should throw if alert not found', async () => {
      prisma.monitoringAlert.findFirst.mockResolvedValue(null);

      await expect(service.resolveAlert('alert-999', tenantId)).rejects.toThrow(
        'not found for tenant',
      );
    });
  });
});
