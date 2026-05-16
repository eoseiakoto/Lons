import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AgingBucketConfig,
  ContractClassification,
  ContractStatus,
  PrismaService,
} from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { AgingActionService } from './aging-action.service';

interface AgingBucket {
  minDpd: number;
  maxDpd: number;
  status: ContractStatus;
  classification: ContractClassification;
  /** Sprint 16 (S16-12) — original DB row for action dispatch. Null
   * when buckets come from DEFAULT_BUCKETS (no actions configured). */
  config?: AgingBucketConfig;
}

/**
 * Sprint 16 (S16-11) — fallback buckets when no `aging_bucket_configs`
 * rows exist for a tenant. The migration seeds these for every active
 * tenant; this constant only triggers for fresh tenants that haven't
 * been seeded yet. Exported for tests that exercise bucket math
 * without standing up a DB.
 */
export const DEFAULT_BUCKETS: AgingBucket[] = [
  { minDpd: 0, maxDpd: 0, status: ContractStatus.performing, classification: ContractClassification.performing },
  { minDpd: 1, maxDpd: 7, status: ContractStatus.due, classification: ContractClassification.performing },
  { minDpd: 8, maxDpd: 30, status: ContractStatus.overdue, classification: ContractClassification.special_mention },
  { minDpd: 31, maxDpd: 60, status: ContractStatus.delinquent, classification: ContractClassification.substandard },
  { minDpd: 61, maxDpd: 90, status: ContractStatus.default_status, classification: ContractClassification.doubtful },
  { minDpd: 91, maxDpd: Number.MAX_SAFE_INTEGER, status: ContractStatus.default_status, classification: ContractClassification.loss },
];

@Injectable()
export class AgingService {
  private readonly logger = new Logger('AgingService');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    /**
     * Sprint 16 (S16-12) — optional so legacy tests construct without
     * the action service. Production wiring via AgingModule provides it.
     */
    @Optional() private agingActionService?: AgingActionService,
  ) {}

  async classifyPortfolio(tenantId: string, date: Date) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: {
          in: [
            ContractStatus.active,
            ContractStatus.performing,
            ContractStatus.due,
            ContractStatus.overdue,
            ContractStatus.delinquent,
            ContractStatus.default_status,
          ],
        },
      },
      include: {
        repaymentSchedule: {
          where: { status: { in: ['pending', 'partial', 'overdue'] } },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
      },
    });

    const transitioned: { contractId: string; oldStatus: string; newStatus: string; dpd: number }[] = [];

    // S16-11: per-product bucket lookup is memoised within this run so
    // we don't re-query for every contract on the same product.
    const bucketCache = new Map<string, AgingBucket[]>();

    for (const contract of contracts) {
      const dpd = this.calculateDaysPastDue(contract, date);
      const buckets = await this.getCachedBuckets(
        bucketCache,
        tenantId,
        contract.productId,
      );
      const bucket = this.getBucket(dpd, buckets);

      const oldStatus = contract.status;
      const oldClassification = contract.classification;

      if (contract.daysPastDue !== dpd || contract.status !== bucket.status || contract.classification !== bucket.classification) {
        await this.prisma.contract.update({
          where: { id: contract.id },
          data: {
            daysPastDue: dpd,
            status: bucket.status,
            classification: bucket.classification,
            ...(bucket.status === ContractStatus.default_status && !contract.defaultedAt
              ? { defaultedAt: date }
              : {}),
          },
        });

        if (oldStatus !== bucket.status) {
          transitioned.push({
            contractId: contract.id,
            oldStatus,
            newStatus: bucket.status,
            dpd,
          });

          this.eventBus.emitAndBuild(EventType.CONTRACT_STATE_CHANGED, tenantId, {
            contractId: contract.id,
            previousStatus: oldStatus,
            newStatus: bucket.status,
          });

          this.eventBus.emitAndBuild(EventType.CONTRACT_AGED, tenantId, {
            contractId: contract.id,
            daysPastDue: dpd,
            oldClassification,
            newClassification: bucket.classification,
          });

          // S16-12: execute the matrix of actions configured for the
          // NEW bucket. Only fires when a bucket actually has a backing
          // DB config (DEFAULT_BUCKETS fallback has no actions).
          if (bucket.config && this.agingActionService) {
            await this.agingActionService.executeActions(
              tenantId,
              contract.id,
              contract.customerId,
              bucket.config,
            );
          }
        }
      }
    }

    this.logger.log(`Aging complete: ${contracts.length} contracts processed, ${transitioned.length} transitioned`);
    return { processed: contracts.length, transitioned };
  }

  /**
   * S16-11 — per-(tenant, product) bucket lookup with per-run memo.
   * Tries product-specific config first, falls back to tenant-wide
   * (productId IS NULL), then to the hardcoded DEFAULT_BUCKETS.
   */
  private async getCachedBuckets(
    cache: Map<string, AgingBucket[]>,
    tenantId: string,
    productId: string,
  ): Promise<AgingBucket[]> {
    const key = `${tenantId}:${productId}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const buckets = await this.loadBuckets(tenantId, productId);
    cache.set(key, buckets);
    return buckets;
  }

  private async loadBuckets(
    tenantId: string,
    productId: string,
  ): Promise<AgingBucket[]> {
    try {
      // Product-specific config takes precedence.
      const productRows = await this.prisma.agingBucketConfig.findMany({
        where: { tenantId, productId },
        orderBy: { sortOrder: 'asc' },
      });
      if (productRows.length > 0) return productRows.map((r) => this.toBucket(r));

      // Fall back to tenant-wide default (productId IS NULL).
      const tenantRows = await this.prisma.agingBucketConfig.findMany({
        where: { tenantId, productId: null },
        orderBy: { sortOrder: 'asc' },
      });
      if (tenantRows.length > 0) return tenantRows.map((r) => this.toBucket(r));
    } catch (err) {
      this.logger.warn(
        `Failed to load AgingBucketConfig for tenant ${tenantId} product ${productId}: ${(err as Error).message}. Using DEFAULT_BUCKETS.`,
      );
    }
    return DEFAULT_BUCKETS;
  }

  /**
   * Coerce a DB row's stringly-typed `contractStatus` + `classification`
   * back into their enums. Invalid values default to `performing` to
   * avoid throwing on a misconfigured row — surfaces a log instead.
   */
  private toBucket(row: AgingBucketConfig): AgingBucket {
    const status = (
      Object.values(ContractStatus) as string[]
    ).includes(row.contractStatus)
      ? (row.contractStatus as ContractStatus)
      : ContractStatus.performing;
    const classification = (
      Object.values(ContractClassification) as string[]
    ).includes(row.classification)
      ? (row.classification as ContractClassification)
      : ContractClassification.performing;
    return {
      minDpd: row.daysMin,
      maxDpd: row.daysMax,
      status,
      classification,
      config: row,
    };
  }

  private calculateDaysPastDue(
    contract: { repaymentSchedule: { dueDate: Date }[] },
    asOfDate: Date,
  ): number {
    const earliestOverdue = contract.repaymentSchedule[0];
    if (!earliestOverdue) return 0;

    const dueDate = new Date(earliestOverdue.dueDate);
    if (asOfDate <= dueDate) return 0;

    return Math.floor((asOfDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  private getBucket(dpd: number, buckets: AgingBucket[]): AgingBucket {
    for (const bucket of buckets) {
      if (dpd >= bucket.minDpd && dpd <= bucket.maxDpd) {
        return bucket;
      }
    }
    return buckets[buckets.length - 1];
  }
}
