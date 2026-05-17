import { Field, ID, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

/**
 * S17-4 / FR-CS-001.1 — persisted scorecard version.
 *
 * `config` carries the full scorecard JSON (factors, weights, bands,
 * risk tiers, limit bands). Score range is duplicated as a top-level
 * decimal for fast filtering / aggregation.
 */
@ObjectType()
export class ScorecardConfigType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field(() => ID, { nullable: true })
  productId?: string;

  @Field()
  name!: string;

  @Field()
  version!: string;

  @Field(() => GraphQLJSON)
  config!: Record<string, unknown>;

  @Field()
  scoreRangeMin!: string;

  @Field()
  scoreRangeMax!: string;

  @Field()
  isActive!: boolean;

  @Field({ nullable: true })
  createdBy?: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
