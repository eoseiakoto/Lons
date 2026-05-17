import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@lons/database';

import { EmiDataService } from './emi-data.service';
import { EmiIntegrationConfigService } from './emi-integration-config.service';

export interface EmiSyncResult {
  tenantId: string;
  attempted: number;
  succeeded: number;
  skipped: number;
  failed: number;
  errors: { customerId: string; error: string }[];
}

/**
 * S17-1 / FR-DI-001.1 — periodic EMI snapshot sync.
 *
 * Iterates customers that have an active subscription for a given tenant
 * and refreshes their `customer_financial_data` row via
 * {@link EmiDataService.syncFinancialSnapshot}. Designed to be invoked
 * by the scheduler/BullMQ on a configurable cadence (default 6h per
 * S17-1 spec and `EmiIntegrationConfig.syncFrequencyMin`).
 *
 * The job is idempotent — re-running it inserts a fresh snapshot row;
 * scoring always reads the most-recent row by (customerId, source,
 * fetchedAt).
 */
@Injectable()
export class EmiDataSyncJob {
  private readonly logger = new Logger('EmiDataSyncJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emiDataService: EmiDataService,
    // S17-FIX-8 — record per-config sync status on the integration row
    // (`last_sync_at`, `last_sync_error`). @Optional so existing tests
    // that construct the job with two args continue to work; the
    // status update is a best-effort no-op when the service is absent.
    @Optional()
    private readonly emiConfigService?: EmiIntegrationConfigService,
  ) {}

  /**
   * Run the sync for a single tenant + integration config. Returns a
   * summary suitable for logging/metrics.
   *
   * S17-FIX-8 — when `configId` is passed, the job updates the
   * `last_sync_at` / `last_sync_error` columns on the
   * `emi_integration_configs` row so the admin portal "Last sync"
   * indicator is accurate. The configId is optional only for legacy
   * callers; new scheduler bindings must pass it.
   */
  async runForTenant(tenantId: string, configId?: string): Promise<EmiSyncResult> {
    const startedAt = Date.now();

    // S17-FIX-8 — wrap the entire body (including the initial
    // subscription lookup) in try/catch so a batch-wide failure
    // (e.g. Prisma connection lost) still records the error against
    // the integration config. Per-customer failures accumulate in
    // result.errors and don't escalate.
    const result: EmiSyncResult = {
      tenantId,
      attempted: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    try {
    // Active subscriptions → customers who matter for scoring right now.
    const subscriptions = await this.prisma.subscription.findMany({
      where: { tenantId, status: 'active' },
      select: { customerId: true },
      distinct: ['customerId'],
    });
    result.attempted = subscriptions.length;

    for (const sub of subscriptions) {
      try {
        // Wallet ID is held on the wallet account mapping (preferred) or
        // on customer.metadata.walletId (legacy). We try the mapping first.
        const mapping = await this.prisma.walletAccountMapping.findFirst({
          where: { tenantId, customerId: sub.customerId },
          select: { walletId: true },
          orderBy: { createdAt: 'desc' },
        });

        let walletId = mapping?.walletId ?? null;
        if (!walletId) {
          const customer = await this.prisma.customer.findFirst({
            where: { id: sub.customerId, tenantId },
            select: { metadata: true },
          });
          const meta = (customer?.metadata as Record<string, unknown> | null) ?? null;
          if (meta && typeof meta.walletId === 'string') {
            walletId = meta.walletId;
          }
        }

        if (!walletId) {
          result.skipped++;
          continue;
        }

        const snapshot = await this.emiDataService.syncFinancialSnapshot(
          tenantId,
          sub.customerId,
          walletId,
        );

        if (snapshot) {
          result.succeeded++;
        } else {
          result.skipped++; // EMI unavailable; not a hard failure
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.failed++;
        result.errors.push({ customerId: sub.customerId, error: msg });
      }
    }

    this.logger.log(
      `EMI sync done tenant=${tenantId} attempted=${result.attempted} ` +
        `ok=${result.succeeded} skipped=${result.skipped} failed=${result.failed} ` +
        `elapsed=${Date.now() - startedAt}ms`,
    );

      // S17-FIX-8 — record success when we made it through the loop
      // without a batch-wide throw. Per-customer failures don't flip
      // the integration "last sync" status to error; that's reserved
      // for systemic failures that broke the entire pass.
      if (configId && this.emiConfigService) {
        try {
          await this.emiConfigService.recordSyncSuccess(tenantId, configId);
        } catch (statusErr) {
          this.logger.warn(
            `recordSyncSuccess failed for config=${configId}: ${(statusErr as Error).message}`,
          );
        }
      }

      return result;
    } catch (batchErr) {
      // S17-FIX-8 — batch-wide failure: stamp the integration row with
      // the error so operators can diagnose without trawling logs.
      const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
      this.logger.error(
        `EMI sync batch failed tenant=${tenantId} configId=${configId ?? 'n/a'} error=${msg}`,
      );
      if (configId && this.emiConfigService) {
        try {
          await this.emiConfigService.recordSyncError(tenantId, configId, msg);
        } catch (statusErr) {
          this.logger.warn(
            `recordSyncError failed for config=${configId}: ${(statusErr as Error).message}`,
          );
        }
      }
      throw batchErr;
    }
  }
}
