import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * Sprint 18 (S18-11) — admin-portal types for the Billing & Plan page.
 *
 * Three top-level types:
 *   - `PlanTierSummaryType` — the calling tenant's current plan,
 *     usage snapshot, limits, and feature flags.
 *   - `PlanTierComparisonType` — single-row tier definition; the
 *     query returns one per tier so the portal can render a
 *     comparison table.
 *   - `UpgradeRequestType` — confirmation of a submitted upgrade.
 */

@ObjectType()
export class UsageLimitsType {
  @Field(() => Int, { nullable: true }) maxActiveProducts?: number | null;
  @Field(() => Int, { nullable: true }) maxCustomers?: number | null;
  @Field({ nullable: true }) maxMonthlyDisbursementVolumeUsd?: string | null;
  @Field(() => Int, { nullable: true }) maxMonthlyTransactions?: number | null;
  @Field(() => Int, { nullable: true }) maxLenderConfigs?: number | null;
  @Field(() => Int, { nullable: true }) maxBnplMerchants?: number | null;
  @Field(() => Int, { nullable: true }) maxPortalUsers?: number | null;
  @Field(() => Int, { nullable: true }) maxApiKeys?: number | null;
  @Field(() => Int) apiRateLimitPerMinute!: number;
}

@ObjectType()
export class CurrentUsageType {
  @Field(() => Int) activeProducts!: number;
  @Field(() => Int) totalCustomers!: number;
  /** Decimal string — never converted to a float. */
  @Field() monthlyDisbursementVolumeUsd!: string;
  @Field(() => Int) monthlyTransactions!: number;
  @Field(() => Int) activeLenderConfigs!: number;
  @Field(() => Int) activeBnplMerchants!: number;
  @Field(() => Int) portalUsers!: number;
  @Field(() => Int) activeApiKeys!: number;
}

@ObjectType()
export class PlanTierSummaryType {
  @Field() currentTier!: string;
  @Field() tierDisplayName!: string;
  @Field() billingModel!: string;
  @Field() subscriptionAmount!: string;
  @Field() billingCurrency!: string;
  @Field({ nullable: true }) contractStartDate?: string | null;
  @Field({ nullable: true }) contractEndDate?: string | null;
  @Field(() => CurrentUsageType) usage!: CurrentUsageType;
  @Field(() => UsageLimitsType) limits!: UsageLimitsType;
  @Field(() => GraphQLJSON) featureFlags!: Record<string, unknown>;
}

@ObjectType()
export class PlanTierComparisonType {
  @Field() tier!: string;
  @Field() displayName!: string;
  @Field(() => Int, { nullable: true }) maxActiveProducts?: number | null;
  @Field(() => Int, { nullable: true }) maxCustomers?: number | null;
  @Field({ nullable: true }) maxMonthlyDisbursementVolumeUsd?: string | null;
  @Field(() => Int, { nullable: true }) maxMonthlyTransactions?: number | null;
  @Field(() => Int, { nullable: true }) maxLenderConfigs?: number | null;
  @Field(() => Int, { nullable: true }) maxPortalUsers?: number | null;
  @Field(() => Int) apiRateLimitPerMinute!: number;
  @Field() restApiEnabled!: boolean;
  @Field() websocketEnabled!: boolean;
  @Field() bulkOperationsEnabled!: boolean;
  @Field(() => GraphQLJSON) featureFlags!: Record<string, unknown>;
  @Field(() => GraphQLJSON) allowedProductTypes!: unknown;
}

@ObjectType()
export class UpgradeRequestType {
  @Field(() => ID) id!: string;
  @Field() currentTier!: string;
  @Field() requestedTier!: string;
  @Field() status!: string;
  @Field({ nullable: true }) reason?: string | null;
  @Field() createdAt!: Date;
}
