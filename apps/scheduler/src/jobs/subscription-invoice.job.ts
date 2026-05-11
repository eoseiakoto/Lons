import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { SubscriptionBillingService } from '@lons/settlement-service';

/**
 * Sprint 14 (S14-12) — monthly subscription invoice generation.
 *
 * Fires at 01:00 UTC on the 1st of every month. The service handles
 * the per-tenant fan-out (with idempotency checks); this job is a
 * thin schedule wrapper.
 */
@Injectable()
export class SubscriptionInvoiceJob {
  private readonly logger = new Logger('SubscriptionInvoiceJob');

  constructor(
    private readonly subscriptionBillingService: SubscriptionBillingService,
  ) {}

  @Cron('0 1 1 * *')
  async handleMonthlySubscriptionInvoicing(): Promise<void> {
    this.logger.log('Starting monthly subscription invoice generation');
    const result =
      await this.subscriptionBillingService.generateMonthlySubscriptionInvoices();
    this.logger.log(
      `Monthly subscription invoice generation complete — generated=${result.generated}, skippedNoConfig=${result.skippedNoConfig}, failed=${result.failed}`,
    );
  }
}
