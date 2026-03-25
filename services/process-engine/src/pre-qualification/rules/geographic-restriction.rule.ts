import { IEligibilityRule, RuleEvaluationContext, RuleResult } from './rule.interface';

export class GeographicRestrictionRule implements IEligibilityRule {
  type = 'geographic_restriction';

  evaluate(context: RuleEvaluationContext, params: Record<string, unknown>): RuleResult {
    const allowedCountries = params.allowed_countries as string[];
    const customerCountry = context.customer.country;

    if (!customerCountry || !allowedCountries.includes(customerCountry)) {
      return {
        passed: false,
        failureCode: 'GEOGRAPHIC_RESTRICTION',
        failureMessage: `Customer country ${customerCountry || 'unknown'} not in allowed list`,
      };
    }
    return { passed: true };
  }
}
