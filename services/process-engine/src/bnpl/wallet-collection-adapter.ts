import { Injectable, Logger } from '@nestjs/common';

/**
 * BNPL wallet collection adapter (Sprint 12 G2).
 *
 * Same shape as the overdraft `WalletCollectionAdapter`
 * (`services/overdraft-service/src/repayment/repayment.service.ts`) — kept
 * locally in `bnpl/` so the BNPL service has no upstream dependency on the
 * overdraft module. Phase 5 will swap the mock for the real MTN MoMo /
 * M-Pesa adapter from `services/integration-service`; the call sites do
 * not need to change.
 */
export interface BnplCollectionAdapter {
  collect(input: {
    walletId: string;
    amount: string;
    reference: string;
  }): Promise<
    | { success: true; walletRef: string }
    | { success: false; reason: string }
  >;
}

export const BNPL_COLLECTION_ADAPTER = Symbol('BNPL_COLLECTION_ADAPTER');

/**
 * Mock adapter for tests, CI, and local dev. Outcome is deterministic by
 * `walletId` hash so the same customer always succeeds or always fails:
 *
 *   - even hash → `success`
 *   - odd hash  → `insufficient_balance`
 *
 * Determinism is critical so the same-day idempotency tests on the
 * scheduler can rely on stable outcomes between runs. Real wallet
 * adapters land in Phase 5.
 */
@Injectable()
export class MockBnplCollectionAdapter implements BnplCollectionAdapter {
  private readonly logger = new Logger('MockBnplCollectionAdapter');
  private counter = 0;

  async collect(input: {
    walletId: string;
    amount: string;
    reference: string;
  }): Promise<
    | { success: true; walletRef: string }
    | { success: false; reason: string }
  > {
    this.counter += 1;
    const success = hashWalletId(input.walletId) % 2 === 0;
    if (!success) {
      this.logger.log(
        `Mock-collect FAILED for wallet ${input.walletId.slice(0, 8)}… amount=${input.amount} ref=${input.reference}`,
      );
      return { success: false, reason: 'insufficient_balance' };
    }
    const walletRef = `MOCK-BNPL-COLLECT-${Date.now()}-${this.counter}`;
    this.logger.log(
      `Mock-collect OK for wallet ${input.walletId.slice(0, 8)}… amount=${input.amount} ref=${input.reference}`,
    );
    return { success: true, walletRef };
  }
}

/** Cheap deterministic hash — exported for the deterministic tests. */
export function hashWalletId(walletId: string): number {
  let h = 0;
  for (let i = 0; i < walletId.length; i++) {
    h = (h * 31 + walletId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
