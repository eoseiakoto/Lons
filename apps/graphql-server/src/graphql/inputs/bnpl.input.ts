import { InputType, Field, Int } from '@nestjs/graphql';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  MerchantStatusGql,
  RefundTypeGql,
  SettlementTypeGql,
} from '../types/bnpl.type';

/**
 * FIX-STAB-1: every @Field carries a class-validator decorator so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) doesn't 400
 * legitimate calls. See invoice-verification.input.ts for the canonical
 * pattern.
 */

@InputType()
export class BnplPurchaseItemInput {
  @IsString()
  @Field() name!: string;

  @IsString()
  @Field() amount!: string;
}

@InputType()
export class InitiateBnplPurchaseInput {
  @IsString()
  @Field() merchantCode!: string;

  @IsString()
  @Field() customerId!: string;

  @IsString()
  @Field() purchaseAmount!: string;

  @IsString()
  @Field() currency!: string;

  @IsInt()
  @Field(() => Int) numberOfInstallments!: number;

  @IsString()
  @Field() purchaseRef!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) merchantRef?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BnplPurchaseItemInput)
  @Field(() => [BnplPurchaseItemInput], { nullable: true }) items?: BnplPurchaseItemInput[];

  @IsString()
  @Field() idempotencyKey!: string;
}

@InputType()
export class CreateMerchantInput {
  @IsString()
  @Field() name!: string;

  @IsString()
  @Field() code!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) contactEmail?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) contactPhone?: string;

  @IsOptional()
  @IsEnum(SettlementTypeGql)
  @Field(() => SettlementTypeGql, { nullable: true }) settlementType?: SettlementTypeGql;

  /** Decimal-as-string in [0, 1). */
  @IsString()
  @Field() discountRate!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) walletId?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) walletProvider?: string;
}

@InputType()
export class UpdateMerchantInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true }) name?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) contactEmail?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) contactPhone?: string;

  @IsOptional()
  @IsEnum(SettlementTypeGql)
  @Field(() => SettlementTypeGql, { nullable: true }) settlementType?: SettlementTypeGql;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) discountRate?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) walletId?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) walletProvider?: string;
}

@InputType()
export class BnplTransactionFiltersInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true }) customerId?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) merchantId?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) status?: string;
}

@InputType()
export class MerchantFiltersInput {
  @IsOptional()
  @IsEnum(MerchantStatusGql)
  @Field(() => MerchantStatusGql, { nullable: true }) status?: MerchantStatusGql;

  @IsOptional()
  @IsEnum(SettlementTypeGql)
  @Field(() => SettlementTypeGql, { nullable: true }) settlementType?: SettlementTypeGql;
}

@InputType()
export class InitiateRefundInput {
  @IsString()
  @Field() transactionId!: string;

  @IsString()
  @Field() amount!: string;

  @IsEnum(RefundTypeGql)
  @Field(() => RefundTypeGql) type!: RefundTypeGql;

  @IsString()
  @Field() reason!: string;

  @IsString()
  @Field() idempotencyKey!: string;
}
