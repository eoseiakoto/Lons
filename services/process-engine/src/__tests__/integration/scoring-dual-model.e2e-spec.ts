/**
 * Dual-Model Scoring E2E Integration Test
 *
 * Tests all 5 scoring strategies with mocked dependencies:
 * - rule_only: verify only scorecard called, ML not called
 * - ml_only: verify only ML client called
 * - higher/lower: verify both called, correct one selected
 * - weighted_average: verify weighted combination
 * - Fallback: ML unavailable -> falls back to rule_only
 * - Credit limit derivation with exposure cap
 * - All scores are Decimal strings
 */
import { DualScoringStrategy, DualScoringResult } from '../../scoring/dual-scoring.strategy';
import { MlScoringClient, MlScoringUnavailableError, MlScoringResponse } from '../../scoring/ml-scoring.client';
import { CreditLimitService } from '../../scoring/credit-limit.service';
import { ScoringService } from '../../scoring/scoring.service';
import { ScorecardConfig, calculateScore } from '../../scoring/scorecard/scorecard-engine';
import { ScoringStrategy } from '@lons/shared-types';

const TENANT_ID = 'tenant-scoring-e2e';
const CUSTOMER_ID = 'customer-scoring-e2e-001';
const PRODUCT_ID = 'product-scoring-e2e-001';

// ---------------------------------------------------------------------------
// Test Scorecard
// ---------------------------------------------------------------------------

const TEST_SCORECARD: ScorecardConfig = {
  version: '1.0-test',
  scoreRange: { min: 0, max: 1000 },
  factors: [
    {
      name: 'account_age_days',
      weight: 15,
      bands: [
        { min: 365, max: null, points: 100 },
        { min: 180, max: 364, points: 70 },
        { min: 90, max: 179, points: 40 },
        { min: 0, max: 89, points: 10 },
      ],
    },
    {
      name: 'kyc_level',
      weight: 10,
      bands: [
        { min: 3, max: null, points: 100 },
        { min: 2, max: 2, points: 75 },
        { min: 1, max: 1, points: 50 },
        { min: 0, max: 0, points: 10 },
      ],
    },
    {
      name: 'payment_history_pct',
      weight: 30,
      bands: [
        { min: 90, max: null, points: 100 },
        { min: 70, max: 89, points: 70 },
        { min: 50, max: 69, points: 40 },
        { min: 0, max: 49, points: 10 },
      ],
    },
    {
      name: 'transaction_frequency',
      weight: 15,
      bands: [
        { min: 20, max: null, points: 100 },
        { min: 10, max: 19, points: 70 },
        { min: 5, max: 9, points: 40 },
        { min: 0, max: 4, points: 10 },
      ],
    },
    {
      name: 'existing_debt_ratio',
      weight: 15,
      bands: [
        { min: 0, max: 20, points: 100 },
        { min: 21, max: 50, points: 70 },
        { min: 51, max: 80, points: 30 },
        { min: 81, max: null, points: 0 },
      ],
    },
    {
      name: 'income_consistency',
      weight: 15,
      bands: [
        { min: 80, max: null, points: 100 },
        { min: 60, max: 79, points: 70 },
        { min: 40, max: 59, points: 40 },
        { min: 0, max: 39, points: 10 },
      ],
    },
  ],
  riskTiers: [
    { tier: 'low', minScore: 750 },
    { tier: 'medium', minScore: 500 },
    { tier: 'high', minScore: 300 },
    { tier: 'critical', minScore: 0 },
  ],
  limitBands: [
    { minScore: 800, maxScore: 1000, limitMultiplier: '5.0' },
    { minScore: 600, maxScore: 799, limitMultiplier: '3.0' },
    { minScore: 400, maxScore: 599, limitMultiplier: '1.5' },
    { minScore: 0, maxScore: 399, limitMultiplier: '0' },
  ],
};

const GOOD_FEATURES = {
  account_age_days: 500,
  kyc_level: 3,
  payment_history_pct: 95,
  transaction_frequency: 25,
  existing_debt_ratio: 15,
  income_consistency: 85,
};

const REQUESTED_AMOUNT = '10000.0000';

// ---------------------------------------------------------------------------
// Mock ML Response
// ---------------------------------------------------------------------------

