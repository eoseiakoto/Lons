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
}

export function calculateScore(scorecard: ScorecardConfig, inputs: ScoringInput, baseAmount: string): ScoringOutput {
  const contributingFactors: ScoringOutput['contributingFactors'] = {};
  let totalWeightedPoints = '0.0000';
  let totalWeight = 0;

  for (const factor of scorecard.factors) {
    const value = inputs[factor.name];
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

  return { score, riskTier, recommendedLimit, contributingFactors, confidence };
}
