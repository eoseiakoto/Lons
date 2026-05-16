/**
 * Sprint 16 (S16-8) — early settlement product config + quote types.
 *
 * Stored on `product.feeStructure.earlySettlement` (JSON column already
 * on the schema). The shape isn't enforced by a Prisma model — products
 * created before S16-8 have an empty `feeStructure` and fall back to
 * DEFAULT_EARLY_SETTLEMENT_CONFIG.
 *
 * Money is Decimal-as-string per CLAUDE.md. `interestRebatePercent`
 * and `settlementFeeValue` are percentages or amounts depending on
 * `settlementFeeType` — the service reads + validates at call time.
 */
export interface IEarlySettlementConfig {
  /** Whether early settlement is allowed for this product. */
  allowed: boolean;
  /**
   * Percentage (0-100, Decimal-as-string) of remaining future interest
   * to rebate to the customer. e.g. `'50'` refunds half the unearned
   * interest. `'0'` = no rebate (full interest still owed at payoff).
   */
  interestRebatePercent: string;
  /** `flat` = absolute amount; `percentage` = % of remaining principal. */
  settlementFeeType: 'flat' | 'percentage';
  /**
   * Decimal-as-string. When `settlementFeeType === 'flat'`, this is an
   * absolute currency amount. When `percentage`, this is a percent of
   * the remaining principal (e.g. `'1.5'` = 1.5%).
   */
  settlementFeeValue: string;
  /**
   * Minimum remaining tenor (days) the customer must still have on the
   * contract to qualify. `0` = always allowed. Used to prevent
   * early-settlement abuse on very short remaining periods.
   */
  minRemainingDays: number;
}

export const DEFAULT_EARLY_SETTLEMENT_CONFIG: IEarlySettlementConfig = {
  allowed: true,
  interestRebatePercent: '0',
  settlementFeeType: 'flat',
  settlementFeeValue: '0',
  minRemainingDays: 0,
};

export interface IEarlySettlementBreakdownItem {
  label: string;
  /** Decimal-as-string. */
  amount: string;
  /** `debit` = customer owes; `credit` = customer is refunded. */
  type: 'debit' | 'credit';
}

export interface IEarlySettlementQuote {
  contractId: string;
  /** Decimal-as-string. */
  remainingPrincipal: string;
  accruedInterest: string;
  interestRebate: string;
  settlementFee: string;
  totalSettlementAmount: string;
  /** ISO 8601 — quote valid through end of current UTC day. */
  validUntil: string;
  breakdown: IEarlySettlementBreakdownItem[];
}
