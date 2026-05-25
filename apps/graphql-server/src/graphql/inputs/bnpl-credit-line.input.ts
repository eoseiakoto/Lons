import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsDateString,
  IsEnum,
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
 *
 * FIX-STAB-1: decorators placed ABOVE @Field so the global
 * ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted. See invoice-verification.input.ts for the
 * canonical pattern.
 */

@InputType()
export class CreateBnplCreditLineInput {
  /** Replay key. Repeated calls with the same value return the existing row. */
  @IsString()
  @IsNotEmpty()
  @Length(8, 255)
  @Field()
  idempotencyKey!: string;

  @IsUUID()
  @Field(() => ID)
  customerId!: string;

  @IsUUID()
  @Field(() => ID)
  subscriptionId!: string;

  @IsUUID()
  @Field(() => ID)
  productId!: string;

  /** Decimal-as-string. */
  @IsString()
  @IsNotEmpty()
  @Field()
  approvedLimit!: string;

  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  @Field()
  currency!: string;

  /** ISO 8601. Defaults to +90 days from now if omitted. */
  @IsOptional()
  @IsDateString()
  @Field({ nullable: true })
  nextReviewAt?: string;

  /**
   * S16-FIX-1 — ISO 8601. When set, the adjustment service transitions
   * the line to `expired` after this timestamp. Leave unset for
   * indefinite credit grants.
   */
  @IsOptional()
  @IsDateString()
  @Field({ nullable: true })
  expiresAt?: string;
}

@InputType()
export class UpdateBnplCreditLineStatusInput {
  /** Replay key — same status transition with same key is a no-op. */
  @IsString()
  @IsNotEmpty()
  @Length(8, 255)
  @Field()
  idempotencyKey!: string;

  @IsUUID()
  @Field(() => ID)
  id!: string;

  @IsEnum(BnplCreditLineStatusGql)
  @Field(() => BnplCreditLineStatusGql)
  status!: BnplCreditLineStatusGql;

  /** Required when suspending or closing. */
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  reason?: string;
}

@InputType()
export class AdjustBnplCreditLimitInput {
  /**
   * Replay key. Duplicate manual adjustment with the same value returns
   * the originally-created adjustment row — no double-apply.
   */
  @IsString()
  @IsNotEmpty()
  @Length(8, 255)
  @Field()
  idempotencyKey!: string;

  @IsUUID()
  @Field(() => ID)
  creditLineId!: string;

  /** Decimal-as-string. */
  @IsString()
  @IsNotEmpty()
  @Field()
  newLimit!: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  reasonCode!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  reasonDetail?: string;
}
