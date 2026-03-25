import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import { encodeCursor } from '@lons/common';
import { ContractService } from '@lons/process-engine';
import { ScheduleService } from '@lons/repayment-service';
import { CurrentTenant, Roles } from '@lons/entity-service';

import { ContractType, ContractConnection } from '../types/contract.type';
import { RepaymentScheduleEntryType } from '../types/repayment.type';
import { PaginationInput } from '../inputs/pagination.input';

@Resolver(() => ContractType)
export class ContractResolver {
  constructor(
    private contractService: ContractService,
    private scheduleService: ScheduleService,
  ) {}

  @Query(() => ContractConnection)
  @Roles('contract:read')
  async contracts(
    @CurrentTenant() tenantId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @Args('customerId', { nullable: true }) customerId?: string,
    @Args('status', { nullable: true }) status?: string,
  ): Promise<ContractConnection> {
    const take = pagination?.first || 20;
    const result = await this.contractService.findMany(tenantId, { customerId, status }, take, pagination?.after);
    const items = result.items;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: items.map((c: any) => ({ node: c as ContractType, cursor: encodeCursor(c.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  @Query(() => ContractType)
  @Roles('contract:read')
  async contract(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ContractType> {
    return this.contractService.findById(tenantId, id) as unknown as ContractType;
  }

  @Query(() => [RepaymentScheduleEntryType])
  @Roles('contract:read')
  async repaymentSchedule(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
  ): Promise<RepaymentScheduleEntryType[]> {
    return this.scheduleService.getSchedule(tenantId, contractId) as unknown as RepaymentScheduleEntryType[];
  }
}
