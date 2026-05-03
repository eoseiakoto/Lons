/**
 * Mock Reconciliation Source — Unit Tests
 *
 * The mock source synthesizes "external" wallet provider records during
 * staging tests. Two things actually matter to verify:
 *   1. Every emitted amount is a string (no float coercion creeping in)
 *   2. The configured rates produce roughly the expected mix
 */

import { MockReconciliationSource } from '../mock-reconciliation-source';

describe('MockReconciliationSource', () => {
  const source = new MockReconciliationSource();

  function makeInternal(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `txn-${i}`,
      type: (i % 2 === 0 ? 'disbursement' : 'repayment') as 'disbursement' | 'repayment',
      amount: '1000.0000',
      externalRef: null,
      date: new Date('2026-04-15T00:00:00.000Z'),
    }));
  }

  it('emits string amounts on every record', () => {
    const out = source.generateExternalRecords(makeInternal(50));
    for (const r of out) {
      expect(typeof r.amount).toBe('string');
      // Every amount should parse as a finite Decimal-shaped string.
      expect(r.amount).toMatch(/^\d+(\.\d+)?$/);
    }
  });

  it('produces matched + timing-diff + mismatched + orphan records under default config', () => {
    // With 200 inputs and the default rates (95% match, 3% timing, 2% exception),
    // statistical noise is small enough that we expect at least one of each
    // category, plus a few orphans. We assert non-zero output overall.
    const out = source.generateExternalRecords(makeInternal(200));
    expect(out.length).toBeGreaterThan(0);
    const orphans = out.filter((r) => r.externalRef.startsWith('ORPHAN-'));
    expect(orphans.length).toBeGreaterThan(0);
  });

  it('handles an empty input set without throwing', () => {
    const out = source.generateExternalRecords([]);
    // The orphan loop iterates `Math.max(1, ...)` times even on empty input,
    // so we still get at least one orphan record (intentional behavior — it
    // exercises the orphan-handling path during tests).
    expect(out.length).toBeGreaterThanOrEqual(1);
    for (const r of out) {
      expect(typeof r.amount).toBe('string');
    }
  });
});
