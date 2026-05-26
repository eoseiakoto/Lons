import { Injectable } from '@nestjs/common';
import { RevenueDistributionModel } from '@lons/database';
import { bankersRound, compare, percentage, subtract, ValidationError } from '@lons/common';

import {
  DistributionInput,
  DistributionLine,
  IRevenueDistributionStrategy,
  TieredConfig,
  TieredTierConfig,
} from '../distribution.types';

/**
 * F-S18-9-A — Standalone validator for a tiered distribution config.
 *
 * Exported so future admin-portal mutations that persist tiered
 * configs can call it before write, not just at calculate-time.
 * Until then, the {@link TieredStrategy} calls it on every calculate
 * to fail closed on bad persisted configs.
 *
 * Semantic checks (beyond the shape check the strategy had before):
 *
 *   1. **Strictly ascending `upTo`.** With cumulative tier upper
 *      bounds (each tier starts where the previous ended), an
 *      ascending sort with no duplicates is the only valid shape.
 *      Duplicate upTos mean "two tiers fight for the same boundary
 *      value" — a config bug.
 *   2. **At most one `null` upTo, and it must be last.** The `null`
 *      tier is the unbounded top; multiple unbounded tiers don't
 *      mean anything coherent, and a `null` tier in the middle
 *      eats all subsequent rates.
 *   3. **Positive numeric upTos.** A negative or zero upper bound
 *      would never match any real disbursement volume.
 *   4. **platformPercentage in [0, 100].** Anything outside that
 *      range produces a negative SP share or > 100% platform cut.
 *
 * The gap / overlap concerns named in the PM's F-S18-9-A spec
 * collapse to these checks under the cumulative-bound shape — a
 * spec that talked about "tier N lower bound = tier N-1 upper + 1"
 * was describing inclusive ranges, but the implementation uses
 * cumulative `upTo` so the "lower bound" is implicit (the previous
 * tier's upTo). Ascending + non-duplicate + bounded-positive
 * delivers the same guarantee.
 */
export function validateTieredConfig(rawConfig: unknown): TieredConfig {
  const config = rawConfig as TieredConfig | null | undefined;
  if (!config || !Array.isArray(config.tiers) || config.tiers.length === 0) {
    throw new ValidationError('tiered config requires non-empty tiers array');
  }

  // ── Per-tier shape checks (carried over from previous strategy) ──
  for (const [i, tier] of config.tiers.entries()) {
    if (tier.upTo !== null && typeof tier.upTo !== 'string') {
      throw new ValidationError(
        `tiered tier[${i}].upTo must be a Decimal string or null`,
      );
    }
    if (typeof tier.platformPercentage !== 'string') {
      throw new ValidationError(
        `tiered tier[${i}].platformPercentage must be a Decimal string`,
      );
    }
    // platformPercentage must parse and sit in [0, 100].
    const pct = Number(tier.platformPercentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new ValidationError(
        `tiered tier[${i}].platformPercentage must be a number between 0 and 100 (got '${tier.platformPercentage}')`,
      );
    }
    // Numeric upTo must parse and be > 0. The boundary value itself
    // belongs to the lower tier (compare(volume, upTo) <= 0), so
    // upTo = 0 would mean "this tier matches only zero volume" —
    // technically valid but never useful and almost always a typo.
    if (tier.upTo !== null) {
      const upTo = Number(tier.upTo);
      if (!Number.isFinite(upTo) || upTo <= 0) {
        throw new ValidationError(
          `tiered tier[${i}].upTo must be a positive Decimal string (got '${tier.upTo}')`,
        );
      }
    }
  }

  // ── Sort and check the cross-tier semantics ─────────────────────
  // Sort by numeric upTo with `null` always last. After the sort:
  //   - All numeric upTos must be strictly ascending (no duplicates)
  //   - At most ONE entry may have upTo = null (the last)
  const sorted = [...config.tiers].sort(
    (a: TieredTierConfig, b: TieredTierConfig) => {
      if (a.upTo === null) return 1;
      if (b.upTo === null) return -1;
      return compare(a.upTo, b.upTo);
    },
  );

  const nullCount = sorted.filter((t) => t.upTo === null).length;
  if (nullCount > 1) {
    throw new ValidationError(
      `tiered config can have at most one tier with upTo: null (the unbounded top tier) — found ${nullCount}`,
    );
  }

  // The `null` tier (if any) is now sorted last. Compare numeric
  // upTos pairwise.
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.upTo === null) continue; // unbounded top — already last
    if (prev.upTo === null) {
      // Shouldn't happen given the sort, but guard against future
      // refactors. A null tier appearing before a numeric one means
      // the sort comparator was bypassed.
      throw new ValidationError(
        'tiered config has a `null` upTo before a numeric one after sort — internal invariant violated',
      );
    }
    const cmp = compare(prev.upTo, cur.upTo);
    if (cmp >= 0) {
      throw new ValidationError(
        `tiered tier upTo values must be strictly ascending — '${prev.upTo}' and '${cur.upTo}' overlap or duplicate (boundaries must be unique)`,
      );
    }
  }

  return config;
}

