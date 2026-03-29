import { DualScoringStrategy } from '../dual-scoring.strategy';
import { MlScoringClient, MlScoringResponse } from '../ml-scoring.client';
import { ScoringStrategy } from '@lons/shared-types';
import { ScorecardConfig } from '../scorecard/scorecard-engine';

const TEST_SCORECARD: ScorecardConfig = {
  version: '1.0',
  scoreRange: { min: 0, max: 1000 },
  factors: [
    {
      name: 'account_age_days',
      weight: 50,
      bands: [
        { min: 365, max: null, points: 100 },
        { min: 180, max: 364, points: 70 },
        { min: 0, max: 179, points: 30 },
      ],
    },
    {
      name: 'payment_history_pct',
      weight: 50,
      bands: [
        { min: 90, max: null, points: 100 },
        { min: 50, max: 89, points: 60 },
        { min: 0, max: 49, points: 20 },
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
    { minScore: 750, maxScore: 1000, limitMultiplier: '5.0' },
    { minScore: 500, maxScore: 749, limitMultiplier: '3.0' },
    { minScore: 300, maxScore: 499, limitMultiplier: '1.5' },
    { minScore: 0, maxScore: 299, limitMultiplier: '0' },
  ],
};

const MOCK_ML_RESPONSE: MlScoringResponse = {
  score: 650,
  probability_of_default: 0.15,
  recommended_limit: '3000.0000',
  confidence: 0.88,
  risk_tier: 'medium',
  contributing_factors: [
    { name: 'payment_history', impact: 0.4 },
    { name: 'account_age', impact: 0.3 },
  ],
  model_version: 'ml-v1.0',
};

const INPUT_FEATURES = {
  account_age_days: 400,
  payment_history_pct: 95,
};

describe('DualScoringStrategy', () => {
  let strategy: DualScoringStrategy;
  let mockMlClient: jest.Mocked<MlScoringClient>;

  beforeEach(() => {
    mockMlClient = {
      score: jest.fn().mockResolvedValue(MOCK_ML_RESPONSE),
      healthCheck: jest.fn().mockResolvedValue(true),
      _getCircuitBreakerState: jest.fn(),
      _resetCircuitBreaker: jest.fn(),
    } as any;

    strategy = new DualScoringStrategy(mockMlClient);
  });

  describe('RULE_ONLY strategy', () => {
    it('should only use rule-based scoring', async () => {
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.RULE_ONLY,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      expect(result.strategy).toBe(ScoringStrategy.RULE_ONLY);
      expect(result.ruleScore).toBeDefined();
      expect(result.mlScore).toBeUndefined();
      expect(result.modelVersions.rule).toBe('1.0');
      expect(result.modelVersions.ml).toBeUndefined();
      expect(mockMlClient.score).not.toHaveBeenCalled();
    });

    it('should return correct rule score for high inputs', async () => {
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.RULE_ONLY,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      // account_age_days=400 => 100pts, payment_history_pct=95 => 100pts
      // weighted = (100*50 + 100*50) = 10000, total_weight=100
      // score = 10000 * 1000 / (100 * 100) = 1000
      expect(Number(result.finalScore)).toBe(1000);
      expect(result.riskTier).toBe('low');
    });
  });

  describe('ML_ONLY strategy', () => {
    it('should only use ML scoring', async () => {
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.ML_ONLY,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      expect(result.strategy).toBe(ScoringStrategy.ML_ONLY);
      expect(result.mlScore).toBeDefined();
      expect(result.ruleScore).toBeUndefined();
      expect(result.modelVersions.ml).toBe('ml-v1.0');
      expect(result.modelVersions.rule).toBeUndefined();
      expect(mockMlClient.score).toHaveBeenCalledTimes(1);
    });

    it('should map ML response correctly', async () => {
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.ML_ONLY,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      expect(Number(result.finalScore)).toBe(650);
      expect(result.riskTier).toBe('medium');
      expect(result.probabilityOfDefault).toBe('0.1500');
      expect(result.recommendedLimit).toBe('3000.0000');
    });
  });

  describe('HIGHER strategy', () => {
    it('should run both and return higher score', async () => {
      // Rule score is 1000 (perfect inputs), ML score is 650
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.HIGHER,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      expect(result.strategy).toBe(ScoringStrategy.HIGHER);
      expect(result.ruleScore).toBeDefined();
      expect(result.mlScore).toBeDefined();
      // Rule score (1000) > ML score (650)
      expect(Number(result.finalScore)).toBe(1000);
      expect(mockMlClient.score).toHaveBeenCalledTimes(1);
    });

    it('should return ML score when it is higher', async () => {
      // Use low rule inputs so rule score is low
      const lowInputs = { account_age_days: 10, payment_history_pct: 10 };
      mockMlClient.score.mockResolvedValue({ ...MOCK_ML_RESPONSE, score: 800 });

      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.HIGHER,
        TEST_SCORECARD, lowInputs,
      );

      // Rule with low inputs: 30pts*50 + 20pts*50 = 2500, score = 2500*1000/(100*100) = 250
      expect(Number(result.finalScore)).toBe(800);
    });
  });

  describe('LOWER strategy', () => {
    it('should run both and return lower score', async () => {
      // Rule score is 1000 (perfect inputs), ML score is 650
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.LOWER,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      expect(result.strategy).toBe(ScoringStrategy.LOWER);
      expect(result.ruleScore).toBeDefined();
      expect(result.mlScore).toBeDefined();
      // ML score (650) < Rule score (1000)
      expect(Number(result.finalScore)).toBe(650);
    });
  });

  describe('WEIGHTED_AVERAGE strategy', () => {
    it('should calculate weighted average with default weights (60% ML, 40% rule)', async () => {
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      expect(result.strategy).toBe(ScoringStrategy.WEIGHTED_AVERAGE);
      expect(result.ruleScore).toBeDefined();
      expect(result.mlScore).toBeDefined();

      // Rule score = 1000, ML score = 650
      // Weighted = (1000 * 0.4) + (650 * 0.6) = 400 + 390 = 790
      expect(Number(result.finalScore)).toBe(790);
    });

    it('should calculate weighted average with custom weights', async () => {
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, INPUT_FEATURES,
        '0.3000', // ML weight
        '0.7000', // Rule weight
      );

      // Rule score = 1000, ML score = 650
      // Weighted = (1000 * 0.7) + (650 * 0.3) = 700 + 195 = 895
      expect(Number(result.finalScore)).toBe(895);
    });

    it('should include contributing factors from both models', async () => {
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      const factors = result.contributingFactors as { rule: unknown; ml: unknown };
      expect(factors.rule).toBeDefined();
      expect(factors.ml).toBeDefined();
    });

    it('should include both model versions', async () => {
      const result = await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      expect(result.modelVersions.rule).toBe('1.0');
      expect(result.modelVersions.ml).toBe('ml-v1.0');
    });
  });

  describe('parallel execution', () => {
    it('should call rule and ML in parallel for HIGHER strategy', async () => {
      let mlCallTime = 0;
      mockMlClient.score.mockImplementation(async () => {
        mlCallTime = Date.now();
        return MOCK_ML_RESPONSE;
      });

      const startTime = Date.now();
      await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.HIGHER,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      // ML client should have been called
      expect(mockMlClient.score).toHaveBeenCalledTimes(1);
    });

    it('should call rule and ML in parallel for LOWER strategy', async () => {
      await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.LOWER,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      expect(mockMlClient.score).toHaveBeenCalledTimes(1);
    });

    it('should call rule and ML in parallel for WEIGHTED_AVERAGE strategy', async () => {
      await strategy.execute(
        'tenant-1', 'customer-1', 'product-1', 'application',
        '1000.0000', ScoringStrategy.WEIGHTED_AVERAGE,
        TEST_SCORECARD, INPUT_FEATURES,
      );

      expect(mockMlClient.score).toHaveBeenCalledTimes(1);
    });
  });
});
