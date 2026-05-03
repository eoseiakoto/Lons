/**
 * Type definitions for the Recourse enforcement / non-recourse write-off
 * flow (Sprint 12 Phase 3E). See SPEC-invoice-factoring.md §5.
 *
 * Both monetary amounts and "loss" values are Decimal-as-string per
 * CLAUDE.md — never coerced through Number / parseFloat.
 */

/** Optional input to `RecourseService.enforceDefault`. */
export interface EnforceDefaultInput {
  /**
   * Days-past-due to record on the default event. When omitted the
   * service falls back to `today − dueDate` (UTC midnight to UTC
   * midnight). Callers like the aging scan typically supply their own
   * DPD so the value matches the bucket that triggered the default.
   */
  dpd?: number;
}

/**
 * Result of `RecourseService.enforceDefault`. A discriminated union
 * keyed on `recourseType` so callers can narrow without re-querying
 * the invoice.
 */
export type EnforceDefaultResult =
  | EnforceDefaultWithRecourseResult
  | EnforceDefaultWithoutRecourseResult;

export interface EnforceDefaultWithRecourseResult {
  recourseType: 'with_recourse';
  /**
   * `'grace_period_started'` for the first call against an active
   * invoice. When the call is idempotent (already-defaulted invoice)
   * the action is `'already_defaulted'` and the original grace fields
   * are echoed back.
   */
  action: 'grace_period_started' | 'already_defaulted';
  /** ISO 8601 timestamp when the grace period closes. */
  graceEndAt: string;
  /** Decimal string — face value minus payments received. */
  amountToRecover: string;
}

export interface EnforceDefaultWithoutRecourseResult {
  recourseType: 'without_recourse';
  action: 'written_off' | 'already_defaulted';
  /** Decimal string — `advancedAmount − amountReceived`, floored at 0. */
  lossAmount: string;
  /** Decimal string — unreleased reserve handed back to the seller. */
  reserveReturnedToSeller: string;
}

/**
 * Result of `RecourseService.enforceGracePeriodElapsed`.
 *
 * v1: always routes to collections (mock wallet deduction). The
 * discriminated `action` leaves room for a `wallet_deducted` branch
 * when Phase 6+ wires the real wallet adapter.
 */
export interface EnforceGracePeriodElapsedResult {
  action: 'collections_routed' | 'wallet_deducted';
  /** Decimal string — amount targeted for recovery from the seller. */
  amount: string;
}
