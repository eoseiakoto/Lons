import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * Sprint 15 (S15-BILL-1) — GraphQL types for billing invoices.
 *
 * Monetary fields are surfaced as `String` per CLAUDE.md (Decimal-as-string).
 * `metadata` and any JSON columns are surfaced as `GraphQLJSON`.
 */

export enum BillingInvoiceTypeGql {
  subscription = 'subscription',
  usage = 'usage',
  revenue_share = 'revenue_share',
}
registerEnumType(BillingInvoiceTypeGql, { name: 'BillingInvoiceTypeEnum' });

export enum BillingInvoiceStatusGql {
  draft = 'draft',
  issued = 'issued',
  paid = 'paid',
  overdue = 'overdue',
  cancelled = 'cancelled',
  void_ = 'void',
}
registerEnumType(BillingInvoiceStatusGql, { name: 'BillingInvoiceStatusEnum' });

export enum BillingLineItemTypeGql {
  subscription = 'subscription',
  per_disbursement = 'per_disbursement',
  revenue_share = 'revenue_share',
  discount = 'discount',
  credit = 'credit',
  other = 'other',
}
registerEnumType(BillingLineItemTypeGql, { name: 'BillingLineItemTypeEnum' });

@ObjectType()
export class BillingLineItemType {
  @Field(() => ID) id!: string;
  @Field(() => BillingLineItemTypeGql) type!: BillingLineItemTypeGql;
  @Field() description!: string;
  @Field(() => Int) quantity!: number;
  @Field() unitPrice!: string;
  @Field() amount!: string;
  @Field() currency!: string;
  @Field(() => GraphQLJSON, { nullable: true }) metadata?: unknown;
  @Field() createdAt!: Date;
}

@ObjectType()
export class BillingInvoiceType {
  @Field(() => ID) id!: string;
  @Field(() => ID) tenantId!: string;
  @Field() invoiceNumber!: string;
  @Field(() => BillingInvoiceTypeGql) type!: BillingInvoiceTypeGql;
  @Field() billingPeriodStart!: Date;
  @Field() billingPeriodEnd!: Date;
  @Field() currency!: string;
  @Field() subtotal!: string;
  @Field() taxAmount!: string;
  @Field() total!: string;
  @Field(() => BillingInvoiceStatusGql) status!: BillingInvoiceStatusGql;
  @Field({ nullable: true }) issuedAt?: Date;
  @Field({ nullable: true }) dueDate?: Date;
  @Field({ nullable: true }) paidAt?: Date;
  @Field({ nullable: true }) notes?: string;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;

  /**
   * Line items resolved on demand via field resolver. Cascades from
   * BillingInvoice deletion (which doesn't happen in practice — invoices
   * are soft-cancelled via status).
   */
  @Field(() => [BillingLineItemType])
  lineItems!: BillingLineItemType[];
}

@ObjectType()
export class BillingInvoicePageInfo {
  @Field() hasNextPage!: boolean;
  @Field({ nullable: true }) endCursor?: string;
}

@ObjectType()
export class BillingInvoiceEdge {
  @Field() cursor!: string;
  @Field(() => BillingInvoiceType) node!: BillingInvoiceType;
}

@ObjectType()
export class BillingInvoiceConnection {
  @Field(() => [BillingInvoiceEdge]) edges!: BillingInvoiceEdge[];
  @Field(() => BillingInvoicePageInfo) pageInfo!: BillingInvoicePageInfo;
  @Field(() => Int) totalCount!: number;
}
