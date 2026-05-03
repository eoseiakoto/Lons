/**
 * Overdraft event payloads (Sprint 10B).
 *
 * Every monetary field is a Decimal-as-string per CLAUDE.md — never a
 * number. These are the *data* portions of events; the standard envelope
 * (`event`, `tenantId`, `timestamp`, `correlationId`) is added by
 * `EventBusService.emitAndBuild` from `@lons/common`.
 */

/** Emitted after `creditline.activated`: a new credit line has been created and is ready for drawdowns. */
export interface ICreditLineActivatedEvent {
  creditLineId: string;
  customerId: string;
  productId: string;
  /** Decimal string. */
  approvedLimit: string;
  /** Decimal string (e.g. "0.0250" for 2.5% annual). */
  interestRate: string;
  /** ISO 8601 timestamp. */
  expiresAt: string;
}

/**
 * Emitted after `creditline.drawdown.completed`: the wallet provider has
 * successfully disbursed the shortfall and the credit line balances are
 * updated. The corresponding `CreditLineDrawdownInitiated` is emitted
 * earlier in the flow.
 */
export interface ICreditLineDrawdownCompletedEvent {
  creditLineId: string;
  drawdownId: string;
  customerId: string;
  /** Drawdown principal (the shortfall covered, exclusive of fee). */
  amount: string;
  /** Per-transaction fee, separately tracked in `feesOutstanding`. */
  feeAmount: string;
  /** Updated `availableBalance` on the credit line. */
  newAvailableBalance: string;
  /** Updated `outstandingAmount` (principal only). */
  newOutstandingAmount: string;
  /** Wallet provider's reference for the original transaction that triggered the drawdown. */
  transactionRef: string;
}

/**
 * Emitted after `creditline.repayment.auto_collected`: a wallet credit was
 * applied to outstanding overdraft balances per the configured waterfall.
 * Sum of allocated portions equals `totalCollected` exactly (Decimal math).
 */
export interface ICreditLineRepaymentAutoCollectedEvent {
  creditLineId: string;
  customerId: string;
  /** Total collected from the wallet credit. */
  totalCollected: string;
  /** Sum of these four equals `totalCollected`. */
  allocatedPrincipal: string;
  allocatedInterest: string;
  allocatedFees: string;
  allocatedPenalties: string;
  newOutstandingAmount: string;
  newAvailableBalance: string;
}

/** Emitted after `creditline.limit.changed`: any limit adjustment with reason context. */
export interface ICreditLineLimitChangedEvent {
  creditLineId: string;
  customerId: string;
  previousLimit: string;
  newLimit: string;
  /** One of: initial_assignment, periodic_review, behavior_upgrade, behavior_downgrade, manual_adjustment, overdue_reduction, fraud_freeze, regulatory_cap. */
  reasonCode: string;
  /** scoring_engine | scheduler | operator:{userId} | system. */
  triggeredBy: string;
}

/**
 * Emitted by the integration service when a wallet provider reports an
 * insufficient-balance event for a transaction. Consumed by the overdraft
 * service's drawdown flow.
 */
export interface IWalletBalanceInsufficientEvent {
  customerId: string;
  /** Wallet account identifier (provider-specific, mapped to customer/tenant via integration service). */
  walletId: string;
  /** Original transaction amount the customer attempted. */
  transactionAmount: string;
  /** Wallet's available balance at the time of the request. */
  availableBalance: string;
  /** `transactionAmount - availableBalance` — what the overdraft must cover. */
  shortfall: string;
  /** Wallet provider's transaction reference for audit and reconciliation. */
  transactionRef: string;
  /** e.g. "mtn_momo", "mpesa". */
  walletProvider: string;
}
