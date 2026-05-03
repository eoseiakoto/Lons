import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { AuditService, Roles } from '@lons/entity-service';

import { PlatformAuditLogType, PlatformAuditLogConnection } from '../types/platform-audit-log.type';
import { PlatformAuditLogFilterInput } from '../inputs/platform-audit-log-filter.input';

@Resolver(() => PlatformAuditLogType)
export class PlatformAuditResolver {
  constructor(private readonly auditService: AuditService) {}

  @Query(() => PlatformAuditLogConnection)
  @Roles('platform_admin')
  async platformAuditLogs(
    @Args('filter', { nullable: true }) filter?: PlatformAuditLogFilterInput,
    @Args('take', { type: () => Int, nullable: true, defaultValue: 50 }) take?: number,
    @Args('cursor', { nullable: true }) cursor?: string,
  ): Promise<PlatformAuditLogConnection> {
    const result = await this.auditService.findAllCrossTenant(filter, take ?? 50, cursor);
    return {
      items: result.items as PlatformAuditLogType[],
      hasMore: result.hasMore,
    };
  }
}
