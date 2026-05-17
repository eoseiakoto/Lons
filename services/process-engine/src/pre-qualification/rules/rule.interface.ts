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
  /**
   * S17-6 — Latest EMI financial snapshot for the customer, if any.
   * Pre-qualification rules that depend on transaction count or
   * average balance pull from this. Absent (null) means the customer
   * has no EMI data yet; rules MUST skip rather than auto-reject.
   */
  financialData?: {
    transactionCount30d: number | null;
    transactionCount90d: number | null;
    averageBalance30d: string | null; // decimal string
    averageBalance90d: string | null; // decimal string
    fetchedAt: Date;
  } | null;
}

export interface RuleResult {
  passed: boolean;
  failureCode?: string;
  failureMessage?: string;
  /**
   * S17-6 — true when the rule could not be evaluated because required
   * input data was missing (e.g. no EMI snapshot yet). Skipped rules
   * are treated as PASS but surface a warning to the caller.
   */
  skipped?: boolean;
  skipReason?: string;
}

export interface IEligibilityRule {
  type: string;
  evaluate(context: RuleEvaluationContext, params: Record<string, unknown>): RuleResult;
}
