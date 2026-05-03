import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class ScoreDistributionBucket {
  @Field()
  label!: string;

  @Field(() => Int)
  min!: number;

  @Field(() => Int)
  max!: number;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class RiskTierBreakdown {
  @Field()
  riskTier!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class ScoringVolumePoint {
  @Field()
  date!: string;

  @Field()
  modelType!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class TenantScoringRow {
  @Field()
  tenantId!: string;

  @Field({ nullable: true })
  tenantName?: string;

  @Field(() => Int)
  totalScorings!: number;

  @Field()
  avgScore!: string;

  @Field(() => Int)
  lowRiskCount!: number;

  @Field(() => Int)
  highRiskCount!: number;
}

@ObjectType()
export class PlatformScoringAnalyticsType {
  @Field(() => [ScoreDistributionBucket])
  scoreDistribution!: ScoreDistributionBucket[];

  @Field(() => [RiskTierBreakdown])
  riskTierBreakdown!: RiskTierBreakdown[];

  @Field(() => [ScoringVolumePoint])
  scoringVolume!: ScoringVolumePoint[];

  @Field(() => [TenantScoringRow])
  tenantComparison!: TenantScoringRow[];
}
