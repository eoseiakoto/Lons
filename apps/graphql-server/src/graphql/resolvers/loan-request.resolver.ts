import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { encodeCursor } from '@lons/common';

import { LoanRequestType, LoanRequestConnection } from '../types/loan-request.type';
import { CreateLoanRequestInput } from '../inputs/create-loan-request.input';
import { PaginationInput } from '../inputs/pagination.input';

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
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser, Public } from '@lons/entity-service';

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
  @Roles('loan_request:process')
  async declineOffer(
    @CurrentTenant() tenantId: string,
    @Args('loanRequestId', { type: () => ID }) loanRequestId: string,
  ): Promise<LoanRequestType> {
    return this.offerService.declineOffer(tenantId, loanRequestId) as unknown as LoanRequestType;
  }
}
