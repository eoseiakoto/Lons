/**
 * Type definitions for the ConcentrationLimitService (Sprint 12 Phase 3F).
 * See SPEC-invoice-factoring.md §2.4.
 *
 * All monetary amounts and percentages are Decimal-as-string per CLAUDE.md.
 */

import type { ConcentrationLimitType } from '@lons/event-contracts';

/**
 * Input to `ConcentrationLimitService.checkLimits`. Mirrors the shape passed
 * by `InvoiceSubmissionService.submit` after it has resolved the seller,
 * debtor, and product.
 */
export interface CheckLimitsInput {
  debtorId: string;
  sellerId: string;
  /** Decimal-as-string. Face value of the invoice being submitted. */
  faceValue: string;
  productId: string;
}

/**
 * One failed concentration check. The `type` string maps onto the
 * `ConcentrationLimitType` enum from `@lons/event-contracts` so consumers
 * can route it back to a typed event payload.
 *
 * Field shape is identical to the Phase 3B `ConcentrationViolation` type
 * exported from `invoice-submission.types.ts` — that file's interface stays
 * the more permissive `string` because it predates this enum landing.
 */
export interface ConcentrationViolation {
  type: ConcentrationLimitType;
  /** Decimal-as-string. The projected value that would result from accepting the invoice. */
  current: string;
  /** Decimal-as-string. The configured cap that would be exceeded. */
  max: string;
  message: string;
}

/**
 * Aggregate result returned by `checkLimits`. When `passed === false`, the
 * caller (InvoiceSubmissionService) must reject the submission and surface
 * the violations to the API client.
 */
export interface ConcentrationCheckResult {
  passed: boolean;
  violations: ConcentrationViolation[];
}

// ─── Dashboard / summary types ───────────────────────────────────────────

export interface DebtorExposureRow {
  debtorId: string;
  companyName: string;
  /** Decimal-as-string. */
  totalExposure: string;
  /** Decimal-as-string percent in [0, 100], 2dp. */
  percentOfPortfolio: string;
}

export interface IndustryExposureRow {
  /** Industry sector code/label. `null` when grouping invoices whose debtor has no sector set. */
  industrySector: string | null;
  /** Decimal-as-string. */
  totalExposure: string;
  /** Decimal-as-string percent in [0, 100], 2dp. */
  percentOfPortfolio: string;
  debtorCount: number;
}

export interface SellerDebtorExposureRow {
  sellerId: string;
  debtorId: string;
  /** Decimal-as-string. */
  totalExposure: string;
  /** Decimal-as-string percent in [0, 100], 2dp. */
  percentOfPortfolio: string;
}

export interface LimitUtilizationRow {
  type: ConcentrationLimitType;
  /** Decimal-as-string. The configured cap. Percent for the `_percent` types, absolute for `debtor_absolute`. */
  max: string;
  /**
   * Decimal-as-string. The current observed value (peak across the relevant
   * dimension — e.g. for `debtor_percent` this is the largest debtor's
   * percent-of-portfolio).
   */
  current: string;
  /** Decimal-as-string percent in [0, 100], 2dp. `current / max * 100`. */
  utilizationPercent: string;
}

export interface ConcentrationSummary {
  topDebtors: DebtorExposureRow[];
  industryBreakdown: IndustryExposureRow[];
  topSellerDebtors: SellerDebtorExposureRow[];
  limitUtilization: LimitUtilizationRow[];
}
