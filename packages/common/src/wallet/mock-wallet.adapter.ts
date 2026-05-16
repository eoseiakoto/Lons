import { Injectable, Logger } from '@nestjs/common';

import {
  IWalletCollectionAdapter,
  IWalletDisbursementAdapter,
  WalletAdapterResult,
} from './wallet-adapter.interface';

/**
 * Sprint 15 (S15-8) — shared deterministic mock adapters for CI + dev.
 *
 * Outcome is deterministic by `walletId` hash so same-day idempotency
 * tests in the scheduler can rely on stable outcomes between runs:
 *   - even hash → success
 *   - odd hash  → failure with reason `insufficient_balance`
 *
 * The legacy mocks in `overdraft-service/.../mock-wallet.adapter.ts` and
 * `process-engine/.../wallet-collection-adapter.ts` use the same hash
 * pattern; this consolidated copy serves the new AutoDeductionJob
 * (S15-4) and any future installment-loan service.
 */

function hashWalletId(walletId: string): number {
  let h = 0;
  for (let i = 0; i < walletId.length; i++) {
    h = (h * 31 + walletId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

@Injectable()
export class SharedMockWalletDisbursementAdapter
  implements IWalletDisbursementAdapter
{
  private readonly logger = new Logger('SharedMockWalletDisbursementAdapter');
  private counter = 0;

  async disburse(input: {
    walletId: string;
    amount: string;
    reference: string;
    currency: string;
  }): Promise<WalletAdapterResult> {
    this.counter += 1;
    const success = hashWalletId(input.walletId) % 2 === 0;
    if (!success) {
      this.logger.log(
        `Mock-disburse FAILED for wallet ${input.walletId.slice(0, 8)}… ref=${input.reference}`,
      );
      return { success: false, reason: 'wallet_rejected' };
    }
    const walletRef = `MOCK-DISBURSE-${Date.now()}-${this.counter}`;
    this.logger.log(
      `Mock-disburse OK for wallet ${input.walletId.slice(0, 8)}… amount=${input.amount} ${input.currency} ref=${input.reference}`,
    );
    return { success: true, walletRef };
  }
}

@Injectable()
export class SharedMockWalletCollectionAdapter
  implements IWalletCollectionAdapter
{
  private readonly logger = new Logger('SharedMockWalletCollectionAdapter');
  private counter = 0;

  async collect(input: {
    walletId: string;
    amount: string;
    reference: string;
  }): Promise<WalletAdapterResult> {
    this.counter += 1;
    const success = hashWalletId(input.walletId) % 2 === 0;
    if (!success) {
      this.logger.log(
        `Mock-collect FAILED for wallet ${input.walletId.slice(0, 8)}… ref=${input.reference}`,
      );
      return { success: false, reason: 'insufficient_balance' };
    }
    const walletRef = `MOCK-COLLECT-${Date.now()}-${this.counter}`;
    this.logger.log(
      `Mock-collect OK for wallet ${input.walletId.slice(0, 8)}… amount=${input.amount} ref=${input.reference}`,
    );
    return { success: true, walletRef };
  }
}

export { hashWalletId };
