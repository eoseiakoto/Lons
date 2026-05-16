import {
  Args,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { AuditAction, RequiresPlan } from '@lons/common';
import { PrismaService } from '@lons/database';
import { CurrentTenant, Roles } from '@lons/entity-service';
import { SubscriptionBillingService } from '@lons/settlement-service';

import {
  BillingInvoiceConnection,
  BillingInvoiceEdge,
  BillingInvoiceStatusGql,
  BillingInvoiceType,
  BillingInvoiceTypeGql,
  BillingLineItemType,
} from '../types/billing-invoice.type';

/**
 * Sprint 15 (S15-BILL-1) — GraphQL surface for billing invoices.
 *
 * Closes BA findings F-S14-B2 and F-S14-B3 — Sprint 14 added the
 * services and Prisma models but no read API. Tenants now query
 * `billingInvoices` for their own invoices; operators with
 * `billing:manage` permission can flip an invoice to `paid` via
 * `markInvoicePaid` (the corresponding event is emitted by the service).
 */
@Resolver(() => BillingInvoiceType)
export class BillingResolver {
  constructor(
    private readonly subscriptionBillingService: SubscriptionBillingService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Tenant-scoped invoice list with Relay cursor pagination. Filters by
   * type, status, and the billing-period window. Default page size is
   * 25; cap at 100.
   */
  @Query(() => BillingInvoiceConnection)
  @Roles('billing:read')
  @RequiresPlan('growth')
  async billingInvoices(
    @CurrentTenant() tenantId: string,
    @Args('type', { type: () => BillingInvoiceTypeGql, nullable: true })
    type?: BillingInvoiceTypeGql,
    @Args('status', { type: () => BillingInvoiceStatusGql, nullable: true })
    status?: BillingInvoiceStatusGql,
    @Args('billingPeriodStart', { nullable: true }) billingPeriodStart?: string,
    @Args('billingPeriodEnd', { nullable: true }) billingPeriodEnd?: string,
    @Args('first', { type: () => Int, nullable: true }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<BillingInvoiceConnection> {
    const take = Math.min(first ?? 25, 100);
    const where = {
      tenantId,
      ...(type && { type: type as unknown as 'subscription' }),
      ...(status && { status: status as unknown as 'issued' }),
      ...(billingPeriodStart && {
        billingPeriodStart: { gte: new Date(billingPeriodStart) },
      }),
      ...(billingPeriodEnd && {
        billingPeriodEnd: { lte: new Date(billingPeriodEnd) },
      }),
    };

    const [rows, totalCount] = await Promise.all([
      this.prisma.billingInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        ...(after && { cursor: { id: after }, skip: 1 }),
      }),
      this.prisma.billingInvoice.count({ where }),
    ]);

    const hasNextPage = rows.length > take;
    const trimmed = hasNextPage ? rows.slice(0, -1) : rows;
    const edges: BillingInvoiceEdge[] = trimmed.map((row) => ({
      cursor: row.id,
      node: row as unknown as BillingInvoiceType,
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : undefined,
      },
      totalCount,
    };
  }

  /** Single invoice by ID. Line items resolved via field resolver. */
  @Query(() => BillingInvoiceType, { nullable: true })
  @Roles('billing:read')
  @RequiresPlan('growth')
  async billingInvoice(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BillingInvoiceType | null> {
    const row = await this.prisma.billingInvoice.findFirst({
      where: { id, tenantId },
    });
    return row as unknown as BillingInvoiceType | null;
  }

  // ── Mutations ───────────────────────────────────────────────────────

  /**
   * Manual mark-paid (e.g. wire transfer received out-of-band). Service
   * is idempotent — already-paid invoices return as-is without
   * re-emitting `BILLING_INVOICE_PAID`.
   */
  @Mutation(() => BillingInvoiceType)
  @Roles('billing:manage')
  @RequiresPlan('growth')
  @AuditAction('mark_paid.billingInvoice', 'billing_invoice')
  async markInvoicePaid(
    @CurrentTenant() tenantId: string,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<BillingInvoiceType> {
    const updated = await this.subscriptionBillingService.markInvoicePaid(
      tenantId,
      invoiceId,
    );
    return updated as unknown as BillingInvoiceType;
  }

  // ── Field resolvers ─────────────────────────────────────────────────

  /** Line items in display order (created_at ASC). */
  @ResolveField(() => [BillingLineItemType])
  async lineItems(
    @Parent() invoice: BillingInvoiceType,
  ): Promise<BillingLineItemType[]> {
    const rows = await this.prisma.billingLineItem.findMany({
      where: { billingInvoiceId: invoice.id },
      orderBy: { createdAt: 'asc' },
    });
    return rows as unknown as BillingLineItemType[];
  }
}
