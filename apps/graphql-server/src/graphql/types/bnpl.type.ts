import { ObjectType, Field, ID, Int, Float, registerEnumType } from '@nestjs/graphql';

import { PageInfo } from './page-info.type';

/** GraphQL mirror of `MerchantStatus` Prisma enum. */
export enum MerchantStatusGql {
  pending = 'pending',
  active = 'active',
  suspended = 'suspended',
  deactivated = 'deactivated',
}
registerEnumType(MerchantStatusGql, { name: 'MerchantStatus' });

export enum SettlementTypeGql {
  IMMEDIATE = 'IMMEDIATE',
  T_PLUS_1 = 'T_PLUS_1',
}
registerEnumType(SettlementTypeGql, { name: 'SettlementType' });

export enum BnplTransactionStatusGql {
  initiated = 'initiated',
  approved = 'approved',
  active = 'active',
  completed = 'completed',
  cancelled = 'cancelled',
  accelerated = 'accelerated',
  defaulted = 'defaulted',
  refunded = 'refunded',
}
registerEnumType(BnplTransactionStatusGql, { name: 'BnplTransactionStatus' });

export enum InstallmentStatusGql {
  pending = 'pending',
  due = 'due',
  paid = 'paid',
  overdue = 'overdue',
  waived = 'waived',
}
registerEnumType(InstallmentStatusGql, { name: 'InstallmentStatus' });

export enum MerchantSettlementStatusGql {
  pending = 'pending',
  processing = 'processing',
  settled = 'settled',
  failed = 'failed',
}
registerEnumType(MerchantSettlementStatusGql, { name: 'MerchantSettlementStatus' });

export enum RefundTypeGql {
  full = 'full',
  partial = 'partial',
}
registerEnumType(RefundTypeGql, { name: 'RefundType' });

// ───────────────────────────────────────────────────────────────────────
// Merchant
// ───────────────────────────────────────────────────────────────────────

