import { InputType, Field, Int } from '@nestjs/graphql';

import {
  MerchantStatusGql,
  RefundTypeGql,
  SettlementTypeGql,
} from '../types/bnpl.type';

@InputType()
export class BnplPurchaseItemInput {
  @Field() name!: string;
  @Field() amount!: string;
}

@InputType()
export class InitiateBnplPurchaseInput {
  @Field() merchantCode!: string;
  @Field() customerId!: string;
  @Field() purchaseAmount!: string;
  @Field() currency!: string;
  @Field(() => Int) numberOfInstallments!: number;
  @Field() purchaseRef!: string;
  @Field({ nullable: true }) merchantRef?: string;
  @Field(() => [BnplPurchaseItemInput], { nullable: true }) items?: BnplPurchaseItemInput[];
  @Field() idempotencyKey!: string;
}

@InputType()
export class CreateMerchantInput {
  @Field() name!: string;
  @Field() code!: string;
  @Field({ nullable: true }) contactEmail?: string;
  @Field({ nullable: true }) contactPhone?: string;
  @Field(() => SettlementTypeGql, { nullable: true }) settlementType?: SettlementTypeGql;
  /** Decimal-as-string in [0, 1). */
  @Field() discountRate!: string;
  @Field({ nullable: true }) walletId?: string;
  @Field({ nullable: true }) walletProvider?: string;
}

@InputType()
export class UpdateMerchantInput {
  @Field({ nullable: true }) name?: string;
  @Field({ nullable: true }) contactEmail?: string;
  @Field({ nullable: true }) contactPhone?: string;
  @Field(() => SettlementTypeGql, { nullable: true }) settlementType?: SettlementTypeGql;
  @Field({ nullable: true }) discountRate?: string;
  @Field({ nullable: true }) walletId?: string;
  @Field({ nullable: true }) walletProvider?: string;
}

@InputType()
export class BnplTransactionFiltersInput {
  @Field({ nullable: true }) customerId?: string;
  @Field({ nullable: true }) merchantId?: string;
  @Field({ nullable: true }) status?: string;
}

@InputType()
export class MerchantFiltersInput {
  @Field(() => MerchantStatusGql, { nullable: true }) status?: MerchantStatusGql;
  @Field(() => SettlementTypeGql, { nullable: true }) settlementType?: SettlementTypeGql;
}

@InputType()
export class InitiateRefundInput {
  @Field() transactionId!: string;
  @Field() amount!: string;
  @Field(() => RefundTypeGql) type!: RefundTypeGql;
  @Field() reason!: string;
  @Field() idempotencyKey!: string;
}
