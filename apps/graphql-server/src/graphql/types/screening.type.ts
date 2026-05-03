import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

export enum ScreeningStatusEnum {
  CLEAR = 'CLEAR',
  MATCH = 'MATCH',
  POTENTIAL_MATCH = 'POTENTIAL_MATCH',
  ERROR = 'ERROR',
}

export enum ScreeningRiskLevelEnum {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ScreeningMatchTypeEnum {
  SANCTIONS = 'SANCTIONS',
  PEP = 'PEP',
  ADVERSE_MEDIA = 'ADVERSE_MEDIA',
  WATCHLIST = 'WATCHLIST',
}

registerEnumType(ScreeningStatusEnum, { name: 'ScreeningStatus' });
registerEnumType(ScreeningRiskLevelEnum, { name: 'ScreeningRiskLevel' });
registerEnumType(ScreeningMatchTypeEnum, { name: 'ScreeningMatchType' });

@ObjectType()
export class ScreeningMatchFieldType {
  @Field()
  matchId!: string;

  @Field(() => ScreeningMatchTypeEnum)
  matchType!: ScreeningMatchTypeEnum;

  @Field()
  entityName!: string;

  @Field(() => Int)
  matchScore!: number;

  @Field()
  source!: string;

  @Field(() => GraphQLJSON, { nullable: true })
  details?: Record<string, unknown>;
}

@ObjectType()
export class ScreeningCustomerSummary {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  fullName?: string;

  @Field({ nullable: true })
  phonePrimary?: string;

  @Field({ nullable: true })
  externalId?: string;

  @Field({ nullable: true })
  country?: string;

  @Field({ nullable: true })
  kycLevel?: string;

  @Field({ nullable: true })
  status?: string;
}

@ObjectType()
export class ScreeningResultType {
  @Field(() => ID)
  screeningId!: string;

  @Field()
  customerId!: string;

  @Field(() => ScreeningCustomerSummary, { nullable: true })
  customer?: ScreeningCustomerSummary;

  @Field()
  tenantId!: string;

  @Field(() => ScreeningStatusEnum)
  status!: ScreeningStatusEnum;

  @Field(() => ScreeningRiskLevelEnum)
  riskLevel!: ScreeningRiskLevelEnum;

  @Field(() => [ScreeningMatchFieldType])
  matches!: ScreeningMatchFieldType[];

  @Field()
  provider!: string;

  @Field()
  screenedAt!: Date;

  @Field(() => GraphQLJSON, { nullable: true })
  rawResponse?: Record<string, unknown>;

  @Field({ nullable: true })
  reviewedBy?: string;

  @Field({ nullable: true })
  reviewedAt?: Date;

  @Field({ nullable: true })
  reviewDecision?: string;
}