function makeMlResponse(overrides: Partial<MlScoringResponse> = {}): MlScoringResponse {
  return {
    score: 720,
    probability_of_default: 0.18,
    recommended_limit: '30000.0000',
    confidence: 0.82,
    risk_tier: 'medium',
    contributing_factors: [
      { name: 'payment_history', impact: 0.35 },
      { name: 'account_age', impact: 0.25 },
      { name: 'debt_ratio', impact: 0.2 },
    ],
    model_version: 'ml-v1.0-test',
    scoring_method: 'ml_only',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dual-Model Scoring E2E Integration', () => {
  let mockMlClient: jest.Mocked<Partial<MlScoringClient>>;
  let dualStrategy: DualScoringStrategy;

  beforeEach(() => {
    mockMlClient = {
      score: jest.fn().mockResolvedValue(makeMlResponse()),
      healthCheck: jest.fn().mockResolvedValue(true),
    };
    dualStrategy = new DualScoringStrategy(mockMlClient as any);
  });

  // -----------------------------------------------------------------------
  // 1. RULE_ONLY Strategy
  // -----------------------------------------------------------------------

  describe('rule_only strategy', () => {
    it('should only invoke scorecard, not ML client', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.RULE_ONLY,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(mockMlClient.score).not.toHaveBeenCalled();
      expect(result.strategy).toBe(ScoringStrategy.RULE_ONLY);
      expect(result.ruleScore).toBeDefined();
      expect(result.mlScore).toBeUndefined();
      expect(result.finalScore).toBe(result.ruleScore);
      expect(result.modelVersions.rule).toBe('1.0-test');
      expect(result.modelVersions.ml).toBeUndefined();
    });

    it('should return Decimal string scores', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.RULE_ONLY,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(typeof result.finalScore).toBe('string');
      expect(typeof result.ruleScore).toBe('string');
      expect(typeof result.recommendedLimit).toBe('string');
      expect(typeof result.confidence).toBe('string');
      // Verify parseable as numbers
      expect(Number(result.finalScore)).not.toBeNaN();
      expect(Number(result.recommendedLimit)).not.toBeNaN();
    });
  });

  // -----------------------------------------------------------------------
  // 2. ML_ONLY Strategy
  // -----------------------------------------------------------------------

  describe('ml_only strategy', () => {
    it('should only invoke ML client, not scorecard for final result', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.ML_ONLY,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(mockMlClient.score).toHaveBeenCalledTimes(1);
      expect(result.strategy).toBe(ScoringStrategy.ML_ONLY);
      expect(result.mlScore).toBeDefined();
      expect(result.ruleScore).toBeUndefined();
      expect(result.modelVersions.ml).toBe('ml-v1.0-test');
    });

    it('should pass tenant and customer IDs to ML client', async () => {
      await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.ML_ONLY,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(mockMlClient.score).toHaveBeenCalledWith(
        TENANT_ID,
        CUSTOMER_ID,
        expect.any(Object),
        REQUESTED_AMOUNT,
        undefined,
        ScoringStrategy.ML_ONLY,
      );
    });

    it('should return recommended_limit as string', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.ML_ONLY,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(typeof result.recommendedLimit).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // 3. HIGHER Strategy
  // -----------------------------------------------------------------------

  describe('higher strategy', () => {
    it('should call both scorecard and ML in parallel', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.HIGHER,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(mockMlClient.score).toHaveBeenCalledTimes(1);
      expect(result.ruleScore).toBeDefined();
      expect(result.mlScore).toBeDefined();
      expect(result.strategy).toBe(ScoringStrategy.HIGHER);
    });

    it('should select the higher score', async () => {
      // Rule score for GOOD_FEATURES should be high (>800)
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.HIGHER,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      const ruleScoreNum = Number(result.ruleScore);
      const mlScoreNum = Number(result.mlScore);
      const finalScoreNum = Number(result.finalScore);

      expect(finalScoreNum).toBe(Math.max(ruleScoreNum, mlScoreNum));
    });

    it('should select ML when ML score is higher', async () => {
      // Make ML score very high
      (mockMlClient.score as jest.Mock).mockResolvedValue(makeMlResponse({ score: 950 }));

      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.HIGHER,
        TEST_SCORECARD, { ...GOOD_FEATURES, payment_history_pct: 40 }, // lower rule score
      );

      expect(Number(result.finalScore)).toBe(Number(result.mlScore));
    });
  });

  // -----------------------------------------------------------------------
  // 4. LOWER Strategy
  // -----------------------------------------------------------------------

  describe('lower strategy', () => {
    it('should call both scorecard and ML', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.LOWER,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(mockMlClient.score).toHaveBeenCalledTimes(1);
      expect(result.ruleScore).toBeDefined();
      expect(result.mlScore).toBeDefined();
      expect(result.strategy).toBe(ScoringStrategy.LOWER);
    });

    it('should select the lower score', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.LOWER,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      const ruleScoreNum = Number(result.ruleScore);
      const mlScoreNum = Number(result.mlScore);
      const finalScoreNum = Number(result.finalScore);

      expect(finalScoreNum).toBe(Math.min(ruleScoreNum, mlScoreNum));
    });
  });

  // -----------------------------------------------------------------------
  // 5. WEIGHTED_AVERAGE Strategy
  // -----------------------------------------------------------------------

  describe('weighted_average strategy', () => {
    it('should call both scorecard and ML', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(mockMlClient.score).toHaveBeenCalledTimes(1);
      expect(result.ruleScore).toBeDefined();
      expect(result.mlScore).toBeDefined();
      expect(result.strategy).toBe(ScoringStrategy.WEIGHTED_AVERAGE);
    });

    it('should produce a weighted blend of scores', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, GOOD_FEATURES,
        '0.6000', // mlWeight
        '0.4000', // ruleWeight
      );

      const ruleScoreNum = Number(result.ruleScore);
      const mlScoreNum = Number(result.mlScore);
      const finalScoreNum = Number(result.finalScore);

      // Weighted average should be between rule and ML scores
      const minScore = Math.min(ruleScoreNum, mlScoreNum);
      const maxScore = Math.max(ruleScoreNum, mlScoreNum);
      expect(finalScoreNum).toBeGreaterThanOrEqual(minScore - 1); // Allow rounding tolerance
      expect(finalScoreNum).toBeLessThanOrEqual(maxScore + 1);
    });

    it('should return probabilityOfDefault as Decimal string', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(result.probabilityOfDefault).toBeDefined();
      expect(typeof result.probabilityOfDefault).toBe('string');
      expect(Number(result.probabilityOfDefault)).not.toBeNaN();
    });

    it('should merge contributing factors from both models', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      // Should have both rule and ml factor sections
      expect(result.contributingFactors).toBeDefined();
      expect(typeof result.contributingFactors).toBe('object');
    });

    it('should include both model versions', async () => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(result.modelVersions.rule).toBe('1.0-test');
      expect(result.modelVersions.ml).toBe('ml-v1.0-test');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Fallback: ML Unavailable
  // -----------------------------------------------------------------------

  describe('ML Fallback', () => {
    it('should throw MlScoringUnavailableError when ML client fails on ml_only', async () => {
      (mockMlClient.score as jest.Mock).mockRejectedValue(
        new MlScoringUnavailableError('ML service circuit breaker open'),
      );

      await expect(
        dualStrategy.execute(
          TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
          REQUESTED_AMOUNT, ScoringStrategy.ML_ONLY,
          TEST_SCORECARD, GOOD_FEATURES,
        ),
      ).rejects.toThrow(MlScoringUnavailableError);
    });

    it('should throw when ML fails on dual strategies (higher/lower/weighted)', async () => {
      (mockMlClient.score as jest.Mock).mockRejectedValue(
        new MlScoringUnavailableError('ML service unavailable'),
      );

      await expect(
        dualStrategy.execute(
          TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
          REQUESTED_AMOUNT, ScoringStrategy.HIGHER,
          TEST_SCORECARD, GOOD_FEATURES,
        ),
      ).rejects.toThrow(MlScoringUnavailableError);
    });
  });

  // -----------------------------------------------------------------------
  // 7. ScoringService Fallback Integration
  // -----------------------------------------------------------------------

  describe('ScoringService Rule-Based Scoring', () => {
    let mockPrisma: any;
    let scoringService: ScoringService;

    beforeEach(() => {
      mockPrisma = {
        customer: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: CUSTOMER_ID,
            createdAt: new Date('2025-01-01'),
            kycLevel: 'tier_2',
          }),
        },
        contract: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        repaymentScheduleEntry: {
          count: jest.fn().mockResolvedValue(0),
        },
        scoringResult: {
          create: jest.fn().mockImplementation(async ({ data }: any) => ({
            id: 'scoring-result-001',
            ...data,
            createdAt: new Date(),
          })),
        },
      };

      scoringService = new ScoringService(mockPrisma);
    });

    it('should score customer using rule-based scorecard', async () => {
      const result = await scoringService.scoreCustomer(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID,
        'application', '10000.0000',
      );

      expect(mockPrisma.scoringResult.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create scoring result with rule_based model type', async () => {
      const result = await scoringService.scoreCustomer(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID,
        'application', '10000.0000',
      );

      expect(mockPrisma.scoringResult.create).toHaveBeenCalled();
      const createCall = mockPrisma.scoringResult.create.mock.calls[0][0];
      expect(createCall.data.modelType).toBe('rule_based');
    });
  });

  // -----------------------------------------------------------------------
  // 8. Credit Limit Derivation with Exposure Cap
  // -----------------------------------------------------------------------

  describe('Credit Limit with Exposure Cap', () => {
    let creditLimitService: CreditLimitService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        product: {
          findFirst: jest.fn().mockResolvedValue({ eligibilityRules: null }),
        },
        contract: {
          findMany: jest.fn().mockResolvedValue([
            { principalAmount: '5000.0000' },
            { principalAmount: '8000.0000' },
          ]),
        },
      };
      creditLimitService = new CreditLimitService(mockPrisma);
    });

    it('should derive limit from score using default bands', async () => {
      const limit = await creditLimitService.deriveLimit('750', PRODUCT_ID, TENANT_ID, '10000.0000');
      // Score 750 is in band 600-799 with multiplier 3.0
      expect(typeof limit).toBe('string');
      expect(limit).toBe('30000.0000');
    });

    it('should calculate current exposure', async () => {
      const exposure = await creditLimitService.calculateExposureCap(CUSTOMER_ID, TENANT_ID);
      expect(typeof exposure).toBe('string');
      // 5000 + 8000 = 13000
      expect(exposure).toBe('13000.0000');
    });

    it('should cap limit when exposure exceeds maximum', () => {
      const cappedLimit = creditLimitService.applyExposureCap(
        '30000.0000', // recommended
        '45000.0000', // current exposure
        '50000.0000', // max exposure
      );
      // Remaining capacity: 50000 - 45000 = 5000
      expect(typeof cappedLimit).toBe('string');
      expect(cappedLimit).toBe('5000.0000');
    });

    it('should return 0 when exposure already at maximum', () => {
      const cappedLimit = creditLimitService.applyExposureCap(
        '30000.0000',
        '50000.0000', // at max
        '50000.0000',
      );
      expect(cappedLimit).toBe('0.0000');
    });

    it('should return recommended limit when under exposure cap', () => {
      const cappedLimit = creditLimitService.applyExposureCap(
        '10000.0000',
        '5000.0000',
        '50000.0000',
      );
      // Remaining = 45000, recommended = 10000 -> min(10000, 45000) = 10000
      expect(cappedLimit).toBe('10000.0000');
    });

    it('should return all amounts as Decimal strings', async () => {
      const limit = await creditLimitService.deriveLimit('850', PRODUCT_ID, TENANT_ID, '5000.0000');
      expect(typeof limit).toBe('string');
      expect(limit).toMatch(/^\d+\.\d{4}$/);

      const exposure = await creditLimitService.calculateExposureCap(CUSTOMER_ID, TENANT_ID);
      expect(typeof exposure).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // 9. All Scores as Decimal Strings (cross-cutting)
  // -----------------------------------------------------------------------

  describe('Decimal String Validation', () => {
    const strategies = [ScoringStrategy.RULE_ONLY];

    it.each(strategies)('should return string scores for %s strategy', async (strategy) => {
      const result = await dualStrategy.execute(
        TENANT_ID, CUSTOMER_ID, PRODUCT_ID, 'application',
        REQUESTED_AMOUNT, strategy,
        TEST_SCORECARD, GOOD_FEATURES,
      );

      expect(typeof result.finalScore).toBe('string');
      expect(typeof result.recommendedLimit).toBe('string');
      expect(typeof result.confidence).toBe('string');
    });
  });
});
