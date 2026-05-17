import { bankersRound, multiply, divide, add, compare } from '@lons/common';

export interface ScorecardConfig {
  version: string;
  scoreRange: { min: number; max: number };
  factors: ScorecardFactor[];
  riskTiers: { tier: string; minScore: number }[];
  limitBands: { minScore: number; maxScore: number; limitMultiplier: string }[];
}

export interface ScorecardFactor {
  name: string;
  weight: number;
  bands: { min: number; max: number | null; points: number }[];
}

export interface ScoringInput {
  [key: string]: number | string | null | undefined;
}

export interface ScoringOutput {
  score: string;
  riskTier: string;
  recommendedLimit: string;
  contributingFactors: Record<string, { value: number | string | null | undefined; points: number; weight: number; weightedScore: string }>;
  confidence: string;
  /**
   * S17-FIX-BA-2 — names of factors that were excluded from the score
   * because their input value was null/undefined AND the factor's
   * weight was > 0. A null on a zero-weight factor is harmless and is
   * NOT reported here. Empty array when nothing was skipped.
   */
  skippedFactors: string[];
}

export function calculateScore(scorecard: ScorecardConfig, inputs: ScoringInput, baseAmount: string): ScoringOutput {
  const contributingFactors: ScoringOutput['contributingFactors'] = {};
  const skippedFactors: string[] = [];
  let totalWeightedPoints = '0.0000';
  let totalWeight = 0;

  for (const factor of scorecard.factors) {
    const value = inputs[factor.name];

    // S17-FIX-BA-2 — null means "no data available", NOT "zero". If
    // the factor has any weight, treating null as 0 would push the
    // customer into the lowest band and silently penalise everyone
    // who hasn't synced EMI/bureau data yet. Skip the factor entirely
    // — it contributes nothing to the score AND nothing to the
    // totalWeight denominator, so the normalisation is over the
    // factors that actually had data. Zero-weight factors stay on
    // the legacy "value-coerced-to-0" path so default-scorecard
    // behaviour is unchanged (backward compatible per FIX-BA-2
    // exit criterion).
    if ((value === null || value === undefined) && factor.weight > 0) {
      skippedFactors.push(factor.name);
      continue;
    }

    const numericValue = value !== null && value !== undefined ? Number(value) : 0;

    let points = 0;
    for (const band of factor.bands) {
      const maxVal = band.max ?? Number.MAX_SAFE_INTEGER;
      if (numericValue >= band.min && numericValue <= maxVal) {
        points = band.points;
        break;
      }
    }

    const weightedScore = bankersRound(multiply(String(points), String(factor.weight)), 4);
    totalWeightedPoints = add(totalWeightedPoints, weightedScore);
    totalWeight += factor.weight;

    contributingFactors[factor.name] = {
      value,
      points,
      weight: factor.weight,
      weightedScore,
    };
  }

  // Normalize to score range
  const rawScore = totalWeight > 0
    ? divide(multiply(totalWeightedPoints, String(scorecard.scoreRange.max)), multiply(String(totalWeight), '100'))
    : '0.0000';

  const score = bankersRound(rawScore, 2);

  // Determine risk tier (sorted descending by minScore)
  const sortedTiers = [...scorecard.riskTiers].sort((a, b) => b.minScore - a.minScore);
  let riskTier = 'critical';
  for (const tier of sortedTiers) {
    if (compare(score, String(tier.minScore)) >= 0) {
      riskTier = tier.tier;
      break;
    }
  }

  // Determine recommended limit
  let recommendedLimit = '0.0000';
  for (const band of scorecard.limitBands) {
    const scoreNum = Number(score);
    if (scoreNum >= band.minScore && scoreNum <= band.maxScore) {
      recommendedLimit = bankersRound(multiply(baseAmount, band.limitMultiplier), 4);
      break;
    }
  }

  const confidence = totalWeight > 0 ? bankersRound(divide(String(totalWeight), '100'), 4) : '0.0000';

  return { score, riskTier, recommendedLimit, contributingFactors, confidence, skippedFactors };
}
