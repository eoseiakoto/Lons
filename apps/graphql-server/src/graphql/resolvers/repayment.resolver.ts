import { Resolver, Query, Mutation, Args, ID, Float } from '@nestjs/graphql';
import { encodeCursor } from '@lons/common';
import { PaymentService } from '@lons/repayment-service';
import { CurrentTenant, Roles } from '@lons/entity-service';

import { RepaymentType, RepaymentConnection, EarlySettlementQuote } from '../types/repayment.type';
import { PaginationInput } from '../inputs/pagination.input';

@Resolver(() => RepaymentType)
export class RepaymentResolver {
  constructor(private paymentService: PaymentService) {}

  @Mutation(() => RepaymentType)
  @Roles('repayment:create')
  async processRepayment(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('amount', { type: () => Float }) amount: number,
    @Args('currency') currency: string,
    @Args('method') method: string,
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

  @Query(() => EarlySettlementQuote)
  @Roles('contract:read')
  async earlySettlementQuote(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
  ): Promise<EarlySettlementQuote> {
    return this.paymentService.calculateEarlySettlement(tenantId, contractId) as unknown as EarlySettlementQuote;
  }
}
