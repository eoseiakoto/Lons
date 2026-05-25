import { Field, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString } from 'class-validator';
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
  @IsOptional() @IsString() @Field({ nullable: true }) displayName?: string;
  @IsOptional() @IsObject() @Field(() => GraphQLJSON, { nullable: true }) allowedProductTypes?: unknown;

  @IsOptional() @IsInt() @Field(() => Int, { nullable: true }) maxActiveProducts?: number | null;
  @IsOptional() @IsInt() @Field(() => Int, { nullable: true }) maxCustomers?: number | null;
  // Explicit `() => String` is required because TypeScript's emitted
  // metadata for `string | null` collapses to `Object`, which the
  // GraphQL schema builder rejects (UndefinedTypeError at boot).
  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  maxMonthlyDisbursementVolumeUsd?: string | null;
  @IsOptional() @IsInt() @Field(() => Int, { nullable: true }) maxMonthlyTransactions?: number | null;
  @IsOptional() @IsInt() @Field(() => Int, { nullable: true }) maxLenderConfigs?: number | null;
  @IsOptional() @IsInt() @Field(() => Int, { nullable: true }) maxBnplMerchants?: number | null;
  @IsOptional() @IsInt() @Field(() => Int, { nullable: true }) maxPortalUsers?: number | null;
  @IsOptional() @IsInt() @Field(() => Int, { nullable: true }) dataRetentionMonths?: number;

  @IsOptional() @IsObject() @Field(() => GraphQLJSON, { nullable: true }) featureFlags?: unknown;

  @IsOptional() @IsInt() @Field(() => Int, { nullable: true }) apiRateLimitPerMinute?: number;
  @IsOptional() @IsBoolean() @Field({ nullable: true }) restApiEnabled?: boolean;
  @IsOptional() @IsBoolean() @Field({ nullable: true }) websocketEnabled?: boolean;
  @IsOptional() @IsBoolean() @Field({ nullable: true }) bulkOperationsEnabled?: boolean;
  @IsOptional() @IsInt() @Field(() => Int, { nullable: true }) maxApiKeys?: number | null;

  @IsOptional() @IsObject() @Field(() => GraphQLJSON, { nullable: true }) brandingOptions?: unknown;
}
