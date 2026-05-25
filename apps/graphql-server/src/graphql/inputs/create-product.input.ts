import { InputType, Field, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsInt, Min, IsDecimal } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import type { MoneyString } from '@lons/shared-types';

/**
 * FIX-STAB-1: class-validator decorators placed ABOVE @Field so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted.
 */
@InputType()
export class CreateProductInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true, defaultValue: '' })
  code?: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  name!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  description?: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  type!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  lenderId?: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  currency!: string;

  /** Monetary amount as a string. See MoneyString docs in @lons/shared-types. */
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  @Field(() => String, { nullable: true })
  minAmount?: MoneyString;

  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  @Field(() => String, { nullable: true })
  maxAmount?: MoneyString;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Field(() => Int, { nullable: true })
  minTenorDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Field(() => Int, { nullable: true })
  maxTenorDays?: number;

  @IsNotEmpty()
  @IsString()
  @Field()
  interestRateModel!: string;

  /**
   * Interest rate as a decimal string (e.g. "5.5" for 5.5%). Stored as
   * Decimal to avoid float precision loss in compounding/accrual math.
   */
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  @Field(() => String, { nullable: true })
  interestRate?: MoneyString;

  @IsNotEmpty()
  @IsString()
  @Field()
  repaymentMethod!: string;

  @IsOptional()
  @IsInt()
  @Field(() => Int, { nullable: true, defaultValue: 0 })
  gracePeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Field(() => Int, { nullable: true, defaultValue: 0 })
  coolingOffHours?: number;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  approvalWorkflow?: string;

  @IsOptional()
  @IsInt()
  @Field(() => Int, { nullable: true, defaultValue: 1 })
  maxActiveLoans?: number;

  // JSON fields for structured data stored in Prisma JSON columns
  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true, description: 'Fee structure: { originationFee, serviceFee, latePenalty, insurance }' })
  feeStructure?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true, description: 'Penalty configuration' })
  penaltyConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true, description: 'Eligibility rules: { minCreditScore, minKycLevel, customRules }' })
  eligibilityRules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true, description: 'Approval thresholds: { autoApproveThreshold, slaHours }' })
  approvalThresholds?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true, description: 'Revenue sharing: { lenderSharePercent, insuranceEnabled, insuranceProvider, insuranceCoverageType }' })
  revenueSharing?: Record<string, unknown>;
}
