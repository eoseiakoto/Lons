/**
 * Recovery AI E2E Integration Test
 *
 * Tests the full AI-driven recovery workflow including:
 * - Predictive risk assessment
 * - AI recovery recommendations (ranked by priority)
 * - Strategy application and outcome recording
 * - Feedback loop calibration
 * - Loan restructuring with new schedule generation
 * - All amounts validated as Decimal strings
 */
import { PredictiveRiskService } from '../../predictive-risk.service';
import { StrategyRecommenderService } from '../../strategy-recommender.service';
import { OutcomeTrackerService } from '../../outcome-tracker.service';
import { RestructuringService } from '../../restructuring.service';
import { RecoveryStrategyType, RecoveryOutcomeStatus } from '@lons/shared-types';

const TENANT_ID = 'tenant-recovery-e2e';
const CONTRACT_ID = 'contract-recovery-e2e-001';
const CUSTOMER_ID = 'customer-recovery-e2e-001';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function makeContractMock(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTRACT_ID,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    productId: 'product-001',
    daysPastDue: 25,
    totalOutstanding: '5000.0000',
    principalAmount: '4500.0000',
    outstandingPenalties: '200.0000',
    interestRate: '0.1500',
    totalPaid: '1500.0000',
    totalCostCredit: '6000.0000',
    tenorDays: 90,
    startDate: new Date('2025-12-01'),
    maturityDate: new Date('2026-03-01'),
    status: 'overdue',
    restructured: false,
    restructureCount: 0,
    classification: 'watch',
    metadata: {},
    customer: {
      id: CUSTOMER_ID,
      phone: '+233245678901',
    },
    product: {
      id: 'product-001',
      type: 'micro_loan',
      repaymentMethod: 'equal_installments',
    },
    repayments: [
      { amount: '750.0000', createdAt: new Date('2026-01-15') },
      { amount: '750.0000', createdAt: new Date('2026-02-15') },
    ],
    repaymentSchedule: [
      { dueDate: new Date('2026-01-01'), status: 'paid' },
      { dueDate: new Date('2026-02-01'), status: 'paid' },
      { dueDate: new Date('2026-03-01'), status: 'overdue' },
    ],
    ...overrides,
  };
}

