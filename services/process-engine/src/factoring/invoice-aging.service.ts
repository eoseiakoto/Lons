import { Injectable, Logger } from '@nestjs/common';

import {
  PrismaService,
  Prisma,
  InvoiceStatus,
  type Invoice,
} from '@lons/database';
import { EventBusService } from '@lons/common';

import { RecourseService } from './recourse.service';
import {
  AGING_BUCKETS,
  type AgingBucket,
  type AgingResult,
  type AgingThresholds,
  DEFAULT_AGING_THRESHOLDS,
} from './invoice-aging.types';

/**
 * Statuses considered "active" for aging — an invoice has been funded and
 * the debtor still owes (in part or in whole). `funded` is included
 * because an invoice between funding and debtor notification can still
 * age past due — without this status the aging scan would silently miss
 * those invoices (F-IF-6, pre-S13 fix). `payment_received` is kept in
 * scope because partial payments still age against the unpaid balance
 * until the reserve releases or settlement completes.
 *
 * Statuses explicitly EXCLUDED from aging:
 *   - submitted / under_review / verified / offer_* — pre-funding, no debt yet
 *   - reserve_released / settled — terminal happy path
 *   - defaulted — already in default; recourse owns the lifecycle from here
 *   - disputed — manual review queue
 *   - cancelled / rejected — never funded
 */
const ACTIVE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.funded,
  InvoiceStatus.debtor_notified,
  InvoiceStatus.payment_received,
];

/** UTC midnight for "today" — used for DPD calculations. */
function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Whole days between two UTC dates (b - a). Both inputs are normalized to
 * UTC midnight so partial days don't skew the result. Positive when `b`
 * is after `a`.
 */
function daysBetweenUtc(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bUtc - aUtc) / 86_400_000);
}

/**
 * Read aging thresholds from `product.factoringConfig.agingThresholds`,
 * filling missing keys with the spec defaults. The Prisma `Json` type is
 * `unknown` at runtime so we narrow defensively.
 */
function readAgingThresholds(
  raw: Prisma.JsonValue | null | undefined,
): AgingThresholds {
  const cfg = (raw as Record<string, unknown> | null | undefined) ?? {};
  const at =
    (cfg.agingThresholds as Record<string, unknown> | undefined) ?? {};

  const graceEndDpd =
    typeof at.graceEndDpd === 'number'
      ? at.graceEndDpd
      : DEFAULT_AGING_THRESHOLDS.graceEndDpd;
  const overdueEndDpd =
    typeof at.overdueEndDpd === 'number'
      ? at.overdueEndDpd
      : DEFAULT_AGING_THRESHOLDS.overdueEndDpd;
  const seriouslyOverdueEndDpd =
    typeof at.seriouslyOverdueEndDpd === 'number'
      ? at.seriouslyOverdueEndDpd
      : DEFAULT_AGING_THRESHOLDS.seriouslyOverdueEndDpd;
  const defaultDpd =
    typeof at.defaultDpd === 'number'
      ? at.defaultDpd
      : DEFAULT_AGING_THRESHOLDS.defaultDpd;

  return { graceEndDpd, overdueEndDpd, seriouslyOverdueEndDpd, defaultDpd };
}

/**
 * Determine the aging bucket for a given DPD + days-until-due context per
 * SPEC-invoice-factoring.md §7.1.
 *
 *   daysUntilDue > graceEndDpd       → Current      (more than a week away)
 *   1 ≤ daysUntilDue ≤ graceEndDpd   → Approaching  (within reminder window)
 *   dpd === 0                         → Due          (today is dueDate)
 *   1 ≤ dpd ≤ graceEndDpd            → Grace
 *   graceEndDpd < dpd ≤ overdueEndDpd                → Overdue
 *   overdueEndDpd < dpd ≤ seriouslyOverdueEndDpd     → SeriouslyOverdue
 *   dpd > seriouslyOverdueEndDpd OR dpd ≥ defaultDpd → Default
 *
 * `defaultDpd` defaults to `seriouslyOverdueEndDpd` so the two right-hand
 * conditions normally collapse, but an operator can extend the
 * SeriouslyOverdue window by setting `defaultDpd` higher than
 * `seriouslyOverdueEndDpd + 1` in product config.
 */
