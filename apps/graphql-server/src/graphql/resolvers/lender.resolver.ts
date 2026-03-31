import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import { LenderService, CurrentTenant, Roles } from '@lons/entity-service';
import { encodeCursor } from '@lons/common';

import { LenderType, LenderConnection } from '../types/lender.type';
import { PaginationInput } from '../inputs/pagination.input';

@Resolver(() => LenderType)
export class LenderResolver {
  constructor(private lenderService: LenderService) {}

  @Query(() => LenderConnection)
  @Roles('lender:read')
  async lenders(
    @CurrentTenant() tenantId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<LenderConnection> {
    const take = pagination?.first || 20;
    const result = await this.lenderService.findAll(tenantId, take, pagination?.after);
    const items = result.items;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: items.map((l: any) => ({ node: l as LenderType, cursor: encodeCursor(l.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  @Query(() => LenderType)
  @Roles('lender:read')
  async lender(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<LenderType> {
    return this.lenderService.findById(tenantId, id) as unknown as LenderType;
  }
}
