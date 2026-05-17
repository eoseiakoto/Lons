import { MinAverageBalanceRule } from './min-average-balance.rule';
import { RuleEvaluationContext } from './rule.interface';

const baseContext: RuleEvaluationContext = {
  customer: {
    id: 'c-1', status: 'active', kycLevel: 'tier_2',
    country: 'GHA', dateOfBirth: new Date('1990-01-01'),
    createdAt: new Date('2025-01-01'),
  },
  product: { id: 'p-1', type: 'overdraft', eligibilityRules: null },
  tenantId: 't-1',
  financialData: null,
};

describe('MinAverageBalanceRule', () => {
  const rule = new MinAverageBalanceRule();

  it('passes when balance >= required', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: 10, transactionCount90d: 30,
      averageBalance30d: '100.0000', averageBalance90d: '120.0000',
      fetchedAt: new Date(),
    } };
    const res = rule.evaluate(ctx, { value: '50.0000', period: 30 });
    expect(res.passed).toBe(true);
  });

  it('fails with PRE_QUAL_INSUFFICIENT_BALANCE when below required', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: 10, transactionCount90d: 30,
      averageBalance30d: '20.0000', averageBalance90d: '20.0000',
      fetchedAt: new Date(),
    } };
    const res = rule.evaluate(ctx, { value: '50.0000', period: 30 });
    expect(res.passed).toBe(false);
    expect(res.failureCode).toBe('PRE_QUAL_INSUFFICIENT_BALANCE');
  });

  it('uses 90d balance when period >= 90', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: 5, transactionCount90d: 50,
      averageBalance30d: '10.0000', averageBalance90d: '200.0000',
      fetchedAt: new Date(),
    } };
    const res = rule.evaluate(ctx, { value: '100.0000', period: 90 });
    expect(res.passed).toBe(true);
  });

  it('skips when no EMI data', () => {
    const res = rule.evaluate(baseContext, { value: '50.0000', period: 30 });
    expect(res.passed).toBe(true);
    expect(res.skipped).toBe(true);
  });

  it('skips when balance for the period is null', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: 10, transactionCount90d: 30,
      averageBalance30d: null, averageBalance90d: '100.0000',
      fetchedAt: new Date(),
    } };
    const res = rule.evaluate(ctx, { value: '50.0000', period: 30 });
    expect(res.skipped).toBe(true);
  });

  it('accepts numeric value too (back-compat) but skips other types', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: 10, transactionCount90d: 30,
      averageBalance30d: '100.0000', averageBalance90d: '100.0000',
      fetchedAt: new Date(),
    } };
    expect(rule.evaluate(ctx, { value: 50, period: 30 }).passed).toBe(true);
    expect(rule.evaluate(ctx, { value: {} }).skipped).toBe(true);
  });
});
