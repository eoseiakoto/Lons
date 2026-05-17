import { Injectable } from '@nestjs/common';
import { RevenueDistributionModel } from '@lons/database';
import { bankersRound, percentage, ValidationError } from '@lons/common';

import {
  DistributionInput,
  DistributionLine,
  IRevenueDistributionStrategy,
  PercentageSplitConfig,
} from '../distribution.types';

/**
 * S18-9 — Percentage split (the legacy model).
 *
 * Each party gets a fixed percentage of `totalRevenue`. The sum of party
 * percentages is normally 100, but we do not enforce that here: operators
 * may deliberately under-allocate (e.g. retain a slush bucket) and the
 * shortfall will surface as a settlement variance during reconciliation.
 *
 * Banker's rounding (round half to even) is applied to every line. The
 * cumulative rounding error across N parties is bounded by N * 0.00005,
 * which is below the 0.0001 DECIMAL precision floor — no allocation
 * fix-up needed for the percentage model.
 */
@Injectable()
export class PercentageSplitStrategy implements IRevenueDistributionStrategy {
  readonly model = RevenueDistributionModel.percentage_split;

  calculate(input: DistributionInput, rawConfig: unknown): DistributionLine[] {
    const config = this.validate(rawConfig);

    return config.parties.map((party) => ({
      partyType: party.partyType,
      partyId: party.partyId,
      grossRevenue: input.totalRevenue,
      sharePercentage: party.percentage,
      shareAmount: bankersRound(percentage(input.totalRevenue, party.percentage), 4),
    }));
  }

  private validate(rawConfig: unknown): PercentageSplitConfig {
    const config = rawConfig as PercentageSplitConfig | null | undefined;
    if (!config || !Array.isArray(config.parties) || config.parties.length === 0) {
      throw new ValidationError('percentage_split config requires non-empty parties array');
    }
    for (const party of config.parties) {
      if (!party.partyType || !party.partyId) {
        throw new ValidationError('percentage_split party requires partyType and partyId');
      }
      if (typeof party.percentage !== 'string') {
        throw new ValidationError('percentage_split party.percentage must be a Decimal string');
      }
    }
    return config;
  }
}
