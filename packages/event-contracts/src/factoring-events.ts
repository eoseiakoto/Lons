/**
 * Invoice Factoring event payloads (Sprint 12).
 *
 * Every monetary field is a Decimal-as-string per CLAUDE.md — never a
 * number. These are the *data* portions of events; the standard envelope
 * (`event`, `tenantId`, `timestamp`, `correlationId`) is added by
 * `EventBusService.emitAndBuild` from `@lons/common`.
 *
 * Spec: `Docs/SPEC-invoice-factoring.md` §9.
 */

// ─── Invoice lifecycle (16) ──────────────────────────────────────────────

/** Seller submits an invoice for factoring. */
export interface IInvoiceSubmittedEvent {
  invoiceId: string;
  sellerId: string;
  debtorId: string;
  productId: string;
  invoiceNumber: string;
  /** Decimal string. */
  faceValue: string;
  currency: string;
  /** ISO 8601 date. */
  issueDate: string;
  /** ISO 8601 date. */
  dueDate: string;
}

/** Manual verification routed an invoice into the operator review queue. */
export interface IInvoiceUnderReviewEvent {
  invoiceId: string;
  sellerId: string;
  debtorId: string;
  reason: 'manual_amount_threshold' | 'new_seller' | 'new_debtor' | 'risk_flag';
}

/** Verification (auto or manual) approved the invoice. */
export interface IInvoiceVerifiedEvent {
  invoiceId: string;
  verificationStatus: 'verified' | 'waived';
  verifiedBy?: string;
}

/** Verification rejected the invoice. */
export interface IInvoiceRejectedEvent {
  invoiceId: string;
  reason: string;
  rejectedBy?: string;
}

/** Origination engine produced a factoring offer. */
export interface IInvoiceOfferGeneratedEvent {
  invoiceId: string;
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
  recourseType: 'with_recourse' | 'without_recourse';
}

export interface IInvoiceOfferAcceptedEvent {
  invoiceId: string;
  acceptedBy: string;
}

export interface IInvoiceOfferDeclinedEvent {
  invoiceId: string;
  declinedBy?: string;
}

/** Advance disbursed to the seller; contract opened. */
export interface IInvoiceFundedEvent {
  invoiceId: string;
  contractId: string;
  /** Decimal string. */
  advancedAmount: string;
  /** Decimal string. */
  reserveAmount: string;
  /** Decimal string. */
  netDisbursement: string;
  currency: string;
}

/** Debtor was notified of the assignment of receivables. */
export interface IInvoiceDebtorNotifiedEvent {
  invoiceId: string;
  debtorId: string;
  /** ISO 8601 timestamp. */
  notifiedAt: string;
  channel: 'email' | 'sms' | 'postal';
}

/** Full payment received from debtor. */
export interface IInvoicePaymentReceivedEvent {
  invoiceId: string;
  /** Decimal string. */
  amountReceived: string;
  paymentRef: string;
  /** Decimal string — running total received so far. */
  totalReceivedToDate: string;
  isPartial: false;
}

/** Partial payment received from debtor. */
export interface IInvoicePaymentPartialEvent {
  invoiceId: string;
  /** Decimal string — this payment only. */
  amountReceived: string;
  paymentRef: string;
  /** Decimal string — running total received so far. */
  totalReceivedToDate: string;
  /** Decimal string — face value still outstanding. */
  remainingFaceValue: string;
  isPartial: true;
}

/** Inbound debtor-payment webhook successfully matched to an invoice. */
export interface IDebtorPaymentMatchedEvent {
  invoiceId: string;
  /** Decimal-as-string. */
  amount: string;
  currency: string;
  /** Provider's transaction ref. */
  transactionRef: string;
  matchStrategy: 'invoice_number' | 'debtor_ref' | 'fifo';
}

