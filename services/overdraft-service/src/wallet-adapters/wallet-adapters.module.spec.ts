/**
 * Wallet adapters module — focused on the financial-safety guard PM
 * called out in the Sprint 11 A9 review: when `WALLET_ADAPTER_MODE=live`
 * but no real adapter is registered, the module MUST refuse to start
 * rather than silently routing real-money operations through mocks.
 */

import { WALLET_DISBURSEMENT_ADAPTER } from '../drawdown/drawdown.service';
import { WALLET_COLLECTION_ADAPTER } from '../repayment/repayment.service';

import { WalletAdaptersModule } from './wallet-adapters.module';

describe('WalletAdaptersModule.register', () => {
  const ORIGINAL_MODE = process.env.WALLET_ADAPTER_MODE;

  afterEach(() => {
    if (ORIGINAL_MODE === undefined) delete process.env.WALLET_ADAPTER_MODE;
    else process.env.WALLET_ADAPTER_MODE = ORIGINAL_MODE;
  });

  it('defaults to mock mode when WALLET_ADAPTER_MODE is unset', () => {
    delete process.env.WALLET_ADAPTER_MODE;

    const dyn = WalletAdaptersModule.register();
    const tokens = dyn.exports;

    expect(tokens).toContain(WALLET_DISBURSEMENT_ADAPTER);
    expect(tokens).toContain(WALLET_COLLECTION_ADAPTER);
    expect(dyn.providers && dyn.providers.length).toBeGreaterThan(0);
  });

  it('registers mock adapters when WALLET_ADAPTER_MODE="mock"', () => {
    process.env.WALLET_ADAPTER_MODE = 'mock';

    const dyn = WalletAdaptersModule.register();

    expect(dyn.providers && dyn.providers.length).toBeGreaterThan(0);
  });

  it('falls back to mock with a warning for unknown modes', () => {
    process.env.WALLET_ADAPTER_MODE = 'staging';

    const dyn = WalletAdaptersModule.register();

    // Should still produce providers (mock fallback) — the warning is
    // logged but doesn't block module construction.
    expect(dyn.providers && dyn.providers.length).toBeGreaterThan(0);
  });

  it('THROWS when WALLET_ADAPTER_MODE="live" and no live adapter is supplied (financial safety guard)', () => {
    process.env.WALLET_ADAPTER_MODE = 'live';

    expect(() => WalletAdaptersModule.register()).toThrow(
      /WALLET_ADAPTER_MODE is "live" but no real adapter is registered/,
    );
  });

  it('THROWS when live mode receives an empty liveAdapters array', () => {
    process.env.WALLET_ADAPTER_MODE = 'live';

    expect(() => WalletAdaptersModule.register({ liveAdapters: [] })).toThrow(
      /Refusing to start/,
    );
  });

  it('accepts live mode when concrete adapters are supplied', () => {
    process.env.WALLET_ADAPTER_MODE = 'live';

    const liveAdapters = [
      { provide: WALLET_DISBURSEMENT_ADAPTER, useValue: { disburse: jest.fn() } },
      { provide: WALLET_COLLECTION_ADAPTER, useValue: { collect: jest.fn() } },
    ];

    const dyn = WalletAdaptersModule.register({ liveAdapters });

    expect(dyn.providers).toBe(liveAdapters);
    expect(dyn.exports).toEqual([WALLET_DISBURSEMENT_ADAPTER, WALLET_COLLECTION_ADAPTER]);
  });

  it('mode comparison is case-insensitive (LIVE → live)', () => {
    process.env.WALLET_ADAPTER_MODE = 'LIVE';

    expect(() => WalletAdaptersModule.register()).toThrow(
      /Refusing to start/,
    );
  });
});
