import { Module } from '@nestjs/common';

import { PlanTierModule } from '../plan-tier/plan-tier.module';
import { ProductService } from './product.service';

@Module({
  // Sprint 14 (S14-10): plan-tier services for product-type gating and
  // quota enforcement at create time.
  imports: [PlanTierModule],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