/**
 * S18-9 — Tiered (volume-based) revenue split.
 *
 * The platform's percentage cut scales down as the SP's monthly
 * disbursement volume crosses tier boundaries — a soft volume discount.
 * The remainder (always 100 - platformPct) flows to the SP.
 *
 * Tier selection uses `compare(volume, upTo) <= 0`, which means the
 * boundary value belongs to the *lower* tier — i.e. a tier `upTo:
 * "500000"` includes exactly 500000. The `null` upTo marks the unbounded
 * top tier and is sorted last via the comparator below.
 *
 * If `monthlyDisbursementVolume` is missing (e.g. tenant has zero
 * disbursements in the period) we fall through to the lowest tier (highest
 * platform percentage). That's the conservative choice: we shouldn't
 * silently award a volume discount to a tenant who hasn't earned it.
 */
@Injectable()
export class TieredStrategy implements IRevenueDistributionStrategy {
  readonly model = RevenueDistributionModel.tiered;

  calculate(input: DistributionInput, rawConfig: unknown): DistributionLine[] {
    const config = this.validate(rawConfig);
    const volume = input.monthlyDisbursementVolume ?? '0';

    const sortedTiers = [...config.tiers].sort((a, b) => {
      if (a.upTo === null) return 1;
      if (b.upTo === null) return -1;
      return compare(a.upTo, b.upTo);
    });

    // Fall back to the highest-tier (last) rate if no upper bound is
    // satisfied — guards the case where volume exceeds every numeric
    // `upTo` and there's no unbounded `null` tier configured.
    let applicableRate = sortedTiers[sortedTiers.length - 1].platformPercentage;
    for (const tier of sortedTiers) {
      if (tier.upTo === null || compare(volume, tier.upTo) <= 0) {
        applicableRate = tier.platformPercentage;
        break;
      }
    }

    // Look up the configured platform/sp partyIds. We default to canonical
    // `lons-platform` + `remainder` only when the operator hasn't told us
    // which SP to credit (rare; usually `parties` is populated).
    const platformParty = config.parties?.find((p) => p.partyType === 'platform');
    const spParty = config.parties?.find((p) => p.partyType === 'sp');

    const platformAmount = bankersRound(percentage(input.totalRevenue, applicableRate), 4);
    const spAmount = bankersRound(subtract(input.totalRevenue, platformAmount), 4);
    const spPercentage = subtract('100', applicableRate);

    return [
      {
        partyType: 'platform',
        partyId: platformParty?.partyId ?? 'lons-platform',
        grossRevenue: input.totalRevenue,
        sharePercentage: applicableRate,
        shareAmount: platformAmount,
      },
      {
        partyType: 'sp',
        partyId: spParty?.partyId ?? 'remainder',
        grossRevenue: input.totalRevenue,
        sharePercentage: spPercentage,
        shareAmount: spAmount,
      },
    ];
  }

  private validate(rawConfig: unknown): TieredConfig {
    // Delegate to the standalone validator so future mutations can
    // call the same logic at save-time. Single source of truth.
    return validateTieredConfig(rawConfig);
  }
}
