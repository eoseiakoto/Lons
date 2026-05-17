import { Injectable, Optional, Logger } from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  LoanRequestStatus,
} from '@lons/database';
import {
  EventBusService,
  ValidationError,
  compare,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { LoanRequestService } from './loan-request.service';
import { ApprovalLimitService } from '../approval/approval-limit.service';

/**
 * Sprint 18 — S18-1 / FR-AE-002.2.
 *
 * Operator-driven actions on loan requests sitting in `manual_review` or
 * `escalated`. Lives alongside but separate from `ApprovalService`:
 *
 *   - `ApprovalService.makeDecision()` is the auto pipeline (score-driven).
 *   - `ApprovalService.approveManual()` / `rejectManual()` is the legacy
 *     manual approve/reject path used by the existing GraphQL surface.
 *   - This service adds the four new portal actions the BA asked for —
 *     approve with operator-limit check, reject with structured reasons,
 *     escalate to a higher tier, and modify-terms before approval.
 *
 * The previous-generation manual mutations remain for backwards
 * compatibility with the existing admin queue; this service is what the
 * NEW review detail page (`/loans/applications/[id]`) calls.
 *
 * Cross-track dependency: `ApprovalLimitService` (S18-6, Track B) is
 * `@Optional()` because:
 *   1. Pre-Sprint-18 operators have no limits row — the service no-ops
 *      cleanly when no row exists.
 *   2. Unit tests can construct this service without wiring approval.module.
 */
@Injectable()
export class LoanRequestReviewService {
  private readonly logger = new Logger(LoanRequestReviewService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private loanRequestService: LoanRequestService,
    @Optional() private approvalLimitService?: ApprovalLimitService,
  ) {}

  /**
   * Approve a loan request in `manual_review` or `escalated`. Operator
   * authority is checked via `ApprovalLimitService.validateOperatorAction`
   * before the transition — exceeding any limit throws a structured
   * ForbiddenException whose `code` is surfaced to the admin portal.
   *
   * `approvedAmount` is always a Decimal string per CLAUDE.md. The
   * service clamps it to the product min/max before persisting.
   */
  async approve(
    tenantId: string,
    loanRequestId: string,
    approvedAmount: string,
    approvedTenor: number,
    operatorId: string,
  ) {
    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
    if (
      lr.status !== LoanRequestStatus.manual_review &&
      lr.status !== LoanRequestStatus.escalated
    ) {
      throw new ValidationError(
        `Loan request must be in manual_review or escalated to approve; current status: ${lr.status}`,
        { currentStatus: lr.status },
      );
    }

    // S18-6 — enforce per-operator approval limits. Defensive against
    // the case where the service isn't wired (unit tests, partial
    // deployments).
    if (this.approvalLimitService) {
      await this.approvalLimitService.validateOperatorAction(
        tenantId,
        operatorId,
        'approve',
        lr as unknown as {
          requestedAmount: { toString(): string } | string;
          product: { productType?: string; type?: string };
          status: string;
        },
      );
    }

    // Clamp to product bounds — never exceed maxAmount even if the
    // operator typed something larger.
    const product = lr.product;
    const productMax = product?.maxAmount ? String(product.maxAmount) : approvedAmount;
    const productMin = product?.minAmount ? String(product.minAmount) : '0';
    let amount = approvedAmount;
    if (compare(amount, productMax) > 0) amount = productMax;
    if (compare(amount, productMin) < 0) amount = productMin;

    const updated = await this.loanRequestService.transitionStatus(
      tenantId,
      loanRequestId,
      LoanRequestStatus.approved,
      {
        approvedAmount: amount,
        approvedTenor,
        metadata: {
          ...((lr.metadata as Record<string, unknown>) || {}),
          reviewedBy: operatorId,
          reviewedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    );

    // Best-effort daily counter increment for the operator. Failure here
    // doesn't roll back the approval — the limit check already happened.
    if (this.approvalLimitService) {
      try {
        await this.approvalLimitService.incrementDailyCount(tenantId, operatorId);
      } catch (err) {
        this.logger.warn(
          `Failed to increment daily approval counter for operator ${operatorId.slice(0, 8)}…: ${(err as Error).message}`,
        );
      }
    }

    return updated;
  }

  /**
   * Reject a loan request with operator-supplied structured reasons.
   * Multiple reasons are persisted as a JSON array on `rejectionReasons`
   * so downstream notifications can render them verbatim.
   */
  async reject(
    tenantId: string,
    loanRequestId: string,
    rejectionReasons: { code: string; message: string }[],
    operatorId: string,
  ) {
    if (!rejectionReasons || rejectionReasons.length === 0) {
      throw new ValidationError('At least one rejection reason is required');
    }

    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
    if (
      lr.status !== LoanRequestStatus.manual_review &&
      lr.status !== LoanRequestStatus.escalated
    ) {
      throw new ValidationError(
        `Loan request must be in manual_review or escalated to reject; current status: ${lr.status}`,
        { currentStatus: lr.status },
      );
    }

    return this.loanRequestService.transitionStatus(
      tenantId,
      loanRequestId,
      LoanRequestStatus.rejected,
      {
        rejectionReasons: rejectionReasons as unknown as Prisma.InputJsonValue,
        metadata: {
          ...((lr.metadata as Record<string, unknown>) || {}),
          reviewedBy: operatorId,
          reviewedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    );
  }

  /**
   * Escalate a `manual_review` request to a senior approver. `escalatedTo`
   * is optional — when null any user with the elevated permission can pick
   * the request up. Emits LOAN_REQUEST_ESCALATED so notifications can fan
   * out to the right reviewer pool.
   */
  async escalate(
    tenantId: string,
    loanRequestId: string,
    escalationReason: string,
    escalatedTo: string | null,
    operatorId: string,
  ) {
    if (!escalationReason || escalationReason.trim().length === 0) {
      throw new ValidationError('Escalation reason is required');
    }

    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
    if (lr.status !== LoanRequestStatus.manual_review) {
      throw new ValidationError(
        `Loan request must be in manual_review to escalate; current status: ${lr.status}`,
        { currentStatus: lr.status },
      );
    }

    const updated = await this.loanRequestService.transitionStatus(
      tenantId,
      loanRequestId,
      LoanRequestStatus.escalated,
      {
        metadata: {
          ...((lr.metadata as Record<string, unknown>) || {}),
          escalation: {
            reason: escalationReason,
            escalatedBy: operatorId,
            escalatedTo,
            escalatedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    );

    this.eventBus.emitAndBuild(EventType.LOAN_REQUEST_ESCALATED, tenantId, {
      loanRequestId,
      escalatedBy: operatorId,
      escalatedTo,
      reason: escalationReason,
    });

    return updated;
  }

  /**
   * Modify offer terms before approval. Does NOT change status — the
   * operator must still approve afterwards. Stored under `metadata.termModifications`
   * so the audit trail can show what changed and why.
   *
   * Bounds-check against the product min/max — operators cannot offer
   * a term outside the product's contract.
   */
  async modifyTerms(
    tenantId: string,
    loanRequestId: string,
    modifications: {
      adjustedAmount?: string;
      adjustedTenor?: number;
      adjustedInterestRate?: string;
      modificationReason: string;
    },
    operatorId: string,
  ) {
    if (!modifications.modificationReason || modifications.modificationReason.trim().length === 0) {
      throw new ValidationError('Modification reason is required');
    }

    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
    if (
      lr.status !== LoanRequestStatus.manual_review &&
      lr.status !== LoanRequestStatus.escalated
    ) {
      throw new ValidationError(
        `Loan request must be in manual_review or escalated to modify terms; current status: ${lr.status}`,
        { currentStatus: lr.status },
      );
    }

    const product = lr.product;
    if (modifications.adjustedAmount) {
      if (product?.minAmount && compare(modifications.adjustedAmount, String(product.minAmount)) < 0) {
        throw new ValidationError(
          `Adjusted amount ${modifications.adjustedAmount} below product minimum ${product.minAmount}`,
        );
      }
      if (product?.maxAmount && compare(modifications.adjustedAmount, String(product.maxAmount)) > 0) {
        throw new ValidationError(
          `Adjusted amount ${modifications.adjustedAmount} above product maximum ${product.maxAmount}`,
        );
      }
    }
    if (modifications.adjustedTenor != null && product?.maxTenorDays && modifications.adjustedTenor > product.maxTenorDays) {
      throw new ValidationError(
        `Adjusted tenor ${modifications.adjustedTenor} above product maximum ${product.maxTenorDays}`,
      );
    }

    const existingMeta = (lr.metadata as Record<string, unknown>) || {};
    const updated = await this.prisma.loanRequest.update({
      where: { id: loanRequestId },
      data: {
        metadata: {
          ...existingMeta,
          termModifications: {
            adjustedAmount: modifications.adjustedAmount,
            adjustedTenor: modifications.adjustedTenor,
            adjustedInterestRate: modifications.adjustedInterestRate,
            reason: modifications.modificationReason,
            modifiedBy: operatorId,
            modifiedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
      include: { customer: true, product: true, scoringResult: true },
    });

    this.eventBus.emitAndBuild(EventType.LOAN_REQUEST_TERMS_MODIFIED, tenantId, {
      loanRequestId,
      modifiedBy: operatorId,
      adjustedAmount: modifications.adjustedAmount,
      adjustedTenor: modifications.adjustedTenor,
      adjustedInterestRate: modifications.adjustedInterestRate,
      reason: modifications.modificationReason,
    });

    return updated;
  }
}
