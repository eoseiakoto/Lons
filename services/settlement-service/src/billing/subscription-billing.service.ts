import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  BillingInvoice,
  Prisma,
} from '@lons/database';
import {
  EventBusService,
  ValidationError,
  add,
  bankersRound,
  divide,
  multiply,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { BillingInvoiceNumberService } from './billing-invoice-number.service';

/**
 * Sprint 14 (S14-12) — monthly subscription invoice generation.
 *
 * Run by the `SubscriptionInvoiceJob` cron (1st of every month at
 * 01:00 UTC). For each active tenant with a `TenantBillingConfig`:
 *   1. Determine the billable period (first to last day of month).
 *   2. Pro-rate the subscription amount when the contract start or end
 *      lands inside the period.
 *   3. Insert a `BillingInvoice` (type=`subscription`) + one line item.
 *   4. Emit `BILLING_INVOICE_GENERATED`.
 *
 * **Idempotency.** A `(tenantId, type='subscription', billingPeriodStart)`
 * pre-check returns the existing invoice if the job re-runs in the same
 * month. The unique constraint on `invoiceNumber` is a backstop.
 *
 * **Money handling.** All arithmetic uses `@lons/common` Decimal helpers
 * (CLAUDE.md). Pro-rata fraction is `billableDays / totalDaysInMonth`;
 * we apply banker's rounding to 4 decimal places at the end.
 */
@Injectable()
export class SubscriptionBillingService {
  private readonly logger = new Logger(SubscriptionBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly invoiceNumberService: BillingInvoiceNumberService,
  ) {}

  /**
   * Iterate every active tenant and generate this month's subscription
   * invoice. Per-tenant errors are isolated so one bad config doesn't
   * block the rest of the platform.
   */
  async generateMonthlySubscriptionInvoices(referenceDate?: Date): Promise<{
    generated: number;
    skippedNoConfig: number;
    failed: number;
  }> {
    const now = referenceDate ?? new Date();
    this.logger.log(
      `Starting monthly subscription invoice generation for ${now.toISOString().slice(0, 7)}`,
    );

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
          include: { billingConfig: true },
        }),
    );

    let generated = 0;
    let skippedNoConfig = 0;
    let failed = 0;

    for (const tenant of tenants) {
      if (!tenant.billingConfig) {
        skippedNoConfig++;
        continue;
      }
      try {
        await this.prisma.enterTenantContext({ tenantId: tenant.id }, () =>
          this.generateSubscriptionInvoice(tenant.id, tenant.billingConfig!, now),
        );
        generated++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Subscription invoice failed for tenant ${tenant.id}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Subscription invoice generation complete — generated=${generated}, skippedNoConfig=${skippedNoConfig}, failed=${failed}`,
    );

    // Sprint 15 (S15-BILL-2) — surface tenants that lack a TenantBillingConfig
    // as a platform alert. The seed migration backfills active tenants but
    // tenants onboarded after the migration are caught by the same gap.
    // Operators can dashboard this event and create configs out-of-band.
    if (skippedNoConfig > 0) {
      this.eventBus.emitAndBuild(
        EventType.BILLING_CONFIG_MISSING,
        'platform',
        {
          skippedCount: skippedNoConfig,
          month: now.toISOString().slice(0, 7),
        },
      );
      this.logger.warn(
        `${skippedNoConfig} active tenants skipped — no TenantBillingConfig.`,
      );
    }

    return { generated, skippedNoConfig, failed };
  }

  /**
   * Generate a single subscription invoice for one tenant. Returns the
   * existing invoice if the job is re-run for the same period.
   */
  async generateSubscriptionInvoice(
    tenantId: string,
    config: {
      planTier: string;
      subscriptionAmountUsd: Prisma.Decimal | string;
      billingCurrency: string;
      paymentTermsDays: number;
      contractStartDate: Date;
      contractEndDate: Date | null;
    },
    referenceDate?: Date,
  ): Promise<BillingInvoice> {
    const now = referenceDate ?? new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    );

    // Idempotency: same period already invoiced?
    const existing = await this.prisma.billingInvoice.findFirst({
      where: {
        tenantId,
        type: 'subscription',
        billingPeriodStart: periodStart,
      },
    });
    if (existing) return existing;

    // Pro-rata: count billable days in the period.
    const totalDaysInMonth = periodEnd.getUTCDate();
    let billableDays = totalDaysInMonth;

    if (config.contractStartDate > periodStart) {
      // Contract started mid-month — pro-rate forward from start date.
      const start = config.contractStartDate;
      billableDays = totalDaysInMonth - start.getUTCDate() + 1;
    }
    if (config.contractEndDate && config.contractEndDate < periodEnd) {
      // Contract ended mid-month — pro-rate to end date.
      billableDays = config.contractEndDate.getUTCDate();
    }

    // Bound to [1, totalDaysInMonth] to handle pathological contract
    // dates (negative billable days would invoice zero).
    if (billableDays < 1) {
      throw new ValidationError(
        `Computed billable days is zero or negative for tenant ${tenantId}`,
        { billableDays, periodStart, periodEnd },
      );
    }

    // **Precision note.** `divide` rounds to 4dp; computing the fraction
    // first then multiplying loses precision (e.g. 17/31 = 0.5484 → $500
    // × 0.5484 = $274.20 instead of the correct $274.1935). Multiply by
    // the numerator first so the rounding lands once at the end.
    const subscriptionAmount = bankersRound(
      divide(
        multiply(String(config.subscriptionAmountUsd), String(billableDays)),
        String(totalDaysInMonth),
      ),
      4,
    );

    const invoiceNumber = await this.invoiceNumberService.getNextInvoiceNumber(
      tenantId,
    );
    const dueDate = new Date(periodStart);
    dueDate.setUTCDate(dueDate.getUTCDate() + config.paymentTermsDays);

    const description = `${config.planTier} plan subscription — ${periodStart.toISOString().slice(0, 7)}${
      billableDays < totalDaysInMonth
        ? ` (pro-rated: ${billableDays}/${totalDaysInMonth} days)`
        : ''
    }`;

    const invoice = await this.prisma.billingInvoice.create({
      data: {
        tenantId,
        invoiceNumber,
        type: 'subscription',
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        currency: config.billingCurrency,
        subtotal: subscriptionAmount,
        // Tax handling deferred — when added, set total = subtotal + tax.
        total: subscriptionAmount,
        status: 'issued',
        issuedAt: now,
        dueDate,
        lineItems: {
          create: [
            {
              type: 'subscription',
              description,
              quantity: 1,
              unitPrice: subscriptionAmount,
              amount: subscriptionAmount,
              currency: config.billingCurrency,
            },
          ],
        },
      },
    });

    this.eventBus.emitAndBuild(EventType.BILLING_INVOICE_GENERATED, tenantId, {
      invoiceId: invoice.id,
      invoiceNumber,
      type: 'subscription',
      total: String(subscriptionAmount),
      currency: config.billingCurrency,
      billingPeriodStart: periodStart.toISOString().slice(0, 10),
      billingPeriodEnd: periodEnd.toISOString().slice(0, 10),
    });

    return invoice;
  }

  /**
   * Mark an invoice as paid. Caller is responsible for permission
   * checking — this service trusts the resolver/controller above it.
   */
  async markInvoicePaid(
    tenantId: string,
    invoiceId: string,
  ): Promise<BillingInvoice> {
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) {
      throw new ValidationError(
        `BillingInvoice ${invoiceId} not found for tenant`,
      );
    }
    if (invoice.status === 'paid') return invoice;

    const updated = await this.prisma.billingInvoice.update({
      where: { id: invoiceId },
      data: { status: 'paid', paidAt: new Date() },
    });

    this.eventBus.emitAndBuild(EventType.BILLING_INVOICE_PAID, tenantId, {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      amount: String(invoice.total),
      currency: invoice.currency,
    });

    return updated;
  }

  /**
   * Forward-only helper for `add` used by the usage billing service —
   * exported here so the math helpers can be re-used without exposing
   * the @lons/common helper across all callers.
   */
  static computeTotal(...amounts: string[]): string {
    return amounts.reduce((acc, v) => add(acc, v), '0');
  }
}
