import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { LoanRequestModule } from './loan-request.module';
import { LoanRequestReviewService } from './loan-request-review.service';
import { ApprovalModule } from '../approval/approval.module';

/**
 * Sprint 18 (S18-1) — operator-driven review actions on loan requests
 * sitting in `manual_review` / `escalated`. Imports the existing
 * loan-request and approval modules so the review service can reuse
 * `LoanRequestService.transitionStatus()` and `ApprovalLimitService`
 * (Track B / S18-6) for per-operator authority checks.
 *
 * Lives in its own module to keep the dependency graph one-way:
 * approval-module already imports loan-request-module, so the review
 * service cannot live inside loan-request-module without creating a
 * cycle.
 */
@Module({
  imports: [PrismaModule, LoanRequestModule, ApprovalModule],
  providers: [LoanRequestReviewService],
  exports: [LoanRequestReviewService],
})
export class LoanRequestReviewModule {}
