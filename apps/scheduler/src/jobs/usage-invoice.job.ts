import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { UsageBillingService } from '@lons/settlement-service';

/**
 * Sprint 14 (S14-13) — monthly usage invoice generation.
 *
 * Fires at 02:00 UTC on the 1st of every month — one hour after the
 * subscription job so the platform isn't trying to send two invoices
 * to the SP simultaneously. Aggregates the previous month's metered
 * `DisbursementFee` records into a single per-tenant usage invoice.
 */
@Injectable()
export class UsageInvoiceJob {
  private readonly logger = new Logger('UsageInvoiceJob');

  constructor(private readonly usageBillingService: UsageBillingService) {}

  @Cron('0 2 1 * *')
  async handleMonthlyUsageInvoicing(): Promise<void> {
    this.logger.log('Starting monthly usage invoice generation');
    const result =
      await this.usageBillingService.generateMonthlyUsageInvoices();
    this.logger.log(
      `Monthly usage invoice generation complete — generated=${result.generated}, skippedNoFees=${result.skippedNoFees}, failed=${result.failed}`,
    );
  }
}
