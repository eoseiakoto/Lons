import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDecimal, IsNotEmpty } from 'class-validator';

export class CreateRepaymentDto {
  @ApiProperty({ description: 'Contract ID the repayment is for' })
  @IsString()
  contractId!: string;

  @ApiProperty({ description: 'Payment amount as a decimal string (preserves precision)', example: '250.00' })
  @IsString()
  @IsNotEmpty()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  amount!: string;

  @ApiProperty({ description: 'Currency code (ISO 4217)', example: 'GHS' })
  @IsString()
  currency!: string;

  @ApiProperty({ description: 'Payment method', example: 'MOBILE_MONEY' })
  @IsString()
  method!: string;

  @ApiProperty({ required: false, description: 'Payment source identifier' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({ required: false, description: 'External reference from payment provider' })
  @IsOptional()
  @IsString()
  externalRef?: string;
}
