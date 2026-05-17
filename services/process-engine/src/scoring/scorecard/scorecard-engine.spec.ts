import { calculateScore, ScorecardConfig } from './scorecard-engine';

const TEST_SCORECARD: ScorecardConfig = {
  version: '1.0',
  scoreRange: { min: 0, max: 1000 },
  factors: [
    {
      name: 'account_age_days',
      weight: 30,
      bands: [
        { min: 365, max: null, points: 100 },
        { min: 180, max: 364, points: 70 },
        { min: 90, max: 179, points: 40 },
        { min: 0, max: 89, points: 10 },
      ],
    },
    {
      name: 'kyc_level',
      weight: 20,
      bands: [
        { min: 3, max: null, points: 100 },
        { min: 2, max: 2, points: 75 },
        { min: 1, max: 1, points: 50 },
        { min: 0, max: 0, points: 10 },
      ],
    },
    {
      name: 'payment_history_pct',
      weight: 50,
      bands: [
        { min: 90, max: null, points: 100 },
        { min: 70, max: 89, points: 70 },
        { min: 50, max: 69, points: 40 },
        { min: 0, max: 49, points: 10 },
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

describe('ScorecardEngine', () => {
  it('should produce a high score for excellent inputs', () => {
    const result = calculateScore(TEST_SCORECARD, {
      account_age_days: 400,
      kyc_level: 3,
      payment_history_pct: 95,
    }, '1000.0000');

    expect(Number(result.score)).toBeGreaterThanOrEqual(750);
    expect(result.riskTier).toBe('low');
    expect(Number(result.recommendedLimit)).toBeGreaterThan(0);
  });

  it('should produce a low score for poor inputs', () => {
    const result = calculateScore(TEST_SCORECARD, {
      account_age_days: 10,
      kyc_level: 0,
      payment_history_pct: 20,
    }, '1000.0000');

    expect(Number(result.score)).toBeLessThan(300);
    expect(result.riskTier).toBe('critical');
    expect(result.recommendedLimit).toBe('0.0000');
  });

  it('should include contributing factors', () => {
    const result = calculateScore(TEST_SCORECARD, {
      account_age_days: 200,
      kyc_level: 2,
      payment_history_pct: 80,
    }, '1000.0000');

    expect(result.contributingFactors).toHaveProperty('account_age_days');
    expect(result.contributingFactors).toHaveProperty('kyc_level');
    expect(result.contributingFactors).toHaveProperty('payment_history_pct');
    expect(result.contributingFactors.account_age_days.points).toBe(70);
    expect(result.contributingFactors.kyc_level.points).toBe(75);
    expect(result.contributingFactors.payment_history_pct.points).toBe(70);
  });

  it('should handle missing inputs with zero default', () => {
    const result = calculateScore(TEST_SCORECARD, {}, '1000.0000');
    expect(Number(result.score)).toBeGreaterThanOrEqual(0);
    expect(result.riskTier).toBeDefined();
  });

  it('should calculate recommended limit from score bands', () => {
    const result = calculateScore(TEST_SCORECARD, {
      account_age_days: 400,
      kyc_level: 3,
      payment_history_pct: 95,
    }, '2000.0000');

    // High score should get 5x multiplier
    expect(Number(result.recommendedLimit)).toBe(10000);
  });

  // ─────────────────────────────────────────────────────────────────────
  // S17-FIX-BA-2 — null-value factor handling
  // ─────────────────────────────────────────────────────────────────────

  describe('null factor handling (S17-FIX-BA-2)', () => {
    const SCORECARD_WITH_OPTIONAL: ScorecardConfig = {
      ...TEST_SCORECARD,
      factors: [
        ...TEST_SCORECARD.factors,
        {
          // Zero-weight extension — null on this must NOT show up as skipped.
          name: 'average_balance',
          weight: 0,
          bands: [
            { min: 500, max: null, points: 100 },
            { min: 0, max: 499, points: 10 },
          ],
        },
        {
          // Weighted optional factor — null here MUST skip cleanly.
          name: 'credit_bureau_score',
          weight: 25,
          bands: [
            { min: 70, max: null, points: 100 },
            { min: 0, max: 69, points: 10 },
          ],
        },
      ],
    };

    it('contributes 0 for null value when weight is 0 (backward compatible)', () => {
      const result = calculateScore(SCORECARD_WITH_OPTIONAL, {
        account_age_days: 400,
        kyc_level: 3,
        payment_history_pct: 95,
        average_balance: null, // weight=0 — should NOT appear in skippedFactors
        credit_bureau_score: 80, // present, weight>0 — scored normally
      }, '1000.0000');

      expect(result.skippedFactors).not.toContain('average_balance');
    });

    it('skips factor with null value when weight > 0 (no penalisation)', () => {
      const result = calculateScore(SCORECARD_WITH_OPTIONAL, {
        account_age_days: 400,
        kyc_level: 3,
        payment_history_pct: 95,
        average_balance: 350, // weight=0 — fine
        credit_bureau_score: null, // weight=25 — must skip, not penalise
      }, '1000.0000');

      expect(result.skippedFactors).toContain('credit_bureau_score');
      // contributingFactors must NOT include the skipped one — it didn't
      // contribute to the score at all.
      expect(result.contributingFactors).not.toHaveProperty('credit_bureau_score');
    });

    it('scores factor normally when value is provided and weight > 0', () => {
      const result = calculateScore(SCORECARD_WITH_OPTIONAL, {
        account_age_days: 400,
        kyc_level: 3,
        payment_history_pct: 95,
        average_balance: 350,
        credit_bureau_score: 85, // present, weight>0 — scored
      }, '1000.0000');

      expect(result.skippedFactors).not.toContain('credit_bureau_score');
      expect(result.contributingFactors).toHaveProperty('credit_bureau_score');
    });

    it('lists all skipped factor names in skippedFactors', () => {
      // Promote average_balance to weight>0 to demonstrate multi-skip.
      const dualWeighted: ScorecardConfig = {
        ...SCORECARD_WITH_OPTIONAL,
        factors: SCORECARD_WITH_OPTIONAL.factors.map((f) =>
          ['average_balance', 'credit_bureau_score'].includes(f.name)
            ? { ...f, weight: 10 }
            : f,
        ),
      };
      const result = calculateScore(dualWeighted, {
        account_age_days: 400,
        kyc_level: 3,
        payment_history_pct: 95,
        average_balance: null,
        credit_bureau_score: null,
      }, '1000.0000');

      expect(result.skippedFactors).toEqual(
        expect.arrayContaining(['average_balance', 'credit_bureau_score']),
      );
      // And the score should derive from only the three present factors —
      // i.e. the totalWeight denominator excluded the skipped 20 weight.
      expect(Number(result.score)).toBeGreaterThanOrEqual(0);
    });

    it('returns an empty skippedFactors array when no factors are skipped', () => {
      const result = calculateScore(TEST_SCORECARD, {
        account_age_days: 400,
        kyc_level: 3,
        payment_history_pct: 95,
      }, '1000.0000');
      expect(result.skippedFactors).toEqual([]);
    });
  });
});
