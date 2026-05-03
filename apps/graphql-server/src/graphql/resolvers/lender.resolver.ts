import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { LenderService, CurrentTenant, Roles } from '@lons/entity-service';
import { encodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import type { Prisma } from '@lons/database';

import { LenderType, LenderConnection } from '../types/lender.type';
import { PaginationInput } from '../inputs/pagination.input';
import { CreateLenderInput } from '../inputs/create-lender.input';
import { UpdateLenderInput } from '../inputs/update-lender.input';

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

  @Mutation(() => LenderType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.LENDER)
  @Roles('lender:create')
  async createLender(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateLenderInput,
  ): Promise<LenderType> {
    return this.lenderService.create(tenantId, {
      name: input.name,
      licenseNumber: input.licenseNumber,
      country: input.country,
      fundingCapacity: input.fundingCapacity || undefined,
      fundingCurrency: input.fundingCurrency,
      minInterestRate: input.minInterestRate || undefined,
      maxInterestRate: input.maxInterestRate || undefined,
      settlementAccount: input.settlementAccount as Prisma.InputJsonValue ?? undefined,
      riskParameters: input.riskParameters as Prisma.InputJsonValue ?? undefined,
    }) as unknown as LenderType;
  }

  @Mutation(() => LenderType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.LENDER)
  @Roles('lender:update')
  async updateLender(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateLenderInput,
  ): Promise<LenderType> {
    return this.lenderService.update(tenantId, id, {
      name: input.name,
      licenseNumber: input.licenseNumber,
      country: input.country,
      fundingCapacity: input.fundingCapacity || undefined,
      fundingCurrency: input.fundingCurrency,
      minInterestRate: input.minInterestRate || undefined,
      maxInterestRate: input.maxInterestRate || undefined,
      settlementAccount: input.settlementAccount as Prisma.InputJsonValue ?? undefined,
      riskParameters: input.riskParameters as Prisma.InputJsonValue ?? undefined,
      status: input.status as 'active' | 'suspended' | undefined,
    }) as unknown as LenderType;
  }

  @Mutation(() => LenderType)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.LENDER)
  @Roles('lender:update')
  async deactivateLender(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<LenderType> {
    return this.lenderService.deactivate(tenantId, id) as unknown as LenderType;
  }
}
