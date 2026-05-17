import { Resolver, Mutation, Args, ID, Int } from '@nestjs/graphql';
import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';
import { LoanRequestReviewService } from '@lons/process-engine';
import {
  CurrentTenant,
  CurrentUser,
  IAuthenticatedUser,
  Roles,
} from '@lons/entity-service';

import { LoanRequestType } from '../types/loan-request.type';
import {
  ModifyTermsInput,
  RejectionReasonInput,
} from '../inputs/loan-request-review.input';

/**
 * Sprint 18 (S18-1) — operator review actions for loan requests in
 * `manual_review` / `escalated`.
 *
 * Lives in a separate resolver from `LoanRequestResolver` so the legacy
 * `approveLoanManual` mutation (used by the existing applications list
 * drawer) can keep its surface unchanged. The new review detail page
 * (`/loans/applications/[id]`) calls these mutations.
 *
 * Idempotency: all four mutations accept an optional `idempotencyKey`.
 * Because we transition status (not insert), duplicate calls land on an
 * invalid transition the second time and the service throws — which is
 * the correct semantics (operator gets feedback, no silent re-decision).
 */
@Resolver()
export class LoanRequestReviewResolver {
  constructor(private readonly reviewService: LoanRequestReviewService) {}

  @Mutation(() => LoanRequestType)
  @AuditAction(AuditActionType.LOAN_APPROVE, AuditResourceType.LOAN_REQUEST)
  @Roles('loan_request:approve')
  async approveLoanRequest(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
    @Args('approvedAmount') approvedAmount: string,
    @Args('approvedTenor', { type: () => Int }) approvedTenor: number,
    @Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,
  ): Promise<LoanRequestType> {
    const result = await this.reviewService.approve(
      tenantId,
      loanRequestId,
      approvedAmount,
      approvedTenor,
      user.userId,
    );
    return result as unknown as LoanRequestType;
  }

  @Mutation(() => LoanRequestType)
  @AuditAction(AuditActionType.LOAN_REJECT, AuditResourceType.LOAN_REQUEST)
  @Roles('loan_request:approve')
  async rejectLoanRequest(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
    @Args('rejectionReasons', { type: () => [RejectionReasonInput] })
    rejectionReasons: RejectionReasonInput[],
    @Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,
  ): Promise<LoanRequestType> {
    const result = await this.reviewService.reject(
      tenantId,
      loanRequestId,
      rejectionReasons,
      user.userId,
    );
    return result as unknown as LoanRequestType;
  }

  @Mutation(() => LoanRequestType)
  @AuditAction(AuditActionType.LOAN_ESCALATE, AuditResourceType.LOAN_REQUEST)
  @Roles('loan_request:approve')
  async escalateLoanRequest(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
    @Args('escalationReason') escalationReason: string,
    @Args('escalatedTo', { type: () => ID, nullable: true }) escalatedTo?: string,
    @Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,
  ): Promise<LoanRequestType> {
    const result = await this.reviewService.escalate(
      tenantId,
      loanRequestId,
      escalationReason,
      escalatedTo ?? null,
      user.userId,
    );
    return result as unknown as LoanRequestType;
  }

  @Mutation(() => LoanRequestType)
  @AuditAction(AuditActionType.LOAN_TERMS_MODIFIED, AuditResourceType.LOAN_REQUEST)
  @Roles('loan_request:approve')
  async modifyLoanRequestTerms(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
    @Args('input', { type: () => ModifyTermsInput }) input: ModifyTermsInput,
    @Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,
  ): Promise<LoanRequestType> {
    const result = await this.reviewService.modifyTerms(
      tenantId,
      loanRequestId,
      input,
      user.userId,
    );
    return result as unknown as LoanRequestType;
  }
}
