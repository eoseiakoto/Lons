import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import type { MoneyString } from '@lons/shared-types';
import { encodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import { PaymentService, EarlySettlementService } from '@lons/repayment-service';
import { PrismaService } from '@lons/database';
import { CurrentTenant, Roles } from '@lons/entity-service';

import { RepaymentType, RepaymentConnection, EarlySettlementQuote } from '../types/repayment.type';
import { PaginationInput } from '../inputs/pagination.input';

@Resolver(() => RepaymentType)
export class RepaymentResolver {
  constructor(
    private paymentService: PaymentService,
    // Sprint 16 (S16-9) — rebate/fee-aware quote service.
    private earlySettlementService: EarlySettlementService,
    private prisma: PrismaService,
  ) {}

  /**
   * Sprint 16 fixes (FIX-3): `idempotencyKey` is REQUIRED. A duplicate
   * mutation with the same `(tenantId, idempotencyKey)` returns the
   * existing repayment instead of creating a phantom row. Closes the
   * direct-financial-loss vector from a network retry / double-click.
   * Per CLAUDE.md "API Design" — all mutations accept an idempotencyKey.
   */
  @Mutation(() => RepaymentType)
  @AuditAction(AuditActionType.REPAYMENT, AuditResourceType.REPAYMENT)
  @Roles('repayment:create')
  async processRepayment(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('amount', { type: () => String }) amount: MoneyString,
    @Args('currency') currency: string,
    @Args('method') method: string,
    @Args('idempotencyKey') idempotencyKey: string,
    @Args('source', { nullable: true }) source?: string,
    @Args('externalRef', { nullable: true }) externalRef?: string,
  ): Promise<RepaymentType> {
    return this.paymentService.processPayment(tenantId, {
      contractId,
      amount,
      currency,
      method,
      source,
      externalRef,
      idempotencyKey,
    }) as unknown as RepaymentType;
  }

  @Query(() => RepaymentConnection)
  @Roles('repayment:read')
  async repayments(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<RepaymentConnection> {
    const take = pagination?.first || 20;
    const result = await this.paymentService.getRepayments(tenantId, contractId, take, pagination?.after);
    const items = result.items;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: items.map((r: any) => ({ node: r as RepaymentType, cursor: encodeCursor(r.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  /**
   * Sprint 16 (S16-9): rebate-aware quote. The returned shape merges
   * the legacy `outstanding*` + `currency` fields (unchanged for
   * backwards compatibility) with the new rebate / fee / breakdown
   * fields from `EarlySettlementService`.
   */
  @Query(() => EarlySettlementQuote)
  @Roles('contract:read')
  async earlySettlementQuote(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
  ): Promise<EarlySettlementQuote> {
    const quote = await this.earlySettlementService.calculateEarlySettlementAmount(
      tenantId,
      contractId,
    );
    // Look up `currency` from the contract — the new service doesn't
    // surface it because the breakdown is in the contract's currency
    // implicitly (one contract = one currency).
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: {
        currency: true,
        outstandingPrincipal: true,
        outstandingInterest: true,
        outstandingFees: true,
        outstandingPenalties: true,
      },
    });
    return {
      contractId: quote.contractId,
      outstandingPrincipal: quote.remainingPrincipal,
      outstandingInterest: quote.accruedInterest,
      outstandingFees: String(contract?.outstandingFees ?? '0'),
      outstandingPenalties: String(contract?.outstandingPenalties ?? '0'),
      totalSettlementAmount: quote.totalSettlementAmount,
      currency: contract?.currency ?? 'USD',
      interestRebate: quote.interestRebate,
      settlementFee: quote.settlementFee,
      validUntil: quote.validUntil,
      breakdown: quote.breakdown.map((b) => ({
        label: b.label,
        amount: b.amount,
        type: b.type,
      })),
    };
  }
}
