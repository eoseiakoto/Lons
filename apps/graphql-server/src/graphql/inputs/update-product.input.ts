import { InputType, Field, Int } from '@nestjs/graphql';
import { IsDecimal, IsInt, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import type { MoneyString } from '@lons/shared-types';

@InputType()
export class UpdateProductInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  name?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  description?: string;

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

  /** Interest rate as a decimal string (e.g. "5.5" for 5.5%). */
  @IsOptional()
  @IsString()
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  @Field(() => String, { nullable: true })
  interestRate?: MoneyString;

  @IsOptional()
  @IsInt()
  @Field(() => Int, { nullable: true })
  gracePeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Field(() => Int, { nullable: true })
  coolingOffHours?: number;

  @IsOptional()
  @IsInt()
  @Field(() => Int, { nullable: true })
  maxActiveLoans?: number;

  // JSON fields for structured data stored in Prisma JSON columns
  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  feeStructure?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  penaltyConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  eligibilityRules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  approvalThresholds?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  @Field({ nullable: true, description: 'Lender UUID — set to null to remove lender assignment' })
  lenderId?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true, description: 'Revenue sharing: { lenderSharePercent, insuranceEnabled, insuranceProvider, insuranceCoverageType }' })
  revenueSharing?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  notificationConfig?: Record<string, unknown>;
}
