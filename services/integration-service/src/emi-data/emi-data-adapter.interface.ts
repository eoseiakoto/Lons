/**
 * S17-1 / FR-DI-001.1 — EMI (Electronic Money Issuer) data-pull adapter.
 *
 * All implementations (mock, MTN MoMo, M-Pesa, generic REST) MUST conform
 * to this interface so the {@link EmiDataService} can swap providers
 * transparently. The service layer wraps every call in circuit-breaker +
 * retry semantics and persists the resulting snapshot into
 * `customer_financial_data` so scoring stays available even if the EMI is
 * down at scoring time.
 *
 * All monetary amounts are decimal strings (never `number`) per CLAUDE.md.
 */
export interface IEmiDataAdapter {
  /** Pull transaction history for a customer from the EMI. */
  getTransactionHistory(
    walletId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<EmiTransaction[]>;

  /** Pull current wallet balance. */
  getWalletBalance(walletId: string): Promise<EmiBalance>;

  /** Pull income pattern analysis (deposits classified as income). */
  getIncomePatterns(
    walletId: string,
    periodDays: number,
  ): Promise<EmiIncomePattern>;

  /** Pull full customer financial snapshot for scoring. */
  getFinancialSnapshot(walletId: string): Promise<EmiFinancialSnapshot>;

  /** Health check — returns true if the EMI is reachable. */
  isAvailable(): Promise<boolean>;

  /** Identifies the underlying provider (e.g. 'mock', 'mtn_momo'). */
  getProvider(): string;
}

export const EMI_DATA_ADAPTER = 'EMI_DATA_ADAPTER';

// ─────────────────────────────────────────────────────────────────────────
// DTOs — wire format crossing the integration boundary.
// All amounts are decimal strings per CLAUDE.md money rules.
// ─────────────────────────────────────────────────────────────────────────

export interface EmiTransaction {
  transactionId: string;
  type: 'credit' | 'debit';
  /** Decimal string (e.g. "1234.5678"). */
  amount: string;
  currency: string;
  /** Optional categorisation, e.g. 'salary', 'transfer', 'merchant', 'utility'. */
  category?: string;
  counterpartyId?: string;
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
}

export interface EmiBalance {
  walletId: string;
  /** Decimal string. */
  currentBalance: string;
  currency: string;
  asOf: Date;
}

export interface EmiIncomePattern {
  walletId: string;
  periodDays: number;
  /** Decimal string. */
  totalIncome: string;
  transactionCount: number;
  /** % of days in period that had income deposits (0-100). */
  depositRegularity: number;
  /** Stddev of deposit amounts divided by mean (lower = more consistent). */
  incomeVolatility: number;
  /** Decimal string. */
  averageDeposit: string;
  lastDepositDate: Date | null;
}

export interface EmiFinancialSnapshot {
  walletId: string;
  /** Decimal string. */
  currentBalance: string;
  currency: string;
  /** Average daily balance over last 90 days (decimal string). */
  averageBalance90d: string;
  /** Average daily balance over last 30 days (decimal string). */
  averageBalance30d: string;
  /** Total transactions in last 30 days. */
  transactionCount30d: number;
  /** Total transactions in last 90 days. */
  transactionCount90d: number;
  /** Income consistency score (0-100) based on deposit regularity. */
  incomeConsistency: number;
  /** Ratio of income to expenses (>1 means net positive). Decimal string. */
  incomeExpenseRatio: string;
  fetchedAt: Date;
}
