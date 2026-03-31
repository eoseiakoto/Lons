import { Injectable, Logger } from '@nestjs/common';
import { ScoringStrategy } from '@lons/shared-types';
import { bankersRound, multiply, add } from '@lons/common';

import { calculateScore, ScorecardConfig, ScoringInput } from './scorecard/scorecard-engine';
import { MlScoringClient, MlScoringResponse } from './ml-scoring.client';

export interface DualScoringResult {
  finalScore: string;
  ruleScore?: string;
  mlScore?: string;
  riskTier: string;
  recommendedLimit: string;
  strategy: ScoringStrategy;
  contributingFactors: Record<string, unknown>;
  confidence: string;
  probabilityOfDefault?: string;
  modelVersions: {
    rule?: string;
    ml?: string;
  };
}

const DEFAULT_ML_WEIGHT = '0.6000';
const DEFAULT_RULE_WEIGHT = '0.4000';

@Injectable()
export class DualScoringStrategy {
  private readonly logger = new Logger(DualScoringStrategy.name);

  constructor(private readonly mlClient: MlScoringClient) {}

  async execute(
    tenantId: string,
    customerId: string,
    productId: string,
    context: string,
    requestedAmount: string,
    strategy: ScoringStrategy,
    scorecard: ScorecardConfig,
    inputFeatures: ScoringInput,
    mlWeight: string = DEFAULT_ML_WEIGHT,
    ruleWeight: string = DEFAULT_RULE_WEIGHT,
  ): Promise<DualScoringResult> {
    switch (strategy) {
      case ScoringStrategy.RULE_ONLY:
        return this.executeRuleOnly(scorecard, inputFeatures, requestedAmount);

      case ScoringStrategy.ML_ONLY:
        return this.executeMlOnly(tenantId, customerId, inputFeatures, requestedAmount, strategy);

      case ScoringStrategy.HIGHER:
      case ScoringStrategy.LOWER:
      case ScoringStrategy.WEIGHTED_AVERAGE:
        return this.executeDual(
          tenantId,
          customerId,
          requestedAmount,
          strategy,
          scorecard,
          inputFeatures,
          mlWeight,
          ruleWeight,
        );

      default:
        throw new Error(`Unknown scoring strategy: ${strategy}`);
    }
  }

  private executeRuleOnly(
    scorecard: ScorecardConfig,
    inputFeatures: ScoringInput,
    requestedAmount: string,
  ): DualScoringResult {
    const result = calculateScore(scorecard, inputFeatures, requestedAmount);

    return {
      finalScore: result.score,
      ruleScore: result.score,
      riskTier: result.riskTier,
      recommendedLimit: result.recommendedLimit,
      strategy: ScoringStrategy.RULE_ONLY,
      contributingFactors: result.contributingFactors,
      confidence: result.confidence,
      modelVersions: { rule: scorecard.version },
    };
  }

  private async executeMlOnly(
    tenantId: string,
    customerId: string,
    inputFeatures: ScoringInput,
    requestedAmount: string,
    strategy: ScoringStrategy,
  ): Promise<DualScoringResult> {
    const mlResponse = await this.mlClient.score(
      tenantId,
      customerId,
      inputFeatures as Record<string, unknown>,
      requestedAmount,
      undefined,
      strategy,
    );

    return this.mapMlResponse(mlResponse, ScoringStrategy.ML_ONLY);
  }

