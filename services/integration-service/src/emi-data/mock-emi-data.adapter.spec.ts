import { MockEmiDataAdapter } from './mock-emi-data.adapter';

describe('MockEmiDataAdapter', () => {
  let adapter: MockEmiDataAdapter;

  beforeEach(() => {
    adapter = new MockEmiDataAdapter();
  });

  it('reports its provider name', () => {
    expect(adapter.getProvider()).toBe('mock');
  });

  it('is always available', async () => {
    await expect(adapter.isAvailable()).resolves.toBe(true);
  });

  describe('determinism', () => {
    it('returns identical snapshots for the same walletId', async () => {
      const a = await adapter.getFinancialSnapshot('wallet-deterministic-1');
      const b = await adapter.getFinancialSnapshot('wallet-deterministic-1');
      // fetchedAt differs (it's "now"), but the rest of the snapshot must
      // be bit-identical for the same wallet.
      expect({ ...a, fetchedAt: undefined }).toEqual({ ...b, fetchedAt: undefined });
    });

    it('returns different snapshots for different walletIds', async () => {
      const a = await adapter.getFinancialSnapshot('wallet-A');
      const b = await adapter.getFinancialSnapshot('wallet-B');
      expect(a.currentBalance).not.toBe(b.currentBalance);
    });
  });

  describe('getFinancialSnapshot', () => {
    it('returns a snapshot with all required fields', async () => {
      const snap = await adapter.getFinancialSnapshot('wallet-1');
      expect(snap.walletId).toBe('wallet-1');
      expect(snap.currency).toBe('GHS');
      expect(typeof snap.currentBalance).toBe('string');
      expect(typeof snap.averageBalance30d).toBe('string');
      expect(typeof snap.averageBalance90d).toBe('string');
      expect(typeof snap.incomeExpenseRatio).toBe('string');
      expect(snap.transactionCount30d).toBeGreaterThanOrEqual(0);
      expect(snap.transactionCount90d).toBeGreaterThanOrEqual(0);
      expect(snap.incomeConsistency).toBeGreaterThanOrEqual(40);
      expect(snap.incomeConsistency).toBeLessThanOrEqual(100);
    });

    it('returns amounts as decimal strings (not numbers)', async () => {
      const snap = await adapter.getFinancialSnapshot('wallet-money-check');
      expect(snap.currentBalance).toMatch(/^\d+\.\d{4}$/);
      expect(snap.averageBalance30d).toMatch(/^\d+\.\d{4}$/);
      expect(snap.averageBalance90d).toMatch(/^\d+\.\d{4}$/);
    });
  });

  describe('getWalletBalance', () => {
    it('returns a positive balance', async () => {
      const b = await adapter.getWalletBalance('wallet-x');
      expect(b.walletId).toBe('wallet-x');
      expect(b.currency).toBe('GHS');
      expect(Number(b.currentBalance)).toBeGreaterThan(0);
    });
  });

  describe('getIncomePatterns', () => {
    it('respects periodDays', async () => {
      const p30 = await adapter.getIncomePatterns('wallet-q', 30);
      const p90 = await adapter.getIncomePatterns('wallet-q', 90);
      expect(p30.periodDays).toBe(30);
      expect(p90.periodDays).toBe(90);
      // Longer period should produce >= deposits.
      expect(p90.transactionCount).toBeGreaterThanOrEqual(p30.transactionCount);
    });

    it('returns regularity within [40, 100]', async () => {
      const p = await adapter.getIncomePatterns('wallet-regular', 30);
      expect(p.depositRegularity).toBeGreaterThanOrEqual(40);
      expect(p.depositRegularity).toBeLessThanOrEqual(100);
    });
  });

  describe('getTransactionHistory', () => {
    it('returns transactions inside the requested window', async () => {
      const from = new Date('2026-01-01');
      const to = new Date('2026-02-01');
      const txs = await adapter.getTransactionHistory('wallet-h', { from, to });
      expect(txs.length).toBeGreaterThan(0);
      for (const t of txs) {
        expect(t.timestamp.getTime()).toBeGreaterThanOrEqual(from.getTime());
        expect(t.timestamp.getTime()).toBeLessThanOrEqual(to.getTime());
        expect(['credit', 'debit']).toContain(t.type);
        expect(t.status).toBe('completed');
        expect(t.amount).toMatch(/^\d+\.\d{4}$/);
      }
    });
  });
});
