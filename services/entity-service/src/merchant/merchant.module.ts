import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { PlanTierModule } from '../plan-tier/plan-tier.module';
import { MerchantService } from './merchant.service';

@Module({
  // Sprint 14 (S14-10): plan-tier quota enforcement on merchant create.
  imports: [PrismaModule, PlanTierModule],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
