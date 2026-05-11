import { Module } from '@nestjs/common';

import { PlanTierModule } from '../plan-tier/plan-tier.module';
import { LenderService } from './lender.service';

@Module({
  // Sprint 14 (S14-10): plan-tier quota enforcement on lender create.
  imports: [PlanTierModule],
  providers: [LenderService],
  exports: [LenderService],
})
export class LenderModule {}
