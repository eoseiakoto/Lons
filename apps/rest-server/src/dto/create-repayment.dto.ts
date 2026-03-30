import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateRepaymentDto {
  @ApiProperty({ description: 'Contract ID the repayment is for' })
  @IsString()
  contractId!: string;

  @ApiProperty({ description: 'Payment amount (string, e.g. "250.00")', example: '250.00' })
  @IsString()
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
