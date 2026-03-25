import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Int } from '@nestjs/graphql';
import { SettlementService } from '@lons/settlement-service';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import { PageInfo } from '../types/page-info.type';
import { encodeCursor } from '@lons/common';

@ObjectType()
class SettlementLineType {
  @Field(() => ID)
  id!: string;

  @Field()
  partyType!: string;

  @Field()
  partyId!: string;

  @Field()
  grossRevenue!: string;

  @Field()
  sharePercentage!: string;

  @Field()
  shareAmount!: string;

  @Field()
  netAmount!: string;
}

@ObjectType()
class SettlementRunType {
  @Field(() => ID)
  id!: string;

  @Field()
  periodStart!: Date;

  @Field()
  periodEnd!: Date;

  @Field()
  status!: string;

  @Field()
  totalRevenue!: string;

  @Field({ nullable: true })
  approvedBy?: string;

  @Field({ nullable: true })
  approvedAt?: Date;

  @Field(() => [SettlementLineType])
  lines!: SettlementLineType[];

  @Field()
  createdAt!: Date;
}

@ObjectType()
class SettlementRunEdge {
  @Field(() => SettlementRunType)
  node!: SettlementRunType;

  @Field()
  cursor!: string;
}

@ObjectType()
class SettlementRunConnection {
  @Field(() => [SettlementRunEdge])
  edges!: SettlementRunEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}

@Resolver()
export class SettlementResolver {
  constructor(private settlementService: SettlementService) {}

  @Mutation(() => SettlementRunType)
  @Roles('analytics:read')
  async calculateSettlement(
    @CurrentTenant() tenantId: string,
    @Args('periodStart') periodStart: string,
    @Args('periodEnd') periodEnd: string,
  ): Promise<any> {
    return this.settlementService.calculateSettlement(tenantId, new Date(periodStart), new Date(periodEnd));
  }

  @Mutation(() => SettlementRunType)
  @Roles('analytics:read')
  async approveSettlement(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('runId', { type: () => ID }) runId: string,
  ): Promise<any> {
    return this.settlementService.approveSettlement(tenantId, runId, user.userId);
  }

  @Query(() => SettlementRunType)
  @Roles('analytics:read')
  async settlementRun(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<any> {
    return this.settlementService.getSettlementRun(tenantId, id);
  }

  @Query(() => SettlementRunConnection)
  @Roles('analytics:read')
  async settlementRuns(
    @CurrentTenant() tenantId: string,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 20 }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<any> {
    const take = first || 20;
    const result = await this.settlementService.listSettlementRuns(tenantId, take, after);
    const items = result.items;
    return {
      edges: items.map((s: any) => ({ node: s, cursor: encodeCursor(s.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }
}
