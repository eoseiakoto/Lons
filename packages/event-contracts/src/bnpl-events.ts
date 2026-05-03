/**
 * BNPL event payloads (Sprint 11 Track B).
 *
 * Every monetary field is a Decimal-as-string per CLAUDE.md — never a
 * number. These are the *data* portions of events; the standard envelope
 * (`event`, `tenantId`, `timestamp`, `correlationId`) is added by
 * `EventBusService.emitAndBuild` from `@lons/common`.
 */

/** Emitted when a merchant submits a purchase but it has not yet been scored. */
export interface IBnplPurchaseInitiatedEvent {
  transactionId: string;
  merchantId: string;
  customerId: string;
  productId: string;
  /** Decimal string. */
  purchaseAmount: string;
  currency: string;
  numberOfInstallments: number;
  purchaseRef: string;
}

/** Emitted when scoring + pre-qualification accepts a purchase and the schedule is generated. */
export interface IBnplPurchaseApprovedEvent {
  transactionId: string;
  merchantId: string;
  customerId: string;
  /** Decimal string. */
  purchaseAmount: string;
  /** Decimal string. */
  totalRepayable: string;
  currency: string;
  numberOfInstallments: number;
  /** Decimal string (annual rate). 0 for interest-free promos. */
  interestRate: string;
  purchaseRef: string;
  /** ISO 8601 date of the first installment due. */
  firstInstallmentDueDate: string;
}

/** Emitted when a purchase is rejected (KYC, scoring, default-on-record). */
export interface IBnplPurchaseDeclinedEvent {
  merchantId: string;
  customerId: string;
  /** Decimal string. */
  purchaseAmount: string;
  currency: string;
  purchaseRef: string;
  reason: string;
}

/** Emitted when every installment on a transaction has been paid. */
export interface IBnplPurchaseCompletedEvent {
  transactionId: string;
  customerId: string;
  /** Decimal string — what the customer paid in total. */
  totalRepaid: string;
  /** ISO 8601 timestamp. */
  completedAt: string;
}

/** Emitted on operator/customer cancellation before any installments are due. */
export interface IBnplPurchaseCancelledEvent {
  transactionId: string;
  customerId: string;
  reason: string;
}

/** Emitted N days before an installment's due date by the scheduler. */
export interface IBnplInstallmentDueEvent {
  transactionId: string;
  installmentId: string;
  installmentNumber: number;
  customerId: string;
  /** Decimal string. */
  amount: string;
  currency: string;
  /** ISO 8601 date. */
  dueDate: string;
}

/** Emitted when an installment is fully paid. */
export interface IBnplInstallmentPaidEvent {
  transactionId: string;
  installmentId: string;
  installmentNumber: number;
  customerId: string;
  /** Decimal string. */
  amount: string;
  /** ISO 8601 timestamp. */
  paidAt: string;
}

/** Emitted by the scheduler when an installment passes its due date unpaid. */
export interface IBnplInstallmentOverdueEvent {
  transactionId: string;
  installmentId: string;
  installmentNumber: number;
  customerId: string;
  /** Decimal string. */
  amount: string;
  daysPastDue: number;
  /**
   * Decimal string. Currently always `'0'` — Sprint 12 will populate
   * this from `product.bnplConfig.lateFee`. Keeping the field stable
   * now so subscribers (notification-service) don't break later.
   */
  lateFeeAmount: string;
}

/**
 * Emitted by the BNPL auto-collection scheduler when a wallet collection
 * succeeds and an installment is closed (Sprint 12 G2). Distinct from
 * `bnpl.installment.paid` — the latter fires for both manual and
 * auto-collection paths once the installment hits zero balance, while
 * `bnpl.installment.collected` records the *automated wallet pull*
 * specifically (subscribers can use it for collection-channel analytics).
 */
export interface IBnplInstallmentCollectedEvent {
  transactionId: string;
  installmentId: string;
  customerId: string;
  /** Decimal string. */
  amount: string;
  currency: string;
}

/**
 * Emitted by the BNPL auto-collection scheduler when a wallet collection
 * attempt fails (Sprint 12 G2). `attempt` is the cumulative attempt count
 * after this failure (1 for the first failure). `reason` is the wallet
 * adapter's failure code (e.g. `insufficient_balance`).
 */
export interface IBnplInstallmentCollectionFailedEvent {
  transactionId: string;
  installmentId: string;
  customerId: string;
  /** Decimal string — the amount the scheduler attempted to collect. */
  amount: string;
  currency: string;
  reason: string;
  attempt: number;
}

