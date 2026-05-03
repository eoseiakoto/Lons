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
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Decimal-as-string. e.g. "12.50".' })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount!: string;
}

export class InitiateBnplPurchaseDto {
  @ApiProperty({ description: 'Merchant code (unique within tenant).' })
  @IsString()
  @Length(1, 50)
  merchantCode!: string;

  @ApiProperty({ description: 'Customer UUID.' })
  @IsString()
  customerId!: string;

  @ApiProperty({ description: 'Decimal-as-string. e.g. "120.00".' })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  purchaseAmount!: string;

  @ApiProperty({ description: 'ISO 4217 currency code.' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ description: 'Number of installments. Typically 3, 4, or 6.' })
  @IsInt()
  @Min(1)
  @Max(36)
  numberOfInstallments!: number;

  @ApiProperty({ description: "Merchant's order identifier (idempotent per merchant)." })
  @IsString()
  @Length(1, 255)
  purchaseRef!: string;

  @ApiPropertyOptional({ description: "Merchant's internal reference for the customer's view." })
  @IsString()
  @IsOptional()
  @Length(1, 255)
  merchantRef?: string;

  @ApiPropertyOptional({
    description: 'Itemized line items (informational; for receipt rendering).',
    type: [BnplPurchaseItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BnplPurchaseItemDto)
  @IsOptional()
  items?: BnplPurchaseItemDto[];

  @ApiProperty({ description: 'Idempotency key. Repeated calls with the same value short-circuit.' })
  @IsString()
  @Length(1, 255)
  idempotencyKey!: string;
}

export class EligibilityQueryDto {
  @ApiProperty()
  @IsString()
  @Length(1, 50)
  merchantCode!: string;

  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty({ description: 'Decimal-as-string.' })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount!: string;

  @ApiProperty()
  @IsString()
  @Length(3, 3)
  currency!: string;
}

export class InstallmentPaymentDto {
  @ApiProperty({ description: 'Decimal-as-string.' })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount!: string;

  @ApiProperty({ description: 'Idempotency key.' })
  @IsString()
  @Length(1, 255)
  idempotencyKey!: string;
}

export class RefundDto {
  @ApiProperty({ enum: ['full', 'partial'] })
  @IsString()
  @Matches(/^(full|partial)$/)
  type!: 'full' | 'partial';

  @ApiProperty({ description: 'Decimal-as-string. Required for partial; informational for full.' })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/)
  amount!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 500)
  reason!: string;

  @ApiProperty({ description: 'Idempotency key.' })
  @IsString()
  @Length(1, 255)
  idempotencyKey!: string;
}
