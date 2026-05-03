import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ProductService, CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import { encodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import type { Prisma } from '@lons/database';

import { ProductType, ProductConnection } from '../types/product.type';
import { PaginationInput } from '../inputs/pagination.input';
import { CreateProductInput } from '../inputs/create-product.input';
import { UpdateProductInput } from '../inputs/update-product.input';

@Resolver(() => ProductType)
export class ProductResolver {
  constructor(private productService: ProductService) {}

  /** Platform admin JWT carries tenantId='platform' which is not a real UUID tenant. */
  private effectiveTenantId(tenantId: string | undefined, overrideTenantId?: string): string | undefined {
    if (overrideTenantId) return overrideTenantId;
    return !tenantId || tenantId === 'platform' ? undefined : tenantId;
  }

  @Query(() => ProductConnection)
  @AuditAction(AuditActionType.READ, AuditResourceType.PRODUCT)
  @Roles('product:read')
  async products(
    @CurrentTenant() tenantId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @Args('type', { nullable: true }) type?: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('tenantId', { type: () => ID, nullable: true }) overrideTenantId?: string,
  ): Promise<ProductConnection> {
    const take = pagination?.first || 20;
    const result = await this.productService.findAll(this.effectiveTenantId(tenantId, overrideTenantId), { type, status }, take, pagination?.after);
    const items = result.items;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges: items.map((p: any) => ({ node: p as ProductType, cursor: encodeCursor(p.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  @Query(() => String, { description: 'Generate the next available product code for a type and currency' })
  @Roles('product:create')
  async nextProductCode(
    @CurrentTenant() tenantId: string,
    @Args('type') type: string,
    @Args('currency') currency: string,
  ): Promise<string> {
    return this.productService.getNextProductCode(tenantId, type, currency);
  }

  @Query(() => ProductType)
  @AuditAction(AuditActionType.READ, AuditResourceType.PRODUCT)
  @Roles('product:read')
  async product(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProductType> {
    return this.productService.findById(this.effectiveTenantId(tenantId), id) as unknown as ProductType;
  }

  @Mutation(() => ProductType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.PRODUCT)
  @Roles('product:create')
  async createProduct(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: CreateProductInput,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ): Promise<ProductType> {
    return this.productService.create(tenantId, {
      ...input,
      type: input.type as 'overdraft' | 'micro_loan' | 'bnpl' | 'invoice_financing',
      interestRateModel: input.interestRateModel as 'flat' | 'reducing_balance' | 'tiered',
      repaymentMethod: input.repaymentMethod as 'lump_sum' | 'equal_installments' | 'reducing' | 'balloon' | 'auto_deduction',
      approvalWorkflow: input.approvalWorkflow as 'auto' | 'semi_auto' | 'single_level' | 'multi_level' | undefined,
      feeStructure: input.feeStructure as Prisma.InputJsonValue ?? undefined,
      penaltyConfig: input.penaltyConfig as Prisma.InputJsonValue ?? undefined,
      eligibilityRules: input.eligibilityRules as Prisma.InputJsonValue ?? undefined,
      approvalThresholds: input.approvalThresholds as Prisma.InputJsonValue ?? undefined,
      revenueSharing: input.revenueSharing as Prisma.InputJsonValue ?? undefined,
      createdBy: user.userId,
    }, idempotencyKey) as unknown as ProductType;
  }

  @Mutation(() => ProductType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.PRODUCT)
  @Roles('product:update')
  async updateProduct(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateProductInput,
  ): Promise<ProductType> {
    return this.productService.update(tenantId, id, {
      ...input,
      feeStructure: input.feeStructure as Prisma.InputJsonValue ?? undefined,
      penaltyConfig: input.penaltyConfig as Prisma.InputJsonValue ?? undefined,
      eligibilityRules: input.eligibilityRules as Prisma.InputJsonValue ?? undefined,
      approvalThresholds: input.approvalThresholds as Prisma.InputJsonValue ?? undefined,
      revenueSharing: input.revenueSharing as Prisma.InputJsonValue ?? undefined,
      notificationConfig: input.notificationConfig as Prisma.InputJsonValue ?? undefined,
    }, user.userId) as unknown as ProductType;
  }

  @Mutation(() => ProductType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.PRODUCT)
  @Roles('product:activate')
  async activateProduct(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProductType> {
    return this.productService.activate(tenantId, id) as unknown as ProductType;
  }

  @Mutation(() => ProductType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.PRODUCT)
  @Roles('product:update')
  async suspendProduct(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProductType> {
    return this.productService.suspend(tenantId, id) as unknown as ProductType;
  }
}
