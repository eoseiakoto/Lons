/**
 * Type definitions for the reserve / debtor-payment flow
 * (Sprint 12 Phase 3D). See SPEC-invoice-factoring.md §6.
 *
 * All monetary values are Decimal-as-string per CLAUDE.md.
 */

/**
 * Input payload accepted by `ReserveService.recordDebtorPayment`.
 * One call records a single debtor payment event (full or partial). Multiple
 * calls accumulate against `invoice.amountReceived` until the full face value
 * is reached, at which point the invoice transitions to `payment_received`.
 */
export interface RecordDebtorPaymentInput {
  /**
   * Decimal-as-string. Must be strictly positive — pass the amount of THIS
   * payment event, not a running total.
   */
  amountReceived: string;
  /** External payment reference (bank ref, mobile-money txn id, etc.). */
  paymentRef: string;
  /** SP operator who recorded the payment. */
  operatorId: string;
  /**
   * Idempotency key for this payment event. Replays with the same key
   * return the current invoice without re-applying the payment.
   */
  idempotencyKey: string;
}

/**
 * Input payload accepted by `ReserveService.releaseReserve`.
 *
 * `operatorId` is required when the product config or invoice context
 * forces the manual-approval path (high face-value, etc.); it is
 * optional for the auto-release fast path.
 */
export interface ReleaseReserveInput {
  /** Required when manual approval is in force; optional otherwise. */
  operatorId?: string;
  /**
   * Idempotency key for this release event. Replays after a successful
   * release return the invoice unchanged.
   */
  idempotencyKey: string;
}
