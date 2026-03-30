import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { IntegrationHealthService, ApiLogService } from '@lons/integration-service';
import { CurrentTenant, Roles } from '@lons/entity-service';
import { encodeCursor } from '@lons/common';

import {
  IntegrationHealthType,
  ApiLogConnection,
} from '../types/integration-health.type';

@Resolver(() => IntegrationHealthType)
export class IntegrationHealthResolver {
  constructor(
    private healthService: IntegrationHealthService,
    private apiLogService: ApiLogService,
  ) {}

  @Query(() => IntegrationHealthType)
  @Roles('integration:read')
  async integrationHealth(
    @CurrentTenant() tenantId: string,
    @Args('provider') provider: string,
  ): Promise<IntegrationHealthType> {
    return this.healthService.getHealth(tenantId, provider) as unknown as IntegrationHealthType;
  }

  @Query(() => [IntegrationHealthType])
  @Roles('integration:read')
  async integrationHealthAll(
    @CurrentTenant() tenantId: string,
  ): Promise<IntegrationHealthType[]> {
    return this.healthService.getAllHealth(tenantId) as unknown as IntegrationHealthType[];
  }

  @Query(() => ApiLogConnection)
  @Roles('integration:read')
  async integrationApiLogs(
    @CurrentTenant() tenantId: string,
    @Args('provider') provider: string,
    @Args('from') from: string,
    @Args('to') to: string,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 20 }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<ApiLogConnection> {
    const take = first || 20;
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const logs = await this.apiLogService.getLogsByProvider(tenantId, provider, fromDate, toDate);

    // Apply cursor-based pagination
    let startIndex = 0;
    if (after) {
      const afterId = Buffer.from(after, 'base64').toString('utf-8');
      const afterIndex = logs.findIndex((l: any) => l.id === afterId);
      if (afterIndex >= 0) {
        startIndex = afterIndex + 1;
      }
    }

    const paginatedLogs = logs.slice(startIndex, startIndex + take);
    const hasNextPage = startIndex + take < logs.length;

    return {
      edges: paginatedLogs.map((log: any) => ({
        node: {
          ...log,
          responseStatus: log.responseStatus ?? undefined,
          errorMessage: log.errorMessage ?? undefined,
          correlationId: log.correlationId ?? undefined,
          circuitBreakerState: log.circuitBreakerState ?? undefined,
        },
        cursor: encodeCursor(log.id),
      })),
      pageInfo: {
        hasNextPage,
        hasPreviousPage: startIndex > 0,
        startCursor: paginatedLogs.length > 0 ? encodeCursor(paginatedLogs[0].id) : undefined,
        endCursor: paginatedLogs.length > 0 ? encodeCursor(paginatedLogs[paginatedLogs.length - 1].id) : undefined,
      },
      totalCount: logs.length,
    };
  }
}
