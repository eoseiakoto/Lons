import { InputType, Field, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsInt, Min, IsDecimal } from 'class-validator';
import type { MoneyString } from '@lons/shared-types';

@InputType()
export class CreateLoanRequestInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  customerId!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  productId!: string;

  /**
   * Monetary amount as a string to preserve Decimal precision. CLAUDE.md
   * forbids `Float`/`number` for money. Format: positive decimal with up
   * to 4 decimal places (e.g. "1234.5678").
   */
  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  requestedAmount!: MoneyString;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  requestedTenor?: number;

  @Field()
  @IsNotEmpty()
  @IsString()
  currency!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  channel?: string;
}
