import { Resolver, Query, Mutation, Args, ID, Int, ObjectType, Field } from '@nestjs/graphql';
import { CollectionsService, AnalyticsService, PortfolioMetrics } from '@lons/process-engine';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';

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
  ): Promise<any> {
    return this.analyticsService.getPortfolioMetrics(tenantId);
  }
}
