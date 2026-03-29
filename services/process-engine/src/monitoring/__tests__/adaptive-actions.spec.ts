import { AdaptiveActionsService } from '../adaptive-actions.service';
import { AdaptiveActionType, AlertSeverity } from '@lons/shared-types';
import { EventType } from '@lons/event-contracts';

describe('AdaptiveActionsService', () => {
  let service: AdaptiveActionsService;
  let prisma: any;
  let eventBus: any;

  const tenantId = 'tenant-001';
  const contractId = 'contract-001';

  beforeEach(() => {
    prisma = {
      contract: {
        findFirst: jest.fn().mockResolvedValue({
          id: contractId,
          customerId: 'customer-001',
          productId: 'product-001',
        }),
      },
      subscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sub-001',
          availableLimit: '10000.0000',
        }),
        update: jest.fn().mockResolvedValue({ id: 'sub-001', availableLimit: '0' }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'customer-001',
        }),
      },
      monitoringAlert: {
        create: jest.fn().mockResolvedValue({ id: 'alert-new' }),
      },
    };

    eventBus = {
      emitAndBuild: jest.fn(),
    };

    service = new AdaptiveActionsService(prisma, eventBus);
  });

  describe('executeAction', () => {
    it('should reject when autoExecute is explicitly false', async () => {
      const result = await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.credit_freeze,
        { autoExecute: false },
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('autoExecute is disabled');
    });
  });

  describe('credit_freeze', () => {
    it('should freeze credit by setting available limit to 0', async () => {
      const result = await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.credit_freeze,
      );

      expect(result.success).toBe(true);
      expect(result.actionType).toBe(AdaptiveActionType.credit_freeze);
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-001' },
        data: { availableLimit: '0' },
      });
    });

    it('should emit ADAPTIVE_ACTION_EXECUTED event on success', async () => {
      await service.executeAction(tenantId, contractId, AdaptiveActionType.credit_freeze);

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.ADAPTIVE_ACTION_EXECUTED,
        tenantId,
        expect.objectContaining({
          contractId,
          actionType: AdaptiveActionType.credit_freeze,
        }),
      );
    });

    it('should handle contract not found', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      const result = await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.credit_freeze,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Contract not found');
    });

    it('should handle no active subscription gracefully', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);

      const result = await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.credit_freeze,
      );

      // Should still succeed even if no subscription found
      expect(result.success).toBe(true);
    });
  });

  describe('schedule_adjustment', () => {
    it('should emit review event without auto-adjusting', async () => {
      const result = await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.schedule_adjustment,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('review event emitted');

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.CONTRACT_STATE_CHANGED,
        tenantId,
        expect.objectContaining({
          contractId,
          suggestion: 'schedule_adjustment',
        }),
      );
    });

    it('should emit ADAPTIVE_ACTION_EXECUTED event', async () => {
      await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.schedule_adjustment,
      );

      // Should have two calls: one for CONTRACT_STATE_CHANGED and one for ADAPTIVE_ACTION_EXECUTED
      expect(eventBus.emitAndBuild).toHaveBeenCalledTimes(2);
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.ADAPTIVE_ACTION_EXECUTED,
        tenantId,
        expect.objectContaining({ actionType: AdaptiveActionType.schedule_adjustment }),
      );
    });
  });

  describe('early_warning', () => {
    it('should create a low-severity info alert', async () => {
      const result = await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.early_warning,
      );

      expect(result.success).toBe(true);
      expect(prisma.monitoringAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          contractId,
          severity: AlertSeverity.info,
          riskLevel: 'low',
          actionTaken: 'early_warning',
        }),
      });
    });

    it('should handle contract not found', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      const result = await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.early_warning,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Contract not found');
    });

    it('should emit ADAPTIVE_ACTION_EXECUTED event', async () => {
      await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.early_warning,
      );

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.ADAPTIVE_ACTION_EXECUTED,
        tenantId,
        expect.objectContaining({ actionType: AdaptiveActionType.early_warning }),
      );
    });
  });

  describe('recovery_escalation', () => {
    it('should emit recovery strategy recommended event', async () => {
      const result = await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.recovery_escalation,
      );

      expect(result.success).toBe(true);
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.RECOVERY_STRATEGY_RECOMMENDED,
        tenantId,
        expect.objectContaining({
          contractId,
          escalationType: 'recovery_escalation',
        }),
      );
    });

    it('should emit ADAPTIVE_ACTION_EXECUTED event', async () => {
      await service.executeAction(
        tenantId,
        contractId,
        AdaptiveActionType.recovery_escalation,
      );

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.ADAPTIVE_ACTION_EXECUTED,
        tenantId,
        expect.objectContaining({ actionType: AdaptiveActionType.recovery_escalation }),
      );
    });
  });
});
