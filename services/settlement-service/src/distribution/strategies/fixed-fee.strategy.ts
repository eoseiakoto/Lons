import { Injectable } from '@nestjs/common';
import { RevenueDistributionModel } from '@lons/database';
import { add, bankersRound, compare, subtract, ValidationError } from '@lons/common';

import {
  DistributionInput,
  DistributionLine,
  FixedFeeConfig,
  IRevenueDistributionStrategy,
} from '../distribution.types';

/**
 * S18-9 — Fixed-fee distribution.
 *
 * A list of parties each take a fixed amount from `totalRevenue` in order,
 * and the leftover goes to the designated `remainderParty` (typically the
 * SP). If revenue is too small to satisfy all fixed fees, the last fee in
 * the order is capped at the remaining balance — i.e. earlier fees get
 * paid first, later ones get pro-rated to zero. This matches the
 * commercial intent: critical fees (platform, lender minimums) come
 * before opportunistic ones.
 *
 * The remainder line is *always* emitted, even when it's zero — operators
 * inspecting the settlement breakdown want to see the SP row exists with
 * an explicit zero rather than guess whether it was simply omitted.
 */
@Injectable()
export class FixedFeeStrategy implements IRevenueDistributionStrategy {
  readonly model = RevenueDistributionModel.fixed_fee;

  calculate(input: DistributionInput, rawConfig: unknown): DistributionLine[] {
    const config = this.validate(rawConfig);

    const lines: DistributionLine[] = [];
    let totalDeducted = '0';

    for (const fee of config.fixedFees) {
      const remainingBudget = subtract(input.totalRevenue, totalDeducted);
      const deduction = bankersRound(
        compare(fee.amount, remainingBudget) <= 0
          ? fee.amount
          : compare(remainingBudget, '0') > 0
            ? remainingBudget
            : '0',
        4,
      );

      lines.push({
        partyType: fee.partyType,
        partyId: fee.partyId,
        grossRevenue: input.totalRevenue,
        sharePercentage: '0',
        shareAmount: deduction,
      });
      totalDeducted = add(totalDeducted, deduction);
    }

    const remainder = subtract(input.totalRevenue, totalDeducted);
    lines.push({
      partyType: config.remainderParty.partyType,
      partyId: config.remainderParty.partyId,
      grossRevenue: input.totalRevenue,
      sharePercentage: '0',
      shareAmount: bankersRound(compare(remainder, '0') >= 0 ? remainder : '0', 4),
    });

    return lines;
  }

  private validate(rawConfig: unknown): FixedFeeConfig {
    const config = rawConfig as FixedFeeConfig | null | undefined;
    if (!config || !Array.isArray(config.fixedFees)) {
      throw new ValidationError('fixed_fee config requires fixedFees array');
    }
    if (!config.remainderParty?.partyType || !config.remainderParty?.partyId) {
      throw new ValidationError('fixed_fee config requires remainderParty');
    }
    for (const fee of config.fixedFees) {
      if (!fee.partyType || !fee.partyId) {
        throw new ValidationError('fixed_fee entry requires partyType and partyId');
      }
      if (typeof fee.amount !== 'string') {
        throw new ValidationError('fixed_fee entry.amount must be a Decimal string');
      }
    }
    return config;
  }
}
