import { Injectable } from '@nestjs/common';
import { PrismaService, LoanRequestStatus, Prisma } from '@lons/database';
import { ValidationError } from '@lons/common';

import { LoanRequestService } from '../loan-request/loan-request.service';

@Injectable()
export class ApprovalService {
  constructor(
    private prisma: PrismaService,
    private loanRequestService: LoanRequestService,
  ) {}

  async makeDecision(tenantId: string, loanRequestId: string) {
    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);

    if (lr.status !== LoanRequestStatus.scored) {
      throw new ValidationError('Loan request must be in scored status for approval');
    }

    const scoringResult = lr.scoringResult;
    if (!scoringResult) {
      throw new ValidationError('No scoring result found for this loan request');
    }

    const product = lr.product;
    const workflow = product.approvalWorkflow;
    const score = Number(scoringResult.score);
    const thresholds = product.approvalThresholds as { autoApproveAbove?: number; autoRejectBelow?: number } | null;

    const autoApproveAbove = thresholds?.autoApproveAbove ?? 700;
    const autoRejectBelow = thresholds?.autoRejectBelow ?? 300;

    if (workflow === 'auto' || workflow === 'semi_auto') {
      if (score >= autoApproveAbove) {
        // Approve
        const recommendedLimit = scoringResult.recommendedLimit ? String(scoringResult.recommendedLimit) : String(lr.requestedAmount);
        const productMax = product.maxAmount ? String(product.maxAmount) : recommendedLimit;
        const productMin = product.minAmount ? String(product.minAmount) : '0';
        const requestedStr = String(lr.requestedAmount);

        let approvedAmount = decMin(requestedStr, decMin(recommendedLimit, productMax));
        if (compare(approvedAmount, productMin) < 0) {
          approvedAmount = productMin;
        }

        return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.approved, {
          approvedAmount: Number(approvedAmount),
          approvedTenor: lr.requestedTenor || product.maxTenorDays,
        });
      } else if (score < autoRejectBelow) {
        return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.rejected, {
          rejectionReasons: [{ code: 'LOW_CREDIT_SCORE', message: `Score ${score} below threshold ${autoRejectBelow}` }] as unknown as Prisma.InputJsonValue,
        });
      } else {
        return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.manual_review);
      }
    }

    // single_level, multi_level — always manual review for Phase 2
    return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.manual_review);
  }

  async approveManual(tenantId: string, loanRequestId: string, approvedAmount: number, approvedTenor: number) {
    return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.approved, {
      approvedAmount,
      approvedTenor,
    });
  }

  async rejectManual(tenantId: string, loanRequestId: string, reason: string) {
    return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.rejected, {
      rejectionReasons: [{ code: 'MANUAL_REJECTION', message: reason }] as unknown as Prisma.InputJsonValue,
    });
  }
}
