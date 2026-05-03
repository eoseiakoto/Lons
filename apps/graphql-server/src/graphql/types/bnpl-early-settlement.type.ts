import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * GraphQL surface for the BNPL early-settlement and advance-payment
 * mutations (Sprint 12 G3).
 *
 * Monetary fields are Decimal-as-string per CLAUDE.md.
 */

@ObjectType()
export class EarlySettlementType {
  /** Decimal-as-string — what the customer paid (already net of discount). */
  @Field() settlementAmount!: string;
  /** Decimal-as-string — the discount the customer received ('0' if none). */
  @Field() discountApplied!: string;
  /** Count of installments transitioned to paid. */
  @Field(() => Int) installmentsClosed!: number;
}

@ObjectType()
export class AdvancePaymentType {
  /** Decimal-as-string — sum of the paid installments. */
  @Field() totalPaid!: string;
  /** Count of installments transitioned to paid. */
  @Field(() => Int) installmentsClosed!: number;
}
