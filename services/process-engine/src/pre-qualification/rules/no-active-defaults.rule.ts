import { IEligibilityRule, RuleEvaluationContext, RuleResult } from './rule.interface';

export class NoActiveDefaultsRule implements IEligibilityRule {
  type = 'no_active_defaults';

  evaluate(context: RuleEvaluationContext): RuleResult {
    if (context.activeDefaultCount && context.activeDefaultCount > 0) {
      return { passed: false, failureCode: 'ACTIVE_DEFAULTS', failureMessage: 'Customer has active defaulted contracts' };
    }
    return { passed: true };
  }
}
