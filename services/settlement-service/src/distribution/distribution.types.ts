/**
 * S18-9 — Revenue distribution shared types.
 *
 * Four strategies share the same input/output contract so the dispatcher
 * in {@link RevenueDistributionService} can call them polymorphically. All
 * monetary values are Decimal strings (DECIMAL(19,4) on the wire). Never
 * coerce these to JS `number` — precision is lost beyond ~15 significant
 * digits, and banker's rounding at the strategy boundary is the only
 * place we tolerate `bankersRound` to produce a final value.
 *
 * Config shapes are documented per-model in Docs/DEV-PROMPT-SPRINT-18.md
 * §S18-9. Each strategy is responsible for its own narrow type guarding on
 * the JSON payload, because Prisma stores `config` as `Json` and we cannot
 * know the shape at compile time.
 */

import { RevenueDistributionModel } from '@lons/database';

/**
 * Context passed to {@link IRevenueDistributionStrategy.calculate}.
 *
 * `monthlyDisbursementVolume` is required for the `tiered` model; the
 * other strategies ignore it. `transactionCount` is reserved for future
 * tier dimensions (e.g. tier by request count) — none of the four shipped
 * strategies consume it yet, but threading it through keeps the contract
 * stable as new models land.
 */
export interface DistributionInput {
  totalRevenue: string;
  periodStart: Date;
  periodEnd: Date;
  monthlyDisbursementVolume?: string;
  transactionCount?: number;
}

/**
 * One row of the settlement output. The {@link SettlementService} maps each
 * line directly into a `SettlementLine` row, so the field names and types
 * here are intentionally aligned with the Prisma model.
 *
 * `sharePercentage` is `'0'` for fixed-fee and waterfall fixed/remainder
 * legs since percent is meaningless there — the persisted value is purely
 * audit metadata, never used in downstream math.
 */
export interface DistributionLine {
  partyType: string;
  partyId: string;
  grossRevenue: string;
  sharePercentage: string;
  shareAmount: string;
}

export interface PartyPercentageConfig {
  partyType: string;
  partyId: string;
  percentage: string;
}

export interface PercentageSplitConfig {
  parties: PartyPercentageConfig[];
}

export interface TieredTierConfig {
  /** Upper bound (inclusive) for this tier. `null` = unbounded top tier. */
  upTo: string | null;
  platformPercentage: string;
}

export interface TieredConfig {
  /** Reserved for future use (`monthly_revenue`, `transaction_count`). */
  basedOn?: string;
  tiers: TieredTierConfig[];
  /**
   * Parties block is informational only — the strategy always emits
   * platform (rate from tier) + sp (remainder). Kept in the config shape
   * so operators can identify the recipient SP/platform partyIds.
   */
  parties?: { partyType: string; partyId: string; source?: string }[];
}

export interface FixedFeeEntryConfig {
  partyType: string;
  partyId: string;
  amount: string;
  currency?: string;
}

export interface FixedFeeConfig {
  fixedFees: FixedFeeEntryConfig[];
  remainderParty: { partyType: string; partyId: string };
}

export type WaterfallDeductionType = 'percentage' | 'fixed' | 'remainder';

export interface WaterfallStepConfig {
  partyType: string;
  partyId: string;
  deduction: {
    type: WaterfallDeductionType;
    /** Required for `percentage` and `fixed`; ignored for `remainder`. */
    value?: string;
  };
}

export interface WaterfallConfig {
  waterfall: WaterfallStepConfig[];
}

/**
 * Strategy contract. Each model implements this once; the dispatcher in
 * {@link RevenueDistributionService} routes by enum value. Strategies are
 * pure functions of (input, config) — no DB access, no IO — which is what
 * makes them trivially unit-testable with the canonical JSON shapes from
 * the spec.
 */
export interface IRevenueDistributionStrategy {
  readonly model: RevenueDistributionModel;
  calculate(input: DistributionInput, config: unknown): DistributionLine[];
}
