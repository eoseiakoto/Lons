import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { PageInfo } from './page-info.type';
import { LenderType } from './lender.type';

@ObjectType()
export class ProductType {
  @Field(() => ID)
  id!: string;

  @Field()
  code!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  type!: string;

  @Field(() => LenderType, { nullable: true })
  lender?: LenderType;

  @Field()
  currency!: string;

  @Field({ nullable: true })
  minAmount?: string;

  @Field({ nullable: true })
  maxAmount?: string;

  @Field({ nullable: true })
  minTenorDays?: number;

  @Field({ nullable: true })
  maxTenorDays?: number;

  @Field()
  interestRateModel!: string;

  @Field({ nullable: true })
  interestRate?: string;

  @Field()
  repaymentMethod!: string;

  @Field()
  gracePeriodDays!: number;

  @Field()
  approvalWorkflow!: string;

  @Field()
  maxActiveLoans!: number;

  @Field(() => GraphQLJSON, { nullable: true })
  feeStructure?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  penaltyConfig?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  eligibilityRules?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  approvalThresholds?: Record<string, unknown>;

  @Field({ nullable: true })
  coolingOffHours?: number;

  @Field({ nullable: true })
  tenantId?: string;

  @Field()
  version!: number;

  @Field()
  status!: string;

  @Field({ nullable: true })
  activatedAt?: Date;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => Int, { nullable: true })
  activeContractsCount?: number;

  @Field({ nullable: true })
  totalDisbursed?: string;
}

@ObjectType()
export class ProductEdge {
  @Field(() => ProductType)
  node!: ProductType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class ProductConnection {
  @Field(() => [ProductEdge])
  edges!: ProductEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
