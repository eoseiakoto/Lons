/**
 * Mock wallet adapters — Sprint 11 A9. The real adapters live in
 * `services/integration-service` (Phase 5). These mocks always succeed so
 * end-to-end overdraft flows can be exercised without external dependencies.
 */

import {
  MockWalletCollectionAdapter,
  MockWalletDisbursementAdapter,
} from './mock-wallet.adapter';

describe('MockWalletDisbursementAdapter', () => {
  it('always returns success with a deterministic walletRef prefix', async () => {
    const adapter = new MockWalletDisbursementAdapter();
    const result = await adapter.disburse({
      walletId: 'wallet-1234567890',
      amount: '100.0000',
      transactionRef: 'txn-abc',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.walletRef).toMatch(/^MOCK-DISBURSE-/);
    }
  });

  it('returns unique walletRefs across consecutive calls', async () => {
    const adapter = new MockWalletDisbursementAdapter();
    const a = await adapter.disburse({ walletId: 'w', amount: '10', transactionRef: '1' });
    const b = await adapter.disburse({ walletId: 'w', amount: '10', transactionRef: '2' });
    if (a.success && b.success) {
      expect(a.walletRef).not.toBe(b.walletRef);
    }
  });
});

describe('MockWalletCollectionAdapter', () => {
  it('always returns success with a deterministic walletRef prefix', async () => {
    const adapter = new MockWalletCollectionAdapter();
    const result = await adapter.collect({
      walletId: 'wallet-1234567890',
      amount: '100.0000',
      reference: 'rep-abc',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.walletRef).toMatch(/^MOCK-COLLECT-/);
    }
  });
});
