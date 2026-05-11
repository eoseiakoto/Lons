import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { AuditAction, RequiresPlan } from '@lons/common';
import {
  CurrentTenant,
  CurrentUser,
  IAuthenticatedUser,
  Roles,
} from '@lons/entity-service';
import {
  InvoiceVerificationService,
  type RejectInvoiceReason,
} from '@lons/process-engine';

import { InvoiceType } from '../types/factoring.type';
import {
  ApproveInvoiceInput,
  RejectInvoiceInput,
  VerificationQueueFiltersInput,
  VerificationQueuePaginationInput,
} from '../inputs/invoice-verification.input';
import { InvoiceConnectionType } from '../types/factoring.type';

/**
 * Sprint 14 (S14-IF-1) — GraphQL surface for the operator-facing invoice
 * verification queue.
 *
 * All endpoints require:
 *   - `factoring:verify` role (operator permission)
 *   - Enterprise plan tier (factoring is enterprise-only — see SPEC-plan-tiers.md §3.1)
 *
 * Resolved separately from `FactoringResolver` to keep the verification
 * concerns isolated from the underlying invoice lifecycle resolvers.
 */
@Resolver()
export class InvoiceVerificationResolver {
  constructor(
    private readonly verificationService: InvoiceVerificationService,
  ) {}

  // ── Queue ─────────────────────────────────────────────────────────

  @Query(() => InvoiceConnectionType)
  @Roles('factoring:verify')
  @RequiresPlan('enterprise')
  async invoiceVerificationQueue(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('filters', { nullable: true }) filters?: VerificationQueueFiltersInput,
    @Args('pagination', { nullable: true })
    pagination?: VerificationQueuePaginationInput,
  ): Promise<InvoiceConnectionType> {
    const result = await this.verificationService.getVerificationQueue(
      tenantId,
      {
        sellerId: filters?.sellerId,
        debtorId: filters?.debtorId,
        minAmount: filters?.minAmount,
        maxAmount: filters?.maxAmount,
        submittedAfter: filters?.submittedAfter
          ? new Date(filters.submittedAfter)
          : undefined,
        submittedBefore: filters?.submittedBefore
          ? new Date(filters.submittedBefore)
          : undefined,
        // Narrow to the accepted literal union; anything else falls
        // through to "all" (the service's default).
        assignedTo:
          filters?.assignedTo === 'me'
            ? 'me'
            : filters?.assignedTo === 'unassigned'
              ? 'unassigned'
              : undefined,
        currentUserId: user.userId,
      },
      {
        first: pagination?.first,
        after: pagination?.after,
      },
    );

    // Shape into the existing InvoiceConnection contract — totalCount
    // is omitted (the queue is FIFO, operators care about depth not
    // an exact count).
    const items = result.items as Array<{ id: string }>;
    return {
      edges: items.map((node) => ({
        node: node as unknown as InvoiceType,
        cursor: node.id,
      })),
      pageInfo: {
        hasNextPage: result.nextCursor !== null,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? items[0].id : undefined,
        endCursor: items.length > 0 ? items[items.length - 1].id : undefined,
      },
      totalCount: items.length,
    };
  }

  // ── Mutations ────────────────────────────────────────────────────

  @Mutation(() => InvoiceType)
  @Roles('factoring:verify')
  @RequiresPlan('enterprise')
  @AuditAction('claim.invoice', 'invoice')
  async claimInvoice(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<InvoiceType> {
    return (await this.verificationService.claimInvoice(
      tenantId,
      invoiceId,
      user.userId,
    )) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @Roles('factoring:verify')
  @RequiresPlan('enterprise')
  @AuditAction('approve.invoice', 'invoice')
  async approveInvoice(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('input') input: ApproveInvoiceInput,
  ): Promise<InvoiceType> {
    return (await this.verificationService.approveInvoice(
      tenantId,
      invoiceId,
      user.userId,
      { notes: input.notes, checklist: input.checklist },
    )) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @Roles('factoring:verify')
  @RequiresPlan('enterprise')
  @AuditAction('reject.invoice', 'invoice')
  async rejectInvoice(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('input') input: RejectInvoiceInput,
  ): Promise<InvoiceType> {
    return (await this.verificationService.rejectInvoice(
      tenantId,
      invoiceId,
      user.userId,
      {
        reason: input.reason as RejectInvoiceReason,
        notes: input.notes,
      },
    )) as unknown as InvoiceType;
  }

  @Mutation(() => InvoiceType)
  @Roles('factoring:verify')
  @RequiresPlan('enterprise')
  @AuditAction('requestInfo.invoice', 'invoice')
  async requestInvoiceInfo(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('message') message: string,
  ): Promise<InvoiceType> {
    return (await this.verificationService.requestMoreInfo(
      tenantId,
      invoiceId,
      user.userId,
      message,
    )) as unknown as InvoiceType;
  }
}
