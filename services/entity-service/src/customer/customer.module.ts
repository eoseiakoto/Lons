import { Module } from '@nestjs/common';

import { PlanTierModule } from '../plan-tier/plan-tier.module';
import { CustomerService } from './customer.service';
import { CustomerConsentService } from './customer-consent.service';

@Module({
  // Sprint 14 (S14-10): plan-tier quota enforcement on customer create.
  imports: [PlanTierModule],
  providers: [CustomerService, CustomerConsentService],
  exports: [CustomerService, CustomerConsentService],
})
export class CustomerModule {}
