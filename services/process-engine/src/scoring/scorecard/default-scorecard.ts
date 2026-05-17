import { ScorecardConfig } from './scorecard-engine';

/**
 * S17-4 / S17-5 — Hardcoded fallback scorecard.
 *
 * Used by {@link ScorecardConfigService.getActiveScorecard} when neither
 * a product-specific nor tenant-default scorecard is configured in the
 * database. The three new factors (`average_balance`,
 * `credit_bureau_score`, `custom_factors`) are present but carry
 * `weight: 0` so they have no effect on the default score until a tenant
 * explicitly opts in by uploading a scorecard with non-zero weights.
 */
export const DEFAULT_SCORECARD: ScorecardConfig = {
  version: '1.1',
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
    // ── S17-5 new factors — weight 0 keeps the v1.0 score unchanged
    //    until a tenant uploads a scorecard that re-weights them.
    {
      name: 'average_balance',
      weight: 0,
      bands: [
        { min: 500, max: null, points: 100 },
        { min: 200, max: 499, points: 70 },
        { min: 50, max: 199, points: 40 },
        { min: 0, max: 49, points: 10 },
      ],
    },
    {
      name: 'credit_bureau_score',
      weight: 0,
      bands: [
        { min: 700, max: null, points: 100 },
        { min: 500, max: 699, points: 70 },
        { min: 300, max: 499, points: 40 },
        { min: 0, max: 299, points: 10 },
      ],
    },
    {
      name: 'custom_factors',
      weight: 0,
      bands: [
        { min: 80, max: null, points: 100 },
        { min: 50, max: 79, points: 70 },
        { min: 20, max: 49, points: 40 },
        { min: 0, max: 19, points: 10 },
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
