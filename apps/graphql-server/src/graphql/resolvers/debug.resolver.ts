import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { ForbiddenException } from '@nestjs/common';
import { Roles } from '@lons/entity-service';

import { DebugApiLog, DebugAdapterLog, DebugEvent, DebugStateTransition } from '../types/debug.type';
import { DebugLogService } from '../services/debug-log.service';

@Resolver()
export class DebugResolver {
  constructor(private readonly debugLogService: DebugLogService) {}

  private assertDebugMode(): void {
    if (process.env.ALLOW_MOCK_ADAPTERS !== 'true') {
      throw new ForbiddenException('Debug mode not available in this environment');
    }
  }

  @Query(() => [DebugApiLog])
  @Roles('admin')
  async debugApiLogs(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ): Promise<DebugApiLog[]> {
    this.assertDebugMode();
    return this.debugLogService.getApiLogs(limit) as unknown as DebugApiLog[];
  }

  @Query(() => [DebugAdapterLog])
  @Roles('admin')
  async debugAdapterLogs(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ): Promise<DebugAdapterLog[]> {
    this.assertDebugMode();
    return this.debugLogService.getAdapterLogs(limit) as unknown as DebugAdapterLog[];
  }

  @Query(() => [DebugEvent])
  @Roles('admin')
  async debugEvents(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ): Promise<DebugEvent[]> {
    this.assertDebugMode();
    return this.debugLogService.getEvents(limit) as unknown as DebugEvent[];
  }

  @Query(() => [DebugStateTransition])
  @Roles('admin')
  async debugStateTransitions(
    @Args('entityId', { type: () => String }) entityId: string,
  ): Promise<DebugStateTransition[]> {
    this.assertDebugMode();
    return this.debugLogService.getStateTransitions(entityId) as unknown as DebugStateTransition[];
  }
}
