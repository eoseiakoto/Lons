import { Injectable, Logger } from '@nestjs/common';
import {
  PrismaService,
  RevenueDistributionConfig,
  RevenueDistributionModel,
} from '@lons/database';
import { subtract, ValidationError } from '@lons/common';

import {
  DistributionInput,
  DistributionLine,
  IRevenueDistributionStrategy,
} from './distribution.types';
import { PercentageSplitStrategy } from './strategies/percentage-split.strategy';
import { TieredStrategy } from './strategies/tiered.strategy';
import { FixedFeeStrategy } from './strategies/fixed-fee.strategy';
import { WaterfallStrategy } from './strategies/waterfall.strategy';

/**
 * Result of {@link RevenueDistributionService.distribute}. The dispatcher
 * surfaces both the lines *and* the resolved config metadata so the caller
 * (SettlementService) can record which model produced the split — useful
 * during audit and when investigating "why did this settlement look
 * different from last month?" questions.
 */
export interface DistributionResult {
  model: RevenueDistributionModel;
  /** The DB config row that produced the lines, or `null` for the legacy fallback. */
  config: RevenueDistributionConfig | null;
  /** `'product' | 'tenant' | 'legacy'` — which step in the resolution chain matched. */
  source: 'product' | 'tenant' | 'legacy';
  lines: DistributionLine[];
}

/**
 * S18-9 — Revenue distribution dispatcher.
 *
 * Resolves the active {@link RevenueDistributionConfig} for a tenant /
 * product and routes to the appropriate strategy. The resolution chain is
 * deliberately narrow:
 *
 *   1. Product-specific active config (if `productId` provided).
 *   2. Tenant-default active config (`productId IS NULL`).
 *   3. Legacy `percentage_split` synthesized from `tenant.platformFeePercent`.
 *
 * Step (3) is the backwards-compat fallback that lets tenants who haven't
 * opted into the new system keep running on the old hardcoded behaviour.
 * Do not remove without a coordinated migration.
 *
 * Idempotency: this service is pure dispatch — no writes. The caller
 * (SettlementService) owns the SettlementRun upsert and idempotency key
 * handling, so calling `.distribute()` twice produces identical lines but
 * never duplicates DB rows.
 */
@Injectable()
export class RevenueDistributionService {
  private readonly logger = new Logger(RevenueDistributionService.name);
  private readonly strategies: Map<RevenueDistributionModel, IRevenueDistributionStrategy>;

  constructor(
    private prisma: PrismaService,
    private percentageSplit: PercentageSplitStrategy,
    private tiered: TieredStrategy,
    private fixedFee: FixedFeeStrategy,
    private waterfall: WaterfallStrategy,
  ) {
    this.strategies = new Map<RevenueDistributionModel, IRevenueDistributionStrategy>([
      [RevenueDistributionModel.percentage_split, percentageSplit],
      [RevenueDistributionModel.tiered, tiered],
      [RevenueDistributionModel.fixed_fee, fixedFee],
      [RevenueDistributionModel.waterfall, waterfall],
    ]);
  }

  /**
   * Resolve config, dispatch to the matching strategy, return lines plus
   * the resolution metadata.
   */
  async distribute(
    tenantId: string,
    productId: string | null,
    input: DistributionInput,
  ): Promise<DistributionResult> {
    const resolved = await this.resolveConfig(tenantId, productId);

    const strategy = this.strategies.get(resolved.model);
    if (!strategy) {
      throw new ValidationError(`No strategy registered for distribution model: ${resolved.model}`);
    }

    const lines = strategy.calculate(input, resolved.configPayload);

    this.logger.debug(
      `Distribution[${resolved.model} via ${resolved.source}] tenant=${tenantId} product=${productId ?? 'tenant-default'} lines=${lines.length}`,
    );

    return {
      model: resolved.model,
      config: resolved.dbRow,
      source: resolved.source,
      lines,
    };
  }

  /**
   * Public-facing read for the GraphQL resolver (Track A). Returns the
   * active configs visible to the tenant (product + tenant-default rows).
   */
  async listConfigs(tenantId: string, productId?: string | null): Promise<RevenueDistributionConfig[]> {
    return this.prisma.revenueDistributionConfig.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(productId !== undefined ? { productId } : {}),
      },
      orderBy: [{ productId: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Walk the resolution chain. Separated from {@link distribute} so the
   * resolver helper for "preview what distribution would look like" can
   * reuse the same logic without dispatching.
   */
  private async resolveConfig(
    tenantId: string,
    productId: string | null,
  ): Promise<{
    model: RevenueDistributionModel;
    configPayload: unknown;
    dbRow: RevenueDistributionConfig | null;
    source: 'product' | 'tenant' | 'legacy';
  }> {
    // 1. Product-specific active config (lowest priority wins; ties broken
    //    by createdAt desc so the most recent operator-authored config
    //    takes effect first).
    if (productId) {
      const productConfig = await this.prisma.revenueDistributionConfig.findFirst({
        where: { tenantId, productId, isActive: true, deletedAt: null },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      });
      if (productConfig) {
        return {
          model: productConfig.model,
          configPayload: productConfig.config,
          dbRow: productConfig,
          source: 'product',
        };
      }
    }

    // 2. Tenant-default config (productId IS NULL).
    const tenantDefault = await this.prisma.revenueDistributionConfig.findFirst({
      where: { tenantId, productId: null, isActive: true, deletedAt: null },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    if (tenantDefault) {
      return {
        model: tenantDefault.model,
        configPayload: tenantDefault.config,
        dbRow: tenantDefault,
        source: 'tenant',
      };
    }

    // 3. Legacy fallback: synthesize a percentage_split config from the
    //    tenant's `platformFeePercent` column. This is the path every
    //    pre-S18 tenant currently takes — preserve it until ops backfill
    //    the new config table.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { platformFeePercent: true },
    });
    const platformPct = String(tenant?.platformFeePercent ?? '0');
    const spPct = subtract('100', platformPct);

    return {
      model: RevenueDistributionModel.percentage_split,
      configPayload: {
        parties: [
          { partyType: 'platform', partyId: 'lons-platform', percentage: platformPct },
          { partyType: 'sp', partyId: tenantId, percentage: spPct },
        ],
      },
      dbRow: null,
      source: 'legacy',
    };
  }
}
