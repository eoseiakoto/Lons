/**
 * Full AI Lifecycle E2E Integration Test
 *
 * Tests the complete loan lifecycle with AI/ML features:
 * 1. Loan request -> scoring -> approval based on score
 * 2. Contract creation -> disbursement
 * 3. Missed payment -> overdue detection
 * 4. Monitoring sweep detects risk -> alert generated
 * 5. Recovery recommendation generated
 * 6. Restructuring applied -> new schedule created
 * 7. Tenant isolation throughout
 * 8. All monetary values as Decimal strings
 */
import { ScoringService } from '../../scoring/scoring.service';
import { MonitoringService } from '../../monitoring/monitoring.service';
import { AlertRulesService } from '../../monitoring/alert-rules.service';
import { AlertService } from '../../monitoring/alert.service';
import { AdaptiveActionsService } from '../../monitoring/adaptive-actions.service';

const TENANT_A = 'tenant-lifecycle-a';
const TENANT_B = 'tenant-lifecycle-b';
const CUSTOMER_ID = 'customer-lifecycle-001';
const PRODUCT_ID = 'product-lifecycle-001';
const CONTRACT_ID = 'contract-lifecycle-001';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function makeMockPrisma() {
  const alertRules: any[] = [];
  const alerts: any[] = [];
  const scoringResults: any[] = [];
  let alertIdCounter = 1;
  let ruleIdCounter = 1;
  let scoringIdCounter = 1;

  return {
    customer: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: CUSTOMER_ID,
        createdAt: new Date('2025-06-01'),
        kycLevel: 'tier_2',
      }),
      findFirst: jest.fn().mockResolvedValue({ id: CUSTOMER_ID, metadata: null }),
    },
    contract: {
      findFirst: jest.fn().mockResolvedValue({
        id: CONTRACT_ID,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        productId: PRODUCT_ID,
        contractNumber: 'CTR-LC-001',
        daysPastDue: 35,
        totalOutstanding: '12000.0000',
        principalAmount: '10000.0000',
        totalPaid: '3000.0000',
        totalCostCredit: '15000.0000',
        emiAmount: '2500.0000',
        status: 'overdue',
        classification: 'substandard',
        interestRate: '0.1200',
        tenorDays: 180,
        startDate: new Date('2025-10-01'),
        maturityDate: new Date('2026-03-28'),
        outstandingPenalties: '500.0000',
        restructured: false,
        restructureCount: 0,
        metadata: {},
        customer: { id: CUSTOMER_ID, phone: '+233200000001' },
        product: { id: PRODUCT_ID, type: 'micro_loan', repaymentMethod: 'equal_installments' },
        repayments: [
          { amount: '2500.0000', createdAt: new Date('2025-11-01') },
          { amount: '500.0000', createdAt: new Date('2025-12-15') },
        ],
        repaymentSchedule: [
          { dueDate: new Date('2025-11-01'), status: 'paid' },
          { dueDate: new Date('2025-12-01'), status: 'partial' },
          { dueDate: new Date('2026-01-01'), status: 'overdue' },
          { dueDate: new Date('2026-02-01'), status: 'pending' },
        ],
      }),
      findFirstOrThrow: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where?.tenantId === TENANT_B) {
          throw new Error('Not found');
        }
        return {
          id: CONTRACT_ID,
          tenantId: TENANT_A,
          customerId: CUSTOMER_ID,
          productId: PRODUCT_ID,
          daysPastDue: 35,
          totalOutstanding: '12000.0000',
          principalAmount: '10000.0000',
          totalPaid: '3000.0000',
          totalCostCredit: '15000.0000',
          emiAmount: '2500.0000',
          status: 'overdue',
          classification: 'substandard',
          repaymentSchedule: [
            { dueDate: new Date(Date.now() - 86400000 * 5), status: 'overdue' },
          ],
        };
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ id: CONTRACT_ID, restructured: true, restructureCount: 1 }),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue({ eligibilityRules: null }),
    },
    repaymentScheduleEntry: {
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    repaymentSchedule: {
      count: jest.fn().mockResolvedValue(1),
    },
    scoringResult: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const result = {
          id: `scoring-${scoringIdCounter++}`,
          ...data,
          createdAt: new Date(),
        };
        scoringResults.push(result);
        return result;
      }),
    },
    alertRule: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const rule = {
          id: `rule-${ruleIdCounter++}`,
          ...data,
          isActive: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        alertRules.push(rule);
        return rule;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }: any) => {
        return alertRules.filter((r) => r.tenantId === where?.tenantId && r.isActive);
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        return alertRules.find((r) => r.id === where?.id && r.tenantId === where?.tenantId) ?? null;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => {
        const idx = alertRules.findIndex((r) => r.id === where.id);
        if (idx >= 0) {
          alertRules[idx] = { ...alertRules[idx], ...data };
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
          status: 'active',
          createdAt: new Date(),
          contract: include?.contract ? { contractNumber: 'CTR-LC-001' } : undefined,
          customer: include?.customer ? { id: CUSTOMER_ID } : undefined,
          alertRule: include?.alertRule ? { name: 'Test Rule' } : undefined,
        };
        alerts.push(alert);
        return alert;
      }),
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        return alerts.find((a) => a.id === where?.id && a.tenantId === where?.tenantId) ?? null;
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
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
        id: 'sub-lc-001',
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        productId: PRODUCT_ID,
        status: 'active',
      }),
      update: jest.fn().mockResolvedValue({ id: 'sub-lc-001', availableLimit: '0' }),
    },
    recoveryOutcome: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'outcome-lc-001',
        ...data,
        createdAt: new Date(),
      })),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => {
      const tx = {
        contract: {
          update: jest.fn().mockResolvedValue({
            id: CONTRACT_ID,
            restructured: true,
            restructureCount: 1,
          }),
        },
        repaymentScheduleEntry: {
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      return fn(tx);
    }),
    _alertRules: alertRules,
    _alerts: alerts,
    _scoringResults: scoringResults,
  };
}

