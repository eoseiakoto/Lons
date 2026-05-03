import { Injectable, Logger } from '@nestjs/common';

import { PrismaService, CreditLineStatus, ProductType } from '@lons/database';
import { EventBusService, isZero, add } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { CreditLineService } from '../credit-line/credit-line.service';

/**
 * Sprint 11 A5 — overdraft DPD / aging classification.
 *
 * Runs daily via the scheduler. For every overdraft credit line with a
 * non-zero outstanding obligation past its due date, computes days-past-
 * due, classifies into a bucket, and on bucket transitions triggers the
 * configured automated action (notification, freeze, recovery referral,
 * NPL classification).
 *
 * Bucket definitions per SPEC §9.1 (overdraft default thresholds —
 * configurable per product in a future sprint):
 *
 *   | Bucket       | DPD range | Action on entry                              |
 *   |--------------|-----------|-----------------------------------------------|
 *   | current      |     0     | none                                          |
 *   | watch        |   1–7     | overdue reminder notifications                |
 *   | substandard  |   8–30    | freeze credit line + ops work item            |
 *   | doubtful     |  31–90    | refer to recovery + reduce limit              |
 *   | loss        |    91+    | NPL classification + bureau-report flag       |
 *
 * Actions only fire on bucket *transitions*, not every run — the daily
 * job re-classifies idempotently.
 */

export type AgingBucket = 'current' | 'watch' | 'substandard' | 'doubtful' | 'loss';

interface BucketDefinition {
  name: AgingBucket;
  minDpd: number;
  maxDpd: number;
}

