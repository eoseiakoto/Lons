import { ObjectType, Field, Float, registerEnumType } from '@nestjs/graphql';

export enum RecoveryStrategyTypeEnum {
  grace_period = 'grace_period',
  restructure = 'restructure',
  partial_settlement = 'partial_settlement',
  fee_recovery = 'fee_recovery',
  escalation = 'escalation',
  payment_holiday = 'payment_holiday',
}

registerEnumType(RecoveryStrategyTypeEnum, {
  name: 'RecoveryStrategyTypeEnum',
  description: 'Types of recovery strategies',
});

@ObjectType()
export class RiskFactorType {
  @Field()
  factor!: string;

  @Field()
  impact!: string;

  @Field()
  description!: string;
}

@ObjectType()
export class DefaultRiskAssessmentType {
  @Field()
  contractId!: string;

  @Field()
  probabilityOfDefault!: string;

  @Field()
  predictedDaysToDefault!: number;

  @Field()
  confidence!: string;

  @Field(() => [RiskFactorType])
  topRiskFactors!: RiskFactorType[];

  @Field()
  assessedAt!: Date;
}

@ObjectType()
export class RecoveryStrategyItemType {
  @Field(() => RecoveryStrategyTypeEnum)
  type!: RecoveryStrategyTypeEnum;

  @Field()
  description!: string;

  @Field(() => Float)
  successProbability!: number;

  @Field()
  estimatedRecovery!: string;

  @Field()
  priority!: number;

  @Field({ nullable: true })
  confidence?: number;

  @Field({ nullable: true })
  reasoning?: string;
}
