import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';

import { EmiDataService } from './emi-data.service';

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
  ) {}

  /**
   * Run the sync for a single tenant. Returns a summary suitable for
   * logging/metrics.
   */
  async runForTenant(tenantId: string): Promise<EmiSyncResult> {
    const startedAt = Date.now();

    // Active subscriptions → customers who matter for scoring right now.
    const subscriptions = await this.prisma.subscription.findMany({
      where: { tenantId, status: 'active' },
      select: { customerId: true },
      distinct: ['customerId'],
    });

    const result: EmiSyncResult = {
      tenantId,
      attempted: subscriptions.length,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

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

    return result;
  }
}
