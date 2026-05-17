import { Module } from '@nestjs/common';
import { EventBusModule } from '@lons/common';

import { PlanTierModule } from '../plan-tier/plan-tier.module';
import { AuditModule } from '../audit/audit.module';
import { CustomerService } from './customer.service';
import { CustomerConsentService } from './customer-consent.service';
// S17-8 (FR-CM-001.3): configurable de-duplication + merge.
import { CustomerDedupService } from './customer-dedup.service';
import { CustomerMergeService } from './customer-merge.service';
// S17-9 (FR-CM-002.1): financial profile aggregation.
import { CustomerFinancialProfileService } from './customer-financial-profile.service';
// S17-10 (FR-CM-003.1): credit summary aggregation.
import { CustomerCreditSummaryService } from './customer-credit-summary.service';

@Module({
  // Sprint 14 (S14-10): plan-tier quota enforcement on customer create.
  // S17-8: AuditModule for customer merge audit logging.
  // S17 review fix: EventBus so merge / financial-data-sync emit
  // cache-invalidation events the profile/summary listeners consume.
  imports: [PlanTierModule, AuditModule, EventBusModule],
  providers: [
    CustomerService,
    CustomerConsentService,
    CustomerDedupService,
    CustomerMergeService,
    CustomerFinancialProfileService,
    CustomerCreditSummaryService,
  ],
  exports: [
    CustomerService,
    CustomerConsentService,
    CustomerDedupService,
    CustomerMergeService,
    CustomerFinancialProfileService,
    CustomerCreditSummaryService,
  ],
})
export class CustomerModule {}
