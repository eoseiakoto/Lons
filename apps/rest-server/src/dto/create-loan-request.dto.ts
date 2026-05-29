import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDecimal, IsNotEmpty } from 'class-validator';

export class CreateLoanRequestDto {
  @ApiProperty({
    description: 'Customer UUID — the customer the loan is being requested for.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsString()
  customerId!: string;

  @ApiProperty({
    description: 'Product UUID — the loan product being applied for.',
    example: '660e8400-e29b-41d4-a716-446655440111',
    format: 'uuid',
  })
  @IsString()
  productId!: string;

  @ApiProperty({
    description:
      'Requested loan amount as a decimal string (preserves full precision, max 4 decimal places). ' +
      'Per CLAUDE.md §Money, monetary values MUST be strings — never numbers — to avoid floating-point loss.',
    example: '5000.0000',
  })
  @IsString()
  @IsNotEmpty()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  amount!: string;

  @ApiProperty({
    description: 'ISO 4217 currency code.',
    example: 'GHS',
  })
  @IsString()
  currency!: string;

  @ApiPropertyOptional({
    description: 'Requested loan term in days, as a decimal string. The product may override.',
    example: '30',
  })
  @IsOptional()
  @IsString()
  termDays?: string;

  @ApiPropertyOptional({
    description: 'Free-form purpose of the loan, surfaced to the operator.',
    example: 'School fees',
  })
  @IsOptional()
  @IsString()
  purpose?: string;
}
