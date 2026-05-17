import { Field, InputType, Int } from '@nestjs/graphql';

/**
 * Sprint 18 (S18-1) — operator review action inputs. Lives alongside
 * the existing `create-loan-request.input.ts`; consumed by
 * `LoanRequestReviewResolver`.
 */

@InputType()
export class RejectionReasonInput {
  /** Predefined code, e.g. LOW_CREDIT_SCORE, POLICY_VIOLATION. */
  @Field()
  code!: string;

  /** Human-readable explanation rendered in the customer notification. */
  @Field()
  message!: string;
}

@InputType()
export class ModifyTermsInput {
  /** Decimal string per CLAUDE.md — never a float. */
  @Field({ nullable: true })
  adjustedAmount?: string;

  @Field(() => Int, { nullable: true })
  adjustedTenor?: number;

  /** Decimal string, e.g. "12.5000" — annual percentage rate. */
  @Field({ nullable: true })
  adjustedInterestRate?: string;

  @Field()
  modificationReason!: string;
}
