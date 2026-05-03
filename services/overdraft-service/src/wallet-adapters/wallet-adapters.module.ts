import { DynamicModule, Logger, Module, Provider } from '@nestjs/common';

import { WALLET_DISBURSEMENT_ADAPTER } from '../drawdown/drawdown.service';
import { WALLET_COLLECTION_ADAPTER } from '../repayment/repayment.service';

import {
  MockWalletCollectionAdapter,
  MockWalletDisbursementAdapter,
} from './mock-wallet.adapter';

/**
 * DI registration for the wallet adapters consumed by the drawdown and
 * repayment flows. Two modes:
 *   - `mock` (default): in-memory `MockWallet*Adapter` classes that always
 *     succeed. Used in CI, local dev, and Sprint 11 end-to-end tests.
 *   - `live`: concrete adapters from `@lons/integration-service` (MTN MoMo,
 *     M-Pesa). Wired in Phase 5. Until then, `live` mode REFUSES to start
 *     rather than silently falling back to mock — a misconfigured `live`
 *     mode in staging or production would route real money operations
 *     through always-success mocks, which is a financial safety hazard.
 *
 * Mode is selected by `WALLET_ADAPTER_MODE` env var (default `mock`).
 *
 * When the live adapters land, replace the throw in `register()` with the
 * concrete provider list (`MtnMomoDisbursementAdapter`, `MPesaCollectionAdapter`,
 * etc.) — the call sites do not need to change.
 */
@Module({})
export class WalletAdaptersModule {
  private static readonly logger = new Logger('WalletAdaptersModule');

  static register(options: { liveAdapters?: Provider[] } = {}): DynamicModule {
    const mode = (process.env.WALLET_ADAPTER_MODE ?? 'mock').toLowerCase();

    if (mode === 'live') {
      if (!options.liveAdapters || options.liveAdapters.length === 0) {
        // Fail-fast: no real adapter registered means real-money flows
        // would silently route through always-success mocks. Block
        // module construction so the misconfiguration is loud and
        // immediate at startup, not a silent runtime data risk.
        const message =
          'WALLET_ADAPTER_MODE is "live" but no real adapter is registered. ' +
          'Refusing to start — set WALLET_ADAPTER_MODE=mock for development, ' +
          'or pass `liveAdapters` to WalletAdaptersModule.register() once the ' +
          'integration-service adapters are wired in Phase 5.';
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

    const providers: Provider[] = [
      MockWalletDisbursementAdapter,
      MockWalletCollectionAdapter,
      { provide: WALLET_DISBURSEMENT_ADAPTER, useExisting: MockWalletDisbursementAdapter },
      { provide: WALLET_COLLECTION_ADAPTER, useExisting: MockWalletCollectionAdapter },
    ];

    return {
      module: WalletAdaptersModule,
      providers,
      exports: [WALLET_DISBURSEMENT_ADAPTER, WALLET_COLLECTION_ADAPTER],
    };
  }
}
