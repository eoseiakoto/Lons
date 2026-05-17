import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { EventBusModule, ObservabilityModule } from '@lons/common';

import { LoanRequestModule } from './loan-request/loan-request.module';
import { LoanRequestReviewModule } from './loan-request/loan-request-review.module';
import { ContractWriteOperationsModule } from './contract/contract-write-operations.module';
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
import { CoolingOffModule } from './cooling-off/cooling-off.module';
import { ExposureModule } from './exposure/exposure.module';
import { BnplModule } from './bnpl/bnpl.module';
import { ProcessEngineFactoringModule } from './factoring/factoring.module';
import { MicroLoanModule } from './micro-loan/micro-loan.module';
// Sprint 18 (S18-7 / S18-12): per-step audit trail + delayed-job retry
// orchestration. The retry module registers the `pipeline-step-retry`
// BullMQ queue — the composition root (graphql-server / rest-server)
// must register `BullModule.forRoot(...)` once for the Redis
// connection details to be picked up.
import { PipelineStepLoggerModule } from './pipeline/pipeline-step-logger.module';
import { PipelineRetryModule } from './pipeline/pipeline-retry.module';

@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    ObservabilityModule,
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
    CoolingOffModule,
    ExposureModule,
    BnplModule,
    ProcessEngineFactoringModule,
    // Sprint 16 (Track A) — micro-loan-specific services + listener.
    MicroLoanModule,
    // Sprint 18 (S18-1) — operator review actions (approve / reject /
    // escalate / modify terms) for loan requests in manual_review.
    LoanRequestReviewModule,
    // Sprint 18 (S18-2) — operator write operations on active contracts
    // (manual payment, restructure, penalty waiver). PaymentService is
    // @Optional() and wired by the composition root via
    // RepaymentServiceModule.
    ContractWriteOperationsModule,
    // Sprint 18 (S18-7) — pipeline audit trail.
    PipelineStepLoggerModule,
    // Sprint 18 (S18-12) — pipeline retry orchestration.
    PipelineRetryModule,
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
    CoolingOffModule,
    ExposureModule,
    BnplModule,
    ProcessEngineFactoringModule,
    MicroLoanModule,
    LoanRequestReviewModule,
    ContractWriteOperationsModule,
    PipelineStepLoggerModule,
    PipelineRetryModule,
  ],
})
export class ProcessEngineModule {}
