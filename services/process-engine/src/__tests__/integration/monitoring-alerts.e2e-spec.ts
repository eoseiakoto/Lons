/**
 * Monitoring Alerts E2E Integration Test
 *
 * Tests the full monitoring workflow:
 * - Alert rule CRUD for a tenant
 * - Contract risk assessment
 * - Rule evaluation against risk indicators
 * - Alert generation when rule conditions met
 * - Adaptive action triggering (e.g., credit_freeze)
 * - Alert acknowledgement and status changes
 * - Event emission at each step
 */
import { MonitoringService, RiskIndicator } from '../../monitoring/monitoring.service';
import { AlertRulesService, TriggeredAlert } from '../../monitoring/alert-rules.service';
import { AlertService } from '../../monitoring/alert.service';
import { AdaptiveActionsService } from '../../monitoring/adaptive-actions.service';

const TENANT_ID = 'tenant-monitor-e2e';
const CONTRACT_ID = 'contract-monitor-e2e-001';
const CUSTOMER_ID = 'customer-monitor-e2e-001';
const PRODUCT_ID = 'product-monitor-e2e-001';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function makeContractMock(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTRACT_ID,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    contractNumber: 'CTR-E2E-001',
    daysPastDue: 45,
    totalOutstanding: '8000.0000',
    principalAmount: '7000.0000',
    totalPaid: '2000.0000',
    totalCostCredit: '9000.0000',
    emiAmount: '1500.0000',
    status: 'overdue',
    classification: 'substandard',
    repaymentSchedule: [
      { dueDate: new Date(Date.now() - 86400000 * 10), status: 'overdue' },
    ],
    ...overrides,
  };
}

function makeMockPrisma() {
  const alertRules: any[] = [];
  const alerts: any[] = [];
  let ruleIdCounter = 1;
  let alertIdCounter = 1;

  return {
    contract: {
      findFirst: jest.fn().mockResolvedValue(makeContractMock()),
      findFirstOrThrow: jest.fn().mockResolvedValue(makeContractMock()),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue({ id: CUSTOMER_ID, metadata: null }),
    },
    alertRule: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const rule = {
          id: `alert-rule-${ruleIdCounter++}`,
          ...data,
          isActive: data.isActive ?? true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        alertRules.push(rule);
        return rule;
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        return alertRules.find(
          (r) => r.id === where.id && r.tenantId === where.tenantId && !r.deletedAt,
        ) ?? null;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }: any) => {
        return alertRules.filter(
          (r) =>
            r.tenantId === where?.tenantId &&
            r.isActive !== false &&
            !r.deletedAt,
        );
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => {
        const idx = alertRules.findIndex((r) => r.id === where.id);
        if (idx >= 0) {
          alertRules[idx] = { ...alertRules[idx], ...data, updatedAt: new Date() };
          return alertRules[idx];
        }
        return null;
      }),
    },
    monitoringAlert: {
      create: jest.fn().mockImplementation(async ({ data, include }: any) => {
        const alert = {
          id: `alert-${alertIdCounter++}`,
          ...data,
          status: data.status ?? 'active',
          createdAt: new Date(),
          contract: include?.contract ? { contractNumber: 'CTR-E2E-001' } : undefined,
          customer: include?.customer ? { id: CUSTOMER_ID } : undefined,
          alertRule: include?.alertRule ? { name: 'Test Rule' } : undefined,
        };
        alerts.push(alert);
        return alert;
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        return alerts.find(
          (a) => a.id === where.id && a.tenantId === where.tenantId,
        ) ?? null;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }: any) => {
        return alerts.filter((a) => a.tenantId === where?.tenantId);
      }),
      count: jest.fn().mockImplementation(async ({ where }: any) => {
        return alerts.filter((a) => a.tenantId === where?.tenantId).length;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => {
        const idx = alerts.findIndex((a) => a.id === where.id);
        if (idx >= 0) {
          alerts[idx] = { ...alerts[idx], ...data };
          return alerts[idx];
        }
        return null;
      }),
    },
    subscription: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'sub-001',
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        productId: PRODUCT_ID,
        status: 'active',
        availableLimit: '10000.0000',
      }),
      update: jest.fn().mockResolvedValue({ id: 'sub-001', availableLimit: '0' }),
    },
    repaymentSchedule: {
      count: jest.fn().mockResolvedValue(2),
    },
    _alertRules: alertRules,
    _alerts: alerts,
  };
}

