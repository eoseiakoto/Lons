import { IEligibilityRule, RuleEvaluationContext, RuleResult } from './rule.interface';

export class MinAccountAgeRule implements IEligibilityRule {
  type = 'min_account_age_days';

  evaluate(context: RuleEvaluationContext, params: Record<string, unknown>): RuleResult {
    const requiredDays = params.value as number;
    const accountAgeDays = Math.floor(
      (Date.now() - context.customer.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (accountAgeDays < requiredDays) {
      return {
        passed: false,
        failureCode: 'ACCOUNT_TOO_NEW',
        failureMessage: `Account age ${accountAgeDays} days, required ${requiredDays} days`,
      };
    }
    return { passed: true };
  }
}
