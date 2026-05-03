import { InputType, Field, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsInt, Min, IsDecimal } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import type { MoneyString } from '@lons/shared-types';

@InputType()
export class CreateProductInput {
  @Field({ nullable: true, defaultValue: '' })
  @IsOptional()
  @IsString()
  code?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  name!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  type!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  lenderId?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  currency!: string;

  /** Monetary amount as a string. See MoneyString docs in @lons/shared-types. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  minAmount?: MoneyString;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  maxAmount?: MoneyString;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  minTenorDays?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTenorDays?: number;

  @Field()
  @IsNotEmpty()
  @IsString()
  interestRateModel!: string;

  /**
   * Interest rate as a decimal string (e.g. "5.5" for 5.5%). Stored as
   * Decimal to avoid float precision loss in compounding/accrual math.
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  interestRate?: MoneyString;

  @Field()
  @IsNotEmpty()
  @IsString()
  repaymentMethod!: string;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  gracePeriodDays?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  coolingOffHours?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  approvalWorkflow?: string;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @IsOptional()
  @IsInt()
  maxActiveLoans?: number;

  // JSON fields for structured data stored in Prisma JSON columns
  @Field(() => GraphQLJSON, { nullable: true, description: 'Fee structure: { originationFee, serviceFee, latePenalty, insurance }' })
  @IsOptional()
  feeStructure?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true, description: 'Penalty configuration' })
  @IsOptional()
  penaltyConfig?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true, description: 'Eligibility rules: { minCreditScore, minKycLevel, customRules }' })
  @IsOptional()
  eligibilityRules?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true, description: 'Approval thresholds: { autoApproveThreshold, slaHours }' })
  @IsOptional()
  approvalThresholds?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true, description: 'Revenue sharing: { lenderSharePercent, insuranceEnabled, insuranceProvider, insuranceCoverageType }' })
  @IsOptional()
  revenueSharing?: Record<string, unknown>;
}
