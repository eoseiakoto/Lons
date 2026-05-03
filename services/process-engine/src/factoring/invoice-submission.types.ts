/**
 * Type definitions for the Invoice submission + verification flow
 * (Sprint 12 Phase 3B). See SPEC-invoice-factoring.md §3 / §4.
 */

import type { Prisma, RecourseType } from '@lons/database';

/**
 * Input payload accepted by `InvoiceSubmissionService.submit`.
 *
 * All monetary values are Decimal-as-string per CLAUDE.md.
 * Dates are ISO 8601 calendar dates (`YYYY-MM-DD`).
 */
export interface SubmitInvoiceInput {
  /** Idempotency key — repeated submissions with the same key return the same invoice. */
  idempotencyKey: string;
  /** Customer ID of the seller (the entity factoring its receivable). */
  sellerId: string;
  /** Debtor (buyer) ID. Must already exist — debtor pre-existence is required in v1.0. */
  debtorId: string;
  /** Invoice-financing product ID. */
  productId: string;
  /** Seller's invoice number — unique per [tenantId, sellerId]. */
  invoiceNumber: string;
  /** ISO 8601 date string (`YYYY-MM-DD`). */
  issueDate: string;
  /** ISO 8601 date string (`YYYY-MM-DD`). Must be strictly future. */
  dueDate: string;
  /** Decimal-as-string (e.g. `"100000.00"`). Must be positive. */
  faceValue: string;
  /** ISO 4217 currency code (e.g. `"GHS"`). */
  currency: string;
  /** Optional supporting documents (invoice PDF, delivery note, etc.). */
  documents?: Prisma.InputJsonValue;
  /** Free-form metadata stored alongside the invoice. */
  metadata?: Prisma.InputJsonValue;
  /** Recourse model. Defaults to `with_recourse` when omitted. */
  recourseType?: RecourseType;
}

/**
 * Result of a concentration-limit pre-check. Phase 3B emits a stub
 * implementation that always passes — Phase 3F replaces it with the
 * real ConcentrationLimitService.
 */
export interface ConcentrationCheckResult {
  passed: boolean;
  violations: ConcentrationViolation[];
}

export interface ConcentrationViolation {
  type: string;
  /** Decimal-as-string. */
  current: string;
  /** Decimal-as-string. */
  max: string;
  message: string;
}
