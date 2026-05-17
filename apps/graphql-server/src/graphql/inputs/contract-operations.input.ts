import { Field, InputType, Int } from '@nestjs/graphql';

/**
 * Sprint 18 (S18-2 / FR-LO-003.2) — operator write-operation inputs.
 *
 * All money values are Decimal strings per CLAUDE.md.
 */

@InputType()
export class ManualPaymentInput {
  /** Decimal string. */
  @Field()
  amount!: string;

  @Field()
  currency!: string;

  /** cash | bank_transfer | cheque | mobile_money */
  @Field()
  paymentMethod!: string;

  /** External reference (bank txn id, cheque #, etc.). */
  @Field()
  paymentRef!: string;

  @Field({ nullable: true })
  paymentDate?: Date;

  @Field({ nullable: true })
  notes?: string;
}

@InputType()
export class RestructureContractInput {
  @Field(() => Int, { nullable: true })
  newTenorDays?: number;

  /** Decimal string e.g. "15.0000". */
  @Field({ nullable: true })
  newInterestRate?: string;

  @Field({ nullable: true })
  newMaturityDate?: Date;

  @Field()
  restructureReason!: string;
}

@InputType()
export class WaivePenaltiesInput {
  /** Decimal string. */
  @Field()
  waiverAmount!: string;

  @Field()
  waiverReason!: string;
}