function classifyBucket(
  dpd: number,
  daysUntilDue: number,
  thresholds: AgingThresholds,
): AgingBucket {
  // Default is the highest-severity bucket — check it first so a
  // misconfigured `defaultDpd < seriouslyOverdueEndDpd` still defaults
  // (rather than getting trapped at SeriouslyOverdue).
  if (dpd > thresholds.seriouslyOverdueEndDpd || dpd >= thresholds.defaultDpd) {
    return 'Default';
  }
  if (dpd > thresholds.overdueEndDpd) return 'SeriouslyOverdue';
  if (dpd > thresholds.graceEndDpd) return 'Overdue';
  if (dpd >= 1) return 'Grace';
  if (dpd === 0 && daysUntilDue === 0) return 'Due';
  if (daysUntilDue >= 1 && daysUntilDue <= thresholds.graceEndDpd) {
    return 'Approaching';
  }
  return 'Current';
}

/**
 * Action mock for v1. Phase 5 will swap these for real notification /
 * collections / recourse calls. We keep the side effect surface confined
 * to logging here so the integration layer can wire dispatch without
 * having to unwind double-handling.
 */
function describeBucketAction(bucket: AgingBucket, invoiceId: string): string {
  switch (bucket) {
    case 'Approaching':
      return `Mock send debtor reminder for invoice ${invoiceId}`;
    case 'Due':
      return `Mock send payment-due notification for invoice ${invoiceId}`;
    case 'Grace':
      return `Mock send reminder to debtor + seller for invoice ${invoiceId}`;
    case 'Overdue':
      return `Mock escalation: contact debtor for invoice ${invoiceId}`;
    case 'SeriouslyOverdue':
      return `Mock collection escalation + recourse flag for invoice ${invoiceId}`;
    case 'Default':
      // Surfaced separately by the caller with the DPD context; this
      // branch is a safety net.
      return `Default bucket reached for invoice ${invoiceId}`;
    case 'Current':
    default:
      return '';
  }
}

/**
 * Sprint 12 Phase 6A — daily aging classification for unpaid invoices.
 *
 * Implements SPEC-invoice-factoring.md §7 (the 7-bucket model) — NOT the
 * simplified 30/60/90 portfolio-level aging used elsewhere. Driven by the
 * scheduler's daily cron, scoped per tenant.
 *
 * Side-effect philosophy:
 *   - Bucket transitions write to `invoice.metadata.agingBucket` so the
 *     next run can detect first-crossing without consulting an audit log.
 *   - `metadata.agingLastCheckedAt` is updated every run for observability,
 *     even when the bucket doesn't change.
 *   - Reaching `Default` for the first time records
 *     `metadata.defaultThresholdCrossedAt` and adds the invoice to
 *     {@link AgingResult.newDefaults}. The integration layer
 *     (Phase 3E RecourseService) is responsible for the actual default
 *     workflow — we deliberately do NOT mutate `invoice.status` here so
 *     recourse can do it atomically with ledger entries, reserve
 *     handling, and event emission.
 *
 * Multi-tenancy: every read and write is scoped via `findMany` /
 * `update` with `tenantId` in the predicate. RLS is the second line of
 * defense; the scheduler enters per-tenant context before calling.
 */
@Injectable()
export class InvoiceAgingService {
  private readonly logger = new Logger('InvoiceAgingService');

  constructor(
    private readonly prisma: PrismaService,
    // Reserved for v2 — bucket transitions emit logging only in v1 per
    // sprint plan (no aging-specific event was added in Phase 2B). Kept
    // in the constructor so the DI shape lines up with sibling factoring
    // services and we can start emitting without a refactor.
    private readonly _eventBus: EventBusService,
    private readonly recourseService: RecourseService,
  ) {
    void this._eventBus;
  }

