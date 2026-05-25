import { ScorecardConfig } from '../interfaces/scorecard-config.interface';

/**
 * S17-4 / S17-5 — Hardcoded fallback scorecard.
 *
 * Used by the process-engine `ScorecardConfigService.getActiveScorecard`
 * when neither a product-specific nor tenant-default scorecard is configured
 * in the database, and by the database seed to populate the initial
 * `scorecard_configs` row.
 *
 * The three S17-5 factors (`average_balance`, `credit_bureau_score`,
 * `custom_factors`) carry `weight: 0` so they have no effect on the default
 * score until a tenant explicitly opts in by uploading a scorecard with
 * non-zero weights.
 */
export const DEFAULT_SCORECARD: ScorecardConfig = {
  // S17-FIX-7 — bumped 1.1 → 1.2 alongside the bureau-score band fix.
  // The version is part of the unique key on scorecard_configs, so
  // re-seeding will insert the new bands as a fresh row rather than
  // colliding with the prior (broken) row. Operators handle the
  // activation cut-over manually via the scorecard admin UI.
  version: '1.2',
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
      // S17-FIX-7 — bureau scores are normalised to a 0–100 scale
      // before scoring (via `normalizeBureauScore` in feature-normalizer).
      // The earlier 0–1000 thresholds left all real-world inputs in the
      // lowest band once a tenant flipped the weight off zero. Bands
      // now match the post-normalisation range.
      name: 'credit_bureau_score',
      weight: 0,
      bands: [
        { min: 70, max: null, points: 100 },
        { min: 50, max: 69, points: 70 },
        { min: 30, max: 49, points: 40 },
        { min: 0, max: 29, points: 10 },
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
