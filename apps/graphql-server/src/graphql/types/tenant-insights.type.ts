import { ObjectType, Field, Int, ID } from '@nestjs/graphql';

@ObjectType()
export class PortfolioHealthBucket {
  @Field()
  classification!: string;

  @Field(() => Int)
  count!: number;

  @Field()
  amount!: string;
}

@ObjectType()
export class MonthlyDisbursement {
  @Field()
  month!: string;

  @Field()
  totalAmount!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class RevenueBreakdown {
  @Field()
  totalRevenue!: string;

  @Field()
  platformShare!: string;

  @Field()
  lenderShare!: string;

  @Field()
  netSPRevenue!: string;
}

@ObjectType()
export class ProductPerformanceRow {
  @Field(() => ID)
  productId!: string;

  @Field()
  productName!: string;

  @Field(() => Int)
  contracts!: number;

  @Field()
  disbursed!: string;

  @Field()
  defaultRate!: string;

  @Field()
  avgScore!: string;
}

@ObjectType()
export class TenantInsightsType {
  @Field(() => Int)
  activeContracts!: number;

  @Field()
  totalOutstanding!: string;

  @Field()
  defaultRate!: string;

  @Field()
  avgCreditScore!: string;

  @Field(() => [PortfolioHealthBucket])
  portfolioHealth!: PortfolioHealthBucket[];

  @Field(() => [MonthlyDisbursement])
  monthlyDisbursements!: MonthlyDisbursement[];

  @Field(() => RevenueBreakdown, { nullable: true })
  revenueBreakdown?: RevenueBreakdown;

  @Field(() => [ProductPerformanceRow])
  productPerformance!: ProductPerformanceRow[];

  @Field(() => Int, { nullable: true })
  anonymizationCount?: number;

  @Field(() => Int, { nullable: true })
  anonymizationBlockedCount?: number;

  @Field(() => Int, { nullable: true })
  coolingOffContracts?: number;

  @Field({ nullable: true })
  avgCustomerExposure?: string;

  @Field(() => Int, { nullable: true })
  customersNearExposureLimit?: number;
}