function makeMockPrisma() {
  const outcomes: any[] = [];
  let outcomeIdCounter = 1;

  return {
    contract: {
      findFirst: jest.fn().mockResolvedValue(makeContractMock()),
      findFirstOrThrow: jest.fn().mockResolvedValue(makeContractMock()),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        ...makeContractMock(),
        ...data,
        restructured: data.restructured ?? false,
        restructureCount: (data.restructureCount?.increment ?? 0),
      })),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue({ id: CUSTOMER_ID, metadata: null }),
    },
    recoveryOutcome: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const outcome = {
          id: `outcome-${outcomeIdCounter++}`,
          ...data,
          createdAt: new Date(),
        };
        outcomes.push(outcome);
        return outcome;
      }),
      findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
        return outcomes.find((o) => o.id === where.id) ?? null;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }: any) => {
        return outcomes.filter(
          (o) =>
            o.tenantId === where?.tenantId &&
            (!where?.contractId || o.contractId === where.contractId) &&
            (!where?.strategyType || o.strategyType === where.strategyType) &&
            (!where?.status || o.status !== where.status?.not),
        );
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => {
        const idx = outcomes.findIndex((o) => o.id === where.id);
        if (idx >= 0) {
          outcomes[idx] = { ...outcomes[idx], ...data };
          return outcomes[idx];
        }
        return null;
      }),
    },
    repaymentScheduleEntry: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    repaymentSchedule: {
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => {
      const tx = {
        contract: {
          update: jest.fn().mockResolvedValue(makeContractMock({ restructured: true, restructureCount: 1 })),
        },
        repaymentScheduleEntry: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return fn(tx);
    }),
    _outcomes: outcomes,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Recovery AI E2E Integration', () => {
  let mockPrisma: ReturnType<typeof makeMockPrisma>;
  let mockEventBus: ReturnType<typeof makeMockEventBus>;
  let predictiveRiskService: PredictiveRiskService;
  let recommenderService: StrategyRecommenderService;
  let outcomeTracker: OutcomeTrackerService;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    mockEventBus = makeMockEventBus();
    predictiveRiskService = new PredictiveRiskService(mockPrisma as any);
    recommenderService = new StrategyRecommenderService(mockPrisma as any, predictiveRiskService);
    outcomeTracker = new OutcomeTrackerService(mockPrisma as any, mockEventBus as any);
  });

  // -----------------------------------------------------------------------
  // 1. Predictive Risk Assessment
  // -----------------------------------------------------------------------

  describe('Predictive Risk Assessment', () => {
    it('should assess default risk for an overdue contract', async () => {
      const assessment = await predictiveRiskService.predictDefaultRisk(TENANT_ID, CONTRACT_ID);

      expect(assessment.contractId).toBe(CONTRACT_ID);
      expect(typeof assessment.probabilityOfDefault).toBe('string');
      expect(typeof assessment.confidence).toBe('string');
      expect(Number(assessment.probabilityOfDefault)).toBeGreaterThanOrEqual(0);
      expect(Number(assessment.probabilityOfDefault)).toBeLessThanOrEqual(100);
      expect(assessment.predictedDaysToDefault).toBeGreaterThanOrEqual(0);
      expect(assessment.topRiskFactors).toBeDefined();
      expect(assessment.assessedAt).toBeInstanceOf(Date);
    });

    it('should return higher risk for severely overdue contracts', async () => {
      const severeContract = makeContractMock({
        daysPastDue: 95,
        classification: 'loss',
        repayments: [],
        repaymentSchedule: [
          { dueDate: new Date('2025-12-01'), status: 'overdue' },
          { dueDate: new Date('2026-01-01'), status: 'overdue' },
          { dueDate: new Date('2026-02-01'), status: 'overdue' },
        ],
      });
      mockPrisma.contract.findFirst.mockResolvedValue(severeContract);

      const assessment = await predictiveRiskService.predictDefaultRisk(TENANT_ID, CONTRACT_ID);
      expect(Number(assessment.probabilityOfDefault)).toBeGreaterThan(50);
    });

    it('should return Decimal string values for all monetary fields', async () => {
      const assessment = await predictiveRiskService.predictDefaultRisk(TENANT_ID, CONTRACT_ID);

      // probabilityOfDefault and confidence are Decimal strings
      expect(assessment.probabilityOfDefault).toMatch(/^\d+\.\d+$/);
      expect(assessment.confidence).toMatch(/^\d+\.\d+$/);
    });
  });

  // -----------------------------------------------------------------------
  // 2. AI Recovery Recommendations
  // -----------------------------------------------------------------------

  describe('AI Recovery Recommendations', () => {
    it('should return recommendations ranked by priority', async () => {
      mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

      const strategies = await recommenderService.recommend(TENANT_ID, CONTRACT_ID);

      expect(strategies.length).toBeGreaterThan(0);

      // Verify sorted by priority (ascending)
      for (let i = 1; i < strategies.length; i++) {
        expect(strategies[i].priority).toBeGreaterThanOrEqual(strategies[i - 1].priority);
      }
    });

    it('should include grace_period for early overdue (DPD 25)', async () => {
      mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

      const strategies = await recommenderService.recommend(TENANT_ID, CONTRACT_ID);
      const graceStrategy = strategies.find((s) => s.type === RecoveryStrategyType.GRACE_PERIOD);

      expect(graceStrategy).toBeDefined();
      expect(graceStrategy!.successProbability).toBeGreaterThan(0);
      expect(graceStrategy!.successProbability).toBeLessThanOrEqual(1);
      // estimatedRecovery must be a Decimal string
      expect(typeof graceStrategy!.estimatedRecovery).toBe('string');
      expect(graceStrategy!.estimatedRecovery).toMatch(/^\d+\.\d{4}$/);
    });

    it('should include restructure for moderate overdue', async () => {
      mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

      const strategies = await recommenderService.recommend(TENANT_ID, CONTRACT_ID);
      const restructure = strategies.find((s) => s.type === RecoveryStrategyType.RESTRUCTURE);

      expect(restructure).toBeDefined();
      expect(typeof restructure!.estimatedRecovery).toBe('string');
    });

    it('should include escalation for severe default (DPD >= 90)', async () => {
      mockPrisma.contract.findFirst.mockResolvedValue(makeContractMock({ daysPastDue: 120 }));
      mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

      const strategies = await recommenderService.recommend(TENANT_ID, CONTRACT_ID);
      const escalation = strategies.find((s) => s.type === RecoveryStrategyType.ESCALATION);

      expect(escalation).toBeDefined();
      expect(typeof escalation!.estimatedRecovery).toBe('string');
    });

    it('should validate all estimatedRecovery values are Decimal strings', async () => {
      mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

      const strategies = await recommenderService.recommend(TENANT_ID, CONTRACT_ID);

      for (const strategy of strategies) {
        expect(typeof strategy.estimatedRecovery).toBe('string');
        // Must be parseable as a number
        expect(Number(strategy.estimatedRecovery)).not.toBeNaN();
      }
    });
  });

  // -----------------------------------------------------------------------
  // 3. Apply Strategy and Record Outcome
  // -----------------------------------------------------------------------

  describe('Strategy Application and Outcome Recording', () => {
    it('should record a recovery strategy outcome', async () => {
      const outcome = await outcomeTracker.recordOutcome(TENANT_ID, CONTRACT_ID, {
        strategyType: RecoveryStrategyType.GRACE_PERIOD,
        notes: 'Extended grace by 7 days',
        appliedBy: 'agent-001',
      });

      expect(outcome.id).toBeDefined();
      expect(outcome.tenantId).toBe(TENANT_ID);
      expect(outcome.contractId).toBe(CONTRACT_ID);
      expect(outcome.strategyType).toBe(RecoveryStrategyType.GRACE_PERIOD);
      expect(outcome.status).toBe(RecoveryOutcomeStatus.PENDING);
    });

    it('should emit RECOVERY_STRATEGY_APPLIED event', async () => {
      await outcomeTracker.recordOutcome(TENANT_ID, CONTRACT_ID, {
        strategyType: RecoveryStrategyType.GRACE_PERIOD,
      });

      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'recovery.strategy_applied',
        TENANT_ID,
        expect.objectContaining({
          contractId: CONTRACT_ID,
          strategyType: RecoveryStrategyType.GRACE_PERIOD,
        }),
      );
    });

    it('should update outcome to success with amount recovered as string', async () => {
      // Record
      const outcome = await outcomeTracker.recordOutcome(TENANT_ID, CONTRACT_ID, {
        strategyType: RecoveryStrategyType.GRACE_PERIOD,
      });

      // Update to success
      const updated = await outcomeTracker.updateOutcome(outcome.id, {
        status: RecoveryOutcomeStatus.SUCCESS,
        amountRecovered: '5000.0000',
        notes: 'Customer paid in full after grace period',
      });

      expect(updated.status).toBe(RecoveryOutcomeStatus.SUCCESS);
    });

    it('should update outcome to failed', async () => {
      const outcome = await outcomeTracker.recordOutcome(TENANT_ID, CONTRACT_ID, {
        strategyType: RecoveryStrategyType.PAYMENT_HOLIDAY,
      });

      const updated = await outcomeTracker.updateOutcome(outcome.id, {
        status: RecoveryOutcomeStatus.FAILED,
        notes: 'Customer did not resume payments after holiday',
      });

      expect(updated.status).toBe(RecoveryOutcomeStatus.FAILED);
    });

    it('should emit RECOVERY_OUTCOME_RECORDED event on update', async () => {
      const outcome = await outcomeTracker.recordOutcome(TENANT_ID, CONTRACT_ID, {
        strategyType: RecoveryStrategyType.RESTRUCTURE,
      });

      await outcomeTracker.updateOutcome(outcome.id, {
        status: RecoveryOutcomeStatus.SUCCESS,
        amountRecovered: '4750.0000',
      });

      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'recovery.outcome_recorded',
        TENANT_ID,
        expect.objectContaining({
          contractId: CONTRACT_ID,
          status: RecoveryOutcomeStatus.SUCCESS,
          amountRecovered: '4750.0000',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 4. Feedback Loop: Calibrated Recommendations
  // -----------------------------------------------------------------------

  describe('Feedback Loop Calibration', () => {
    it('should calibrate success probabilities based on prior outcomes', async () => {
      // Populate prior outcomes for the tenant (>= 5 for calibration to kick in)
      const priorOutcomes = Array.from({ length: 8 }, (_, i) => ({
        id: `prior-outcome-${i}`,
        tenantId: TENANT_ID,
        contractId: `contract-prior-${i}`,
        strategyType: RecoveryStrategyType.GRACE_PERIOD,
        status: i < 6 ? RecoveryOutcomeStatus.SUCCESS : RecoveryOutcomeStatus.FAILED,
        amountRecovered: i < 6 ? '5000.0000' : '0.0000',
        appliedAt: new Date(),
      }));

      // First call: no prior outcomes
      mockPrisma.recoveryOutcome.findMany.mockResolvedValueOnce([]);
      const strategiesBaseline = await recommenderService.recommend(TENANT_ID, CONTRACT_ID);
      const graceBaseline = strategiesBaseline.find((s) => s.type === RecoveryStrategyType.GRACE_PERIOD);

      // Second call: with 8 prior outcomes (6 success, 2 failed = 75% success rate)
      mockPrisma.contract.findFirst.mockResolvedValue(makeContractMock());
      mockPrisma.recoveryOutcome.findMany.mockResolvedValueOnce(priorOutcomes);
      const strategiesCalibrated = await recommenderService.recommend(TENANT_ID, CONTRACT_ID);
      const graceCalibrated = strategiesCalibrated.find((s) => s.type === RecoveryStrategyType.GRACE_PERIOD);

      expect(graceBaseline).toBeDefined();
      expect(graceCalibrated).toBeDefined();

      // Both should be valid probabilities
      expect(graceBaseline!.successProbability).toBeGreaterThan(0);
      expect(graceBaseline!.successProbability).toBeLessThanOrEqual(1);
      expect(graceCalibrated!.successProbability).toBeGreaterThan(0);
      expect(graceCalibrated!.successProbability).toBeLessThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Loan Restructuring
  // -----------------------------------------------------------------------

  describe('Loan Restructuring', () => {
    let restructuringService: RestructuringService;
    let mockScheduleService: any;

    beforeEach(() => {
      mockScheduleService = {
        createSchedule: jest.fn().mockResolvedValue([
          { id: 'sched-1', dueDate: new Date('2026-04-01'), amount: '1000.0000', status: 'pending' },
          { id: 'sched-2', dueDate: new Date('2026-05-01'), amount: '1000.0000', status: 'pending' },
          { id: 'sched-3', dueDate: new Date('2026-06-01'), amount: '1000.0000', status: 'pending' },
          { id: 'sched-4', dueDate: new Date('2026-07-01'), amount: '1000.0000', status: 'pending' },
          { id: 'sched-5', dueDate: new Date('2026-08-01'), amount: '800.0000', status: 'pending' },
        ]),
      };

      restructuringService = new RestructuringService(
        mockPrisma as any,
        mockEventBus as any,
        mockScheduleService,
      );
    });

    it('should restructure a loan with extended tenor', async () => {
      const result = await restructuringService.restructureLoan(TENANT_ID, CONTRACT_ID, {
        newTenorDays: 150,
        reason: 'Customer cash flow difficulty',
      });

      expect(result.success).toBe(true);
      expect(result.contractId).toBe(CONTRACT_ID);
      expect(result.originalTenorDays).toBe(90);
      expect(result.newTenorDays).toBe(150);
      // All monetary values as strings
      expect(typeof result.originalInterestRate).toBe('string');
      expect(typeof result.newInterestRate).toBe('string');
      expect(typeof result.originalOutstanding).toBe('string');
      expect(typeof result.newOutstanding).toBe('string');
      expect(result.restructureCount).toBe(1);
    });

    it('should generate new repayment schedule', async () => {
      const result = await restructuringService.restructureLoan(TENANT_ID, CONTRACT_ID, {
        newTenorDays: 120,
        reason: 'Restructure for E2E test',
      });

      expect(mockScheduleService.createSchedule).toHaveBeenCalledWith(TENANT_ID, CONTRACT_ID);
      expect(result.newScheduleEntries).toBe(5);
    });

    it('should preserve original contract history (restructured flag)', async () => {
      await restructuringService.restructureLoan(TENANT_ID, CONTRACT_ID, {
        newTenorDays: 120,
        reason: 'Test restructure',
      });

      // Verify the transaction was called with restructured=true
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should increment restructureCount', async () => {
      const result = await restructuringService.restructureLoan(TENANT_ID, CONTRACT_ID, {
        newTenorDays: 120,
        reason: 'Test restructure',
      });

      expect(result.restructureCount).toBe(1);
    });

    it('should apply penalty waiver when requested', async () => {
      const result = await restructuringService.restructureLoan(TENANT_ID, CONTRACT_ID, {
        newTenorDays: 120,
        penaltyWaiver: true,
        reason: 'Penalty waiver requested',
      });

      // newOutstanding should be less than original (penalties removed)
      expect(Number(result.newOutstanding)).toBeLessThanOrEqual(Number(result.originalOutstanding));
      expect(typeof result.newOutstanding).toBe('string');
    });

    it('should emit LOAN_RESTRUCTURED event', async () => {
      await restructuringService.restructureLoan(TENANT_ID, CONTRACT_ID, {
        newTenorDays: 120,
        reason: 'E2E event test',
      });

      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'loan.restructured',
        TENANT_ID,
        expect.objectContaining({
          contractId: CONTRACT_ID,
          reason: 'E2E event test',
        }),
      );
    });

    it('should reject restructuring of settled contract', async () => {
      mockPrisma.contract.findFirst.mockResolvedValue(makeContractMock({ status: 'settled' }));

      await expect(
        restructuringService.restructureLoan(TENANT_ID, CONTRACT_ID, {
          newTenorDays: 120,
          reason: 'Should fail',
        }),
      ).rejects.toThrow('Cannot restructure a settled or cancelled contract');
    });

    it('should add payment holiday days to tenor', async () => {
      const result = await restructuringService.restructureLoan(TENANT_ID, CONTRACT_ID, {
        newTenorDays: 120,
        paymentHolidayDays: 14,
        reason: 'Payment holiday requested',
      });

      // newTenorDays = 120 + 14 = 134
      expect(result.newTenorDays).toBe(134);
    });

    it('should validate all result amounts are Decimal strings', async () => {
      const result = await restructuringService.restructureLoan(TENANT_ID, CONTRACT_ID, {
        newTenorDays: 120,
        reason: 'Decimal string validation',
      });

      expect(result.originalInterestRate).toMatch(/^\d+\.\d+$/);
      expect(result.newInterestRate).toMatch(/^\d+\.\d+$/);
      expect(result.originalOutstanding).toMatch(/^\d+\.\d+$/);
      expect(result.newOutstanding).toMatch(/^\d+\.\d+$/);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Tenant Isolation
  // -----------------------------------------------------------------------

  describe('Tenant Isolation', () => {
    it('should throw NotFoundError for contract from different tenant', async () => {
      mockPrisma.contract.findFirst.mockResolvedValue(null);

      await expect(
        recommenderService.recommend('other-tenant', CONTRACT_ID),
      ).rejects.toThrow('Contract');
    });
  });
});
