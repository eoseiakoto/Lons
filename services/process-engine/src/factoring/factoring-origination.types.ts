/**
 * Type definitions for the Factoring origination state-machine
 * (Sprint 12 Phase 3C). See SPEC-invoice-factoring.md §4 / §5.
 *
 * All monetary values are Decimal-as-string per CLAUDE.md.
 */

import type { RecourseType } from '@lons/database';

/**
 * Optional inputs the seller may pass to `generateOffer`.
 *
 * `requestedRecourseType === 'without_recourse'` triggers the
 * non-recourse eligibility check (spec §5.3). When the debtor
 * doesn't qualify, the offer falls back to `with_recourse` —
 * this is intentional, not an error.
 */
export interface GenerateOfferInput {
  requestedRecourseType?: RecourseType;
}

/**
 * The factoring offer presented to the seller. The Invoice record on
 * disk carries the same numbers; this shape is what consumers (GraphQL
 * resolvers, API responses) read after `generateOffer` returns.
 */
export interface InvoiceOffer {
  invoiceId: string;
  /** Decimal string. */
  faceValue: string;
  /** Decimal string (percent). */
  advanceRatePercent: string;
  /** Decimal string. */
  advancedAmount: string;
  /** Decimal string. */
  reserveAmount: string;
  /** Decimal string. */
  discountFee: string;
  /** Decimal string. */
  serviceFee: string;
  /** Decimal string. */
  netDisbursement: string;
  recourseType: RecourseType;
  /** ISO 8601 calendar date. */
  dueDate: string;
  currency: string;
  /** ISO 8601 timestamp — 24h from offer generation. */
  expiresAt?: string;
}

/**
 * Snapshot of the inputs that drive `disburseAdvance` contract creation.
 * Used internally to keep the method signature focused; not part of the
 * service's public surface area.
 */
export interface FactoringContractInput {
  /** Decimal string. */
  principalAmount: string;
  /** Decimal string (annual percent). */
  interestRate: string;
  /** Decimal string. */
  interestAmount: string;
  /** Decimal string. */
  totalFees: string;
  tenorDays: number;
  startDate: Date;
  maturityDate: Date;
  currency: string;
}
