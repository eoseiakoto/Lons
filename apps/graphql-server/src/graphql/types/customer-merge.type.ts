import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

/**
 * S17-8 / FR-CM-001.3 — result of a customer merge mutation.
 *
 * `reparented` is an open-ended map of <table-name, count>; surfacing
 * it as a structured object (rather than JSON) keeps the schema
 * self-documenting and lets clients render it directly. The exact set
 * of table names is the service's contract — see CustomerMergeService.
 */
@ObjectType()
export class CustomerMergeReparentedType {
  @Field(() => Int)
  subscription!: number;

  @Field(() => Int)
  loanRequest!: number;

  @Field(() => Int)
  scoringResult!: number;

  @Field(() => Int)
  contract!: number;

  @Field(() => Int)
  disbursement!: number;

  @Field(() => Int)
  repayment!: number;

  @Field(() => Int)
  notification!: number;

  @Field(() => Int)
  screeningResult!: number;

  @Field(() => Int)
  creditLine!: number;

  @Field(() => Int)
  customerConsent!: number;

  @Field(() => Int)
  walletAccountMapping!: number;

  @Field(() => Int)
  bnplTransaction!: number;

  @Field(() => Int)
  bnplCreditLine!: number;

  @Field(() => Int)
  microLoanCreditLimitChange!: number;

  @Field(() => Int)
  customerFinancialData!: number;
}

@ObjectType()
export class CustomerMergeResultType {
  @Field(() => ID)
  targetCustomerId!: string;

  @Field(() => ID)
  sourceCustomerId!: string;

  @Field(() => CustomerMergeReparentedType)
  reparented!: CustomerMergeReparentedType;

  @Field()
  idempotentReplay!: boolean;

  @Field()
  mergedAt!: Date;
}
