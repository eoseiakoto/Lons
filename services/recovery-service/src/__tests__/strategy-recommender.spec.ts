import { StrategyRecommenderService } from '../strategy-recommender.service';
import { RecoveryStrategyType } from '@lons/shared-types';

describe('StrategyRecommenderService', () => {
  let service: StrategyRecommenderService;
  let mockPrisma: any;
  let mockPredictiveRisk: any;

  beforeEach(() => {
    mockPrisma = {
      contract: { findFirst: jest.fn() },
      recoveryOutcome: { findMany: jest.fn() },
    };

    mockPredictiveRisk = {
      predictDefaultRisk: jest.fn().mockResolvedValue({
        contractId: 'contract-1',
        probabilityOfDefault: '45.0000',
        predictedDaysToDefault: 90,
        confidence: '0.7000',
        topRiskFactors: [],
        assessedAt: new Date(),
      }),
    };

    service = new StrategyRecommenderService(mockPrisma, mockPredictiveRisk);
  });

  const makeContract = (overrides: Record<string, any> = {}) => ({
    id: 'contract-1',
    tenantId: 'tenant-1',
    daysPastDue: 15,
    totalOutstanding: 5000,
    customer: { phone: '+233245678901' },
    product: { type: 'micro_loan', repaymentMethod: 'equal_installments' },
    ...overrides,
  });

  it('should throw NotFoundError for non-existent contract', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(null);
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

    await expect(
      service.recommend('tenant-1', 'non-existent'),
    ).rejects.toThrow('Contract');
  });

  it('should recommend grace_period for early overdue (DPD <= 30)', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ daysPastDue: 10 }));
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

    const strategies = await service.recommend('tenant-1', 'contract-1');

    expect(strategies.some((s) => s.type === RecoveryStrategyType.GRACE_PERIOD)).toBe(true);
    expect(strategies[0].type).toBe(RecoveryStrategyType.GRACE_PERIOD);
  });

  it('should recommend restructure for moderate overdue (8-90 DPD)', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ daysPastDue: 45 }));
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

    const strategies = await service.recommend('tenant-1', 'contract-1');

    expect(strategies.some((s) => s.type === RecoveryStrategyType.RESTRUCTURE)).toBe(true);
  });

  it('should recommend partial_settlement for DPD >= 31', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ daysPastDue: 50 }));
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

    const strategies = await service.recommend('tenant-1', 'contract-1');

    expect(strategies.some((s) => s.type === RecoveryStrategyType.PARTIAL_SETTLEMENT)).toBe(true);
  });

  it('should recommend escalation for severe default (DPD >= 90)', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ daysPastDue: 120 }));
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

    mockPredictiveRisk.predictDefaultRisk.mockResolvedValue({
      contractId: 'contract-1',
      probabilityOfDefault: '85.0000',
      predictedDaysToDefault: 0,
      confidence: '0.8500',
      topRiskFactors: [],
      assessedAt: new Date(),
    });

    const strategies = await service.recommend('tenant-1', 'contract-1');

    expect(strategies.some((s) => s.type === RecoveryStrategyType.ESCALATION)).toBe(true);
  });

  it('should recommend fee_recovery for auto_deduction products', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(
      makeContract({
        daysPastDue: 15,
        product: { type: 'overdraft', repaymentMethod: 'auto_deduction' },
      }),
    );
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

    const strategies = await service.recommend('tenant-1', 'contract-1');

    expect(strategies.some((s) => s.type === RecoveryStrategyType.FEE_RECOVERY)).toBe(true);
  });

  it('should calibrate success rates using historical outcomes', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ daysPastDue: 10 }));

    // 10 outcomes for grace_period: 8 success, 2 failed
    const outcomes = Array.from({ length: 10 }, (_, i) => ({
      strategyType: RecoveryStrategyType.GRACE_PERIOD,
      status: i < 8 ? 'success' : 'failed',
    }));
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue(outcomes);

    const strategies = await service.recommend('tenant-1', 'contract-1');
    const gracePeriod = strategies.find((s) => s.type === RecoveryStrategyType.GRACE_PERIOD);

    expect(gracePeriod).toBeDefined();
    // Historical rate is 0.8, base is 0.75, blended: 0.8*0.6 + 0.75*0.4 = 0.78
    expect(gracePeriod!.successProbability).toBeCloseTo(0.78, 2);
  });

  it('should return strategies sorted by priority', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ daysPastDue: 50 }));
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

    const strategies = await service.recommend('tenant-1', 'contract-1');

    for (let i = 1; i < strategies.length; i++) {
      expect(strategies[i].priority).toBeGreaterThanOrEqual(strategies[i - 1].priority);
    }
  });

  it('should include reasoning in each strategy', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ daysPastDue: 10 }));
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

    const strategies = await service.recommend('tenant-1', 'contract-1');

    for (const strategy of strategies) {
      expect(strategy.reasoning).toBeDefined();
      expect(strategy.reasoning!.length).toBeGreaterThan(0);
    }
  });

  it('should use Decimal strings for estimatedRecovery', async () => {
    mockPrisma.contract.findFirst.mockResolvedValue(makeContract({ daysPastDue: 50 }));
    mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

    const strategies = await service.recommend('tenant-1', 'contract-1');

    for (const strategy of strategies) {
      expect(typeof strategy.estimatedRecovery).toBe('string');
      expect(Number(strategy.estimatedRecovery)).not.toBeNaN();
    }
  });
});
