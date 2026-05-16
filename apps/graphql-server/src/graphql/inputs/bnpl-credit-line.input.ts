import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

import { BnplCreditLineStatusGql } from '../types/bnpl-credit-line.type';

/**
 * Sprint 15 (S15-1, S15-2) — input types for BNPL credit line mutations.
 *
 * FIX-3 (Sprint 15 PM review): every mutation accepts an
 * `idempotencyKey` per CLAUDE.md. Replay-protection lives in the
 * service layer; this DTO only carries the value.
 *
 * FIX-8: class-validator decorators added to mirror the rest of the
 * codebase — UUIDs validated at the framework boundary so malformed
 * inputs never reach the service, and a 422 surfaces to the client
 * instead of an opaque Prisma error.
 */

@InputType()
export class CreateBnplCreditLineInput {
  /** Replay key. Repeated calls with the same value return the existing row. */
  @Field()
  @IsString()
  @IsNotEmpty()
  @Length(8, 255)
  idempotencyKey!: string;

  @Field(() => ID)
  @IsUUID()
  customerId!: string;

  @Field(() => ID)
  @IsUUID()
  subscriptionId!: string;

  @Field(() => ID)
  @IsUUID()
  productId!: string;

  /** Decimal-as-string. */
  @Field()
  @IsString()
  @IsNotEmpty()
  approvedLimit!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  currency!: string;

  /** ISO 8601. Defaults to +90 days from now if omitted. */
  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  nextReviewAt?: string;

  /**
   * S16-FIX-1 — ISO 8601. When set, the adjustment service transitions
   * the line to `expired` after this timestamp. Leave unset for
   * indefinite credit grants.
   */
  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

@InputType()
export class UpdateBnplCreditLineStatusInput {
  /** Replay key — same status transition with same key is a no-op. */
  @Field()
  @IsString()
  @IsNotEmpty()
  @Length(8, 255)
  idempotencyKey!: string;

  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field(() => BnplCreditLineStatusGql)
  status!: BnplCreditLineStatusGql;

  /** Required when suspending or closing. */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;
}

@InputType()
export class AdjustBnplCreditLimitInput {
  /**
   * Replay key. Duplicate manual adjustment with the same value returns
   * the originally-created adjustment row — no double-apply.
   */
  @Field()
  @IsString()
  @IsNotEmpty()
  @Length(8, 255)
  idempotencyKey!: string;

  @Field(() => ID)
  @IsUUID()
  creditLineId!: string;

  /** Decimal-as-string. */
  @Field()
  @IsString()
  @IsNotEmpty()
  newLimit!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  reasonCode!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  reasonDetail?: string;
}
