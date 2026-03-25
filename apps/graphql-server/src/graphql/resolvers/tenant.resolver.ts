import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { TenantService, Roles } from '@lons/entity-service';
import { encodeCursor } from '@lons/common';

import { TenantType, TenantConnection } from '../types/tenant.type';
import { PaginationInput } from '../inputs/pagination.input';

@Resolver(() => TenantType)
export class TenantResolver {
  constructor(private tenantService: TenantService) {}

  @Query(() => TenantConnection)
  @Roles('tenant:read')
  async tenants(
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<TenantConnection> {
    const take = pagination?.first || 20;
    const result = await this.tenantService.findAll(take, pagination?.after);
    const items = result.items;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: items.map((t: any) => ({ node: t as TenantType, cursor: encodeCursor(t.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  @Query(() => TenantType)
  @Roles('tenant:read')
  async tenant(@Args('id', { type: () => ID }) id: string): Promise<TenantType> {
    return this.tenantService.findById(id) as unknown as TenantType;
  }
}
