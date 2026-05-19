import { Field, InputType, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * Sprint 14 (S14-9) — platform-admin input for editing a PlanTierConfig
 * row. Every field is optional so the resolver can do a partial update;
 * the service merges these into the existing row.
 *
 * Money fields are Decimal-as-string per CLAUDE.md.
 */
@InputType()
export class UpdatePlanTierConfigInput {
  @Field({ nullable: true }) displayName?: string;
  @Field(() => GraphQLJSON, { nullable: true }) allowedProductTypes?: unknown;

  @Field(() => Int, { nullable: true }) maxActiveProducts?: number | null;
  @Field(() => Int, { nullable: true }) maxCustomers?: number | null;
  // Explicit `() => String` is required because TypeScript's emitted
  // metadata for `string | null` collapses to `Object`, which the
  // GraphQL schema builder rejects (UndefinedTypeError at boot).
  @Field(() => String, { nullable: true })
  maxMonthlyDisbursementVolumeUsd?: string | null;
  @Field(() => Int, { nullable: true }) maxMonthlyTransactions?: number | null;
  @Field(() => Int, { nullable: true }) maxLenderConfigs?: number | null;
  @Field(() => Int, { nullable: true }) maxBnplMerchants?: number | null;
  @Field(() => Int, { nullable: true }) maxPortalUsers?: number | null;
  @Field(() => Int, { nullable: true }) dataRetentionMonths?: number;

  @Field(() => GraphQLJSON, { nullable: true }) featureFlags?: unknown;

  @Field(() => Int, { nullable: true }) apiRateLimitPerMinute?: number;
  @Field({ nullable: true }) restApiEnabled?: boolean;
  @Field({ nullable: true }) websocketEnabled?: boolean;
  @Field({ nullable: true }) bulkOperationsEnabled?: boolean;
  @Field(() => Int, { nullable: true }) maxApiKeys?: number | null;

  @Field(() => GraphQLJSON, { nullable: true }) brandingOptions?: unknown;
}