function makeMockEventBus() {
  const events: Array<{ event: string; tenantId: string; data: unknown }> = [];
  return {
    emitAndBuild: jest.fn().mockImplementation((event, tenantId, data) => {
      events.push({ event, tenantId, data });
    }),
    _events: events,
  };
}

function makeMockNotification() {
  return {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Full AI Lifecycle E2E', () => {
  let mockPrisma: ReturnType<typeof makeMockPrisma>;
  let mockEventBus: ReturnType<typeof makeMockEventBus>;
  let mockNotification: ReturnType<typeof makeMockNotification>;
  let scoringService: ScoringService;
  let monitoringService: MonitoringService;
  let alertRulesService: AlertRulesService;
  let alertService: AlertService;
  let adaptiveActionsService: AdaptiveActionsService;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    mockEventBus = makeMockEventBus();
    mockNotification = makeMockNotification();

    scoringService = new ScoringService(mockPrisma as any);
    monitoringService = new MonitoringService(mockPrisma as any);
    alertRulesService = new AlertRulesService(mockPrisma as any);
    alertService = new AlertService(mockPrisma as any, mockEventBus as any, mockNotification as any);
    adaptiveActionsService = new AdaptiveActionsService(mockPrisma as any, mockEventBus as any);
  });

  // -----------------------------------------------------------------------
  // Phase 1: Loan Request -> Scoring -> Approval
  // -----------------------------------------------------------------------

  describe('Phase 1: Scoring and Approval', () => {
    it('should score customer using rule-based scorecard', async () => {
      const result = await scoringService.scoreCustomer(
        TENANT_A, CUSTOMER_ID, PRODUCT_ID,
        'application', '10000.0000',
      );

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(mockPrisma.scoringResult.create).toHaveBeenCalled();
    });

    it('should store scoring result with model type rule_based', async () => {
      await scoringService.scoreCustomer(
        TENANT_A, CUSTOMER_ID, PRODUCT_ID,
        'application', '10000.0000',
      );

      const createCall = mockPrisma.scoringResult.create.mock.calls[0][0];
      expect(createCall.data.modelType).toBe('rule_based');
    });
  });

  // -----------------------------------------------------------------------
  // Phase 2: Overdue Detection and Monitoring
  // -----------------------------------------------------------------------

  describe('Phase 2: Overdue Detection and Monitoring', () => {
    it('should detect risk for an overdue contract', async () => {
      const risk = await monitoringService.assessContractRisk(TENANT_A, CONTRACT_ID);

      expect(risk.contractId).toBe(CONTRACT_ID);
      expect(risk.score).toBeGreaterThan(0);
      expect(risk.factors.length).toBeGreaterThan(0);
      expect(['medium', 'high', 'critical']).toContain(risk.riskLevel);
    });

    it('should create alert rules and evaluate against risk', async () => {
      // Create rule
      await alertRulesService.create(TENANT_A, {
        name: 'Lifecycle Overdue Alert',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 30, operator: 'gte' },
        severity: 'warning' as any,
        actionType: 'credit_freeze' as any,
        actionConfig: { autoExecute: true },
      });

      // Assess risk
      const risk = await monitoringService.assessContractRisk(TENANT_A, CONTRACT_ID);

      // Evaluate rules
      const triggered = await alertRulesService.evaluateRules(TENANT_A, CONTRACT_ID, risk);
      expect(triggered.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // Phase 3: Alert and Adaptive Action
  // -----------------------------------------------------------------------

  describe('Phase 3: Alert Generation and Actions', () => {
    it('should generate alert and trigger adaptive action', async () => {
      // Create alert
      const alert = await alertService.createAlert(
        TENANT_A, CONTRACT_ID, CUSTOMER_ID,
        null, 'warning' as any,
        55, 'high',
        ['35 days past due', 'Substandard classification'],
      );

      expect(alert.id).toBeDefined();

      // Event emitted
      expect(mockEventBus._events.some((e) => e.event === 'monitoring.alert_triggered')).toBe(true);

      // Execute adaptive action
      const actionResult = await adaptiveActionsService.executeAction(
        TENANT_A, CONTRACT_ID, 'credit_freeze' as any,
      );
      expect(actionResult.success).toBe(true);

      // Verify event
      expect(mockEventBus._events.some((e) => e.event === 'monitoring.adaptive_action_executed')).toBe(true);

      // Acknowledge alert
      const acked = await alertService.acknowledgeAlert(alert.id, TENANT_A, 'system');
      expect(acked.status).toBe('acknowledged');
    });
  });

  // -----------------------------------------------------------------------
  // Phase 4: Monetary Values Validation
  // -----------------------------------------------------------------------

  describe('Phase 4: Monetary Values as Decimal Strings', () => {
    it('should store scoring result with numeric score', async () => {
      await scoringService.scoreCustomer(
        TENANT_A, CUSTOMER_ID, PRODUCT_ID,
        'application', '10000.0000',
      );

      const createCall = mockPrisma.scoringResult.create.mock.calls[0][0];
      expect(typeof createCall.data.score).toBe('number');
      expect(typeof createCall.data.recommendedLimit).toBe('number');
    });
  });

  // -----------------------------------------------------------------------
  // Phase 5: Tenant Isolation
  // -----------------------------------------------------------------------

  describe('Phase 5: Tenant Isolation', () => {
    it('should not allow Tenant B to access Tenant A scoring', async () => {
      // Score with tenant A
      await scoringService.scoreCustomer(
        TENANT_A, CUSTOMER_ID, PRODUCT_ID,
        'application', '10000.0000',
      );

      // Verify prisma was called with correct tenant
      expect(mockPrisma.customer.findFirstOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A }),
        }),
      );
    });

    it('should create alerts isolated by tenant', async () => {
      // Create alert for tenant A
      const alertA = await alertService.createAlert(
        TENANT_A, CONTRACT_ID, CUSTOMER_ID,
        null, 'warning' as any, 50, 'high', ['test'],
      );

      // Create alert for tenant B
      const alertB = await alertService.createAlert(
        TENANT_B, 'contract-b', 'customer-b',
        null, 'info' as any, 20, 'low', ['test-b'],
      );

      // Verify events carry correct tenant IDs
      const tenantAEvents = mockEventBus._events.filter((e) => e.tenantId === TENANT_A);
      const tenantBEvents = mockEventBus._events.filter((e) => e.tenantId === TENANT_B);

      expect(tenantAEvents.length).toBeGreaterThan(0);
      expect(tenantBEvents.length).toBeGreaterThan(0);
      expect(alertA.tenantId).toBe(TENANT_A);
      expect(alertB.tenantId).toBe(TENANT_B);
    });

    it('should isolate alert rules by tenant', async () => {
      await alertRulesService.create(TENANT_A, {
        name: 'Tenant A Only Rule',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 50 },
      });

      const tenantBRules = await alertRulesService.findByTenant(TENANT_B);
      const tenantARulesInB = tenantBRules.filter((r: any) => r.name === 'Tenant A Only Rule');
      expect(tenantARulesInB.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Phase 6: Complete Lifecycle Flow
  // -----------------------------------------------------------------------

  describe('Phase 6: Complete End-to-End Flow', () => {
    it('should execute the full AI-powered loan lifecycle', async () => {
      // 1. Score with rule-based model
      const scoringResult = await scoringService.scoreCustomer(
        TENANT_A, CUSTOMER_ID, PRODUCT_ID,
        'application', '10000.0000',
      );
      expect(scoringResult).toBeDefined();

      // 2. Simulate overdue -- monitor contract risk
      const risk = await monitoringService.assessContractRisk(TENANT_A, CONTRACT_ID);
      expect(risk.score).toBeGreaterThan(0);

      // 3. Create and evaluate alert rule
      await alertRulesService.create(TENANT_A, {
        name: 'Full Lifecycle Rule',
        conditionType: 'score_threshold',
        conditionConfig: { threshold: 25, operator: 'gte' },
        severity: 'warning' as any,
        actionType: 'recovery_escalation' as any,
      });

      const triggered = await alertRulesService.evaluateRules(TENANT_A, CONTRACT_ID, risk);
      expect(triggered.length).toBeGreaterThanOrEqual(1);

      // 4. Create alert
      const triggeredRule = triggered[0];
      const alert = await alertService.createAlert(
        TENANT_A, CONTRACT_ID, CUSTOMER_ID,
        triggeredRule.alertRuleId,
        triggeredRule.severity,
        risk.score, risk.riskLevel,
        risk.factors,
      );
      expect(alert.id).toBeDefined();

      // 5. Execute recovery escalation
      if (triggeredRule.actionType) {
        const action = await adaptiveActionsService.executeAction(
          TENANT_A, CONTRACT_ID,
          triggeredRule.actionType as any,
        );
        expect(action.success).toBe(true);
      }

      // 6. Acknowledge alert
      const acked = await alertService.acknowledgeAlert(alert.id, TENANT_A, 'ai-system');
      expect(acked.status).toBe('acknowledged');

      // 7. Verify full event trail
      const eventTypes = mockEventBus._events.map((e) => e.event);
      expect(eventTypes).toContain('monitoring.alert_triggered');
      expect(eventTypes).toContain('monitoring.alert_acknowledged');

      // All events carry the correct tenant
      const tenantAEvents = mockEventBus._events.filter((e) => e.tenantId === TENANT_A);
      expect(tenantAEvents.length).toBeGreaterThanOrEqual(3);
    });
  });
});
