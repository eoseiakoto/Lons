import { IEligibilityRule } from './rule.interface';
import { MinKycLevelRule } from './min-kyc-level.rule';
import { MinAccountAgeRule } from './min-account-age.rule';
import { GeographicRestrictionRule } from './geographic-restriction.rule';
import { AgeRestrictionRule } from './age-restriction.rule';
import { BlacklistCheckRule } from './blacklist-check.rule';
import { NoActiveDefaultsRule } from './no-active-defaults.rule';

const RULES: IEligibilityRule[] = [
  new MinKycLevelRule(),
  new MinAccountAgeRule(),
  new GeographicRestrictionRule(),
  new AgeRestrictionRule(),
  new BlacklistCheckRule(),
  new NoActiveDefaultsRule(),
];

export function getRule(type: string): IEligibilityRule | undefined {
  return RULES.find((r) => r.type === type);
}

export function getAllRules(): IEligibilityRule[] {
  return RULES;
}
