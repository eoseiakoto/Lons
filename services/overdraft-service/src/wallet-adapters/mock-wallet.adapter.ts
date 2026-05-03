import { Injectable, Logger } from '@nestjs/common';

import {
  WalletDisbursementAdapter,
} from '../drawdown/drawdown.service';
import { WalletCollectionAdapter } from '../repayment/repayment.service';

/**
 * In-memory mock disbursement adapter. Always succeeds and returns a
 * deterministic synthetic walletRef. Used for end-to-end tests, CI, and
 * local development before the real MTN MoMo / M-Pesa adapters land in
 * Phase 5. Real implementations live in `services/integration-service`.
 */
@Injectable()
export class MockWalletDisbursementAdapter implements WalletDisbursementAdapter {
  private readonly logger = new Logger('MockWalletDisbursementAdapter');
  private counter = 0;

  async disburse(input: { walletId: string; amount: string; transactionRef: string }) {
    this.counter += 1;
    const walletRef = `MOCK-DISBURSE-${Date.now()}-${this.counter}`;
    this.logger.log(
      `Disbursing ${input.amount} to wallet ${input.walletId.slice(0, 8)}… ref=${input.transactionRef}`,
    );
    return { success: true as const, walletRef };
  }
}

/**
 * In-memory mock collection adapter. Always succeeds. See
 * `MockWalletDisbursementAdapter` for the rationale.
 */
@Injectable()
export class MockWalletCollectionAdapter implements WalletCollectionAdapter {
  private readonly logger = new Logger('MockWalletCollectionAdapter');
  private counter = 0;

  async collect(input: { walletId: string; amount: string; reference: string }) {
    this.counter += 1;
    const walletRef = `MOCK-COLLECT-${Date.now()}-${this.counter}`;
    this.logger.log(
      `Collecting ${input.amount} from wallet ${input.walletId.slice(0, 8)}… ref=${input.reference}`,
    );
    return { success: true as const, walletRef };
  }
}
