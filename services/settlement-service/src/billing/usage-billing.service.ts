import { Injectable, Logger } from '@nestjs/common';

import { PrismaService, BillingInvoice } from '@lons/database';
import {
  EventBusService,
  add,
  bankersRound,
  divide,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { BillingInvoiceNumberService } from './billing-invoice-number.service';

/**
 * Sprint 14 (S14-13) — monthly aggregation of metered disbursement
 * fees into per-tenant usage invoices.
 *
 * Run by `UsageInvoiceJob` on the 1st of every month at 02:00 UTC
 * (after the subscription job at 01:00). For each tenant:
 *   1. Find all `DisbursementFee` rows in the previous month with no
 *      `billingInvoiceId` (unbilled).
 *   2. Group by `productType` for the invoice line items.
 *   3. Create a `BillingInvoice` (type=`usage`) and link the fees.
 *   4. Emit `BILLING_INVOICE_GENERATED`.
 *
 * **Idempotency.** Same `(tenantId, type='usage', billingPeriodStart)`
 * pre-check as subscription billing. The fees-to-invoice link via
 * `billingInvoiceId` is the second line of defence — already-linked
 * fees are filtered out of subsequent runs.
 */
@Injectable()
export class UsageBillingService {
  private readonly logger = new Logger(UsageBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly invoiceNumberService: BillingInvoiceNumberService,
  ) {}

  /**
   * Iterate active tenants and generate the previous month's usage
   * invoice. Returns counts for the scheduler's log line.
   */
  async generateMonthlyUsageInvoices(referenceDate?: Date): Promise<{
    generated: number;
    skippedNoFees: number;
    failed: number;
  }> {
    const now = referenceDate ?? new Date();
    // Previous month period: [first day prev month, last day prev month]
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
    );

    this.logger.log(
      `Starting usage invoice generation for period ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}`,
    );

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
        }),
    );

    let generated = 0;
    let skippedNoFees = 0;
    let failed = 0;

    for (const tenant of tenants) {
      try {
        const invoice = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.generateUsageInvoice(tenant.id, periodStart, periodEnd),
        );
        if (invoice) generated++;
        else skippedNoFees++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Usage invoice failed for tenant ${tenant.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Usage invoice generation complete — generated=${generated}, skippedNoFees=${skippedNoFees}, failed=${failed}`,
    );
    return { generated, skippedNoFees, failed };
  }

  /**
   * Generate a single tenant's usage invoice. Returns `null` when the
   * tenant had no fees in the period (no invoice produced).
   */
  async generateUsageInvoice(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BillingInvoice | null> {
    // Idempotency: same period already invoiced?
    const existing = await this.prisma.billingInvoice.findFirst({
      where: {
        tenantId,
        type: 'usage',
        billingPeriodStart: periodStart,
      },
    });
    if (existing) return existing;

    // Period end inclusive — DisbursementFee.createdAt is timestamptz,
    // so the last instant of the period is `periodEnd 23:59:59.999`.
    const inclusiveEnd = new Date(periodEnd);
    inclusiveEnd.setUTCHours(23, 59, 59, 999);

    const unbilledFees = await this.prisma.disbursementFee.findMany({
      where: {
        tenantId,
        createdAt: { gte: periodStart, lte: inclusiveEnd },
        billingInvoiceId: null,
      },
    });
    if (unbilledFees.length === 0) return null;

    // Group by productType for line items.
    const groups = new Map<
      string,
      { count: number; sumFeeUsd: string; currency: string }
    >();
    for (const fee of unbilledFees) {
      const group = groups.get(fee.productType) ?? {
        count: 0,
        sumFeeUsd: '0',
        currency: 'USD',
      };
      group.count += 1;
      group.sumFeeUsd = add(group.sumFeeUsd, String(fee.feeAmountUsd));
      groups.set(fee.productType, group);
    }

    // Total + line items.
    let subtotal = '0';
    const lineItems: Array<{
      type: 'disbursement_fee';
      description: string;
      quantity: number;
      unitPrice: string;
      amount: string;
      currency: string;
    }> = [];
    for (const [productType, group] of groups.entries()) {
      const unitPrice =
        group.count > 0
          ? bankersRound(divide(group.sumFeeUsd, String(group.count)), 4)
          : '0.0000';
      subtotal = add(subtotal, group.sumFeeUsd);
      lineItems.push({
        type: 'disbursement_fee',
        description: `${this.productLabel(productType)} disbursement fees (${group.count} transaction${group.count === 1 ? '' : 's'})`,
        quantity: group.count,
        unitPrice,
        amount: group.sumFeeUsd,
        currency: group.currency,
      });
    }
    subtotal = bankersRound(subtotal, 4);

    const invoiceNumber =
      await this.invoiceNumberService.getNextInvoiceNumber(tenantId);

    // Payment terms inherited from the billing config so this matches
    // the subscription invoice's due-date rules. Default 15 days when
    // no config is present (shouldn't happen for active tenants).
    const config = await this.prisma.tenantBillingConfig.findUnique({
      where: { tenantId },
    });
    const paymentTermsDays = config?.paymentTermsDays ?? 15;
    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + paymentTermsDays);

    // Atomic invoice create + fee link. We use $transaction so a partial
    // failure (e.g. invoice insert succeeds but fee update fails) rolls
    // back and the next run re-generates from scratch.
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.billingInvoice.create({
        data: {
          tenantId,
          invoiceNumber,
          type: 'usage',
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          currency: 'USD',
          subtotal,
          total: subtotal,
          status: 'issued',
          issuedAt: new Date(),
          dueDate,
          lineItems: { create: lineItems },
        },
      });
      // Link the fees so subsequent runs don't double-bill.
      await tx.disbursementFee.updateMany({
        where: { id: { in: unbilledFees.map((f) => f.id) } },
        data: { billingInvoiceId: invoice.id },
      });
      return invoice;
    });

    this.eventBus.emitAndBuild(EventType.BILLING_INVOICE_GENERATED, tenantId, {
      invoiceId: result.id,
      invoiceNumber,
      type: 'usage',
      total: subtotal,
      currency: 'USD',
      billingPeriodStart: periodStart.toISOString().slice(0, 10),
      billingPeriodEnd: periodEnd.toISOString().slice(0, 10),
      feeCount: unbilledFees.length,
    });

    return result;
  }

  /** Human-readable product label for line item descriptions. */
  private productLabel(productType: string): string {
    switch (productType) {
      case 'micro_loan':
        return 'Micro-Loan';
      case 'overdraft':
        return 'Overdraft';
      case 'bnpl':
        return 'BNPL';
      case 'invoice_financing':
        return 'Invoice Factoring';
      default:
        return productType;
    }
  }
}
