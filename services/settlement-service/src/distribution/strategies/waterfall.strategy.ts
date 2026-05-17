import { Injectable } from '@nestjs/common';
import { RevenueDistributionModel } from '@lons/database';
import { bankersRound, compare, percentage, subtract, ValidationError } from '@lons/common';

import {
  DistributionInput,
  DistributionLine,
  IRevenueDistributionStrategy,
  WaterfallConfig,
} from '../distribution.types';

/**
 * S18-9 — Waterfall (sequential deductions) distribution.
 *
 * Walks the `waterfall` list in order. Each step takes a slice from the
 * *remaining* balance (not the original `totalRevenue`), which is the
 * defining feature: a percentage step takes its rate off whatever's left
 * after earlier steps, not the gross. Fixed steps are capped at the
 * remaining balance to avoid driving the running total negative, and
 * `remainder` simply sweeps whatever is left to a designated party
 * (typically the SP).
 *
 * The strategy keeps `remaining` as a Decimal string throughout — every
 * arithmetic op runs through {@link bankersRound} or returns the
 * canonical 4-dp string from the common helpers, so there's no float
 * arithmetic in the hot path.
 */
@Injectable()
export class WaterfallStrategy implements IRevenueDistributionStrategy {
  readonly model = RevenueDistributionModel.waterfall;

  calculate(input: DistributionInput, rawConfig: unknown): DistributionLine[] {
    const config = this.validate(rawConfig);

    const lines: DistributionLine[] = [];
    let remaining = input.totalRevenue;

    for (const step of config.waterfall) {
      let amount: string;

      switch (step.deduction.type) {
        case 'percentage': {
          if (typeof step.deduction.value !== 'string') {
            throw new ValidationError('waterfall percentage step requires deduction.value');
          }
          // Percentage applies to the *remaining* balance — that's what
          // makes a waterfall a waterfall (vs a flat percentage split).
          amount = bankersRound(percentage(remaining, step.deduction.value), 4);
          // Cap at remaining: rounding could in theory bump us past, and
          // we'd rather under-allocate by one minor unit than emit a
          // negative leftover that fails reconciliation invariants.
          if (compare(amount, remaining) > 0) amount = remaining;
          break;
        }
        case 'fixed': {
          if (typeof step.deduction.value !== 'string') {
            throw new ValidationError('waterfall fixed step requires deduction.value');
          }
          amount = compare(step.deduction.value, remaining) <= 0
            ? step.deduction.value
            : compare(remaining, '0') > 0
              ? remaining
              : '0';
          amount = bankersRound(amount, 4);
          break;
        }
        case 'remainder':
          amount = bankersRound(compare(remaining, '0') >= 0 ? remaining : '0', 4);
          break;
        default:
          throw new ValidationError(`Unknown waterfall deduction type: ${String((step.deduction as { type: unknown }).type)}`);
      }

      lines.push({
        partyType: step.partyType,
        partyId: step.partyId,
        grossRevenue: input.totalRevenue,
        sharePercentage: step.deduction.type === 'percentage' ? (step.deduction.value ?? '0') : '0',
        shareAmount: amount,
      });

      remaining = subtract(remaining, amount);
    }

    return lines;
  }

  private validate(rawConfig: unknown): WaterfallConfig {
    const config = rawConfig as WaterfallConfig | null | undefined;
    if (!config || !Array.isArray(config.waterfall) || config.waterfall.length === 0) {
      throw new ValidationError('waterfall config requires non-empty waterfall array');
    }
    for (const step of config.waterfall) {
      if (!step.partyType || !step.partyId) {
        throw new ValidationError('waterfall step requires partyType and partyId');
      }
      if (!step.deduction?.type) {
        throw new ValidationError('waterfall step requires deduction.type');
      }
    }
    return config;
  }
}
