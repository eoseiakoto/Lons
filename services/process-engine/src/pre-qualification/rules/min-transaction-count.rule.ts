import { IEligibilityRule, RuleEvaluationContext, RuleResult } from './rule.interface';

/**
 * S17-6 / FR-PQ-001.2 — Reject when the customer's recent transaction
 * count is below a configurable threshold.
 *
 * Config:
 *   { type: 'min_transaction_count', value: 10, period: 30 }
 *
 * Behaviour:
 *   - If `period >= 90` we read transactionCount90d, otherwise transactionCount30d.
 *   - If no EMI snapshot exists, the rule SKIPS (not fails) and reports
 *     `emiDataMissing: true` so brand-new customers can still proceed
 *     to scoring instead of being silently bounced.
 */
export class MinTransactionCountRule implements IEligibilityRule {
  type = 'min_transaction_count';

  evaluate(context: RuleEvaluationContext, params: Record<string, unknown>): RuleResult {
    const required = Number(params.value);
    const period = Number(params.period ?? 30);

    if (!Number.isFinite(required) || required < 0) {
      return {
        passed: true,
        skipped: true,
        skipReason: `min_transaction_count rule has invalid value=${String(params.value)}`,
      };
    }

    if (!context.financialData) {
      return {
        passed: true,
        skipped: true,
        skipReason: 'No EMI data available; rule skipped',
      };
    }

    const count =
      period >= 90
        ? context.financialData.transactionCount90d
        : context.financialData.transactionCount30d;

    if (count === null || count === undefined) {
      return {
        passed: true,
        skipped: true,
        skipReason: `No transaction count for period=${period}`,
      };
    }

    if (count < required) {
      return {
        passed: false,
        failureCode: 'PRE_QUAL_INSUFFICIENT_TRANSACTIONS',
        failureMessage: `Transaction count ${count} over ${period}d below required ${required}`,
      };
    }

    return { passed: true };
  }
}
