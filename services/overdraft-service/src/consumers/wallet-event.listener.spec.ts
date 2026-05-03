/**
 * Wallet event listener — Sprint 11 A12 coverage. The listener bridges
 * EventEmitter2 events from the webhook controller into the BullMQ
 * queue with idempotency keys + retry/backoff. We mock the queue and
 * verify the right job shape and options are enqueued.
 */

import { WalletEventListener } from './wallet-event.listener';
import {
  WALLET_EVENTS_QUEUE,
  WALLET_JOB_CREDITED,
  WALLET_JOB_INSUFFICIENT,
} from './wallet-event.types';

describe('WalletEventListener', () => {
  const TENANT = '11111111-1111-1111-1111-111111111111';

  function makeQueue() {
    return { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
  }

  describe('onInsufficient', () => {
    it('enqueues an insufficient-balance job with retry config and idempotency key', async () => {
      const queue = makeQueue();
      const listener = new WalletEventListener(queue as any);

      await listener.onInsufficient({
        event: 'wallet.balance.insufficient',
        tenantId: TENANT,
        timestamp: '2026-05-02T00:00:00Z',
        correlationId: 'cor-1',
        data: {
          customerId: 'cust-1',
          walletId: 'wallet-x',
          transactionAmount: '120',
          availableBalance: '20',
          shortfall: '100',
          transactionRef: 'txn-1',
          walletProvider: 'mtn_momo',
        },
      });

      expect(queue.add).toHaveBeenCalledWith(
        WALLET_JOB_INSUFFICIENT,
        expect.objectContaining({
          tenantId: TENANT,
          event: expect.objectContaining({ transactionRef: 'txn-1' }),
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          jobId: 'insuff-txn-1', // transactionRef-keyed for idempotency
        }),
      );
    });
  });

  describe('onCredited', () => {
    it('enqueues a wallet-credited job with retry config and idempotency key', async () => {
      const queue = makeQueue();
      const listener = new WalletEventListener(queue as any);

      await listener.onCredited({
        event: 'wallet.balance.credited',
        tenantId: TENANT,
        timestamp: '2026-05-02T00:00:00Z',
        correlationId: 'cor-2',
        data: {
          customerId: 'cust-1',
          walletId: 'wallet-x',
          creditAmount: '500',
          newBalance: '550',
          transactionRef: 'txn-2',
          walletProvider: 'mtn_momo',
        },
      } as any);

      expect(queue.add).toHaveBeenCalledWith(
        WALLET_JOB_CREDITED,
        expect.objectContaining({
          tenantId: TENANT,
          customerId: 'cust-1',
          creditAmount: '500',
          transactionRef: 'txn-2',
        }),
        expect.objectContaining({
          attempts: 3,
          jobId: 'cred-txn-2',
        }),
      );
    });
  });

  it('uses the queue name expected by the consumer', () => {
    expect(WALLET_EVENTS_QUEUE).toBe('overdraft-wallet-events');
  });
});
