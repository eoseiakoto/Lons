import { IEligibilityRule, RuleEvaluationContext, RuleResult } from './rule.interface';

export class AgeRestrictionRule implements IEligibilityRule {
  type = 'age_restriction';

  evaluate(context: RuleEvaluationContext, params: Record<string, unknown>): RuleResult {
    const minAge = params.min_age as number | undefined;
    const maxAge = params.max_age as number | undefined;
    const dob = context.customer.dateOfBirth;

    if (!dob) {
      return { passed: false, failureCode: 'AGE_UNKNOWN', failureMessage: 'Date of birth not provided' };
    }

    const age = Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));

    if (minAge !== undefined && age < minAge) {
      return { passed: false, failureCode: 'UNDERAGE', failureMessage: `Customer age ${age}, minimum ${minAge}` };
    }
    if (maxAge !== undefined && age > maxAge) {
      return { passed: false, failureCode: 'OVERAGE', failureMessage: `Customer age ${age}, maximum ${maxAge}` };
    }
    return { passed: true };
  }
}
