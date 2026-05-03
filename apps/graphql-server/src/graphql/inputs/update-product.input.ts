import { InputType, Field, Int } from '@nestjs/graphql';
import { IsOptional, IsString, IsInt, Min, IsDecimal } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import type { MoneyString } from '@lons/shared-types';

@InputType()
export class UpdateProductInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

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

  /** Interest rate as a decimal string (e.g. "5.5" for 5.5%). */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  interestRate?: MoneyString;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  gracePeriodDays?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  coolingOffHours?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  maxActiveLoans?: number;

  // JSON fields for structured data stored in Prisma JSON columns
  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  feeStructure?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  penaltyConfig?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  eligibilityRules?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  approvalThresholds?: Record<string, unknown>;

  @Field({ nullable: true, description: 'Lender UUID — set to null to remove lender assignment' })
  @IsOptional()
  @IsString()
  lenderId?: string;

  @Field(() => GraphQLJSON, { nullable: true, description: 'Revenue sharing: { lenderSharePercent, insuranceEnabled, insuranceProvider, insuranceCoverageType }' })
  @IsOptional()
  revenueSharing?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  notificationConfig?: Record<string, unknown>;
}