/** Inbound debtor-payment webhook could not be matched to an invoice. */
export interface IDebtorPaymentUnmatchedEvent {
  /** Provider's transaction ref. */
  transactionRef: string;
  /** Decimal-as-string. */
  amount: string;
  currency: string;
  reason: 'no_matching_invoice' | 'currency_mismatch' | 'invoice_not_active';
}

/** Reserve held back at funding time was released to the seller. */
export interface IInvoiceReserveReleasedEvent {
  invoiceId: string;
  /** Decimal string. */
  releasedAmount: string;
  /** Decimal string — cumulative released to date. */
  totalReleased: string;
  releasedBy?: string;
}

/** Invoice fully settled — seller paid out, contract closed. */
export interface IInvoiceSettledEvent {
  invoiceId: string;
  contractId: string;
  /** ISO 8601 timestamp. */
  settledAt: string;
}

/** Seller or operator flagged the invoice as disputed. */
export interface IInvoiceDisputedEvent {
  invoiceId: string;
  reason: string;
  raisedBy: string;
}

/** Invoice crossed the configured default DPD threshold. */
export interface IInvoiceDefaultedEvent {
  invoiceId: string;
  dpd: number;
  recourseType: 'with_recourse' | 'without_recourse';
  /** Decimal string — face value minus any received payments. */
  outstandingAmount: string;
}

export interface IInvoiceCancelledEvent {
  invoiceId: string;
  reason: string;
  cancelledBy?: string;
}

// ─── Debtor lifecycle (5) ────────────────────────────────────────────────

export interface IDebtorCreatedEvent {
  debtorId: string;
  companyName: string;
  country: string;
  industrySector?: string;
}

export interface IDebtorRiskAssessedEvent {
  debtorId: string;
  /** Decimal string (0–100). */
  internalRiskScore: string;
  averagePaymentDays?: number;
  factors: {
    /** Decimal string contribution. */
    paymentHistory?: string;
    industryRisk?: string;
    countryRisk?: string;
    concentrationRisk?: string;
  };
}

export interface IDebtorSuspendedEvent {
  debtorId: string;
  reason: string;
  suspendedBy: string;
}

export interface IDebtorBlacklistedEvent {
  debtorId: string;
  reason: string;
  blacklistedBy: string;
}

export interface IDebtorExposureChangedEvent {
  debtorId: string;
  /** Decimal string. */
  previousExposure: string;
  /** Decimal string. */
  newExposure: string;
  /** Decimal string — signed delta. */
  delta: string;
  invoiceId?: string;
}

// ─── Concentration limits (2) ────────────────────────────────────────────

export type ConcentrationLimitType =
  | 'debtor_percent'
  | 'debtor_absolute'
  | 'industry_percent'
  | 'seller_debtor_percent';

export interface IConcentrationLimitWarningEvent {
  limitType: ConcentrationLimitType;
  /** Decimal string (percent or absolute amount, depending on limitType). */
  currentValue: string;
  /** Decimal string. */
  maxValue: string;
  /** Decimal string (percent). E.g. "85.00" = 85% utilization. */
  utilizationPercent: string;
  debtorId?: string;
  industrySector?: string;
  sellerId?: string;
}

export interface IConcentrationLimitBreachedEvent {
  limitType: ConcentrationLimitType;
  /** Decimal string. */
  attemptedValue: string;
  /** Decimal string. */
  maxValue: string;
  invoiceId?: string;
  debtorId?: string;
  industrySector?: string;
  sellerId?: string;
}

// ─── Recourse / write-off (additional) ───────────────────────────────────

export interface IRecourseEnforcementInitiatedEvent {
  invoiceId: string;
  sellerId: string;
  /** Decimal string — amount being recovered from the seller. */
  amountToRecover: string;
  graceEndAt: string;
}

export interface INonRecourseWriteOffEvent {
  invoiceId: string;
  /** Decimal string — loss = advancedAmount − amountReceived. */
  lossAmount: string;
  /** Decimal string — reserve released back to seller (if any). */
  reserveReturnedToSeller: string;
}
