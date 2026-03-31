import { Test } from '@nestjs/testing';
import { AlertRulesService } from '../alert-rules.service';
import { RiskIndicator } from '../monitoring.service';
import { AlertSeverity, AdaptiveActionType } from '@lons/shared-types';

describe('AlertRulesService', () => {
  let service: AlertRulesService;
  let prisma: any;

  const tenantId = 'tenant-001';
  const contractId = 'contract-001';

  const mockAlertRule = {
    id: 'rule-001',
    tenantId,
    productId: null,
    riskTier: null,
    name: 'High Risk Score',
    description: 'Alert when risk score exceeds threshold',
    conditionType: 'score_threshold',
    conditionConfig: { threshold: 50, operator: 'gte' },
    severity: AlertSeverity.warning,
    actionType: null,
    actionConfig: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      alertRule: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      contract: {
        findFirst: jest.fn(),
      },
    };

    await Test.createTestingModule({
      providers: [
        AlertRulesService,
        { provide: 'PrismaService', useValue: prisma },
      ],
    })
      .overrideProvider('PrismaService')
      .useValue(prisma)
      .compile();

    // Manually instantiate to inject our mock
    service = new AlertRulesService(prisma);
  });

  describe('create', () => {
    it('should create an alert rule with tenant isolation', async () => {
      prisma.alertRule.create.mockResolvedValue(mockAlertRule);

      const result = await service.create(tenantId, {
        name: 'High Risk Score',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 50, operator: 'gte' },
      });

      expect(prisma.alertRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            name: 'High Risk Score',
            conditionType: 'score_threshold',
          }),
        }),
      );
      expect(result).toEqual(mockAlertRule);
    });

    it('should set default severity to warning', async () => {
      prisma.alertRule.create.mockResolvedValue(mockAlertRule);

      await service.create(tenantId, {
        name: 'Test Rule',
        conditionType: 'dpd_threshold',
        conditionConfig: { threshold: 30 },
      });

      expect(prisma.alertRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: AlertSeverity.warning,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('should update an alert rule for the correct tenant', async () => {
      prisma.alertRule.findFirst.mockResolvedValue(mockAlertRule);
      prisma.alertRule.update.mockResolvedValue({ ...mockAlertRule, name: 'Updated Rule' });

      const result = await service.update('rule-001', tenantId, { name: 'Updated Rule' });

      expect(prisma.alertRule.findFirst).toHaveBeenCalledWith({
        where: { id: 'rule-001', tenantId, deletedAt: null },
      });
      expect(result.name).toBe('Updated Rule');
    });

    it('should throw if rule not found for tenant', async () => {
      prisma.alertRule.findFirst.mockResolvedValue(null);

      await expect(service.update('rule-999', tenantId, { name: 'X' })).rejects.toThrow(
        'AlertRule rule-999 not found for tenant',
      );
    });

    it('should enforce tenant isolation on update', async () => {
      prisma.alertRule.findFirst.mockResolvedValue(null);

      await expect(
        service.update('rule-001', 'other-tenant', { name: 'Hack' }),
      ).rejects.toThrow('not found for tenant');
    });
  });

  describe('softDelete', () => {
    it('should soft delete by setting deletedAt and isActive=false', async () => {
      prisma.alertRule.findFirst.mockResolvedValue(mockAlertRule);
      prisma.alertRule.update.mockResolvedValue({
        ...mockAlertRule,
        deletedAt: new Date(),
        isActive: false,
      });

      const result = await service.softDelete('rule-001', tenantId);

      expect(prisma.alertRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-001' },
        data: expect.objectContaining({
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      });
      expect(result.isActive).toBe(false);
    });

    it('should throw if rule not found', async () => {
      prisma.alertRule.findFirst.mockResolvedValue(null);

      await expect(service.softDelete('rule-999', tenantId)).rejects.toThrow(
        'not found for tenant',
      );
    });
  });

  describe('findByTenant', () => {
    it('should return rules for tenant excluding deleted', async () => {
      prisma.alertRule.findMany.mockResolvedValue([mockAlertRule]);

      const result = await service.findByTenant(tenantId);

      expect(prisma.alertRule.findMany).toHaveBeenCalledWith({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should filter by productId when provided', async () => {
      prisma.alertRule.findMany.mockResolvedValue([]);

      await service.findByTenant(tenantId, 'product-001');

      expect(prisma.alertRule.findMany).toHaveBeenCalledWith({
        where: { tenantId, deletedAt: null, productId: 'product-001' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('evaluateRules', () => {
    const highRisk: RiskIndicator = {
      contractId,
      riskLevel: 'high',
      score: 65,
      factors: ['30 days past due', 'Less than 10% of total cost paid'],
    };

    beforeEach(() => {
      prisma.contract.findFirst.mockResolvedValue({ productId: 'product-001' });
    });

    it('should trigger score_threshold rule when score exceeds threshold', async () => {
      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          conditionType: 'score_threshold',
          conditionConfig: { threshold: 50, operator: 'gte' },
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, highRisk);

      expect(result).toHaveLength(1);
      expect(result[0].alertRuleId).toBe('rule-001');
      expect(result[0].conditionType).toBe('score_threshold');
    });

    it('should not trigger score_threshold when score is below threshold', async () => {
      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          conditionType: 'score_threshold',
          conditionConfig: { threshold: 80, operator: 'gte' },
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, highRisk);

      expect(result).toHaveLength(0);
    });

    it('should trigger dpd_threshold rule', async () => {
      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          conditionType: 'dpd_threshold',
          conditionConfig: { threshold: 15 },
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, highRisk);

      expect(result).toHaveLength(1);
    });

    it('should not trigger dpd_threshold when DPD is below threshold', async () => {
      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          conditionType: 'dpd_threshold',
          conditionConfig: { threshold: 60 },
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, highRisk);

      expect(result).toHaveLength(0);
    });

    it('should trigger risk_level_change rule for high level', async () => {
      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          conditionType: 'risk_level_change',
          conditionConfig: { targetLevel: 'high' },
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, highRisk);

      expect(result).toHaveLength(1);
    });

    it('should trigger wallet_balance_threshold when factor present', async () => {
      const riskWithWallet: RiskIndicator = {
        contractId,
        riskLevel: 'medium',
        score: 35,
        factors: ['Wallet balance below repayment threshold'],
      };

      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          conditionType: 'wallet_balance_threshold',
          conditionConfig: {},
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, riskWithWallet);

      expect(result).toHaveLength(1);
    });

    it('should trigger income_deposit_stopped when factor present', async () => {
      const riskWithIncome: RiskIndicator = {
        contractId,
        riskLevel: 'medium',
        score: 40,
        factors: ['Income deposit stopped for 14 days'],
      };

      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          conditionType: 'income_deposit_stopped',
          conditionConfig: {},
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, riskWithIncome);

      expect(result).toHaveLength(1);
    });

    it('should trigger spending_pattern_change when factor present', async () => {
      const riskWithSpending: RiskIndicator = {
        contractId,
        riskLevel: 'medium',
        score: 30,
        factors: ['Spending pattern change detected'],
      };

      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          conditionType: 'spending_pattern_change',
          conditionConfig: {},
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, riskWithSpending);

      expect(result).toHaveLength(1);
    });

    it('should include action type and config from triggered rule', async () => {
      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          conditionType: 'score_threshold',
          conditionConfig: { threshold: 50 },
          actionType: AdaptiveActionType.credit_freeze,
          actionConfig: { autoExecute: true },
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, highRisk);

      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe(AdaptiveActionType.credit_freeze);
      expect(result[0].actionConfig).toEqual({ autoExecute: true });
    });

    it('should evaluate multiple rules and return all triggered', async () => {
      prisma.alertRule.findMany.mockResolvedValue([
        {
          ...mockAlertRule,
          id: 'rule-001',
          conditionType: 'score_threshold',
          conditionConfig: { threshold: 50 },
        },
        {
          ...mockAlertRule,
          id: 'rule-002',
          conditionType: 'dpd_threshold',
          conditionConfig: { threshold: 15 },
        },
        {
          ...mockAlertRule,
          id: 'rule-003',
          conditionType: 'score_threshold',
          conditionConfig: { threshold: 90 }, // Should NOT trigger
        },
      ]);

      const result = await service.evaluateRules(tenantId, contractId, highRisk);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.alertRuleId)).toEqual(['rule-001', 'rule-002']);
    });
  });
});
