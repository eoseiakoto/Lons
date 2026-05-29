import { Prisma } from '@prisma/client';
import { add, subtract, multiply, divide, bankersRound, percentage } from '@lons/common';

/**
 * S19-6 / FR-DM-002.1 — penalty calculator.
 *
 * Two modes:
 *   - simple:   penalty = outstanding_principal * dailyRate
 *               (the legacy/default behaviour preserved across all
 *               products without an explicit PenaltyConfig)
 *   - compound: penalty = (outstanding_principal + accumulated_penalty)
 *               * dailyRate (penalties accrue on themselves)
 *
 * Per-DPD rate tiers let tenants ramp penalties as delinquency
 * deepens (e.g. 0.10 %/day for 1–30 DPD, 0.20 %/day for 31–60 DPD,
 * 0.30 %/day for 60+ DPD). The applicable tier is selected by
 * `currentDpd` falling within [fromDpd, toDpd]. `toDpd: null` means
 * "unlimited" — the final tier extends to infinity.
 *
 * Cap: `maxPenaltyPct` (as a percentage of the ORIGINAL principal,
 * NOT the current outstanding — operators tune this to a meaningful
 * ceiling regardless of partial repayments). Once the cap is reached
 * the penalty stops accruing.
 *
 * **Money discipline:** every input is a decimal STRING, every
 * intermediate uses the `@lons/common` decimal utilities, and the
 * return is a `Prisma.Decimal` for direct write to the schedule.
 * No `number` arithmetic anywhere — that's the entire point of this
 * module existing.
 */

export interface PenaltyRateTier {
  /** Lower bound (inclusive). 1 means "from day 1 past due". */
  fromDpd: number;
  /** Upper bound (inclusive). null = unlimited (final tier). */
  toDpd: number | null;
  /** Basis points per day as a decimal STRING. 10 bps = 0.10 % per day. */
  dailyRateBps: string;
}

export type PenaltyMode = 'simple' | 'compound';

export interface PenaltyCalculationInput {
  /** Outstanding principal at the start of the day. */
  principalOutstanding: Prisma.Decimal;
  /** Penalty already accumulated across prior days. */
  accumulatedPenalty: Prisma.Decimal;
  /** Days past due as of the day this penalty is being computed. */
  currentDpd: number;
  /** Calculation mode. Defaults to 'simple' if not specified. */
  mode: PenaltyMode;
  /** Per-DPD tier configuration. Tiers must NOT overlap; ranges should be contiguous. */
  rateTiers: PenaltyRateTier[];
  /** Cap as percentage of originalPrincipal (e.g. "100.0000" = 100 %). null = no cap. */
  maxPenaltyPct: Prisma.Decimal | null;
  /** Original disbursed principal — anchor for the cap calculation. */
  originalPrincipal: Prisma.Decimal;
}

/**
 * Compute the day's penalty accrual. Pure function — no IO, no
 * side-effects, fully testable with property-based assertions.
 *
 * Returns a `Prisma.Decimal`. Zero is returned when no tier matches
 * (DPD outside all configured ranges) — defensive against tenants
 * who configure tiers starting at fromDpd: 5 and forget the 1–4
 * range, in which case the early days have zero penalty.
 */
export function calculateDailyPenalty(input: PenaltyCalculationInput): Prisma.Decimal {
  const {
    principalOutstanding,
    accumulatedPenalty,
    currentDpd,
    mode,
    rateTiers,
    maxPenaltyPct,
    originalPrincipal,
  } = input;

  // DPD = 0 means not past due — no penalty.
  if (currentDpd <= 0) return new Prisma.Decimal('0');

  // Find the applicable tier. Tiers are evaluated in order; the
  // first match wins. Tenants are responsible for non-overlap.
  const tier = rateTiers.find(
    (t) => currentDpd >= t.fromDpd && (t.toDpd === null || currentDpd <= t.toDpd),
  );
  if (!tier) return new Prisma.Decimal('0');

  // Convert basis points to a daily rate fraction:
  //   10 bps = 0.10 % per day = 0.001 fraction
  //   Formula: rate = bps / 10000
  const dailyRate = divide(tier.dailyRateBps, '10000');

  // Pick the base for today's accrual.
  const baseStr =
    mode === 'compound'
      ? add(principalOutstanding.toString(), accumulatedPenalty.toString())
      : principalOutstanding.toString();

  // Today's raw penalty before the cap.
  let todayPenalty = multiply(baseStr, dailyRate);
  todayPenalty = bankersRound(todayPenalty, 4);

  // Apply the cap if configured. Cap is against ORIGINAL principal,
  // so an operator setting "100 %" means the total accumulated
  // penalty cannot exceed the disbursed amount.
  if (maxPenaltyPct) {
    const maxAllowed = percentage(originalPrincipal.toString(), maxPenaltyPct.toString());
    const totalAfter = add(accumulatedPenalty.toString(), todayPenalty);
    if (new Prisma.Decimal(totalAfter).greaterThan(new Prisma.Decimal(maxAllowed))) {
      // Only allow enough to bring accumulated up to the cap.
      todayPenalty = subtract(maxAllowed, accumulatedPenalty.toString());
      if (new Prisma.Decimal(todayPenalty).lessThan(new Prisma.Decimal('0'))) {
        todayPenalty = '0';
      }
    }
  }

  return new Prisma.Decimal(todayPenalty);
}

/**
 * Load and shape-validate the `rateTiers` JSON blob from a
 * `PenaltyConfig` row. Throws a descriptive Error on shape mismatch
 * — better to fail loudly than accrue zero penalty silently.
 *
 * Validation: array of objects with `fromDpd: number`,
 * `toDpd: number | null`, `dailyRateBps: string`. Empty array is
 * accepted (effectively disables the calculator for that product).
 */
export function parseRateTiers(raw: unknown): PenaltyRateTier[] {
  if (!Array.isArray(raw)) {
    throw new Error('PenaltyConfig.rateTiers must be a JSON array');
  }
  return raw.map((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`PenaltyConfig.rateTiers[${i}] must be an object`);
    }
    const t = entry as Record<string, unknown>;
    const fromDpd = t.fromDpd;
    const toDpd = t.toDpd;
    const dailyRateBps = t.dailyRateBps;
    if (typeof fromDpd !== 'number') {
      throw new Error(`PenaltyConfig.rateTiers[${i}].fromDpd must be a number`);
    }
    if (toDpd !== null && typeof toDpd !== 'number') {
      throw new Error(`PenaltyConfig.rateTiers[${i}].toDpd must be a number or null`);
    }
    if (typeof dailyRateBps !== 'string') {
      throw new Error(`PenaltyConfig.rateTiers[${i}].dailyRateBps must be a decimal string`);
    }
    return { fromDpd, toDpd, dailyRateBps };
  });
}
