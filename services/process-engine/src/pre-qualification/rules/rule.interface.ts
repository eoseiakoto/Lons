export interface RuleEvaluationContext {
  customer: {
    id: string;
    status: string;
    kycLevel: string;
    country?: string | null;
    dateOfBirth?: Date | null;
    createdAt: Date;
  };
  product: {
    id: string;
    type: string;
    eligibilityRules: unknown;
  };
  tenantId: string;
  activeDefaultCount?: number;
}

export interface RuleResult {
  passed: boolean;
  failureCode?: string;
  failureMessage?: string;
}

export interface IEligibilityRule {
  type: string;
  evaluate(context: RuleEvaluationContext, params: Record<string, unknown>): RuleResult;
}
