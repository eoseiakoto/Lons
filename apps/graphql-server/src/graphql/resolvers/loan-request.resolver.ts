import { Resolver, Query, Mutation, Args, ID, registerEnumType } from '@nestjs/graphql';
import { encodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import type { MoneyString } from '@lons/shared-types';

import { LoanRequestType, LoanRequestConnection } from '../types/loan-request.type';
import { CreateLoanRequestInput } from '../inputs/create-loan-request.input';
import { PaginationInput } from '../inputs/pagination.input';

/**
 * Decision an operator makes when manually reviewing a loan request that
 * landed in `manual_review` (because the auto pipeline scored between the
 * approve / reject thresholds, or because the product is configured for
 * manual workflow).
 */
export enum ApprovalDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}
registerEnumType(ApprovalDecision, { name: 'ApprovalDecision' });

import {
  LoanRequestService,
  PreQualificationService,
  ScoringService,
  ApprovalService,
  OfferService,
  ContractService,
  DisbursementService,
} from '@lons/process-engine';
import { ScheduleService } from '@lons/repayment-service';

// Import decorators — these come from @lons/entity-service
import { CurrentTenant, Roles } from '@lons/entity-service';

@Resolver(() => LoanRequestType)
export class LoanRequestResolver {
  constructor(
    private loanRequestService: LoanRequestService,
    private preQualificationService: PreQualificationService,
    private scoringService: ScoringService,
    private approvalService: ApprovalService,
    private offerService: OfferService,
    private contractService: ContractService,
    private disbursementService: DisbursementService,
    private scheduleService: ScheduleService,
  ) {}

