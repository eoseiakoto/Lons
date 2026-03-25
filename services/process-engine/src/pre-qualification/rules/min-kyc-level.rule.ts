import { IEligibilityRule, RuleEvaluationContext, RuleResult } from './rule.interface';

const KYC_LEVELS: Record<string, number> = { none: 0, tier_1: 1, tier_2: 2, tier_3: 3 };

export class MinKycLevelRule implements IEligibilityRule {
  type = 'min_kyc_level';

  evaluate(context: RuleEvaluationContext, params: Record<string, unknown>): RuleResult {
    const requiredLevel = KYC_LEVELS[params.value as string] ?? 0;
    const customerLevel = KYC_LEVELS[context.customer.kycLevel] ?? 0;

    if (customerLevel < requiredLevel) {
      return {
        passed: false,
        failureCode: 'KYC_LEVEL_INSUFFICIENT',
        failureMessage: `Required KYC level: ${params.value}, customer has: ${context.customer.kycLevel}`,
      };
    }
    return { passed: true };
  }
}
