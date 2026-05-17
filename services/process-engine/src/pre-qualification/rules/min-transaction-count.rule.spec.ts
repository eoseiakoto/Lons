import { MinTransactionCountRule } from './min-transaction-count.rule';
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

describe('MinTransactionCountRule', () => {
  const rule = new MinTransactionCountRule();

  it('passes when count meets the threshold', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: 15, transactionCount90d: 45,
      averageBalance30d: '500.0000', averageBalance90d: '500.0000',
      fetchedAt: new Date(),
    } };
    const res = rule.evaluate(ctx, { value: 10, period: 30 });
    expect(res.passed).toBe(true);
    expect(res.skipped).toBeFalsy();
  });

  it('fails with PRE_QUAL_INSUFFICIENT_TRANSACTIONS when below threshold', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: 3, transactionCount90d: 9,
      averageBalance30d: '500.0000', averageBalance90d: '500.0000',
      fetchedAt: new Date(),
    } };
    const res = rule.evaluate(ctx, { value: 10, period: 30 });
    expect(res.passed).toBe(false);
    expect(res.failureCode).toBe('PRE_QUAL_INSUFFICIENT_TRANSACTIONS');
  });

  it('uses 90d count when period >= 90', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: 3, transactionCount90d: 25,
      averageBalance30d: '500.0000', averageBalance90d: '500.0000',
      fetchedAt: new Date(),
    } };
    const res = rule.evaluate(ctx, { value: 20, period: 90 });
    expect(res.passed).toBe(true);
  });

  it('skips (passes without failing) when no EMI data', () => {
    const res = rule.evaluate(baseContext, { value: 10, period: 30 });
    expect(res.passed).toBe(true);
    expect(res.skipped).toBe(true);
    expect(res.skipReason).toMatch(/No EMI data/i);
  });

  it('skips when transactionCount for the period is null', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: null, transactionCount90d: 50,
      averageBalance30d: null, averageBalance90d: null,
      fetchedAt: new Date(),
    } };
    const res = rule.evaluate(ctx, { value: 10, period: 30 });
    expect(res.skipped).toBe(true);
  });

  it('skips when value param is invalid', () => {
    const ctx = { ...baseContext, financialData: {
      transactionCount30d: 100, transactionCount90d: 300,
      averageBalance30d: '500.0000', averageBalance90d: '500.0000',
      fetchedAt: new Date(),
    } };
    const res = rule.evaluate(ctx, { value: 'abc' });
    expect(res.skipped).toBe(true);
  });
});
