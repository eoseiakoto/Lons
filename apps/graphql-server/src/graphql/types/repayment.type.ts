import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';

@ObjectType()
export class RepaymentType {
  @Field(() => ID)
  id!: string;

  @Field()
  contractId!: string;

  @Field()
  customerId!: string;

  @Field()
  amount!: string;

  @Field()
  currency!: string;

  @Field()
  method!: string;

  @Field({ nullable: true })
  source?: string;

  @Field({ nullable: true })
  allocatedPrincipal?: string;

  @Field({ nullable: true })
  allocatedInterest?: string;

  @Field({ nullable: true })
  allocatedFees?: string;

  @Field({ nullable: true })
  allocatedPenalties?: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class RepaymentEdge {
  @Field(() => RepaymentType)
  node!: RepaymentType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class RepaymentConnection {
  @Field(() => [RepaymentEdge])
  edges!: RepaymentEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}

@ObjectType()
export class RepaymentScheduleEntryType {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  installmentNumber!: number;

  @Field()
  dueDate!: Date;

  @Field({ nullable: true })
  principalAmount?: string;

  @Field({ nullable: true })
  interestAmount?: string;

  @Field({ nullable: true })
  feeAmount?: string;

  @Field()
  totalAmount!: string;

  @Field()
  paidAmount!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  paidAt?: Date;
}

/**
 * Sprint 16 (S16-9) — one row of the early-settlement breakdown.
 * `type` is `debit` (customer owes) or `credit` (customer is refunded).
 */
@ObjectType()
export class EarlySettlementBreakdownItem {
  @Field()
  label!: string;

  /** Decimal-as-string. */
  @Field()
  amount!: string;

  @Field()
  type!: string;
}

@ObjectType()
export class EarlySettlementQuote {
  @Field()
  contractId!: string;

  @Field()
  outstandingPrincipal!: string;

  @Field()
  outstandingInterest!: string;

  @Field()
  outstandingFees!: string;

  @Field()
  outstandingPenalties!: string;

  @Field()
  totalSettlementAmount!: string;

  @Field()
  currency!: string;

  // ── Sprint 16 (S16-9) — extended fields ─────────────────────────────
  /** Decimal-as-string. `0` when no rebate is configured. */
  @Field({ nullable: true })
  interestRebate?: string;

  /** Decimal-as-string. `0` when no fee is configured. */
  @Field({ nullable: true })
  settlementFee?: string;

  /** ISO 8601 — quote validity, end of current UTC day. */
  @Field({ nullable: true })
  validUntil?: string;

  /** Itemised breakdown. Empty array on legacy quotes. */
  @Field(() => [EarlySettlementBreakdownItem], { nullable: true })
  breakdown?: EarlySettlementBreakdownItem[];
}
