import { MockWalletAdapter } from './mock-wallet.adapter';

describe('MockWalletAdapter', () => {
  let adapter: MockWalletAdapter;

  beforeEach(() => {
    adapter = new MockWalletAdapter({ latency_ms: 0, webhook_delay_ms: 0 });
  });

  describe('getCustomerInfo', () => {
    it('returns deterministic customer data for a walletId', async () => {
      const info1 = await adapter.getCustomerInfo('wallet-001');
      const info2 = await adapter.getCustomerInfo('wallet-001');
      expect(info1.walletId).toBe('wallet-001');
      expect(info1.fullName).toBeTruthy();
      expect(info1.fullName).toBe(info2.fullName);
      expect(info1.kycLevel).toBe(info2.kycLevel);
      expect(['full', 'partial', 'none']).toContain(info1.kycLevel);
    });

    it('returns different data for different walletIds', async () => {
      const info1 = await adapter.getCustomerInfo('wallet-001');
      const info2 = await adapter.getCustomerInfo('wallet-999');
      // Very unlikely to be same name for different wallet IDs
      expect(info1.walletId).not.toBe(info2.walletId);
    });
  });

  describe('getBalance', () => {
    it('returns initial balance for new wallet', async () => {
      const balance = await adapter.getBalance('new-wallet');
      expect(balance.available).toBe('50000.0000');
      expect(balance.currency).toBeTruthy();
    });

    it('returns configured initial balance', async () => {
      const customAdapter = new MockWalletAdapter({
        latency_ms: 0,
        initial_balance: 100000,
      });
      const balance = await customAdapter.getBalance('wallet-x');
      expect(balance.available).toBe('100000.0000');
    });
  });

  describe('transfer (disburse)', () => {
    it('succeeds and updates balance', async () => {
      const result = await adapter.transfer({
        destination: 'wallet-abc',
        amount: '1000.0000',
        currency: 'GHS',
        reference: 'ref-001',
      });
      expect(result.success).toBe(true);
      expect(result.externalRef).toBeTruthy();

      const balance = await adapter.getBalance('wallet-abc');
      expect(balance.available).toBe('51000.0000');
    });

    it('returns externalRef on success', async () => {
      const result = await adapter.transfer({
        destination: 'wallet-abc',
        amount: '500.0000',
        currency: 'GHS',
        reference: 'ref-002',
      });
      expect(result.externalRef).toMatch(/^mock-tx-/);
    });
  });

  describe('collect', () => {
    it('succeeds and deducts from balance', async () => {
      const result = await adapter.collect({
        source: 'wallet-collect',
        amount: '500.0000',
        currency: 'GHS',
        reference: 'col-001',
      });
      expect(result.success).toBe(true);

      const balance = await adapter.getBalance('wallet-collect');
      expect(balance.available).toBe('49500.0000');
    });

    it('fails with INSUFFICIENT_FUNDS when balance too low', async () => {
      const result = await adapter.collect({
        source: 'wallet-low',
        amount: '999999.0000',
        currency: 'GHS',
        reference: 'col-002',
      });
      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('getTransactionStatus', () => {
    it('returns status for known transactions', async () => {
      await adapter.transfer({
        destination: 'wallet-status',
        amount: '100.0000',
        currency: 'GHS',
        reference: 'status-ref',
      });

      const status = await adapter.getTransactionStatus('status-ref');
      expect(status.reference).toBe('status-ref');
      expect(['pending', 'completed']).toContain(status.status);
      expect(status.amount).toBe('100.0000');
    });

    it('returns failed for unknown transactions', async () => {
      const status = await adapter.getTransactionStatus('unknown-ref');
      expect(status.status).toBe('failed');
      expect(status.failureReason).toBe('TRANSACTION_NOT_FOUND');
    });
  });

  describe('getTransactionHistory', () => {
    it('returns synthetic transactions for wallets with no history', async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const history = await adapter.getTransactionHistory('wallet-hist', {
        from: thirtyDaysAgo,
        to: now,
      });
      expect(history.length).toBeGreaterThan(0);
      history.forEach((tx) => {
        expect(tx.walletId).toBe('wallet-hist');
        expect(['credit', 'debit']).toContain(tx.type);
        expect(tx.amount).toBeTruthy();
      });
    });
  });

  describe('registerWebhook', () => {
    it('stores webhook registration', async () => {
      const reg = await adapter.registerWebhook(
        ['transfer.completed'],
        'https://example.com/webhook',
      );
      expect(reg.id).toBeTruthy();
      expect(reg.events).toEqual(['transfer.completed']);
      expect(reg.callbackUrl).toBe('https://example.com/webhook');
      expect(reg.active).toBe(true);
    });
  });

  describe('failure_rate simulation', () => {
    it('fails transfers when failure_rate is 1.0', async () => {
      const failAdapter = new MockWalletAdapter({
        latency_ms: 0,
        failure_rate: 1.0,
        webhook_delay_ms: 0,
      });
      const result = await failAdapter.transfer({
        destination: 'wallet-fail',
        amount: '100.0000',
        currency: 'GHS',
        reference: 'fail-ref',
      });
      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('SIMULATED_FAILURE');
    });
  });

  describe('balance tracking across operations', () => {
    it('tracks balance correctly across disburse and collect', async () => {
      // Initial: 50000
      await adapter.transfer({
        destination: 'wallet-track',
        amount: '5000.0000',
        currency: 'GHS',
        reference: 'track-1',
      });
      // Balance: 55000

      await adapter.collect({
        source: 'wallet-track',
        amount: '2000.0000',
        currency: 'GHS',
        reference: 'track-2',
      });
      // Balance: 53000

      const balance = await adapter.getBalance('wallet-track');
      expect(balance.available).toBe('53000.0000');
    });
  });
});