@ObjectType()
export class MerchantType {
  @Field(() => ID) id!: string;
  @Field() tenantId!: string;
  @Field() name!: string;
  @Field() code!: string;
  @Field(() => MerchantStatusGql) status!: MerchantStatusGql;
  @Field({ nullable: true }) contactEmail?: string;
  @Field({ nullable: true }) contactPhone?: string;
  @Field(() => SettlementTypeGql) settlementType!: SettlementTypeGql;
  /** Decimal-as-string. */
  @Field() discountRate!: string;
  @Field({ nullable: true }) walletId?: string;
  @Field({ nullable: true }) walletProvider?: string;
  @Field({ nullable: true }) onboardedAt?: Date;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType()
export class MerchantEdge {
  @Field(() => MerchantType) node!: MerchantType;
  @Field() cursor!: string;
}

@ObjectType()
export class MerchantConnection {
  @Field(() => [MerchantEdge]) edges!: MerchantEdge[];
  @Field(() => PageInfo) pageInfo!: PageInfo;
  @Field(() => Int) totalCount!: number;
}

// ───────────────────────────────────────────────────────────────────────
// Installment + transaction
// ───────────────────────────────────────────────────────────────────────

@ObjectType()
export class InstallmentScheduleType {
  @Field(() => ID) id!: string;
  @Field() transactionId!: string;
  @Field(() => Int) installmentNumber!: number;
  /** Decimal-as-string. */
  @Field() amount!: string;
  @Field() principalPortion!: string;
  @Field() interestPortion!: string;
  @Field() feePortion!: string;
  @Field() dueDate!: Date;
  @Field(() => InstallmentStatusGql) status!: InstallmentStatusGql;
  @Field() paidAmount!: string;
  @Field({ nullable: true }) paidAt?: Date;
  @Field(() => Int) daysPastDue!: number;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType()
export class BnplTransactionType {
  @Field(() => ID) id!: string;
  @Field() tenantId!: string;
  @Field() customerId!: string;
  @Field() merchantId!: string;
  @Field() productId!: string;
  @Field() lenderId!: string;
  @Field() currency!: string;
  /** Decimal-as-string. */
  @Field() purchaseAmount!: string;
  @Field() totalRepayable!: string;
  @Field(() => Int) numberOfInstallments!: number;
  @Field(() => BnplTransactionStatusGql) status!: BnplTransactionStatusGql;
  @Field() purchaseRef!: string;
  @Field({ nullable: true }) merchantRef?: string;
  @Field() interestRate!: string;
  @Field({ nullable: true }) completedAt?: Date;
  @Field({ nullable: true }) cancelledAt?: Date;
  @Field({ nullable: true }) acceleratedAt?: Date;
  @Field(() => [InstallmentScheduleType], { nullable: true })
  installments?: InstallmentScheduleType[];
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType()
export class BnplTransactionEdge {
  @Field(() => BnplTransactionType) node!: BnplTransactionType;
  @Field() cursor!: string;
}

@ObjectType()
export class BnplTransactionConnection {
  @Field(() => [BnplTransactionEdge]) edges!: BnplTransactionEdge[];
  @Field(() => PageInfo) pageInfo!: PageInfo;
  @Field(() => Int) totalCount!: number;
}

// ───────────────────────────────────────────────────────────────────────
// Mutation result types
// ───────────────────────────────────────────────────────────────────────

@ObjectType()
export class BnplPurchaseResultType {
  @Field(() => ID) transactionId!: string;
  @Field(() => BnplTransactionStatusGql) status!: BnplTransactionStatusGql;
  @Field() totalRepayable!: string;
  @Field(() => [BnplPurchaseInstallmentSummary]) installments!: BnplPurchaseInstallmentSummary[];
}

@ObjectType()
export class BnplPurchaseInstallmentSummary {
  @Field(() => Int) installmentNumber!: number;
  @Field() amount!: string;
  @Field() dueDate!: string;
}

@ObjectType()
export class BnplEligibilityResultType {
  @Field() eligible!: boolean;
  @Field({ nullable: true }) reason?: string;
  @Field() maxAmount!: string;
  @Field() approvedAmount!: string;
  @Field(() => [Int]) availableInstallmentPlans!: number[];
  @Field() interestRate!: string;
  @Field() monthlyAmount!: string;
}

@ObjectType()
export class BnplRefundResultType {
  @Field() refundedToCustomer!: string;
  @Field() clawedBackFromMerchant!: string;
  @Field(() => Int) cancelledInstallments!: number;
  @Field(() => Int) reducedInstallments!: number;
}

@ObjectType()
export class InstallmentPaymentResultType {
  @Field() installmentPaidInFull!: boolean;
  @Field() transactionCompleted!: boolean;
  @Field() paidAmount!: string;
}

@ObjectType()
export class CancelBnplTransactionResultType {
  @Field(() => ID) transactionId!: string;
  @Field() success!: boolean;
}

/**
 * FIX 20: GraphQL surface for the MerchantSettlement model. Powers the
 * "Settlement history" section on the admin merchant detail page.
 */
@ObjectType()
export class MerchantSettlementType {
  @Field(() => ID) id!: string;
  @Field() merchantId!: string;
  @Field({ nullable: true }) transactionId?: string;
  @Field() currency!: string;
  @Field() grossAmount!: string;
  @Field() discountFee!: string;
  @Field() netAmount!: string;
  @Field(() => Int) transactionCount!: number;
  @Field() periodStart!: Date;
  @Field() periodEnd!: Date;
  @Field(() => MerchantSettlementStatusGql) status!: MerchantSettlementStatusGql;
  @Field({ nullable: true }) settledAt?: Date;
  @Field({ nullable: true }) walletRef?: string;
  @Field({ nullable: true }) failureReason?: string;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

void Float; // future per-installment fee fields will need Float; kept so the import doesn't drift on linters