// TODO (Sprint 12+): Read per-product thresholds from
// `product.overdraftConfig.agingThresholds` and fall back to these
// defaults when unconfigured. SPEC §9.1 / FR-DM-001.2 calls these
// "configurable per product and per regulatory jurisdiction" — the
// current implementation only honours the global defaults.
const DEFAULT_THRESHOLDS: BucketDefinition[] = [
  { name: 'current', minDpd: 0, maxDpd: 0 },
  { name: 'watch', minDpd: 1, maxDpd: 7 },
  { name: 'substandard', minDpd: 8, maxDpd: 30 },
  { name: 'doubtful', minDpd: 31, maxDpd: 90 },
  { name: 'loss', minDpd: 91, maxDpd: Number.MAX_SAFE_INTEGER },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Lower-numbered = healthier. Used to detect direction of a transition. */
const BUCKET_RANK: Record<AgingBucket, number> = {
  current: 0,
  watch: 1,
  substandard: 2,
  doubtful: 3,
  loss: 4,
};

@Injectable()
export class OverdraftAgingService {
  private readonly logger = new Logger('OverdraftAgingService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly creditLineService: CreditLineService,
  ) {}

  /**
   * Pure DPD computation. Days past due = floor((today − dueDate) / 1 day),
   * clamped at zero. `dueDate` and `asOf` are interpreted as dates only —
   * we strip the time component to avoid intra-day off-by-ones across
   * DST boundaries.
   */
  static calculateDpd(dueDate: Date | null, asOf: Date): number {
    if (!dueDate) return 0;
    const dueAtMidnight = Date.UTC(
      dueDate.getUTCFullYear(),
      dueDate.getUTCMonth(),
      dueDate.getUTCDate(),
    );
    const asOfAtMidnight = Date.UTC(
      asOf.getUTCFullYear(),
      asOf.getUTCMonth(),
      asOf.getUTCDate(),
    );
    if (asOfAtMidnight <= dueAtMidnight) return 0;
    return Math.floor((asOfAtMidnight - dueAtMidnight) / MS_PER_DAY);
  }

  /** Pure classifier: DPD → bucket name. */
  static classifyBucket(dpd: number): AgingBucket {
    for (const b of DEFAULT_THRESHOLDS) {
      if (dpd >= b.minDpd && dpd <= b.maxDpd) return b.name;
    }
    return 'loss';
  }

  /**
   * Daily aging pass for one tenant. Processes every overdraft credit
   * line with `dueDate IS NOT NULL` and a non-zero obligation. Updates
   * the snapshot fields and runs automated actions on bucket transitions.
   *
   * Returns a summary with counts and the list of transitions for the
   * scheduler log.
   */
  async classifyPortfolio(
    tenantId: string,
    today: Date,
  ): Promise<{
    processed: number;
    transitioned: Array<{ creditLineId: string; from: AgingBucket | null; to: AgingBucket; dpd: number }>;
  }> {
    const creditLines = await this.prisma.creditLine.findMany({
      where: {
        tenantId,
        status: { in: [CreditLineStatus.active, CreditLineStatus.frozen] },
        dueDate: { not: null },
        product: { type: ProductType.overdraft },
      },
      include: { product: true },
    });

    const transitioned: Array<{
      creditLineId: string;
      from: AgingBucket | null;
      to: AgingBucket;
      dpd: number;
    }> = [];

    for (const cl of creditLines) {
      const totalOwed = this.totalOwed(cl);
      // Lines with everything paid off don't age — skip but reset stale
      // snapshot fields if they're set.
      if (isZero(totalOwed)) {
        if (cl.daysPastDue !== 0 || cl.agingBucket !== 'current') {
          await this.prisma.creditLine.update({
            where: { id: cl.id },
            data: { daysPastDue: 0, agingBucket: 'current', agingUpdatedAt: today },
          });
        }
        continue;
      }

      const dpd = OverdraftAgingService.calculateDpd(cl.dueDate, today);
      const bucket = OverdraftAgingService.classifyBucket(dpd);
      const previousBucket = (cl.agingBucket as AgingBucket | null) ?? null;

      if (cl.daysPastDue === dpd && previousBucket === bucket) {
        // No change — skip the write to keep the per-day touch count low.
        continue;
      }

      await this.prisma.creditLine.update({
        where: { id: cl.id },
        data: {
          daysPastDue: dpd,
          agingBucket: bucket,
          agingUpdatedAt: today,
        },
      });

      // Always emit `creditline.aged` so reporting/dashboards have a
      // signal for every change. Only fire bucket-transition actions
      // (freeze / recovery / NPL) when the bucket name actually changed.
      this.eventBus.emitAndBuild(EventType.CREDITLINE_AGED, tenantId, {
        creditLineId: cl.id,
        customerId: cl.customerId,
        previousBucket,
        newBucket: bucket,
        daysPastDue: dpd,
        totalOwed,
      });

      // FIX 2: watch-bucket reminders fire on every configured DPD day,
      // not only on bucket entry. Otherwise a customer who entered watch
      // at DPD 1 would get one reminder and then silence until DPD 8
      // pushes them to substandard — the SPEC §9.1 reminder schedule
      // (defaults to [1, 3, 7]) would be ignored after day 1. Runs
      // independently of the transition gate below.
      if (bucket === 'watch') {
        const config = (cl.product?.overdraftConfig as Record<string, unknown> | null) ?? {};
        const reminderSchedule =
          ((config.reminderSchedule as Record<string, unknown> | undefined)
            ?.afterOverdueDays as number[] | undefined) ?? [1, 3, 7];
        if (reminderSchedule.includes(dpd)) {
          this.eventBus.emitAndBuild(EventType.CREDITLINE_OVERDUE_REMINDER_DUE, tenantId, {
            creditLineId: cl.id,
            customerId: cl.customerId,
            daysPastDue: dpd,
            totalOwed,
          });
        }
      }

      if (previousBucket !== bucket) {
        transitioned.push({ creditLineId: cl.id, from: previousBucket, to: bucket, dpd });
        await this.runTransitionActions(tenantId, cl, previousBucket, bucket, dpd, totalOwed);
      }
    }

    this.logger.log(
      `Tenant ${tenantId.slice(0, 8)}…: ${creditLines.length} overdraft credit lines classified, ${transitioned.length} transitioned`,
    );
    return { processed: creditLines.length, transitioned };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Bucket-transition actions. Only worsening transitions trigger the
   * heavy actions (substandard freeze, doubtful recovery referral, NPL
   * classification) — improving transitions (e.g. `substandard → watch`
   * after a partial repayment) just emit `CREDITLINE_AGED` so dashboards
   * reflect the new state. Watch-bucket reminders are handled in the
   * main `classifyPortfolio` loop because they fire on every configured
   * DPD day, not only on bucket entry (FIX 2).
   */
  private async runTransitionActions(
    tenantId: string,
    cl: { id: string; customerId: string; product: { overdraftConfig: unknown } | null },
    from: AgingBucket | null,
    to: AgingBucket,
    dpd: number,
    totalOwed: string,
  ): Promise<void> {
    const isWorsening = (BUCKET_RANK[to] ?? 0) > (BUCKET_RANK[from ?? 'current'] ?? 0);
    if (!isWorsening) return;

    switch (to) {
      case 'watch': {
        // Reminders fire from the main loop (FIX 2). No transition-only
        // action for watch — entering the bucket simply means the next
        // configured-DPD day will trigger a reminder.
        break;
      }
      case 'substandard': {
        try {
          await this.creditLineService.freeze(tenantId, cl.id, 'overdue_substandard');
        } catch (e) {
          this.logger.error(
            `Failed to freeze credit line ${cl.id} on substandard transition: ${e instanceof Error ? e.message : e}`,
          );
        }
        break;
      }
      case 'doubtful': {
        this.eventBus.emitAndBuild(EventType.CREDITLINE_RECOVERY_REFERRED, tenantId, {
          creditLineId: cl.id,
          customerId: cl.customerId,
          daysPastDue: dpd,
          totalOwed,
        });
        // Reduce the approved limit to whatever is currently outstanding so
        // no further drawdowns can grow the exposure. The credit-line
        // service handles the audit trail + cache update.
        try {
          await this.creditLineService.adjustLimit(tenantId, cl.id, {
            newLimit: '0',
            reasonCode: 'overdue_reduction',
            reasonDetail: `Auto-reduced on doubtful aging at ${dpd} DPD`,
            triggeredBy: 'system:aging-job',
          });
        } catch (e) {
          this.logger.error(
            `Failed to adjust limit for credit line ${cl.id} on doubtful transition: ${e instanceof Error ? e.message : e}`,
          );
        }
        break;
      }
      case 'loss': {
        this.eventBus.emitAndBuild(EventType.CREDITLINE_NPL_CLASSIFIED, tenantId, {
          creditLineId: cl.id,
          customerId: cl.customerId,
          daysPastDue: dpd,
          totalOwed,
        });
        // TODO (Sprint 13+): Customer-level suspension is owned by
        // entity-service and credit-bureau reporting by integration-
        // service. They must subscribe to CREDITLINE_NPL_CLASSIFIED
        // before NPL handling is end-to-end complete. SPEC §9.1 Loss
        // bucket actions. The aging classifier emits but never reaches
        // across service boundaries directly.
        break;
      }
    }
  }

  /** Sum of all four obligation balances. Used to skip fully-paid lines. */
  private totalOwed(cl: {
    outstandingAmount: { toString(): string } | string;
    interestAccrued: { toString(): string } | string;
    feesOutstanding: { toString(): string } | string;
    penaltiesAccrued: { toString(): string } | string;
  }): string {
    return add(
      add(String(cl.outstandingAmount), String(cl.interestAccrued)),
      add(String(cl.feesOutstanding), String(cl.penaltiesAccrued)),
    );
  }
}
