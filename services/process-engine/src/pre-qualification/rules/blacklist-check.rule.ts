import { IEligibilityRule, RuleEvaluationContext, RuleResult } from './rule.interface';

export class BlacklistCheckRule implements IEligibilityRule {
  type = 'blacklist_check';

  evaluate(context: RuleEvaluationContext): RuleResult {
    if (context.customer.status === 'blacklisted') {
      return { passed: false, failureCode: 'CUSTOMER_BLACKLISTED', failureMessage: 'Customer is blacklisted' };
    }
    return { passed: true };
  }
}
