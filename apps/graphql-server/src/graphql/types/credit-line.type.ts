import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';

import { PageInfo } from './page-info.type';

/**
 * GraphQL enum mirror of the Prisma `CreditLineStatus`. Kept in sync with
 * `packages/database/prisma/schema.prisma` — tests verify parity.
 */
export enum CreditLineStatusGql {
  pending_activation = 'pending_activation',
  active = 'active',
  frozen = 'frozen',
  suspended = 'suspended',
  closed = 'closed',
  expired = 'expired',
}
registerEnumType(CreditLineStatusGql, { name: 'CreditLineStatus' });

export enum DrawdownStatusGql {
  initiated = 'initiated',
  completed = 'completed',
  failed = 'failed',
  reversed = 'reversed',
}
registerEnumType(DrawdownStatusGql, { name: 'DrawdownStatus' });

@ObjectType()
export class CreditLineType {
  @Field(() => ID) id!: string;
  @Field() customerId!: string;
  @Field() productId!: string;
  @Field() lenderId!: string;
  @Field() currency!: string;
  /** Decimal as string. */
  @Field() approvedLimit!: string;
  @Field() availableBalance!: string;
  @Field() outstandingAmount!: string;
  @Field() interestRate!: string;
  @Field() interestAccrued!: string;
  @Field() feesOutstanding!: string;
  @Field() penaltiesAccrued!: string;
  @Field(() => CreditLineStatusGql) status!: CreditLineStatusGql;
  @Field(() => Int) billingCycleDay!: number;
  @Field({ nullable: true }) currentCycleStart?: Date;
  @Field({ nullable: true }) currentCycleEnd?: Date;
  @Field({ nullable: true }) lastDrawdownAt?: Date;
  @Field({ nullable: true }) lastRepaymentAt?: Date;
  @Field({ nullable: true }) activatedAt?: Date;
  @Field({ nullable: true }) expiresAt?: Date;
  @Field({ nullable: true }) frozenAt?: Date;
  @Field({ nullable: true }) frozenReason?: string;
  @Field({ nullable: true }) closedAt?: Date;
  @Field({ nullable: true }) closedReason?: string;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType()
export class CreditLineEdge {
  @Field(() => CreditLineType) node!: CreditLineType;
  @Field() cursor!: string;
}

@ObjectType()
export class CreditLineConnection {
  @Field(() => [CreditLineEdge]) edges!: CreditLineEdge[];
  @Field(() => PageInfo) pageInfo!: PageInfo;
  @Field(() => Int) totalCount!: number;
}

@ObjectType()
export class CreditLineBalanceType {
  @Field() creditLineId!: string;
  @Field() approvedLimit!: string;
  @Field() availableBalance!: string;
  @Field() outstandingAmount!: string;
  @Field() interestAccrued!: string;
  @Field() feesOutstanding!: string;
  @Field() penaltiesAccrued!: string;
  @Field() totalOwed!: string;
}

@ObjectType()
export class DrawdownType {
  @Field(() => ID) id!: string;
  @Field() creditLineId!: string;
  @Field() amount!: string;
  @Field() currency!: string;
  @Field() walletBalance!: string;
  @Field() transactionRef!: string;
  @Field({ nullable: true }) walletRef?: string;
  @Field() feeAmount!: string;
  @Field(() => DrawdownStatusGql) status!: DrawdownStatusGql;
  @Field({ nullable: true }) failureReason?: string;
  @Field({ nullable: true }) completedAt?: Date;
  @Field() createdAt!: Date;
}

@ObjectType()
export class DrawdownEdge {
  @Field(() => DrawdownType) node!: DrawdownType;
  @Field() cursor!: string;
}

@ObjectType()
export class DrawdownConnection {
  @Field(() => [DrawdownEdge]) edges!: DrawdownEdge[];
  @Field(() => PageInfo) pageInfo!: PageInfo;
  @Field(() => Int) totalCount!: number;
}

@ObjectType()
export class CreditLimitChangeType {
  @Field(() => ID) id!: string;
  @Field() creditLineId!: string;
  @Field() previousLimit!: string;
  @Field() newLimit!: string;
  @Field() reasonCode!: string;
  @Field({ nullable: true }) reasonDetail?: string;
  @Field() triggeredBy!: string;
  @Field() createdAt!: Date;
}

@ObjectType()
export class ActivationResultType {
  @Field(() => ID) creditLineId!: string;
  @Field() approvedLimit!: string;
}

@ObjectType()
export class DeactivationResultType {
  @Field() creditLineId!: string;
  @Field() success!: boolean;
}

@ObjectType()
export class OverdraftRepaymentResultType {
  @Field() creditLineId!: string;
  @Field() totalCollected!: string;
  @Field() allocatedPenalties!: string;
  @Field() allocatedInterest!: string;
  @Field() allocatedFees!: string;
  @Field() allocatedPrincipal!: string;
}
