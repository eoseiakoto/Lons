import { compare } from '@lons/common';

import { IEligibilityRule, RuleEvaluationContext, RuleResult } from './rule.interface';

/**
 * S17-6 / FR-PQ-001.2 — Reject when the customer's average wallet
 * balance over `period` days is below `value`.
 *
 * Config:
 *   { type: 'min_average_balance', value: '50.0000', period: 30 }
 *
 * Notes:
 *   - `value` is a decimal STRING per CLAUDE.md money rules (do not
 *     accept `number` — would lose precision for large amounts).
 *   - `period >= 90` reads averageBalance90d; otherwise averageBalance30d.
 *   - Skips (not fails) when no EMI data exists.
 */
export class MinAverageBalanceRule implements IEligibilityRule {
  type = 'min_average_balance';

  evaluate(context: RuleEvaluationContext, params: Record<string, unknown>): RuleResult {
    const requiredRaw = params.value;
    if (
      requiredRaw === null ||
      requiredRaw === undefined ||
      (typeof requiredRaw !== 'string' && typeof requiredRaw !== 'number')
    ) {
      return {
        passed: true,
        skipped: true,
        skipReason: `min_average_balance rule has invalid value=${String(requiredRaw)}`,
      };
    }
    const required = String(requiredRaw);
    const period = Number(params.period ?? 30);

    if (!context.financialData) {
      return {
        passed: true,
        skipped: true,
        skipReason: 'No EMI data available; rule skipped',
      };
    }

    const balance =
      period >= 90
        ? context.financialData.averageBalance90d
        : context.financialData.averageBalance30d;

    if (balance === null || balance === undefined) {
      return {
        passed: true,
        skipped: true,
        skipReason: `No average balance for period=${period}`,
      };
    }

    if (compare(balance, required) < 0) {
      return {
        passed: false,
        failureCode: 'PRE_QUAL_INSUFFICIENT_BALANCE',
        failureMessage: `Average balance ${balance} over ${period}d below required ${required}`,
      };
    }

    return { passed: true };
  }
}