function makeMockEventBus() {
  const emittedEvents: Array<{ event: string; tenantId: string; data: unknown }> = [];
  return {
    emitAndBuild: jest.fn().mockImplementation((event, tenantId, data) => {
      emittedEvents.push({ event, tenantId, data });
    }),
    _emittedEvents: emittedEvents,
  };
}

function makeMockNotificationService() {
  return {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Monitoring Alerts E2E Integration', () => {
  let mockPrisma: ReturnType<typeof makeMockPrisma>;
  let mockEventBus: ReturnType<typeof makeMockEventBus>;
  let mockNotification: ReturnType<typeof makeMockNotificationService>;
  let monitoringService: MonitoringService;
  let alertRulesService: AlertRulesService;
  let alertService: AlertService;
  let adaptiveActionsService: AdaptiveActionsService;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    mockEventBus = makeMockEventBus();
    mockNotification = makeMockNotificationService();
    monitoringService = new MonitoringService(mockPrisma as any);
    alertRulesService = new AlertRulesService(mockPrisma as any);
    alertService = new AlertService(mockPrisma as any, mockEventBus as any, mockNotification as any);
    adaptiveActionsService = new AdaptiveActionsService(mockPrisma as any, mockEventBus as any);
  });

  // -----------------------------------------------------------------------
  // 1. Alert Rule CRUD
  // -----------------------------------------------------------------------

  describe('Alert Rule Management', () => {
    it('should create an alert rule for a tenant', async () => {
      const rule = await alertRulesService.create(TENANT_ID, {
        name: 'High Risk Score Alert',
        description: 'Trigger when risk score >= 50',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 50, operator: 'gte' },
        severity: 'warning' as any,
        actionType: 'credit_freeze' as any,
        actionConfig: { autoExecute: true },
      });

      expect(rule.id).toBeDefined();
      expect(rule.tenantId).toBe(TENANT_ID);
      expect(rule.name).toBe('High Risk Score Alert');
      expect(rule.conditionType).toBe('score_threshold');
      expect(rule.isActive).toBe(true);
    });

    it('should create a DPD threshold rule', async () => {
      const rule = await alertRulesService.create(TENANT_ID, {
        name: 'DPD 30+ Alert',
        conditionType: 'dpd_threshold',
        conditionConfig: { threshold: 30 },
        severity: 'critical' as any,
        actionType: 'recovery_escalation' as any,
      });

      expect(rule.conditionType).toBe('dpd_threshold');
    });

    it('should list rules for a tenant', async () => {
      await alertRulesService.create(TENANT_ID, {
        name: 'Rule 1',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 40 },
      });
      await alertRulesService.create(TENANT_ID, {
        name: 'Rule 2',
        conditionType: 'risk_level_change',
        conditionConfig: { targetLevel: 'critical' },
      });

      const rules = await alertRulesService.findByTenant(TENANT_ID);
      expect(rules.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Contract Risk Assessment
  // -----------------------------------------------------------------------

  describe('Contract Risk Assessment', () => {
    it('should assess risk for an at-risk contract', async () => {
      const risk = await monitoringService.assessContractRisk(TENANT_ID, CONTRACT_ID);

      expect(risk.contractId).toBe(CONTRACT_ID);
      expect(risk.riskLevel).toBeDefined();
      expect(['low', 'medium', 'high', 'critical']).toContain(risk.riskLevel);
      expect(risk.score).toBeGreaterThanOrEqual(0);
      expect(risk.score).toBeLessThanOrEqual(100);
      expect(risk.factors.length).toBeGreaterThan(0);
    });

    it('should return high or critical for 45 DPD overdue contract', async () => {
      const risk = await monitoringService.assessContractRisk(TENANT_ID, CONTRACT_ID);

      // 45 DPD * 0.8 = 36 points + substandard classification = 10 points + overdue payment = 15
      // = 61 at minimum, so should be high or critical
      expect(['high', 'critical']).toContain(risk.riskLevel);
      expect(risk.score).toBeGreaterThanOrEqual(50);
    });

    it('should include DPD factor in risk factors', async () => {
      const risk = await monitoringService.assessContractRisk(TENANT_ID, CONTRACT_ID);
      const dpdFactor = risk.factors.find((f) => f.includes('days past due'));
      expect(dpdFactor).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Rule Evaluation
  // -----------------------------------------------------------------------

  describe('Rule Evaluation', () => {
    it('should trigger score_threshold rule when risk score exceeds threshold', async () => {
      // Create a rule with threshold 40
      await alertRulesService.create(TENANT_ID, {
        name: 'Score Threshold Test',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 40, operator: 'gte' },
        severity: 'warning' as any,
        actionType: 'credit_freeze' as any,
        actionConfig: { autoExecute: true },
      });

      const riskIndicator: RiskIndicator = {
        contractId: CONTRACT_ID,
        riskLevel: 'high',
        score: 65,
        factors: ['45 days past due', 'Substandard classification', 'Payment is overdue'],
      };

      const triggered = await alertRulesService.evaluateRules(TENANT_ID, CONTRACT_ID, riskIndicator);
      expect(triggered.length).toBeGreaterThanOrEqual(1);

      const scoreAlert = triggered.find((t) => t.conditionType === 'score_threshold');
      expect(scoreAlert).toBeDefined();
      expect(scoreAlert!.ruleName).toBe('Score Threshold Test');
    });

    it('should trigger dpd_threshold rule', async () => {
      await alertRulesService.create(TENANT_ID, {
        name: 'DPD Threshold Test',
        conditionType: 'dpd_threshold',
        conditionConfig: { threshold: 30 },
        severity: 'critical' as any,
      });

      const riskIndicator: RiskIndicator = {
        contractId: CONTRACT_ID,
        riskLevel: 'high',
        score: 60,
        factors: ['45 days past due', 'Payment is overdue'],
      };

      const triggered = await alertRulesService.evaluateRules(TENANT_ID, CONTRACT_ID, riskIndicator);
      const dpdAlert = triggered.find((t) => t.conditionType === 'dpd_threshold');
      expect(dpdAlert).toBeDefined();
    });

    it('should trigger risk_level_change rule for critical level', async () => {
      await alertRulesService.create(TENANT_ID, {
        name: 'Critical Level Alert',
        conditionType: 'risk_level_change',
        conditionConfig: { targetLevel: 'critical' },
        severity: 'critical' as any,
      });

      const riskIndicator: RiskIndicator = {
        contractId: CONTRACT_ID,
        riskLevel: 'critical',
        score: 80,
        factors: ['90 days past due', 'Loss classification'],
      };

      const triggered = await alertRulesService.evaluateRules(TENANT_ID, CONTRACT_ID, riskIndicator);
      const levelAlert = triggered.find((t) => t.conditionType === 'risk_level_change');
      expect(levelAlert).toBeDefined();
    });

    it('should NOT trigger when conditions are not met', async () => {
      // Only create a high-threshold rule
      mockPrisma._alertRules.length = 0; // Reset
      await alertRulesService.create(TENANT_ID, {
        name: 'Very High Threshold',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 95, operator: 'gte' },
        severity: 'critical' as any,
      });

      const riskIndicator: RiskIndicator = {
        contractId: CONTRACT_ID,
        riskLevel: 'medium',
        score: 30,
        factors: ['5 days past due'],
      };

      const triggered = await alertRulesService.evaluateRules(TENANT_ID, CONTRACT_ID, riskIndicator);
      const scoreAlerts = triggered.filter((t) => t.conditionType === 'score_threshold');
      expect(scoreAlerts.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Alert Generation and Events
  // -----------------------------------------------------------------------

  describe('Alert Generation', () => {
    it('should create an alert when rules trigger', async () => {
      const alert = await alertService.createAlert(
        TENANT_ID,
        CONTRACT_ID,
        CUSTOMER_ID,
        'rule-001',
        'warning' as any,
        65,
        'high',
        ['45 days past due', 'Substandard classification'],
      );

      expect(alert.id).toBeDefined();
      expect(alert.tenantId).toBe(TENANT_ID);
      expect(alert.contractId).toBe(CONTRACT_ID);
      expect(alert.customerId).toBe(CUSTOMER_ID);
      expect(alert.riskScore).toBe(65);
      expect(alert.riskLevel).toBe('high');
    });

    it('should emit MONITORING_ALERT_TRIGGERED event', async () => {
      await alertService.createAlert(
        TENANT_ID,
        CONTRACT_ID,
        CUSTOMER_ID,
        'rule-001',
        'warning' as any,
        65,
        'high',
        ['45 days past due'],
      );

      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'monitoring.alert_triggered',
        TENANT_ID,
        expect.objectContaining({
          contractId: CONTRACT_ID,
          customerId: CUSTOMER_ID,
          severity: 'warning',
          riskScore: 65,
          riskLevel: 'high',
        }),
      );
    });

    it('should attempt to send notification', async () => {
      await alertService.createAlert(
        TENANT_ID,
        CONTRACT_ID,
        CUSTOMER_ID,
        null,
        'critical' as any,
        85,
        'critical',
        ['90 days past due'],
      );

      expect(mockNotification.sendNotification).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          customerId: CUSTOMER_ID,
          contractId: CONTRACT_ID,
          eventType: 'monitoring.alert_triggered',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 5. Adaptive Actions
  // -----------------------------------------------------------------------

  describe('Adaptive Actions', () => {
    it('should execute credit_freeze action', async () => {
      const result = await adaptiveActionsService.executeAction(
        TENANT_ID,
        CONTRACT_ID,
        'credit_freeze' as any,
      );

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('credit_freeze');
      expect(result.contractId).toBe(CONTRACT_ID);
      expect(result.message).toContain('frozen');
    });

    it('should emit ADAPTIVE_ACTION_EXECUTED event for credit_freeze', async () => {
      await adaptiveActionsService.executeAction(
        TENANT_ID,
        CONTRACT_ID,
        'credit_freeze' as any,
      );

      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'monitoring.adaptive_action_executed',
        TENANT_ID,
        expect.objectContaining({
          contractId: CONTRACT_ID,
          actionType: 'credit_freeze',
        }),
      );
    });

    it('should execute schedule_adjustment action', async () => {
      const result = await adaptiveActionsService.executeAction(
        TENANT_ID,
        CONTRACT_ID,
        'schedule_adjustment' as any,
      );

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('schedule_adjustment');
    });

    it('should execute early_warning action', async () => {
      const result = await adaptiveActionsService.executeAction(
        TENANT_ID,
        CONTRACT_ID,
        'early_warning' as any,
      );

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('early_warning');
    });

    it('should execute recovery_escalation action', async () => {
      const result = await adaptiveActionsService.executeAction(
        TENANT_ID,
        CONTRACT_ID,
        'recovery_escalation' as any,
      );

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('recovery_escalation');
    });

    it('should not auto-execute when autoExecute is disabled', async () => {
      const result = await adaptiveActionsService.executeAction(
        TENANT_ID,
        CONTRACT_ID,
        'credit_freeze' as any,
        { autoExecute: false },
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not authorized');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Alert Acknowledgement
  // -----------------------------------------------------------------------

  describe('Alert Lifecycle', () => {
    it('should acknowledge an alert and verify status change', async () => {
      // Create an alert
      const alert = await alertService.createAlert(
        TENANT_ID,
        CONTRACT_ID,
        CUSTOMER_ID,
        null,
        'warning' as any,
        65,
        'high',
        ['45 days past due'],
      );

      // Acknowledge it
      const acknowledged = await alertService.acknowledgeAlert(
        alert.id,
        TENANT_ID,
        'admin-user-001',
      );

      expect(acknowledged.status).toBe('acknowledged');
      expect(acknowledged.acknowledgedBy).toBe('admin-user-001');
      expect(acknowledged.acknowledgedAt).toBeDefined();
    });

    it('should emit MONITORING_ALERT_ACKNOWLEDGED event', async () => {
      const alert = await alertService.createAlert(
        TENANT_ID,
        CONTRACT_ID,
        CUSTOMER_ID,
        null,
        'warning' as any,
        50,
        'high',
        ['30 days past due'],
      );

      await alertService.acknowledgeAlert(alert.id, TENANT_ID, 'admin-001');

      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'monitoring.alert_acknowledged',
        TENANT_ID,
        expect.objectContaining({
          alertId: alert.id,
          acknowledgedBy: 'admin-001',
        }),
      );
    });

    it('should resolve an alert', async () => {
      const alert = await alertService.createAlert(
        TENANT_ID,
        CONTRACT_ID,
        CUSTOMER_ID,
        null,
        'info' as any,
        20,
        'low',
        [],
      );

      // Acknowledge first
      await alertService.acknowledgeAlert(alert.id, TENANT_ID, 'admin-001');

      // Resolve
      const resolved = await alertService.resolveAlert(alert.id, TENANT_ID);
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedAt).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Full Monitoring Workflow
  // -----------------------------------------------------------------------

  describe('Full Monitoring Workflow', () => {
    it('should assess risk -> evaluate rules -> create alert -> trigger action -> acknowledge', async () => {
      // Step 1: Create alert rule
      const rule = await alertRulesService.create(TENANT_ID, {
        name: 'Full Workflow Rule',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 40, operator: 'gte' },
        severity: 'warning' as any,
        actionType: 'credit_freeze' as any,
        actionConfig: { autoExecute: true },
      });

      // Step 2: Assess contract risk
      const risk = await monitoringService.assessContractRisk(TENANT_ID, CONTRACT_ID);
      expect(risk.score).toBeGreaterThanOrEqual(40); // 45 DPD should exceed 40

      // Step 3: Evaluate rules
      const triggered = await alertRulesService.evaluateRules(TENANT_ID, CONTRACT_ID, risk);
      expect(triggered.length).toBeGreaterThanOrEqual(1);

      // Step 4: Create alert for triggered rule
      const triggeredRule = triggered[0];
      const alert = await alertService.createAlert(
        TENANT_ID,
        CONTRACT_ID,
        CUSTOMER_ID,
        triggeredRule.alertRuleId,
        triggeredRule.severity,
        risk.score,
        risk.riskLevel,
        risk.factors,
      );
      expect(alert.id).toBeDefined();

      // Step 5: Execute adaptive action if configured
      if (triggeredRule.actionType) {
        const actionResult = await adaptiveActionsService.executeAction(
          TENANT_ID,
          CONTRACT_ID,
          triggeredRule.actionType as any,
          triggeredRule.actionConfig,
        );
        expect(actionResult.success).toBe(true);
      }

      // Step 6: Acknowledge
      const acked = await alertService.acknowledgeAlert(alert.id, TENANT_ID, 'system');
      expect(acked.status).toBe('acknowledged');

      // Verify events were emitted at each step
      const eventTypes = mockEventBus._emittedEvents.map((e) => e.event);
      expect(eventTypes).toContain('monitoring.alert_triggered');
      expect(eventTypes).toContain('monitoring.adaptive_action_executed');
      expect(eventTypes).toContain('monitoring.alert_acknowledged');
    });
  });

  // -----------------------------------------------------------------------
  // 8. Tenant Isolation
  // -----------------------------------------------------------------------

  describe('Tenant Isolation', () => {
    it('should not return rules from another tenant', async () => {
      await alertRulesService.create(TENANT_ID, {
        name: 'Tenant A Rule',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 50 },
      });

      // Query with different tenant
      const otherRules = await alertRulesService.findByTenant('other-tenant');
      const tenantARules = otherRules.filter((r: any) => r.name === 'Tenant A Rule');
      expect(tenantARules.length).toBe(0);
    });
  });
});
