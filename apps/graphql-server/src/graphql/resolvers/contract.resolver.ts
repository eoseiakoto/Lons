import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { encodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import { ContractService, CoolingOffService } from '@lons/process-engine';
import { ScheduleService } from '@lons/repayment-service';
import { CurrentTenant, Roles } from '@lons/entity-service';

import { ContractType, ContractConnection } from '../types/contract.type';
import { CancelCoolingOffResult } from '../types/cancel-cooling-off-result.type';
import { RepaymentScheduleEntryType } from '../types/repayment.type';
import { PaginationInput } from '../inputs/pagination.input';

@Resolver(() => ContractType)
export class ContractResolver {
  constructor(
    private contractService: ContractService,
    private coolingOffService: CoolingOffService,
    private scheduleService: ScheduleService,
  ) {}

  /** Platform admin JWT carries tenantId='platform' which is not a real UUID tenant. */
  private effectiveTenantId(tenantId: string | undefined, overrideTenantId?: string): string | undefined {
    if (overrideTenantId) return overrideTenantId;
    return !tenantId || tenantId === 'platform' ? undefined : tenantId;
  }

  @Query(() => ContractConnection)
  @AuditAction(AuditActionType.READ, AuditResourceType.CONTRACT)
  @Roles('contract:read')
  async contracts(
    @CurrentTenant() tenantId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @Args('customerId', { nullable: true }) customerId?: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('tenantId', { type: () => ID, nullable: true }) overrideTenantId?: string,
  ): Promise<ContractConnection> {
    const take = pagination?.first || 20;
    const result = await this.contractService.findMany(this.effectiveTenantId(tenantId, overrideTenantId), { customerId, status }, take, pagination?.after);
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
  @AuditAction(AuditActionType.READ, AuditResourceType.CONTRACT)
  @Roles('contract:read')
  async contract(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ContractType> {
    return this.contractService.findById(this.effectiveTenantId(tenantId), id) as unknown as ContractType;
  }

  @Query(() => [RepaymentScheduleEntryType])
  @AuditAction(AuditActionType.READ, AuditResourceType.CONTRACT)
  @Roles('contract:read')
  async repaymentSchedule(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
  ): Promise<RepaymentScheduleEntryType[]> {
    return this.scheduleService.getSchedule(tenantId, contractId) as unknown as RepaymentScheduleEntryType[];
  }

  @Mutation(() => CancelCoolingOffResult)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async cancelContractDuringCoolingOff(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('reason', { nullable: true }) reason?: string,
    @Args('idempotencyKey') idempotencyKey?: string,
  ): Promise<CancelCoolingOffResult> {
    return this.coolingOffService.cancelDuringCoolingOff(tenantId, contractId, reason, idempotencyKey);
  }
}
