/**
 * S17-5 / FR-CS-001.2 — Feature normalisation helpers for the scorer.
 *
 * Credit bureaus return scores on different ranges (FICO 300-850,
 * VantageScore 300-850, TransUnion XCB 0-700, CRB Kenya 200-900...).
 * Our scorecard works in a 0-100 input space per factor, so we
 * normalise on the way in.
 */

export interface NormalizationRange {
  min: number;
  max: number;
}

/**
 * Linearly normalise a bureau score from its source range to the
 * target range (default 0-100). Out-of-range inputs are clamped.
 *
 * @example
 *   normalizeBureauScore(750, { min: 300, max: 850 })       // → 82
 *   normalizeBureauScore(550, { min: 200, max: 900 })       // → 50
 *   normalizeBureauScore(950, { min: 300, max: 850 })       // → 100 (clamped)
 */
export function normalizeBureauScore(
  score: number,
  sourceRange: NormalizationRange,
  targetRange: NormalizationRange = { min: 0, max: 100 },
): number {
  if (sourceRange.max <= sourceRange.min) {
    throw new Error(
      `Invalid source range: max (${sourceRange.max}) must be > min (${sourceRange.min})`,
    );
  }
  const ratio =
    (score - sourceRange.min) / (sourceRange.max - sourceRange.min);
  const scaled =
    ratio * (targetRange.max - targetRange.min) + targetRange.min;
  // Clamp to target.
  const clamped = Math.min(targetRange.max, Math.max(targetRange.min, scaled));
  return Math.round(clamped);
}

/**
 * Aggregate an arbitrary object of custom factor values into a single
 * 0-100 score by averaging the numeric entries.
 *
 * Tenants can populate `CustomerFinancialData.rawData.customFactors`
 * with SP-specific signals (e.g. {phoneRecharge: 75, utilityPay: 82}).
 * The scorecard reads this as the `custom_factors` input. For Sprint 17
 * the aggregator is intentionally simple (mean of numeric values 0-100);
 * smarter aggregation (weighted, percentile-mapped) is future work.
 *
 * Returns null when no numeric values are present so the scorecard can
 * fall back to its default band.
 */
export function aggregateCustomFactors(
  factors: Record<string, unknown> | null | undefined,
): number | null {
  if (!factors || typeof factors !== 'object') return null;

  const numericValues: number[] = [];
  for (const v of Object.values(factors)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      // Treat any out-of-range numeric as clipped to [0, 100].
      numericValues.push(Math.min(100, Math.max(0, v)));
    }
  }

  if (numericValues.length === 0) return null;
  const sum = numericValues.reduce((acc, n) => acc + n, 0);
  return Math.round(sum / numericValues.length);
}
