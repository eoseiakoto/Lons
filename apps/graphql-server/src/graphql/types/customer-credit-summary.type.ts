import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

/**
 * S17-10 / FR-CM-003.1 — customer credit summary for the admin portal
 * header. All monetary fields are strings; tier strings come from the
 * `DelinquencyTier` union defined in the service.
 */
@ObjectType()
export class CustomerCreditSummaryType {
  @Field(() => ID)
  customerId!: string;

  @Field({ nullable: true })
  currentScore?: string;

  @Field({ nullable: true })
  scoreModelVersion?: string;

  @Field({ nullable: true })
  riskTier?: string;

  @Field()
  totalCreditLimit!: string;

  @Field()
  totalExposure!: string;

  @Field()
  totalUtilizedCredit!: string;

  @Field()
  totalAvailableCredit!: string;

  @Field(() => Int)
  activeContracts!: number;

  @Field(() => Int)
  overdueContracts!: number;

  @Field()
  worstDelinquency!: string;

  @Field()
  totalOutstandingBalance!: string;

  @Field({ nullable: true })
  lastScoreDate?: Date;
}
