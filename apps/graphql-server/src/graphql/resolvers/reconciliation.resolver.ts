import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Int } from '@nestjs/graphql';
import { ReconciliationService } from '@lons/reconciliation-service';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import { PageInfo } from '../types/page-info.type';
import { encodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

// --- Object Types ---

@ObjectType()
class ReconciliationExceptionType {
  @Field(() => ID)
  id!: string;

  @Field()
  txnType!: string;

  @Field()
  exceptionType!: string;

  @Field()
  severity!: string;

  @Field()
  amount!: number;

  @Field({ nullable: true })
  contractId?: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  resolved!: boolean;

  @Field({ nullable: true })
  resolvedAt?: Date;

  @Field({ nullable: true })
  resolvedBy?: string;

  @Field({ nullable: true })
  investigation?: string;

  @Field()
  createdAt!: Date;
}

@ObjectType()
class ReconciliationRunType {
  @Field(() => ID)
  id!: string;

  @Field()
  runDate!: Date;

  @Field()
  status!: string;

  @Field()
  matchRate!: number;

  @Field(() => Int)
  totalTxns!: number;

  @Field(() => Int)
  matchedTxns!: number;

  @Field(() => Int)
  exceptionCount!: number;

  @Field(() => [ReconciliationExceptionType], { nullable: true })
  exceptions?: ReconciliationExceptionType[];

  @Field()
  createdAt!: Date;
}

@ObjectType()
class ReconciliationRunEdge {
  @Field(() => ReconciliationRunType)
  node!: ReconciliationRunType;

  @Field()
  cursor!: string;
}

@ObjectType()
class ReconciliationRunConnection {
  @Field(() => [ReconciliationRunEdge])
  edges!: ReconciliationRunEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}

@ObjectType()
class ReconciliationBreakdownType {
  @Field(() => Int)
  matched!: number;

  @Field(() => Int)
  timingDifference!: number;

  @Field(() => Int)
  unmatched!: number;

  @Field(() => Int)
  orphaned!: number;

  @Field(() => Int)
  amountMismatch!: number;
}

@ObjectType()
class SeverityCountType {
  @Field(() => Int)
  low!: number;

  @Field(() => Int)
  medium!: number;

  @Field(() => Int)
  high!: number;
}

@ObjectType()
class ReconciliationReportType {
  @Field(() => ID)
  runId!: string;

  @Field()
  runDate!: Date;

  @Field()
  status!: string;

  @Field()
  matchRate!: string;

  @Field(() => Int)
  totalTransactions!: number;

  @Field(() => Int)
  matchedTransactions!: number;

  @Field(() => Int)
  exceptionCount!: number;

  @Field(() => ReconciliationBreakdownType)
  breakdown!: ReconciliationBreakdownType;

  @Field(() => SeverityCountType)
  bySeverity!: SeverityCountType;

  @Field(() => Int)
  unresolvedCount!: number;
}

@ObjectType()
class AgeDistributionType {
  @Field(() => Int)
  under24h!: number;

  @Field(() => Int)
  under3d!: number;

  @Field(() => Int)
  under7d!: number;

  @Field(() => Int)
  over7d!: number;
}

@ObjectType()
class ExceptionsSummaryType {
  @Field(() => Int)
  totalOpen!: number;

  @Field(() => SeverityCountType)
  bySeverity!: SeverityCountType;

  @Field(() => AgeDistributionType)
  byAge!: AgeDistributionType;
}

@ObjectType()
class BatchResolveResultType {
  @Field(() => Int)
  resolvedCount!: number;
}

// --- Resolver ---

@Resolver()
export class ReconciliationResolver {
  constructor(private reconciliationService: ReconciliationService) {}

  @Query(() => ReconciliationRunType)
  @Roles('analytics:read')
  async reconciliationRun(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<any> {
    return this.reconciliationService.getReconciliationRun(tenantId, id);
  }

  @Query(() => ReconciliationRunConnection)
  @Roles('analytics:read')
  async reconciliationRuns(
    @CurrentTenant() tenantId: string,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 20 }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<any> {
    const take = first || 20;
    const result = await this.reconciliationService.listReconciliationRuns(tenantId, take, after);
    const items = result.items;
    return {
      edges: items.map((r: any) => ({ node: r, cursor: encodeCursor(r.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
    };
  }

  @Query(() => ExceptionsSummaryType)
  @Roles('analytics:read')
  async reconciliationExceptionsSummary(
    @CurrentTenant() tenantId: string,
  ): Promise<any> {
    // getExceptionsSummary not yet implemented on ReconciliationService
    return { total: 0, resolved: 0, pending: 0, byType: [] };
  }

  @Query(() => ReconciliationReportType)
  @Roles('analytics:read')
  async reconciliationReport(
    @CurrentTenant() tenantId: string,
    @Args('runId', { type: () => ID }) runId: string,
  ): Promise<any> {
    return this.reconciliationService.getReconciliationRun(tenantId, runId);
  }

  @Mutation(() => ReconciliationExceptionType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('analytics:read')
  async resolveReconciliationException(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('exceptionId', { type: () => ID }) exceptionId: string,
    @Args('resolution') resolution: string,
  ): Promise<any> {
    return this.reconciliationService.resolveException(tenantId, exceptionId, resolution, user.userId);
  }

  @Mutation(() => BatchResolveResultType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('analytics:read')
  async batchResolveReconciliationExceptions(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('exceptionIds', { type: () => [ID] }) exceptionIds: string[],
    @Args('resolution') resolution: string,
  ): Promise<any> {
    // batchResolveExceptions not yet on ReconciliationService — resolve one-by-one
    const results = await Promise.allSettled(
      exceptionIds.map((id: string) =>
        this.reconciliationService.resolveException(tenantId, id, resolution, user.userId),
      ),
    );
    return {
      resolved: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    };
  }
}
