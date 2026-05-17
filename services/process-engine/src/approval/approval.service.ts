import { Injectable, Optional } from '@nestjs/common';
import { PrismaService, LoanRequestStatus, Prisma } from '@lons/database';
import { ValidationError, compare, min as decMin } from '@lons/common';

import { LoanRequestService } from '../loan-request/loan-request.service';
import { ApprovalLimitService } from './approval-limit.service';

@Injectable()
export class ApprovalService {
  constructor(
    private prisma: PrismaService,
    private loanRequestService: LoanRequestService,
    // Sprint 18 (S18-6): per-operator approval-authority limits. @Optional
    // so legacy tests that wire ApprovalService without the new dep keep
    // working — production wiring always provides it via ApprovalModule.
    // When absent, manual approvals/rejections proceed without authority
    // checks (matching pre-S18 behaviour).
    @Optional() private approvalLimitService?: ApprovalLimitService,
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
          approvedAmount,
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

  /**
   * Approves a loan request that's in `manual_review`. The operator can
   * accept the requested amount or substitute an adjusted amount (still
   * subject to the product's min/max). `approvedTenor` defaults to the
   * requested tenor if absent.
   *
   * P0-001: `approvedAmount` is a Decimal string — never `number`.
   */
  async approveManual(
    tenantId: string,
    loanRequestId: string,
    approvedAmount: string,
    approvedTenor: number,
    // Sprint 18 (S18-6): operator id is used to enforce per-operator
    // approval-authority limits. Optional for backward compat with
    // callers that haven't been updated yet — when absent, no limit
    // check is performed.
    operatorId?: string,
  ) {
    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
    // S18-1 added the `escalated` status; an escalated request is also a
    // manual decision so we allow approval from either state.
    if (
      lr.status !== LoanRequestStatus.manual_review &&
      lr.status !== LoanRequestStatus.escalated
    ) {
      throw new ValidationError(
        `Loan request must be in manual_review or escalated to approve manually; current status: ${lr.status}`,
      );
    }

    // S18-6: check operator authority BEFORE the clamp so the error
    // surfaces the operator's actual ceiling, not a silently-reduced
    // amount. The check compares the OPERATOR-SUPPLIED amount (their
    // intent) against the limit — clamping happens after.
    if (operatorId && this.approvalLimitService) {
      await this.approvalLimitService.validateOperatorAction(
        tenantId,
        operatorId,
        'approve',
        {
          requestedAmount: approvedAmount,
          product: { type: lr.product?.type, productType: lr.product?.type },
          status: lr.status,
        },
      );
    }

    // Clamp the operator-supplied amount to product min/max. Operators can
    // override an auto-approval recommendation but they can't go outside
    // product bounds.
    const product = lr.product;
    const productMax = product?.maxAmount ? String(product.maxAmount) : approvedAmount;
    const productMin = product?.minAmount ? String(product.minAmount) : '0';
    let amount = decMin(approvedAmount, productMax);
    if (compare(amount, productMin) < 0) {
      amount = productMin;
    }

    const result = await this.loanRequestService.transitionStatus(
      tenantId,
      loanRequestId,
      LoanRequestStatus.approved,
      {
        approvedAmount: amount,
        approvedTenor,
      },
    );

    // S18-6: increment the operator's daily counter only after the
    // transition lands successfully. If the transition throws we leak
    // no counter increment (and Redis being down doesn't roll back the
    // approval — the service swallows that error).
    if (operatorId && this.approvalLimitService) {
      await this.approvalLimitService.incrementDailyCount(tenantId, operatorId);
    }

    return result;
  }

  async rejectManual(
    tenantId: string,
    loanRequestId: string,
    reasonCode: string,
    reasonDetail?: string,
    // S18-6: optional operatorId. Reject/escalate are not amount-bound
    // so the limit check is a no-op in practice — but we pass it
    // through to keep the call sites symmetric and to allow the
    // `OPERATOR_SUSPENDED` check to fire.
    operatorId?: string,
  ) {
    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
    if (
      lr.status !== LoanRequestStatus.manual_review &&
      lr.status !== LoanRequestStatus.escalated
    ) {
      throw new ValidationError(
        `Loan request must be in manual_review or escalated to reject manually; current status: ${lr.status}`,
      );
    }

    if (operatorId && this.approvalLimitService) {
      await this.approvalLimitService.validateOperatorAction(
        tenantId,
        operatorId,
        'reject',
        {
          requestedAmount: String(lr.requestedAmount),
          product: { type: lr.product?.type, productType: lr.product?.type },
          status: lr.status,
        },
      );
    }

    return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.rejected, {
      rejectionReasons: [
        { code: reasonCode, message: reasonDetail ?? reasonCode },
      ] as unknown as Prisma.InputJsonValue,
    });
  }
}
