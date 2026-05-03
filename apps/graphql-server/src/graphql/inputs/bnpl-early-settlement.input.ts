import { Field, ID, InputType, Int } from '@nestjs/graphql';

/**
 * GraphQL input shapes for the BNPL early-settlement and advance-payment
 * mutations (Sprint 12 G3). Both accept `idempotencyKey` for client-side
 * replay safety.
 */

@InputType()
export class EarlySettlementInput {
  @Field(() => ID) transactionId!: string;
  @Field() idempotencyKey!: string;
}

@InputType()
export class AdvancePaymentInput {
  @Field(() => ID) transactionId!: string;
  /** Installment numbers to pay in advance. */
  @Field(() => [Int]) installmentNumbers!: number[];
  @Field() idempotencyKey!: string;
}