  @Query(() => LoanRequestConnection)
  @Roles('loan_request:read')
  async loanRequests(
    @CurrentTenant() tenantId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @Args('status', { nullable: true }) status?: string,
    @Args('customerId', { nullable: true }) customerId?: string,
  ): Promise<LoanRequestConnection> {
    const take = pagination?.first || 20;
    const result = await this.loanRequestService.findMany(tenantId, { status, customerId }, take, pagination?.after);
    const items = result.items;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: items.map((lr: any) => ({ node: lr as LoanRequestType, cursor: encodeCursor(lr.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  @Query(() => LoanRequestType)
  @Roles('loan_request:read')
  async loanRequest(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<LoanRequestType> {
    return this.loanRequestService.findById(tenantId, id) as unknown as LoanRequestType;
  }

  @Mutation(() => LoanRequestType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.LOAN_REQUEST)
  @Roles('loan_request:create')
  async createLoanRequest(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateLoanRequestInput,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ): Promise<LoanRequestType> {
    return this.loanRequestService.create(tenantId, {
      ...input,
      idempotencyKey,
    }) as unknown as LoanRequestType;
  }

  @Mutation(() => LoanRequestType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)
  @Roles('loan_request:process')
  async processLoanRequest(
    @CurrentTenant() tenantId: string,
    @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
  ): Promise<LoanRequestType> {
    // Run full auto pipeline: validate -> prequalify -> score -> approve -> offer
    let lr = await this.loanRequestService.validateRequest(tenantId, loanRequestId);
    if (lr.status === 'rejected') return lr as unknown as LoanRequestType;

    // Pre-qualify
    const preQualResult = await this.preQualificationService.evaluate(tenantId, lr.customerId, lr.productId);
    if (!preQualResult.qualified) {
      lr = await this.loanRequestService.transitionStatus(tenantId, loanRequestId, 'rejected' as any, {
        rejectionReasons: preQualResult.failedRules as any,
      });
      return lr as unknown as LoanRequestType;
    }
    lr = await this.loanRequestService.transitionStatus(tenantId, loanRequestId, 'pre_qualified' as any);

    // Score
    const scoringResult = await this.scoringService.scoreCustomer(
      tenantId, lr.customerId, lr.productId, 'application', String(lr.requestedAmount),
    );
    lr = await this.loanRequestService.transitionStatus(tenantId, loanRequestId, 'scored' as any, {
      scoringResult: { connect: { id: scoringResult.id } },
    });

    // Approve
    lr = await this.approvalService.makeDecision(tenantId, loanRequestId);
    if (lr.status === 'rejected' || lr.status === 'manual_review') {
      return lr as unknown as LoanRequestType;
    }

    // Generate offer
    lr = await this.offerService.generateOffer(tenantId, loanRequestId);
    return lr as unknown as LoanRequestType;
  }

  @Mutation(() => LoanRequestType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)
  @Roles('loan_request:process')
  async acceptOffer(
    @CurrentTenant() tenantId: string,
    @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
  ): Promise<LoanRequestType> {
    // Accept offer
    await this.offerService.acceptOffer(tenantId, loanRequestId);

    // Create contract
    const contract = await this.contractService.createFromAcceptedRequest(tenantId, loanRequestId);

    // Generate repayment schedule
    await this.scheduleService.createSchedule(tenantId, contract.id);

    // Initiate disbursement
    await this.disbursementService.initiateDisbursement(tenantId, contract.id);

    return this.loanRequestService.findById(tenantId, loanRequestId) as unknown as LoanRequestType;
  }

  @Mutation(() => LoanRequestType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)
  @Roles('loan_request:process')
  async declineOffer(
    @CurrentTenant() tenantId: string,
    @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
  ): Promise<LoanRequestType> {
    return this.offerService.declineOffer(tenantId, loanRequestId) as unknown as LoanRequestType;
  }

  /**
   * Manually approve or reject a loan request that landed in `manual_review`.
   *
   * P1-012: previously `ApprovalService.approveManual()` / `rejectManual()`
   * existed in process-engine but had no GraphQL surface, leaving requests
   * in `manual_review` permanently stuck. This mutation closes that gap and
   * is what the admin portal's "Approve / Reject" buttons call.
   *
   * Operators with `loan_request:process` permission can:
   *   - APPROVE with the requested amount, or substitute `adjustedAmount`
   *     (still clamped to product min/max in the service)
   *   - REJECT with a `reasonCode` (and optional `reasonDetail`) that lands
   *     in `rejection_reasons` on the loan request, where the customer-
   *     facing notification renders it
   *
   * `idempotencyKey` is required so a double-click doesn't double-approve.
   */
  @Mutation(() => LoanRequestType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)
  @Roles('loan_request:process')
  async approveLoanManual(
    @CurrentTenant() tenantId: string,
    @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
    @Args('decision', { type: () => ApprovalDecision }) decision: ApprovalDecision,
    @Args('idempotencyKey') _idempotencyKey: string,
    @Args('reasonCode', { nullable: true }) reasonCode?: string,
    @Args('reasonDetail', { nullable: true }) reasonDetail?: string,
    @Args('adjustedAmount', { type: () => String, nullable: true }) adjustedAmount?: MoneyString,
    @Args('approvedTenor', { nullable: true }) approvedTenor?: number,
  ): Promise<LoanRequestType> {
    if (decision === ApprovalDecision.REJECT) {
      if (!reasonCode) {
        throw new Error('reasonCode is required when rejecting a loan request');
      }
      const result = await this.approvalService.rejectManual(
        tenantId,
        loanRequestId,
        reasonCode,
        reasonDetail,
      );
      return result as unknown as LoanRequestType;
    }

    // APPROVE — fall back to the requested amount/tenor when the operator
    // didn't supply an override.
    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);
    const amount = adjustedAmount ?? String(lr.requestedAmount);
    const tenor = approvedTenor ?? lr.requestedTenor ?? lr.product.maxTenorDays ?? 30;
    const result = await this.approvalService.approveManual(
      tenantId,
      loanRequestId,
      amount,
      tenor,
    );
    return result as unknown as LoanRequestType;
  }
}
