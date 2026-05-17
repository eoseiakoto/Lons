import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule } from '@lons/common';

import { SettlementService } from './settlement.service';
import { BillingModule } from './billing/billing.module';
import { RevenueDistributionModule } from './distribution/distribution.module';

@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    ObservabilityModule,
    // Sprint 14 (S14-12, S14-13) — commercial billing engine.
    BillingModule,
    // Sprint 18 (S18-9) — tenant/product-scoped revenue distribution
    // strategies. The settlement service injects RevenueDistributionService
    // to resolve which model (percentage/tiered/fixed/waterfall) applies
    // before splitting period revenue across parties.
    RevenueDistributionModule,
  ],
  providers: [SettlementService],
  exports: [SettlementService, BillingModule, RevenueDistributionModule],
})
export class SettlementServiceModule {}
