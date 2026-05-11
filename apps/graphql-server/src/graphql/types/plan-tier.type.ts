import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * Sprint 14 (S14-9) — GraphQL types for the plan-tier infrastructure.
 *
 * `PlanTierType` mirrors the `PlanTierConfig` Prisma model. JSON-shaped
 * columns (`allowedProductTypes`, `featureFlags`, `brandingOptions`)
 * are surfaced as `GraphQLJSON` — the client renders them as
 * data-driven tables and we don't want every shape change to require a
 * GraphQL schema update.
 */

export enum PlanTierGql {
  starter = 'starter',
  growth = 'growth',
  enterprise = 'enterprise',
}
registerEnumType(PlanTierGql, { name: 'PlanTierEnum' });

@ObjectType()
export class PlanTierConfigType {
  @Field(() => ID) id!: string;
  @Field(() => PlanTierGql) tier!: PlanTierGql;
  @Field() displayName!: string;

  /** JSONB array of `ProductType` strings. */
  @Field(() => GraphQLJSON) allowedProductTypes!: unknown;

  // null = unlimited (enterprise behaviour).
  @Field(() => Int, { nullable: true }) maxActiveProducts?: number;
  @Field(() => Int, { nullable: true }) maxCustomers?: number;
  /** Decimal-as-string. null = unlimited. */
  @Field({ nullable: true }) maxMonthlyDisbursementVolumeUsd?: string;
  @Field(() => Int, { nullable: true }) maxMonthlyTransactions?: number;
  @Field(() => Int, { nullable: true }) maxLenderConfigs?: number;
  @Field(() => Int, { nullable: true }) maxBnplMerchants?: number;
  @Field(() => Int, { nullable: true }) maxPortalUsers?: number;
  @Field(() => Int) dataRetentionMonths!: number;

  /** JSON feature-flag bag — see SPEC-plan-tiers.md §3.3. */
  @Field(() => GraphQLJSON) featureFlags!: unknown;

  @Field(() => Int) apiRateLimitPerMinute!: number;
  @Field() restApiEnabled!: boolean;
  @Field() websocketEnabled!: boolean;
  @Field() bulkOperationsEnabled!: boolean;
  @Field(() => Int, { nullable: true }) maxApiKeys?: number;

  /** JSON branding options — see SPEC-plan-tiers.md §3.6. */
  @Field(() => GraphQLJSON) brandingOptions!: unknown;

  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}