  /**
   * Scan all active invoices for the tenant, classify each into an aging
   * bucket, and trigger first-time-only side effects on transitions.
   *
   * Idempotency: the function can be safely re-run multiple times per
   * day. Bucket assignment is a pure function of `today - dueDate` and
   * config, so re-runs land in the same bucket (no spurious updates).
   * The `newDefaults` list only includes first crossings.
   */
  async processAging(tenantId: string): Promise<AgingResult> {
    const today = startOfTodayUtc();

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ACTIVE_INVOICE_STATUSES },
      },
      include: {
        product: {
          select: { id: true, factoringConfig: true },
        },
      },
    });

    const result: AgingResult = {
      totalScanned: invoices.length,
      byBucket: AGING_BUCKETS.reduce(
        (acc, b) => {
          acc[b] = 0;
          return acc;
        },
        {} as Record<AgingBucket, number>,
      ),
      newDefaults: [],
      transitions: 0,
    };

    if (invoices.length === 0) {
      this.logger.debug(`No active invoices to age for tenant ${tenantId}`);
      return result;
    }

    for (const invoice of invoices) {
      const dueDate = new Date(
        Date.UTC(
          invoice.dueDate.getUTCFullYear(),
          invoice.dueDate.getUTCMonth(),
          invoice.dueDate.getUTCDate(),
        ),
      );
      const rawDelta = daysBetweenUtc(dueDate, today); // today - due
      const dpd = Math.max(0, rawDelta);
      const daysUntilDue = rawDelta < 0 ? -rawDelta : 0;

      const thresholds = readAgingThresholds(invoice.product?.factoringConfig);
      const bucket = classifyBucket(dpd, daysUntilDue, thresholds);

      result.byBucket[bucket] += 1;

      const previousBucket = readPreviousBucket(invoice.metadata);
      const isTransition = previousBucket !== bucket;
      const isFirstDefault = bucket === 'Default' && previousBucket !== 'Default';

      if (isTransition) {
        result.transitions += 1;
        const action = describeBucketAction(bucket, invoice.id);
        if (action) this.logger.log(action);
      }

      if (isFirstDefault) {
        result.newDefaults.push(invoice.id);
      }

      // Persist aging metadata BEFORE invoking recourse so the metadata
      // breadcrumb (`defaultThresholdCrossedAt`) is durable even if recourse
      // fails — operators can manually re-trigger from the breadcrumb.
      await this.persistAgingMetadata({
        invoice,
        bucket,
        previousBucket,
        isFirstDefault,
        now: new Date(),
      });

      // Phase 3E integration: drive the actual default workflow when an
      // invoice first crosses the threshold. RecourseService handles the
      // status transition to `defaulted`, ledger entries, debtor exposure
      // adjustment, and event emission. Wrapped per-invoice so one default
      // failure doesn't abort the whole tenant scan.
      if (isFirstDefault) {
        try {
          await this.recourseService.enforceDefault(tenantId, invoice.id, { dpd });
        } catch (err) {
          this.logger.error(
            `enforceDefault failed for invoice ${invoice.id} (dpd=${dpd}): ${(err as Error).message}. Invoice flagged via metadata.defaultThresholdCrossedAt; operator must drive recourse manually.`,
          );
        }
      }
    }

    return result;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  /**
   * Merge aging breadcrumbs into `invoice.metadata` without clobbering
   * unrelated keys. Always writes `agingLastCheckedAt`. Writes
   * `agingBucket` only on transition (so a no-op run produces a single
   * timestamp update). Writes `defaultThresholdCrossedAt` once, on the
   * first crossing into Default.
   */
  private async persistAgingMetadata(args: {
    invoice: Pick<Invoice, 'id' | 'metadata'>;
    bucket: AgingBucket;
    previousBucket: AgingBucket | null;
    isFirstDefault: boolean;
    now: Date;
  }): Promise<void> {
    const { invoice, bucket, previousBucket, isFirstDefault, now } = args;
    const base =
      (invoice.metadata as Record<string, unknown> | null | undefined) ?? {};
    const next: Record<string, unknown> = {
      ...base,
      agingLastCheckedAt: now.toISOString(),
    };
    if (previousBucket !== bucket) {
      next.agingBucket = bucket;
    }
    if (isFirstDefault) {
      next.defaultThresholdCrossedAt = now.toISOString();
    }

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { metadata: next as Prisma.InputJsonValue },
    });
  }
}

/**
 * Pull the prior bucket marker from `invoice.metadata.agingBucket`. Tolerates
 * missing / mistyped values (treats them as "no prior bucket recorded") so
 * the first run after deployment doesn't spuriously declare every invoice
 * a transition.
 */
function readPreviousBucket(
  metadata: Prisma.JsonValue | null | undefined,
): AgingBucket | null {
  const meta = (metadata as Record<string, unknown> | null | undefined) ?? {};
  const value = meta.agingBucket;
  if (typeof value !== 'string') return null;
  if ((AGING_BUCKETS as readonly string[]).includes(value)) {
    return value as AgingBucket;
  }
  return null;
}
