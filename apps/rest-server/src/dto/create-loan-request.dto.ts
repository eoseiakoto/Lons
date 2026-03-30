import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateLoanRequestDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsString()
  customerId!: string;

  @ApiProperty({ description: 'Product ID to apply for' })
  @IsString()
  productId!: string;

  @ApiProperty({ description: 'Requested loan amount (string, e.g. "5000.00")', example: '5000.00' })
  @IsString()
  amount!: string;

  @ApiProperty({ description: 'Currency code (ISO 4217)', example: 'GHS' })
  @IsString()
  currency!: string;

  @ApiProperty({ required: false, description: 'Requested loan term in days' })
  @IsOptional()
  @IsString()
  termDays?: string;

  @ApiProperty({ required: false, description: 'Purpose of the loan' })
  @IsOptional()
  @IsString()
  purpose?: string;
}
