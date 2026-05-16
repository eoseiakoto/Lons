import { DynamicModule, Logger, Module, Provider } from '@nestjs/common';

import {
  WALLET_COLLECTION_ADAPTER,
  WALLET_DISBURSEMENT_ADAPTER,
} from './wallet-adapter.interface';
import {
  SharedMockWalletCollectionAdapter,
  SharedMockWalletDisbursementAdapter,
} from './mock-wallet.adapter';

/**
 * Sprint 15 (S15-8) — shared wallet adapter DI module.
 *
 * Two modes, same env switch as the legacy overdraft-side module:
 *   - `WALLET_ADAPTER_MODE=mock` (default): in-memory deterministic
 *     mocks. Used by CI, local dev, and the AutoDeductionJob integration
 *     tests.
 *   - `WALLET_ADAPTER_MODE=live`: requires `liveAdapters` to be passed
 *     in. Throws at module construction if missing — a live mode with no
 *     real adapter is a silent route into mock-always-succeed for real
 *     money flows, which is a financial-safety hazard.
 *
 * The legacy `services/overdraft-service/.../wallet-adapters.module.ts`
 * is untouched — both modules coexist during the migration window.
 */
@Module({})
export class WalletAdaptersModule {
  private static readonly logger = new Logger('WalletAdaptersModule');

  static register(options: { liveAdapters?: Provider[] } = {}): DynamicModule {
    const mode = (process.env.WALLET_ADAPTER_MODE ?? 'mock').toLowerCase();

    if (mode === 'live') {
      if (!options.liveAdapters || options.liveAdapters.length === 0) {
        const message =
          'WALLET_ADAPTER_MODE is "live" but no real adapter is registered. ' +
          'Refusing to start — set WALLET_ADAPTER_MODE=mock for development, ' +
          'or pass `liveAdapters` to WalletAdaptersModule.register() once ' +
          'the integration-service adapters are wired in Phase 5.';
        this.logger.error(message);
        throw new Error(message);
      }
      return {
        module: WalletAdaptersModule,
        providers: options.liveAdapters,
        exports: [WALLET_DISBURSEMENT_ADAPTER, WALLET_COLLECTION_ADAPTER],
      };
    }

    if (mode !== 'mock') {
      this.logger.warn(
        `Unknown WALLET_ADAPTER_MODE="${mode}" — defaulting to mock. Valid values: "mock", "live".`,
      );
    }

    return {
      module: WalletAdaptersModule,
      providers: [
        SharedMockWalletDisbursementAdapter,
        SharedMockWalletCollectionAdapter,
        {
          provide: WALLET_DISBURSEMENT_ADAPTER,
          useExisting: SharedMockWalletDisbursementAdapter,
        },
        {
          provide: WALLET_COLLECTION_ADAPTER,
          useExisting: SharedMockWalletCollectionAdapter,
        },
      ],
      exports: [WALLET_DISBURSEMENT_ADAPTER, WALLET_COLLECTION_ADAPTER],
    };
  }
}
