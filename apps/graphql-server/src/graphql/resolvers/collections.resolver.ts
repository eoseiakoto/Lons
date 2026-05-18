import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  Int,
  InputType,
  ObjectType,
  Field,
} from '@nestjs/graphql';
import { CollectionsService, AnalyticsService } from '@lons/process-engine';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

@ObjectType()
class CollectionsActionType {
  @Field(() => ID)
  id!: string;

  @Field()
  contractId!: string;

  @Field()
  actionType!: string;

  @Field({ nullable: true })
  notes?: string;

  @Field({ nullable: true })
  actorId?: string;

  @Field({ nullable: true })
  promiseDate?: Date;

  @Field()
  createdAt!: Date;
}

@ObjectType()
class CollectionsQueueCustomer {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  fullName?: string;

  @Field({ nullable: true })
  phonePrimary?: string;
}

@ObjectType()
class CollectionsQueueProduct {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;
}

@ObjectType()
class CollectionsQueueAction {
  @Field(() => ID)
  id!: string;

  @Field()
  actionType!: string;

  @Field({ nullable: true })
  notes?: string;

  @Field()
  createdAt!: Date;
}

@ObjectType()
class CollectionsQueueItem {
  @Field(() => ID)
  id!: string;

  @Field()
  contractNumber!: string;

  @Field()
  principalAmount!: string;

  @Field({ nullable: true })
  totalOutstanding?: string;

  @Field()
  currency!: string;

  @Field(() => Int)
  daysPastDue!: number;

  @Field()
  status!: string;

  @Field()
  classification!: string;

  @Field()
  startDate!: Date;

  @Field()
  maturityDate!: Date;

  @Field(() => CollectionsQueueCustomer, { nullable: true })
  customer?: CollectionsQueueCustomer;

  @Field(() => CollectionsQueueProduct, { nullable: true })
  product?: CollectionsQueueProduct;

  @Field(() => [CollectionsQueueAction], { nullable: true })
  collectionsActions?: CollectionsQueueAction[];
}

@ObjectType()
class CollectionsQueueResult {
  @Field(() => [CollectionsQueueItem])
  items!: CollectionsQueueItem[];

  @Field()
  hasMore!: boolean;
}

@ObjectType()
class CollectionsMetricsType {
  @Field(() => Int)
  overdueCount!: number;

  @Field(() => Int)
  delinquentCount!: number;

  @Field(() => Int)
  defaultCount!: number;

  @Field(() => Int)
  totalInCollections!: number;

  @Field(() => Int)
  totalActions!: number;
}

@ObjectType()
class ParBucket {
  @Field(() => Int)
  count!: number;

  @Field()
  amount!: string;

  @Field()
  pct!: string;
}

@ObjectType()
class ProvisioningType {
  @Field()
  performing!: string;

  @Field()
  specialMention!: string;

  @Field()
  substandard!: string;

  @Field()
  doubtful!: string;

  @Field()
  loss!: string;

  @Field()
  total!: string;
}

/**
 * S18-FIX-9 — Optional filter for `portfolioMetrics`. All fields are
 * ANDed together; an empty input (or omitted arg) is equivalent to the
 * legacy global view. Mirrors `PortfolioMetricsFilters` in
 * `@lons/process-engine`'s AnalyticsService.
 */
@InputType()
class PortfolioMetricsFilterInput {
  @Field(() => String, { nullable: true })
  productId?: string;

  @Field(() => String, { nullable: true })
  productType?: string;

  @Field(() => String, { nullable: true })
  lenderId?: string;

  @Field(() => String, { nullable: true })
  region?: string;

  @Field(() => String, { nullable: true })
  customerSegment?: string;

  @Field(() => String, { nullable: true })
  dateFrom?: string;

  @Field(() => String, { nullable: true })
  dateTo?: string;
}

@ObjectType()
class PortfolioMetricsType {
  @Field(() => Int)
  activeLoans!: number;

  @Field()
  activeOutstanding!: string;

  @Field(() => ParBucket)
  parAt1!: ParBucket;

  @Field(() => ParBucket)
  parAt7!: ParBucket;

  @Field(() => ParBucket)
  parAt30!: ParBucket;

  @Field(() => ParBucket)
  parAt60!: ParBucket;

  @Field(() => ParBucket)
  parAt90!: ParBucket;

  @Field()
  nplRatio!: string;

  @Field(() => ProvisioningType)
  provisioning!: ProvisioningType;
}

@Resolver()
export class CollectionsResolver {
  constructor(
    private collectionsService: CollectionsService,
    private analyticsService: AnalyticsService,
  ) {}

  @Query(() => CollectionsQueueResult)
  @Roles('contract:read')
  async collectionsQueue(
    @CurrentTenant() tenantId: string,
    @Args('sortBy', { nullable: true, defaultValue: 'dpd' }) sortBy: string,
    @Args('take', { type: () => Int, nullable: true, defaultValue: 20 }) take: number,
    @Args('cursor', { nullable: true }) cursor?: string,
  ): Promise<any> {
    return this.collectionsService.getCollectionsQueue(
      tenantId,
      sortBy as 'amount' | 'dpd',
      Math.min(take, 50),
      cursor,
    );
  }

  @Query(() => CollectionsMetricsType)
  @Roles('contract:read')
  async collectionsMetrics(
    @CurrentTenant() tenantId: string,
  ): Promise<any> {
    return this.collectionsService.getCollectionsMetrics(tenantId);
  }

  @Query(() => [CollectionsActionType])
  @Roles('contract:read')
  async collectionsActions(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
  ): Promise<any> {
    return this.collectionsService.getActionsForContract(tenantId, contractId);
  }

  @Mutation(() => CollectionsActionType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async logCollectionsAction(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('contractId', { type: () => ID }) contractId: string,
    @Args('actionType') actionType: string,
    @Args('notes') notes: string,
    @Args('promiseDate', { nullable: true }) promiseDate?: string,
  ): Promise<any> {
    return this.collectionsService.logAction(
      tenantId,
      contractId,
      actionType,
      notes,
      user.userId,
      promiseDate ? new Date(promiseDate) : undefined,
    );
  }

  @Query(() => PortfolioMetricsType)
  @Roles('analytics:read')
  async portfolioMetrics(
    @CurrentTenant() tenantId: string,
    @Args('filter', { type: () => PortfolioMetricsFilterInput, nullable: true })
    filter?: PortfolioMetricsFilterInput,
  ): Promise<any> {
    // S18-FIX-9: forward optional filter to the service. Date strings
    // are parsed here so the service can stick to `Date` types.
    return this.analyticsService.getPortfolioMetrics(tenantId, {
      productId: filter?.productId ?? null,
      productType: filter?.productType ?? null,
      lenderId: filter?.lenderId ?? null,
      region: filter?.region ?? null,
      customerSegment: filter?.customerSegment ?? null,
      dateFrom: filter?.dateFrom ? new Date(filter.dateFrom) : null,
      dateTo: filter?.dateTo ? new Date(filter.dateTo) : null,
    });
  }
}
