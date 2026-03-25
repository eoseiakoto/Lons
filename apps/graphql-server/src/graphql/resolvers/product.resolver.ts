import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ProductService, CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import { encodeCursor } from '@lons/common';

import { ProductType, ProductConnection } from '../types/product.type';
import { PaginationInput } from '../inputs/pagination.input';
import { CreateProductInput } from '../inputs/create-product.input';
import { UpdateProductInput } from '../inputs/update-product.input';

@Resolver(() => ProductType)
export class ProductResolver {
  constructor(private productService: ProductService) {}

  @Query(() => ProductConnection)
  @Roles('product:read')
  async products(
    @CurrentTenant() tenantId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
    @Args('type', { nullable: true }) type?: string,
    @Args('status', { nullable: true }) status?: string,
  ): Promise<ProductConnection> {
    const take = pagination?.first || 20;
    const result = await this.productService.findAll(tenantId, { type, status }, take, pagination?.after);
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

  @Query(() => ProductType)
  @Roles('product:read')
  async product(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProductType> {
    return this.productService.findById(tenantId, id) as unknown as ProductType;
  }

  @Mutation(() => ProductType)
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
      createdBy: user.userId,
    }, idempotencyKey) as unknown as ProductType;
  }

  @Mutation(() => ProductType)
  @Roles('product:update')
  async updateProduct(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateProductInput,
  ): Promise<ProductType> {
    return this.productService.update(tenantId, id, input, user.userId) as unknown as ProductType;
  }

  @Mutation(() => ProductType)
  @Roles('product:activate')
  async activateProduct(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProductType> {
    return this.productService.activate(tenantId, id) as unknown as ProductType;
  }

  @Mutation(() => ProductType)
  @Roles('product:update')
  async suspendProduct(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProductType> {
    return this.productService.suspend(tenantId, id) as unknown as ProductType;
  }
}
