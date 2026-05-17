import { Injectable } from '@nestjs/common';
import { RevenueDistributionModel } from '@lons/database';
import { bankersRound, compare, percentage, subtract, ValidationError } from '@lons/common';

import {
  DistributionInput,
  DistributionLine,
  IRevenueDistributionStrategy,
  TieredConfig,
} from '../distribution.types';

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
    const config = rawConfig as TieredConfig | null | undefined;
    if (!config || !Array.isArray(config.tiers) || config.tiers.length === 0) {
      throw new ValidationError('tiered config requires non-empty tiers array');
    }
    for (const tier of config.tiers) {
      if (tier.upTo !== null && typeof tier.upTo !== 'string') {
        throw new ValidationError('tiered tier.upTo must be a Decimal string or null');
      }
      if (typeof tier.platformPercentage !== 'string') {
        throw new ValidationError('tiered tier.platformPercentage must be a Decimal string');
      }
    }
    return config;
  }
}
