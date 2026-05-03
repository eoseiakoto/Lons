/**
 * Sprint 12 Phase 6A — Invoice aging classification types.
 *
 * The 7-bucket model comes from SPEC-invoice-factoring.md §7.1 (NOT the
 * simplified 30/60/90 used elsewhere in the platform). Keep this in sync
 * if §7.1 changes.
 */

/**
 * Aging buckets for unpaid factored invoices, ordered from least to most
 * severe. The string values double as both:
 *   - persisted markers in `invoice.metadata.agingBucket` (so we can
 *     detect transitions on subsequent runs without consulting historical
 *     log records), and
 *   - aggregation keys in {@link AgingResult.byBucket}.
 *
 * `Current` is included for completeness — invoices whose dueDate is more
 * than `graceEndDpd` days away from today. The aging job currently skips
 * these in the per-invoice scan (they're not yet "aging"), but the type
 * exposes the bucket so a future enhancement can surface a portfolio
 * "still healthy" count alongside the at-risk ones.
 */
export type AgingBucket =
  | 'Current'
  | 'Approaching'
  | 'Due'
  | 'Grace'
  | 'Overdue'
  | 'SeriouslyOverdue'
  | 'Default';

export const AGING_BUCKETS: readonly AgingBucket[] = [
  'Current',
  'Approaching',
  'Due',
  'Grace',
  'Overdue',
  'SeriouslyOverdue',
  'Default',
];

/**
 * Per-tenant config knobs for aging thresholds, sourced from
 * `product.factoringConfig.agingThresholds`. All values are whole-day
 * counts; defaults match SPEC-invoice-factoring.md §7.1.
 */
export interface AgingThresholds {
  /** Last DPD in the Grace bucket. Default: 7. */
  graceEndDpd: number;
  /** Last DPD in the Overdue bucket. Default: 30. */
  overdueEndDpd: number;
  /** Last DPD in the Seriously Overdue bucket. Default: 60. */
  seriouslyOverdueEndDpd: number;
  /**
   * Configurable cut-over to Default. Defaults to
   * `seriouslyOverdueEndDpd + 1`, but can be set higher to extend the
   * collection window before recourse fires.
   */
  defaultDpd: number;
}

export const DEFAULT_AGING_THRESHOLDS: AgingThresholds = {
  graceEndDpd: 7,
  overdueEndDpd: 30,
  seriouslyOverdueEndDpd: 60,
  defaultDpd: 60,
};

/**
 * Summary of a single tenant's aging pass. Aggregated by the scheduler
 * across tenants for the daily run summary.
 */
export interface AgingResult {
  /** Total active invoices examined this run. */
  totalScanned: number;
  /** Counts of invoices that landed in each bucket this run. */
  byBucket: Record<AgingBucket, number>;
  /**
   * Invoice IDs that crossed into the Default bucket FOR THE FIRST TIME
   * this run. The integration layer (Phase 3E RecourseService) reads this
   * list to invoke `enforceDefault` on each.
   */
  newDefaults: string[];
  /** Count of invoices whose bucket changed since the previous run. */
  transitions: number;
}
