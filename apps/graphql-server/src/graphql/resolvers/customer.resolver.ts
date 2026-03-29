import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { CustomerService, CurrentTenant, Roles } from '@lons/entity-service';
import { encodeCursor, decodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

import { CustomerType, CustomerConnection } from '../types/customer.type';
import { PaginationInput } from '../inputs/pagination.input';

@Resolver(() => CustomerType)
export class CustomerResolver {
  constructor(private customerService: CustomerService) {}

  @Query(() => CustomerConnection)
  @Roles('customer:read')
  async customers(
    @CurrentTenant() tenantId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @Args('status', { nullable: true }) status?: string,
    @Args('kycLevel', { nullable: true }) kycLevel?: string,
  ): Promise<CustomerConnection> {
    const take = pagination?.first || 20;
    const cursor = pagination?.after ? decodeCursor(pagination.after) : undefined;
    const result = await this.customerService.search(tenantId, { status, kycLevel }, take, cursor);
    const items = result.items;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: items.map((c: any) => ({ node: c as CustomerType, cursor: encodeCursor(c.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  @Query(() => CustomerType)
  @Roles('customer:read')
  async customer(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CustomerType> {
    return this.customerService.findById(tenantId, id) as unknown as CustomerType;
  }

  @Mutation(() => CustomerType)
  @AuditAction(AuditActionType.BLACKLIST, AuditResourceType.CUSTOMER)
  @Roles('customer:blacklist')
  async addToBlacklist(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
    @Args('reason') reason: string,
  ): Promise<CustomerType> {
    return this.customerService.blacklist(tenantId, customerId, reason) as unknown as CustomerType;
  }

  @Mutation(() => CustomerType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CUSTOMER)
  @Roles('customer:blacklist')
  async removeFromBlacklist(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
  ): Promise<CustomerType> {
    return this.customerService.unblacklist(tenantId, customerId) as unknown as CustomerType;
  }
}
