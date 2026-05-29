import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDecimal, IsNotEmpty } from 'class-validator';

export class CreateRepaymentDto {
  @ApiProperty({
    description: 'Contract UUID the repayment is being applied to.',
    example: '770e8400-e29b-41d4-a716-446655440222',
    format: 'uuid',
  })
  @IsString()
  contractId!: string;

  @ApiProperty({
    description:
      'Payment amount as a decimal string (max 4 decimal places). ' +
      'Per CLAUDE.md §Money, monetary values MUST be strings — never numbers — to avoid floating-point loss.',
    example: '250.0000',
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

  @ApiProperty({
    description: 'Payment method.',
    example: 'MOBILE_MONEY',
    enum: ['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CARD', 'WALLET_DEDUCT'],
  })
  @IsString()
  method!: string;

  @ApiPropertyOptional({
    description: 'Payment source identifier (e.g. wallet account, bank account).',
    example: 'wallet-acct-123',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    description: 'External reference from the payment provider (for reconciliation).',
    example: 'mtn-momo-txn-9c8a2b4f',
  })
  @IsOptional()
  @IsString()
  externalRef?: string;
}
