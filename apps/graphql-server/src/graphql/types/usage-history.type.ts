import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * S18-ENH — GraphQL types for billing usage history query.
 *
 * Monetary fields are Decimal-as-string per CLAUDE.md.
 * All amounts are expressed in the tenant's billing currency.
 */

@ObjectType()
export class BillingRecordType {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  tenantId!: string;

  @Field()
  invoiceNumber!: string;

  /** 'subscription' | 'usage' | 'revenue_share' */
  @Field()
  type!: string;

  @Field()
  billingPeriodStart!: Date;

  @Field()
  billingPeriodEnd!: Date;

  @Field()
  currency!: string;

  /** Decimal-as-string */
  @Field()
  subtotal!: string;

  /** Decimal-as-string */
  @Field()
  total!: string;

  /** 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled' | 'void' */
  @Field()
  status!: string;

  @Field({ nullable: true })
  issuedAt?: Date;

  @Field({ nullable: true })
  dueDate?: Date;

  @Field({ nullable: true })
  paidAt?: Date;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class EstimatedFeesType {
  /** Decimal-as-string — monthly subscription base fee */
  @Field()
  baseFee!: string;

  /** Decimal-as-string — per-disbursement fees accrued so far this period */
  @Field()
  transactionFees!: string;

  /** Decimal-as-string — baseFee + transactionFees */
  @Field()
  totalEstimated!: string;

  @Field()
  currency!: string;

  /** Count of completed disbursements in the current billing period */
  @Field(() => Int, { nullable: true })
  disbursementCount?: number;

  @Field({ nullable: true })
  periodStart?: Date;

  @Field({ nullable: true })
  periodEnd?: Date;
}

@ObjectType()
export class BillingPlanSummaryType {
  @Field(() => ID)
  id!: string;

  /** 'starter' | 'growth' | 'enterprise' */
  @Field()
  planTier!: string;

  /** 'per_disbursement' | 'revenue_share' */
  @Field()
  billingModel!: string;

  /** Decimal-as-string — monthly subscription amount in USD */
  @Field()
  subscriptionAmountUsd!: string;

  @Field()
  billingCurrency!: string;

  @Field(() => Int)
  paymentTermsDays!: number;

  @Field()
  contractStartDate!: Date;

  @Field({ nullable: true })
  contractEndDate?: Date;
}

@ObjectType()
export class UsageHistoryType {
  @Field(() => [BillingRecordType])
  records!: BillingRecordType[];

  /** ISO-8601 date of the next expected billing cycle */
  @Field({ nullable: true })
  nextBillingDate?: Date;

  @Field(() => EstimatedFeesType)
  estimatedFees!: EstimatedFeesType;

  @Field(() => BillingPlanSummaryType, { nullable: true })
  currentPlan?: BillingPlanSummaryType;

  /** Total count of records matching the query (not just the current page) */
  @Field(() => Int)
  totalCount!: number;
}
