import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

/**
 * S17-9 / FR-CM-002.1 — read-only customer financial profile.
 *
 * All monetary amounts are strings to preserve Decimal precision over
 * the JSON boundary. Counts are integers; the repayment score is null
 * when there's no payment history (avoids the 0%-for-new-customers
 * trap).
 */
@ObjectType()
export class CustomerFinancialProfileType {
  @Field(() => ID)
  customerId!: string;

  @Field(() => Int)
  totalLoans!: number;

  @Field(() => Int)
  activeContracts!: number;

  @Field(() => Int, { nullable: true })
  repaymentScore?: number;

  @Field()
  averageLoanSize!: string;

  @Field(() => Int)
  defaultRate!: number;

  @Field(() => Int)
  defaultedContracts!: number;

  @Field()
  totalOutstandingBalance!: string;

  @Field({ nullable: true })
  latestWalletBalance?: string;

  @Field({ nullable: true })
  averageBalance30d?: string;

  @Field(() => Int, { nullable: true })
  transactionCount30d?: number;

  @Field(() => Int, { nullable: true })
  incomeConsistency?: number;

  @Field()
  lastUpdated!: Date;
}
