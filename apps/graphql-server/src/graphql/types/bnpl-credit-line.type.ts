import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * Sprint 15 (S15-1, S15-2) — GraphQL types for BNPL credit lines.
 *
 * Monetary fields (`approvedLimit`, `availableLimit`, adjustment limits)
 * are surfaced as `String` per CLAUDE.md (Decimal-as-string).
 * `metadata` is opaque JSON.
 */

export enum BnplCreditLineStatusGql {
  active = 'active',
  suspended = 'suspended',
  closed = 'closed',
  // S16-FIX-1 — lines past `expiresAt` transition to this state via the
  // adjustment service's sweep. Distinct from `closed` (which represents
  // operator/customer-initiated termination).
  expired = 'expired',
}
registerEnumType(BnplCreditLineStatusGql, { name: 'BnplCreditLineStatus' });

@ObjectType()
export class BnplCreditLineAdjustmentType {
  @Field(() => ID) id!: string;
  @Field(() => ID) creditLineId!: string;
  @Field() previousLimit!: string;
  @Field() newLimit!: string;
  /** `increase` | `decrease` | `reset`. */
  @Field() adjustmentType!: string;
  @Field() reasonCode!: string;
  @Field({ nullable: true }) reasonDetail?: string;
  /** `system` | `operator:<userId>` | trigger enum value. */
  @Field() triggeredBy!: string;
  @Field() createdAt!: Date;
}

@ObjectType()
export class BnplCreditLineType {
  @Field(() => ID) id!: string;
  @Field(() => ID) tenantId!: string;
  @Field(() => ID) customerId!: string;
  @Field(() => ID) subscriptionId!: string;
  @Field(() => ID) productId!: string;
  /** Decimal-as-string. */
  @Field() approvedLimit!: string;
  /** Decimal-as-string. Always `<= approvedLimit`. */
  @Field() availableLimit!: string;
  @Field() currency!: string;
  @Field(() => BnplCreditLineStatusGql) status!: BnplCreditLineStatusGql;
  /** S16-FIX-1 — when the line first transitioned to active. */
  @Field({ nullable: true }) activatedAt?: Date;
  /** S16-FIX-1 — hard expiry. After this, status transitions to `expired`. */
  @Field({ nullable: true }) expiresAt?: Date;
  @Field({ nullable: true }) lastReviewedAt?: Date;
  @Field({ nullable: true }) nextReviewAt?: Date;
  @Field({ nullable: true }) suspendedAt?: Date;
  @Field({ nullable: true }) suspendedReason?: string;
  @Field({ nullable: true }) closedAt?: Date;
  @Field({ nullable: true }) closedReason?: string;
  @Field(() => GraphQLJSON, { nullable: true }) metadata?: unknown;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;

  /**
   * Adjustments (audit trail) — populated by a field resolver. Returned
   * newest-first. Use pagination once the history gets large; for now
   * limit to most recent 50.
   */
  @Field(() => [BnplCreditLineAdjustmentType])
  adjustments!: BnplCreditLineAdjustmentType[];
}
