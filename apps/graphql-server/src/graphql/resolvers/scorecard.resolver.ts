import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import { ScorecardConfigService, ScorecardConfigRecord, ScorecardConfig } from '@lons/process-engine';

import { ScorecardConfigType } from '../types/scorecard-config.type';
import { CreateScorecardConfigInput } from '../inputs/scorecard-config.input';

/**
 * S17-4 / FR-CS-001.1 — GraphQL surface for scorecard versions.
 *
 * Mutations require `product:update` because scorecard changes affect
 * the credit decisions a product makes. Activation atomically toggles
 * `is_active` across all versions in the same (tenantId, productId)
 * scope so resolution always returns at most one row.
 */
@Resolver(() => ScorecardConfigType)
export class ScorecardResolver {
  private readonly logger = new Logger('ScorecardResolver');

  constructor(private readonly scorecardConfigService: ScorecardConfigService) {}

  @Query(() => [ScorecardConfigType])
  @Roles('product:update')
  async scorecardConfigs(
    @CurrentTenant() tenantId: string,
    @Args('productId', { type: () => ID, nullable: true }) productId?: string,
  ): Promise<ScorecardConfigType[]> {
    const rows = await this.scorecardConfigService.listVersions(tenantId, productId ?? null);
    return rows.map((r) => this.toGraphql(r));
  }

  @Query(() => ScorecardConfigType, { nullable: true })
  @Roles('product:update')
  async activeScorecardConfig(
    @CurrentTenant() tenantId: string,
    @Args('productId', { type: () => ID }) productId: string,
  ): Promise<ScorecardConfigType | null> {
    // We don't have a direct "active record" getter; list and pick the
    // first active row. (`getActiveScorecard` returns the *config* not
    // the record so we'd lose id/version/etc.)
    const rows = await this.scorecardConfigService.listVersions(tenantId, productId);
    const active = rows.find((r: ScorecardConfigRecord) => r.isActive);
    if (active) return this.toGraphql(active);

    // Fall back to tenant default if no product-specific active version.
    const defaults = await this.scorecardConfigService.listVersions(tenantId, null);
    const tenantActive = defaults.find((r: ScorecardConfigRecord) => r.isActive);
    return tenantActive ? this.toGraphql(tenantActive) : null;
  }

  @Mutation(() => ScorecardConfigType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.PRODUCT)
  @Roles('product:update')
  async createScorecardConfig(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: CreateScorecardConfigInput,
    @Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,
  ): Promise<ScorecardConfigType> {
    this.logger.log(
      `Creating scorecard name=${input.name} v${input.version} ` +
        `product=${input.productId ?? 'default'} tenant=${tenantId}`,
    );
    const created = await this.scorecardConfigService.create(tenantId, {
      productId: input.productId ?? null,
      name: input.name,
      version: input.version,
      // We trust the validator inside the service to reject malformed shapes.
      config: input.config as unknown as ScorecardConfig,
      createdBy: user?.userId,
      activate: input.activate ?? false,
    });
    return this.toGraphql(created);
  }

  @Mutation(() => ScorecardConfigType)
  @AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.PRODUCT)
  @Roles('product:update')
  async activateScorecardConfig(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ScorecardConfigType> {
    await this.scorecardConfigService.activate(tenantId, id);
    const after = await this.scorecardConfigService.findById(tenantId, id);
    if (!after) {
      throw new Error(`Scorecard not found after activation: ${id}`);
    }
    return this.toGraphql(after);
  }

  @Mutation(() => ScorecardConfigType)
  @AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.PRODUCT)
  @Roles('product:update')
  async deactivateScorecardConfig(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ScorecardConfigType> {
    await this.scorecardConfigService.deactivate(tenantId, id);
    const after = await this.scorecardConfigService.findById(tenantId, id);
    if (!after) {
      throw new Error(`Scorecard not found after deactivation: ${id}`);
    }
    return this.toGraphql(after);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Mapping
  // ─────────────────────────────────────────────────────────────────────

  private toGraphql(record: {
    id: string;
    tenantId: string;
    productId: string | null;
    name: string;
    version: string;
    config: Record<string, unknown> | unknown;
    scoreRangeMin: string;
    scoreRangeMax: string;
    isActive: boolean;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ScorecardConfigType {
    return {
      id: record.id,
      tenantId: record.tenantId,
      productId: record.productId ?? undefined,
      name: record.name,
      version: record.version,
      config: record.config as Record<string, unknown>,
      scoreRangeMin: record.scoreRangeMin,
      scoreRangeMax: record.scoreRangeMax,
      isActive: record.isActive,
      createdBy: record.createdBy ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
