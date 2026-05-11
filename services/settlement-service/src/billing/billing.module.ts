import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { BillingInvoiceNumberService } from './billing-invoice-number.service';
import { SubscriptionBillingService } from './subscription-billing.service';
import { DisbursementFeeService } from './disbursement-fee.service';
import { DisbursementFeeListener } from './disbursement-fee.listener';
import { UsageBillingService } from './usage-billing.service';

/**
 * Sprint 14 (S14-12, S14-13) — billing engine.
 *
 * Exports the three services callers integrate against:
 *   - `SubscriptionBillingService` — monthly subscription invoices
 *   - `UsageBillingService` — monthly aggregation of metered fees
 *   - `DisbursementFeeService` — per-disbursement fee writes
 *   - `BillingInvoiceNumberService` — invoice number sequencer
 *
 * `DisbursementFeeListener` is internal — it subscribes to
 * `DISBURSEMENT_COMPLETED` and triggers `DisbursementFeeService.recordFee`.
 *
 * Consumers must register `RedisClientModule.forRoot()` at the app
 * composition root so the `REDIS_CLIENT` token resolves
 * (DisbursementFeeService reads the monthly counter from Redis).
 */
@Module({
  imports: [PrismaModule, EventBusModule, EventEmitterModule.forRoot()],
  providers: [
    BillingInvoiceNumberService,
    SubscriptionBillingService,
    UsageBillingService,
    DisbursementFeeService,
    DisbursementFeeListener,
  ],
  exports: [
    BillingInvoiceNumberService,
    SubscriptionBillingService,
    UsageBillingService,
    DisbursementFeeService,
  ],
})
export class BillingModule {}
