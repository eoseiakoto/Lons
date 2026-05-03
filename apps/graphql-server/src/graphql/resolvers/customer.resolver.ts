import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { CustomerService, CurrentTenant, CurrentUser, Roles, AnonymizationService } from '@lons/entity-service';
import { PrismaService } from '@lons/database';
import { encodeCursor, decodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import { ExposureService } from '@lons/process-engine';

import { CustomerType, CustomerConnection } from '../types/customer.type';
import { CustomerExposureType } from '../types/exposure.type';
import { AnonymizationResult, AnonymizationEligibility } from '../types/anonymization.type';
import { PaginationInput } from '../inputs/pagination.input';

@Resolver(() => CustomerType)
export class CustomerResolver {
  constructor(
    private customerService: CustomerService,
    private exposureService: ExposureService,
    private anonymizationService: AnonymizationService,
    private prisma: PrismaService,
  ) {}

  /** Platform admin JWT carries tenantId='platform' which is not a real UUID tenant. */
  private effectiveTenantId(tenantId: string | undefined, overrideTenantId?: string): string | undefined {
    if (overrideTenantId) return overrideTenantId;
    return !tenantId || tenantId === 'platform' ? undefined : tenantId;
  }

  @Query(() => CustomerConnection)
  @AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
  @Roles('customer:read')
  async customers(
    @CurrentTenant() tenantId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @Args('status', { nullable: true }) status?: string,
    @Args('kycLevel', { nullable: true }) kycLevel?: string,
    @Args('tenantId', { type: () => ID, nullable: true }) overrideTenantId?: string,
  ): Promise<CustomerConnection> {
    const take = pagination?.first || 20;
    const cursor = pagination?.after ? decodeCursor(pagination.after) : undefined;
    const result = await this.customerService.search(this.effectiveTenantId(tenantId, overrideTenantId), { status, kycLevel }, take, cursor);
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
  @AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
  @Roles('customer:read')
  async customer(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CustomerType> {
    return this.customerService.findById(this.effectiveTenantId(tenantId), id) as unknown as CustomerType;
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

  @Query(() => CustomerExposureType)
  @AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
  @Roles('customer:read')
  async customerExposure(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
  ): Promise<CustomerExposureType> {
    const exposure = await this.exposureService.calculateTotalExposure(tenantId, customerId);

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings as Record<string, any>) || {};
    const maxAllowed = settings?.exposureRules?.maxCustomerExposure || '0';
    const maxNum = parseFloat(maxAllowed) || 0;
    const totalNum = parseFloat(exposure.totalExposure) || 0;
    const utilizationPercent = maxNum > 0 ? (totalNum / maxNum) * 100 : 0;

    return {
      customerId: exposure.customerId,
      totalExposure: exposure.totalExposure,
      breakdown: exposure.breakdown,
      activeContractCount: exposure.activeContractCount,
      maxAllowed,
      utilizationPercent: Math.round(utilizationPercent * 10) / 10,
    };
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

  @Query(() => AnonymizationEligibility)
  @AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
  @Roles('SP_ADMIN')
  async checkAnonymizationEligibility(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
  ): Promise<AnonymizationEligibility> {
    return this.anonymizationService.checkEligibility(tenantId, customerId);
  }

  @Mutation(() => AnonymizationResult)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.CUSTOMER)
  @Roles('SP_ADMIN')
  async requestCustomerAnonymization(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: { sub: string },
    @Args('customerId', { type: () => ID }) customerId: string,
    @Args('reason') reason: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<AnonymizationResult> {
    return this.anonymizationService.anonymizeCustomer(tenantId, customerId, user.sub, idempotencyKey);
  }
}
