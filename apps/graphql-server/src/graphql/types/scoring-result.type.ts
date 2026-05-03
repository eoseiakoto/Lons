import { ObjectType, Field, ID } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class ScoringResultType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  customerId!: string;

  @Field()
  productId!: string;

  @Field()
  modelType!: string;

  @Field({ nullable: true })
  modelVersion?: string;

  @Field()
  score!: string;

  @Field()
  scoreRangeMin!: string;

  @Field()
  scoreRangeMax!: string;

  @Field({ nullable: true })
  probabilityDefault?: string;

  @Field()
  riskTier!: string;

  @Field({ nullable: true })
  recommendedLimit?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  contributingFactors?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  inputFeatures?: Record<string, unknown>;

  @Field({ nullable: true })
  confidence?: string;

  @Field()
  context!: string;

  @Field()
  createdAt!: Date;
}
