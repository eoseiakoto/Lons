import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';

import { DEFAULT_SCORECARD } from './default-scorecard';
import { ScorecardConfig } from './scorecard-engine';

export interface ScorecardConfigRecord {
  id: string;
  tenantId: string;
  productId: string | null;
  name: string;
  version: string;
  config: ScorecardConfig;
  scoreRangeMin: string;
  scoreRangeMax: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScorecardInput {
  productId?: string | null;
  name: string;
  version: string;
  config: ScorecardConfig;
  createdBy?: string;
  /**
   * When true (default false), set this scorecard as active and
   * deactivate any existing active scorecard for the same scope.
   */
  activate?: boolean;
}

/**
 * S17-4 / FR-CS-001.1 — Loads scorecard definitions from
 * `scorecard_configs` with a deterministic fallback chain so scoring
 * can never silently fail.
 *
 *   1. product-specific active scorecard (tenantId, productId)
 *   2. tenant-default active scorecard (tenantId, productId = null)
 *   3. hardcoded {@link DEFAULT_SCORECARD}
 *
 * Activating a new scorecard atomically deactivates previous active
 * versions for the same scope (so resolution always picks at most one).
 */
@Injectable()
export class ScorecardConfigService {
  private readonly logger = new Logger('ScorecardConfigService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the scorecard to use when scoring a customer against a
   * given product. Falls back through product → tenant-default →
   * hardcoded default.
   */
  async getActiveScorecard(
    tenantId: string,
    productId: string,
  ): Promise<ScorecardConfig> {
    // 1. Product-specific
    const productScorecard = await this.prisma.scorecardConfig.findFirst({
      where: { tenantId, productId, isActive: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (productScorecard) {
      return this.parseConfig(productScorecard.config);
    }

    // 2. Tenant default
    const tenantDefault = await this.prisma.scorecardConfig.findFirst({
      where: { tenantId, productId: null, isActive: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (tenantDefault) {
      return this.parseConfig(tenantDefault.config);
    }

    // 3. Hardcoded fallback
    this.logger.debug(
      `No scorecard configured for tenant=${tenantId} product=${productId}; using hardcoded default`,
    );
    return DEFAULT_SCORECARD;
  }

  async findById(
    tenantId: string,
    scorecardId: string,
  ): Promise<ScorecardConfigRecord | null> {
    const row = await this.prisma.scorecardConfig.findFirst({
      where: { id: scorecardId, tenantId, deletedAt: null },
    });
    return row ? this.toRecord(row) : null;
  }

  async listVersions(
    tenantId: string,
    productId?: string | null,
  ): Promise<ScorecardConfigRecord[]> {
    const rows = await this.prisma.scorecardConfig.findMany({
      where: {
        tenantId,
        productId: productId ?? null,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toRecord(r));
  }

  async create(
    tenantId: string,
    input: CreateScorecardInput,
  ): Promise<ScorecardConfigRecord> {
    this.validateConfig(input.config);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.scorecardConfig.create({
        data: {
          tenantId,
          productId: input.productId ?? null,
          name: input.name,
          version: input.version,
          config: input.config as unknown as Prisma.InputJsonValue,
          scoreRangeMin: input.config.scoreRange.min,
          scoreRangeMax: input.config.scoreRange.max,
          isActive: false,
          createdBy: input.createdBy ?? null,
        },
      });
      if (input.activate) {
        await this.activateInternal(tx, tenantId, row.id);
        return tx.scorecardConfig.findUniqueOrThrow({ where: { id: row.id } });
      }
      return row;
    });

    this.logger.log(
      `Created scorecard ${created.id} v${created.version} ` +
        `tenant=${tenantId} product=${created.productId ?? 'default'}`,
    );
    return this.toRecord(created);
  }

  /**
   * Activate the given scorecard; deactivate any other active scorecard
   * for the same (tenantId, productId) scope in the same transaction.
   */
  async activate(tenantId: string, scorecardId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.activateInternal(tx, tenantId, scorecardId);
    });
    this.logger.log(`Activated scorecard ${scorecardId} tenant=${tenantId}`);
  }

  async deactivate(tenantId: string, scorecardId: string): Promise<void> {
    const existing = await this.prisma.scorecardConfig.findFirst({
      where: { id: scorecardId, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Scorecard config not found: ${scorecardId}`);
    }
    await this.prisma.scorecardConfig.update({
      where: { id: scorecardId },
      data: { isActive: false },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  private async activateInternal(
    tx: Prisma.TransactionClient,
    tenantId: string,
    scorecardId: string,
  ): Promise<void> {
    const target = await tx.scorecardConfig.findFirst({
      where: { id: scorecardId, tenantId, deletedAt: null },
    });
    if (!target) {
      throw new Error(`Scorecard config not found: ${scorecardId}`);
    }
    // Deactivate siblings (same tenant + same productId scope)
    await tx.scorecardConfig.updateMany({
      where: {
        tenantId,
        productId: target.productId,
        isActive: true,
        deletedAt: null,
        id: { not: scorecardId },
      },
      data: { isActive: false },
    });
    await tx.scorecardConfig.update({
      where: { id: scorecardId },
      data: { isActive: true },
    });
  }

  private parseConfig(raw: unknown): ScorecardConfig {
    if (!raw || typeof raw !== 'object') {
      this.logger.warn('Persisted scorecard config is empty; using DEFAULT_SCORECARD');
      return DEFAULT_SCORECARD;
    }
    const cfg = raw as ScorecardConfig;
    try {
      this.validateConfig(cfg);
      return cfg;
    } catch (err) {
      this.logger.error(
        `Invalid persisted scorecard config: ${err instanceof Error ? err.message : err}; falling back to DEFAULT_SCORECARD`,
      );
      return DEFAULT_SCORECARD;
    }
  }

  private validateConfig(cfg: ScorecardConfig): void {
    if (!cfg.version) throw new Error('Scorecard.version is required');
    if (!cfg.scoreRange || typeof cfg.scoreRange.min !== 'number' || typeof cfg.scoreRange.max !== 'number') {
      throw new Error('Scorecard.scoreRange.min/max must be numbers');
    }
    if (cfg.scoreRange.max <= cfg.scoreRange.min) {
      throw new Error('Scorecard.scoreRange.max must exceed min');
    }
    if (!Array.isArray(cfg.factors) || cfg.factors.length === 0) {
      throw new Error('Scorecard.factors must be a non-empty array');
    }
    for (const f of cfg.factors) {
      if (!f.name) throw new Error('Each scorecard factor needs a name');
      if (typeof f.weight !== 'number' || f.weight < 0) {
        throw new Error(`Factor ${f.name} has invalid weight`);
      }
      if (!Array.isArray(f.bands) || f.bands.length === 0) {
        throw new Error(`Factor ${f.name} has no bands`);
      }
    }
    if (!Array.isArray(cfg.riskTiers) || cfg.riskTiers.length === 0) {
      throw new Error('Scorecard.riskTiers must be a non-empty array');
    }
    if (!Array.isArray(cfg.limitBands) || cfg.limitBands.length === 0) {
      throw new Error('Scorecard.limitBands must be a non-empty array');
    }
  }

  private toRecord(row: {
    id: string;
    tenantId: string;
    productId: string | null;
    name: string;
    version: string;
    config: unknown;
    scoreRangeMin: { toString(): string };
    scoreRangeMax: { toString(): string };
    isActive: boolean;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ScorecardConfigRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      productId: row.productId,
      name: row.name,
      version: row.version,
      config: this.parseConfig(row.config),
      scoreRangeMin: row.scoreRangeMin.toString(),
      scoreRangeMax: row.scoreRangeMax.toString(),
      isActive: row.isActive,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
