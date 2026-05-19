import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * Sprint 14 (S14-14b) — GraphQL types for the usage-metrics API.
 *
 * The `*Dimension` types carry `{ current, limit }` pairs. Limits are
 * nullable (null = unlimited / enterprise tier). Monetary fields are
 * Decimal-as-string per CLAUDE.md.
 */

@ObjectType()
export class UsageDimensionInt {
  @Field(() => Int) current!: number;
  /** null = unlimited. */
  @Field(() => Int, { nullable: true }) limit?: number | null;
}

@ObjectType()
export class UsageDimensionMoney {
  /** Decimal-as-string. */
  @Field() current!: string;
  /** Decimal-as-string. null = unlimited. */
  // Explicit `() => String` required — TS emits `string | null` as
  // `Object` and the GraphQL schema builder rejects that.
  @Field(() => String, { nullable: true }) limit?: string | null;
}

@ObjectType()
export class BillingPeriodType {
  @Field() start!: string;
  @Field() end!: string;
}

@ObjectType()
export class UsageSnapshotType {
  @Field() tenantId!: string;
  @Field() currentPlanTier!: string;

  @Field(() => UsageDimensionInt) activeProducts!: UsageDimensionInt;
  @Field(() => UsageDimensionInt) activeCustomers!: UsageDimensionInt;
  @Field(() => UsageDimensionInt) monthlyDisbursementCount!: UsageDimensionInt;
  @Field(() => UsageDimensionMoney)
  monthlyDisbursementVolumeUsd!: UsageDimensionMoney;
  @Field(() => UsageDimensionInt) portalUsers!: UsageDimensionInt;
  @Field(() => UsageDimensionInt) apiKeys!: UsageDimensionInt;
  @Field(() => UsageDimensionInt) lenders!: UsageDimensionInt;
  @Field(() => UsageDimensionInt) merchants!: UsageDimensionInt;

  @Field(() => Int) dailyApiCalls!: number;
  @Field(() => Int) apiRateLimitPerMinute!: number;

  @Field(() => BillingPeriodType) billingPeriod!: BillingPeriodType;
}
