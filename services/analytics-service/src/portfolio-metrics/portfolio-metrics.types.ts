/**
 * S18-10 — Portfolio metrics types.
 *
 * The output shape is a strict superset of the existing
 * `PortfolioMetrics` returned by `@lons/process-engine`'s AnalyticsService
 * — same field names, same Decimal-string semantics — so Track A's GraphQL
 * resolver can swap providers without breaking any consumer.
 *
 * Aggregate-only by contract: PII never leaks here. Per CLAUDE.md, every
 * value is either a count or a DECIMAL(19,4) string; we never include
 * customer IDs, names, or other identifiers in the response.
 */

export interface PortfolioMetricsFilters {
  /** Filter by a specific product ID. */
  productId?: string | null;
  /** Filter by product type ('micro_loan' | 'overdraft' | 'bnpl' | 'invoice_financing'). */
  productType?: string | null;
  lenderId?: string | null;
  region?: string | null;
  customerSegment?: string | null;
  /** Lower bound for contract.createdAt (inclusive). */
  dateFrom?: Date | null;
  /** Upper bound for contract.createdAt (inclusive). */
  dateTo?: Date | null;
}

export interface ParBucket {
  count: number;
  amount: string;
  pct: string;
}

export interface ProvisioningBreakdown {
  performing: string;
  specialMention: string;
  substandard: string;
  doubtful: string;
  loss: string;
  total: string;
}

export interface PortfolioMetrics {
  activeLoans: number;
  activeOutstanding: string;
  parAt1: ParBucket;
  parAt7: ParBucket;
  parAt30: ParBucket;
  parAt60: ParBucket;
  parAt90: ParBucket;
  nplRatio: string;
  provisioning: ProvisioningBreakdown;
}
