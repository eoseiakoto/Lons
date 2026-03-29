import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { AuditService, AuditLogFilterInput, Roles, CurrentTenant } from '@lons/entity-service';

import { AuditLogType, AuditLogConnection } from '../types/audit-log.type';

@Resolver(() => AuditLogType)
export class AuditResolver {
  constructor(private readonly auditService: AuditService) {}

  @Query(() => AuditLogConnection)
  @Roles('audit:read')
  async auditLogs(
    @CurrentTenant() tenantId: string,
    @Args('filter', { nullable: true }) filter?: AuditLogFilterInput,
    @Args('take', { type: () => Int, nullable: true, defaultValue: 50 }) take?: number,
    @Args('cursor', { nullable: true }) cursor?: string,
  ): Promise<AuditLogConnection> {
    const result = await this.auditService.findMany(tenantId, filter, take ?? 50, cursor);
    return {
      items: result.items as AuditLogType[],
      hasMore: result.hasMore,
    };
  }
}
