import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsArray,
  ValidateNested,
  Matches,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

class BnplPurchaseItemDto {
  @ApiProperty({ description: 'Item display name.', example: 'Bluetooth headphones' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Line item amount as a decimal string (max 4 dp). Money MUST be a string per CLAUDE.md §Money.',
    example: '12.5000',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount!: string;
}

export class InitiateBnplPurchaseDto {
  @ApiProperty({ description: 'Merchant code (unique within tenant).', example: 'shop-accra-01' })
  @IsString()
  @Length(1, 50)
  merchantCode!: string;

  @ApiProperty({ description: 'Customer UUID.', example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid' })
  @IsString()
  customerId!: string;

  @ApiProperty({
    description: 'Total purchase amount as a decimal string (max 4 dp). Money MUST be a string per CLAUDE.md §Money.',
    example: '120.0000',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  purchaseAmount!: string;

  @ApiProperty({ description: 'ISO 4217 currency code.', example: 'GHS' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ description: 'Number of installments. Typically 3, 4, or 6.', example: 4, minimum: 1, maximum: 36 })
  @IsInt()
  @Min(1)
  @Max(36)
  numberOfInstallments!: number;

  @ApiProperty({
    description: "Merchant's order identifier (must be unique per merchant for idempotency).",
    example: 'order-2026-05-29-001',
  })
  @IsString()
  @Length(1, 255)
  purchaseRef!: string;

  @ApiPropertyOptional({
    description: "Merchant's internal reference shown to the customer (e.g. on receipts).",
    example: 'Order #4421',
  })
  @IsString()
  @IsOptional()
  @Length(1, 255)
  merchantRef?: string;

  @ApiPropertyOptional({
    description: 'Itemized line items (informational; used for receipt rendering and dispute review).',
    type: [BnplPurchaseItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BnplPurchaseItemDto)
  @IsOptional()
  items?: BnplPurchaseItemDto[];

  @ApiProperty({
    description: 'Idempotency key. Repeated calls with the same value return the original transaction.',
    example: 'bnpl-init-2026-05-29-7a8b',
  })
  @IsString()
  @Length(1, 255)
  idempotencyKey!: string;
}

export class EligibilityQueryDto {
  @ApiProperty({ description: 'Merchant code (unique within tenant).', example: 'shop-accra-01' })
  @IsString()
  @Length(1, 50)
  merchantCode!: string;

  @ApiProperty({ description: 'Customer UUID.', example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid' })
  @IsString()
  customerId!: string;

  @ApiProperty({
    description: 'Purchase amount as a decimal string. Money MUST be a string per CLAUDE.md §Money.',
    example: '120.0000',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount!: string;

  @ApiProperty({ description: 'ISO 4217 currency code.', example: 'GHS' })
  @IsString()
  @Length(3, 3)
  currency!: string;
}

export class InstallmentPaymentDto {
  @ApiProperty({
    description: 'Payment amount as a decimal string (max 4 dp). Money MUST be a string per CLAUDE.md §Money.',
    example: '30.0000',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount!: string;

  @ApiProperty({
    description: 'Idempotency key. Repeated calls with the same value short-circuit.',
    example: 'bnpl-install-pay-2026-05-29-a1',
  })
  @IsString()
  @Length(1, 255)
  idempotencyKey!: string;
}

export class RefundDto {
  @ApiProperty({ enum: ['full', 'partial'], description: 'Refund type.', example: 'partial' })
  @IsString()
  @Matches(/^(full|partial)$/)
  type!: 'full' | 'partial';

  @ApiProperty({
    description:
      'Refund amount as a decimal string (max 4 dp). Required for partial; informational for full. ' +
      'Money MUST be a string per CLAUDE.md §Money.',
    example: '60.0000',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount!: string;

  @ApiProperty({ description: 'Operator-facing reason for the refund.', example: 'Customer returned item' })
  @IsString()
  @Length(1, 500)
  reason!: string;

  @ApiProperty({
    description: 'Idempotency key.',
    example: 'bnpl-refund-2026-05-29-b2',
  })
  @IsString()
  @Length(1, 255)
  idempotencyKey!: string;
}
