import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule } from '@lons/common';

import { SettlementService } from './settlement.service';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    ObservabilityModule,
    // Sprint 14 (S14-12, S14-13) — commercial billing engine.
    BillingModule,
  ],
  providers: [SettlementService],
  exports: [SettlementService, BillingModule],
})
export class SettlementServiceModule {}
