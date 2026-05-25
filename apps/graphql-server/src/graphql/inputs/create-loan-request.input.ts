import { InputType, Field, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsInt, Min, IsDecimal } from 'class-validator';
import type { MoneyString } from '@lons/shared-types';

/**
 * FIX-STAB-1: class-validator decorators placed ABOVE @Field so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted.
 */
@InputType()
export class CreateLoanRequestInput {
  @IsNotEmpty()
  @IsString()
  @Field()
  customerId!: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  productId!: string;

  /**
   * Monetary amount as a string to preserve Decimal precision. CLAUDE.md
   * forbids `Float`/`number` for money. Format: positive decimal with up
   * to 4 decimal places (e.g. "1234.5678").
   */
  @IsNotEmpty()
  @IsString()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  @Field(() => String)
  requestedAmount!: MoneyString;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Field(() => Int, { nullable: true })
  requestedTenor?: number;

  @IsNotEmpty()
  @IsString()
  @Field()
  currency!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  channel?: string;
}
