import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { CurrentTenant, Roles } from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import { EmiIntegrationConfigService } from '@lons/integration-service';

import {
  EmiConnectionTestResult,
  EmiIntegrationConfigType,
} from '../types/emi-integration-config.type';
import {
  CreateEmiIntegrationConfigInput,
  UpdateEmiIntegrationConfigInput,
} from '../inputs/emi-integration-config.input';

/**
 * S17-2 / FR-DI-001.2 — GraphQL surface for EMI integration configs.
 *
 * Decrypted credentials are NEVER returned. The projection sets
 * `credentialsSet: boolean` so admins know whether secrets exist.
 */
@Resolver(() => EmiIntegrationConfigType)
export class EmiConfigResolver {
  private readonly logger = new Logger('EmiConfigResolver');

  constructor(private readonly emiConfigService: EmiIntegrationConfigService) {}

  @Query(() => [EmiIntegrationConfigType])
  @Roles('tenant:update')
  async emiIntegrationConfigs(
    @CurrentTenant() tenantId: string,
  ): Promise<EmiIntegrationConfigType[]> {
    const configs = await this.emiConfigService.findAll(tenantId);
    return configs.map((c) => this.toGraphql(c));
  }

  @Query(() => EmiIntegrationConfigType, { nullable: true })
  @Roles('tenant:update')
  async emiIntegrationConfig(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<EmiIntegrationConfigType | null> {
    const config = await this.emiConfigService.findById(tenantId, id);
    return config ? this.toGraphql(config) : null;
  }

  @Mutation(() => EmiIntegrationConfigType)
  @AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.TENANT)
  @Roles('tenant:update')
  async createEmiIntegrationConfig(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateEmiIntegrationConfigInput,
    @Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,
  ): Promise<EmiIntegrationConfigType> {
    this.logger.log(
      `Creating EMI integration config name=${input.name} provider=${input.provider} tenant=${tenantId}`,
    );
    const created = await this.emiConfigService.create(tenantId, input);
    return this.toGraphql(created);
  }

  @Mutation(() => EmiIntegrationConfigType)
  @AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.TENANT)
  @Roles('tenant:update')
  async updateEmiIntegrationConfig(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateEmiIntegrationConfigInput,
  ): Promise<EmiIntegrationConfigType> {
    const updated = await this.emiConfigService.update(tenantId, id, input);
    return this.toGraphql(updated);
  }

  @Mutation(() => EmiIntegrationConfigType)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.TENANT)
  @Roles('tenant:update')
  async deactivateEmiIntegrationConfig(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<EmiIntegrationConfigType> {
    // S17-FIX-1B — service.deactivate() now returns the updated row,
    // so the post-mutation re-fetch is gone. The earlier re-fetch
    // chained into a findById that filtered `deletedAt: null` and
    // threw because the old deactivate also stamped deletedAt.
    const updated = await this.emiConfigService.deactivate(tenantId, id);
    return this.toGraphql(updated);
  }

  @Mutation(() => EmiConnectionTestResult)
  @AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.TENANT)
  @Roles('tenant:update')
  async testEmiConnection(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<EmiConnectionTestResult> {
    return this.emiConfigService.testConnection(tenantId, id);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Mapping
  // ─────────────────────────────────────────────────────────────────────

  private toGraphql(record: {
    id: string;
    tenantId: string;
    name: string;
    provider: string;
    credentials: Record<string, unknown> | null;
    baseUrl: string | null;
    fieldMappings: Record<string, unknown> | null;
    syncFrequencyMin: number;
    retryPolicy: Record<string, unknown> | null;
    isActive: boolean;
    lastSyncAt: Date | null;
    lastSyncError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): EmiIntegrationConfigType {
    return {
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      provider: record.provider,
      credentialsSet: record.credentials !== null,
      baseUrl: record.baseUrl ?? undefined,
      fieldMappings: record.fieldMappings ?? undefined,
      syncFrequencyMin: record.syncFrequencyMin,
      retryPolicy: record.retryPolicy ?? undefined,
      isActive: record.isActive,
      lastSyncAt: record.lastSyncAt ?? undefined,
      lastSyncError: record.lastSyncError ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