/** Emitted on operator-driven installment waiver (e.g. partial-refund offset). */
export interface IBnplInstallmentWaivedEvent {
  transactionId: string;
  installmentId: string;
  installmentNumber: number;
  /** Decimal string. */
  amount: string;
  reason: string;
  operatorId: string;
}

/** Emitted when consecutive missed installments cross the configured threshold. */
export interface IBnplAcceleratedEvent {
  transactionId: string;
  customerId: string;
  /** Decimal string — sum of remaining unpaid installments. */
  acceleratedBalance: string;
  missedInstallments: number;
}

/** Emitted when a settlement row is created (IMMEDIATE: at origination; T+1: at batch run). */
export interface IBnplMerchantSettlementGeneratedEvent {
  settlementId: string;
  merchantId: string;
  /** Decimal string — sum of purchase amounts in the settlement. */
  grossAmount: string;
  /** Decimal string — platform discount fee. */
  discountFee: string;
  /** Decimal string — what the merchant receives. */
  netAmount: string;
  currency: string;
  transactionCount: number;
  /** ISO 8601 date. */
  periodStart: string;
  /** ISO 8601 date. */
  periodEnd: string;
}

/** Emitted when the wallet adapter confirms the settlement disbursement. */
export interface IBnplMerchantSettlementCompletedEvent {
  settlementId: string;
  merchantId: string;
  /** Decimal string. */
  netAmount: string;
  walletRef: string;
  /** ISO 8601 timestamp. */
  settledAt: string;
}

/** Emitted when the wallet adapter fails to disburse the settlement. */
export interface IBnplMerchantSettlementFailedEvent {
  settlementId: string;
  merchantId: string;
  /** Decimal string. */
  netAmount: string;
  reason: string;
}

/** Emitted when a refund flow starts (full or partial). */
export interface IBnplRefundInitiatedEvent {
  transactionId: string;
  customerId: string;
  merchantId: string;
  /** Decimal string. */
  refundAmount: string;
  /** "full" or "partial". */
  refundType: 'full' | 'partial';
  reason: string;
}

/** Emitted when the refund flow completes (customer reimbursement + merchant clawback). */
export interface IBnplRefundCompletedEvent {
  transactionId: string;
  customerId: string;
  merchantId: string;
  /** Decimal string. */
  refundedToCustomer: string;
  /** Decimal string. */
  clawedBackFromMerchant: string;
  /** ISO 8601 timestamp. */
  completedAt: string;
}

/**
 * Emitted when a transaction is accelerated and the recovery service
 * should pick it up for collections work (Sprint 11 Track B FIX 7).
 * Without this, accelerated transactions had no follow-through path.
 */
export interface IBnplCollectionsReferredEvent {
  transactionId: string;
  customerId: string;
  merchantId: string;
  /** Decimal string — sum of remaining unpaid installments at acceleration. */
  acceleratedBalance: string;
  /** Number of consecutive missed installments that triggered acceleration. */
  missedInstallments: number;
  /** Decimal string — current total owed (will diverge from acceleratedBalance once late fees land in Sprint 12). */
  totalOwed: string;
  /** ISO 8601 timestamp. */
  referredAt: string;
}

/**
 * Emitted when a customer pays off all remaining BNPL installments
 * early (Sprint 12 G3). The transaction transitions to `completed`,
 * every pending installment is marked `paid`, and an optional
 * configurable discount may be applied per
 * `bnplConfig.earlySettlementDiscountPercent`.
 */
export interface IBnplEarlySettlementEvent {
  transactionId: string;
  customerId: string;
  /** Decimal string — what the customer paid (already net of discount). */
  settlementAmount: string;
  /** Decimal string — the discount the customer received (0 if none). */
  discountApplied: string;
  /** Number of installments closed by this settlement. */
  installmentsClosed: number;
  currency: string;
}

/**
 * Emitted when a customer pays one or more future installments ahead
 * of their due date without settling the entire transaction
 * (Sprint 12 G3). The transaction stays active and the remaining
 * installments retain their original due dates.
 */
export interface IBnplAdvancePaymentEvent {
  transactionId: string;
  customerId: string;
  /** Installment numbers that were paid in advance. */
  installmentNumbers: number[];
  /** Decimal string — sum of the paid installments. */
  totalPaid: string;
  currency: string;
}