  private async executeDual(
    tenantId: string,
    customerId: string,
    requestedAmount: string,
    strategy: ScoringStrategy,
    scorecard: ScorecardConfig,
    inputFeatures: ScoringInput,
    mlWeight: string,
    ruleWeight: string,
  ): Promise<DualScoringResult> {
    const [ruleResult, mlResponse] = await Promise.all([
      Promise.resolve(calculateScore(scorecard, inputFeatures, requestedAmount)),
      this.mlClient.score(
        tenantId,
        customerId,
        inputFeatures as Record<string, unknown>,
        requestedAmount,
        undefined,
        strategy,
      ),
    ]);

    const ruleScore = ruleResult.score;
    const mlScore = bankersRound(String(mlResponse.score), 2);

    let finalScore: string;
    let riskTier: string;
    let recommendedLimit: string;
    let contributingFactors: Record<string, unknown>;
    let confidence: string;

    switch (strategy) {
      case ScoringStrategy.HIGHER: {
        const useRule = Number(ruleScore) >= Number(mlScore);
        finalScore = useRule ? ruleScore : mlScore;
        riskTier = useRule ? ruleResult.riskTier : mlResponse.risk_tier;
        recommendedLimit = useRule ? ruleResult.recommendedLimit : mlResponse.recommended_limit;
        contributingFactors = useRule
          ? ruleResult.contributingFactors
          : this.mlFactorsToRecord(mlResponse.contributing_factors);
        confidence = useRule ? ruleResult.confidence : bankersRound(String(mlResponse.confidence), 4);
        break;
      }

      case ScoringStrategy.LOWER: {
        const useRule = Number(ruleScore) <= Number(mlScore);
        finalScore = useRule ? ruleScore : mlScore;
        riskTier = useRule ? ruleResult.riskTier : mlResponse.risk_tier;
        recommendedLimit = useRule ? ruleResult.recommendedLimit : mlResponse.recommended_limit;
        contributingFactors = useRule
          ? ruleResult.contributingFactors
          : this.mlFactorsToRecord(mlResponse.contributing_factors);
        confidence = useRule ? ruleResult.confidence : bankersRound(String(mlResponse.confidence), 4);
        break;
      }

      case ScoringStrategy.WEIGHTED_AVERAGE: {
        const weightedRule = multiply(ruleScore, ruleWeight);
        const weightedMl = multiply(mlScore, mlWeight);
        finalScore = bankersRound(add(weightedRule, weightedMl), 2);

        // Derive risk tier from weighted score using scorecard tiers
        const sortedTiers = [...scorecard.riskTiers].sort((a, b) => b.minScore - a.minScore);
        riskTier = 'critical';
        for (const tier of sortedTiers) {
          if (Number(finalScore) >= tier.minScore) {
            riskTier = tier.tier;
            break;
          }
        }

        // Weighted average of recommended limits
        const ruleLimit = ruleResult.recommendedLimit;
        const mlLimit = mlResponse.recommended_limit;
        recommendedLimit = bankersRound(
          add(multiply(ruleLimit, ruleWeight), multiply(mlLimit, mlWeight)),
          4,
        );

        // Merge contributing factors
        contributingFactors = {
          rule: ruleResult.contributingFactors,
          ml: this.mlFactorsToRecord(mlResponse.contributing_factors),
        };

        // Weighted average of confidence
        const ruleConf = ruleResult.confidence;
        const mlConf = bankersRound(String(mlResponse.confidence), 4);
        confidence = bankersRound(
          add(multiply(ruleConf, ruleWeight), multiply(mlConf, mlWeight)),
          4,
        );
        break;
      }

      default:
        throw new Error(`Unsupported dual strategy: ${strategy}`);
    }

    return {
      finalScore,
      ruleScore,
      mlScore,
      riskTier,
      recommendedLimit,
      strategy,
      contributingFactors,
      confidence,
      probabilityOfDefault: bankersRound(String(mlResponse.probability_of_default), 4),
      modelVersions: {
        rule: scorecard.version,
        ml: mlResponse.model_version,
      },
    };
  }

  private mapMlResponse(
    mlResponse: MlScoringResponse,
    strategy: ScoringStrategy,
  ): DualScoringResult {
    return {
      finalScore: bankersRound(String(mlResponse.score), 2),
      mlScore: bankersRound(String(mlResponse.score), 2),
      riskTier: mlResponse.risk_tier,
      recommendedLimit: mlResponse.recommended_limit,
      strategy,
      contributingFactors: this.mlFactorsToRecord(mlResponse.contributing_factors),
      confidence: bankersRound(String(mlResponse.confidence), 4),
      probabilityOfDefault: bankersRound(String(mlResponse.probability_of_default), 4),
      modelVersions: { ml: mlResponse.model_version },
    };
  }

  private mlFactorsToRecord(
    factors: Array<{ name: string; impact: number }>,
  ): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    for (const f of factors) {
      record[f.name] = { impact: f.impact };
    }
    return record;
  }
}
