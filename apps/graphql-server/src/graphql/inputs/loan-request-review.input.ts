import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Sprint 18 (S18-1) — operator review action inputs. Lives alongside
 * the existing `create-loan-request.input.ts`; consumed by
 * `LoanRequestReviewResolver`.
 */

@InputType()
export class RejectionReasonInput {
  /** Predefined code, e.g. LOW_CREDIT_SCORE, POLICY_VIOLATION. */
  @IsString()
  @Field()
  code!: string;

  /** Human-readable explanation rendered in the customer notification. */
  @IsString()
  @Field()
  message!: string;
}

@InputType()
export class ModifyTermsInput {
  /** Decimal string per CLAUDE.md — never a float. */
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  adjustedAmount?: string;

  @IsOptional()
  @IsInt()
  @Field(() => Int, { nullable: true })
  adjustedTenor?: number;

  /** Decimal string, e.g. "12.5000" — annual percentage rate. */
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  adjustedInterestRate?: string;

  @IsString()
  @Field()
  modificationReason!: string;
}
