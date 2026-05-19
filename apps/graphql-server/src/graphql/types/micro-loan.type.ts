import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

/**
 * Sprint 16 (S16-6) — GraphQL types for micro-loan credit limit history.
 *
 * Append-only audit rows from `MicroLoanCreditLimitChange`. Monetary
 * fields surfaced as `String` (Decimal-as-string per CLAUDE.md).
 */

export enum MicroLoanCreditLimitChangeTypeGql {
  increase = 'increase',
  decrease = 'decrease',
  suspension = 'suspension',
  restoration = 'restoration',
}
// DE-NOTE-nestjs-runtime-crashes — name MUST differ from the
// `MicroLoanCreditLimitChangeType` @ObjectType class below; GraphQL
// requires uniquely-named types across the schema and the prior name
// collided, crashing the schema builder at boot. The enum semantically
// describes the kind of change (increase/decrease/suspension/restoration).
registerEnumType(MicroLoanCreditLimitChangeTypeGql, {
  name: 'MicroLoanCreditLimitChangeKind',
});

@ObjectType()
export class MicroLoanCreditLimitChangeType {
  @Field(() => ID) id!: string;
  @Field(() => ID) tenantId!: string;
  @Field(() => ID) customerId!: string;
  @Field(() => ID) subscriptionId!: string;
  /** Decimal-as-string. */
  @Field() previousLimit!: string;
  /** Decimal-as-string. */
  @Field() newLimit!: string;
  @Field(() => MicroLoanCreditLimitChangeTypeGql)
  changeType!: MicroLoanCreditLimitChangeTypeGql;
  @Field() reason!: string;
  /** `system`, `manual:<userId>`, or trigger name. */
  @Field() triggeredBy!: string;
  @Field() createdAt!: Date;
}

@ObjectType()
export class MicroLoanCreditLimitChangePageInfo {
  @Field() hasNextPage!: boolean;
  @Field({ nullable: true }) endCursor?: string;
}

@ObjectType()
export class MicroLoanCreditLimitChangeEdge {
  @Field() cursor!: string;
  @Field(() => MicroLoanCreditLimitChangeType)
  node!: MicroLoanCreditLimitChangeType;
}

@ObjectType()
export class MicroLoanCreditLimitChangeConnection {
  @Field(() => [MicroLoanCreditLimitChangeEdge])
  edges!: MicroLoanCreditLimitChangeEdge[];
  @Field(() => MicroLoanCreditLimitChangePageInfo)
  pageInfo!: MicroLoanCreditLimitChangePageInfo;
  @Field(() => Int) totalCount!: number;
}
