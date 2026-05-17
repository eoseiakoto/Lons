import { Module } from '@nestjs/common';
import { EventBusModule } from '@lons/common';

import { PlanTierModule } from '../plan-tier/plan-tier.module';
import { ProductService } from './product.service';

@Module({
  // Sprint 14 (S14-10): plan-tier services for product-type gating and
  // quota enforcement at create time.
  // Sprint 17 (S17-FIX-1): EventBus so update() can emit
  // PRODUCT_CONFIG_CHANGED for the BNPL credit-line listener.
  imports: [PlanTierModule, EventBusModule],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
