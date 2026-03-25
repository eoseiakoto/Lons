import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule } from '@lons/common';

import { LoanRequestModule } from './loan-request/loan-request.module';
import { PreQualificationModule } from './pre-qualification/pre-qualification.module';
import { ScoringModule } from './scoring/scoring.module';
import { ApprovalModule } from './approval/approval.module';
import { OfferModule } from './offer/offer.module';
import { ContractModule } from './contract/contract.module';
import { DisbursementModule } from './disbursement/disbursement.module';
import { InterestAccrualModule } from './interest-accrual/interest-accrual.module';
import { AgingModule } from './aging/aging.module';
import { PenaltyModule } from './penalty/penalty.module';
import { CollectionsModule } from './collections/collections.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    LoanRequestModule,
    PreQualificationModule,
    ScoringModule,
    ApprovalModule,
    OfferModule,
    ContractModule,
    DisbursementModule,
    InterestAccrualModule,
    AgingModule,
    PenaltyModule,
    CollectionsModule,
    AnalyticsModule,
    MonitoringModule,
  ],
  exports: [
    LoanRequestModule,
    PreQualificationModule,
    ScoringModule,
    ApprovalModule,
    OfferModule,
    ContractModule,
    DisbursementModule,
    InterestAccrualModule,
    AgingModule,
    PenaltyModule,
    CollectionsModule,
    AnalyticsModule,
    MonitoringModule,
  ],
})
export class ProcessEngineModule {}
