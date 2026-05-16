/**
 * Sprint 15 (S15-8) — shared wallet adapter interfaces.
 *
 * Both the overdraft and BNPL services have their own copies of these
 * interfaces + DI tokens (`overdraft-service/.../repayment.service.ts`
 * and `process-engine/.../bnpl/wallet-collection-adapter.ts`). The
 * shapes are nearly identical. Centralising here lets the new Sprint 15
 * AutoDeductionJob (and any future installment-loan products) consume
 * the same wallet stack without re-declaring the contract.
 *
 * **Migration note.** The existing service-local interfaces remain in
 * place for backwards compatibility — flipping every call site at once
 * is risky and unnecessary. New services should import from
 * `@lons/common/wallet` directly. The intent is that
 * `services/integration-service` will eventually provide concrete
 * adapters that implement these interfaces and bind to the shared
 * tokens via `WalletAdaptersModule.forRoot()`.
 *
 * Money is Decimal-as-string per CLAUDE.md.
 */

export type WalletAdapterResult =
  | { success: true; walletRef: string }
  | { success: false; reason: string };

export interface IWalletDisbursementAdapter {
  disburse(input: {
    walletId: string;
    amount: string;
    reference: string;
    currency: string;
  }): Promise<WalletAdapterResult>;
}

export interface IWalletCollectionAdapter {
  collect(input: {
    walletId: string;
    amount: string;
    reference: string;
  }): Promise<WalletAdapterResult>;
}

/**
 * DI tokens. Use as `@Inject(WALLET_*_ADAPTER)`. Apps wire concrete
 * providers via `WalletAdaptersModule.forRoot({ disbursementAdapter,
 * collectionAdapter })` or via the env-mode `register()` factory in
 * `services/overdraft-service` (legacy).
 */
export const WALLET_DISBURSEMENT_ADAPTER = Symbol.for(
  'lons.WALLET_DISBURSEMENT_ADAPTER',
);
export const WALLET_COLLECTION_ADAPTER = Symbol.for(
  'lons.WALLET_COLLECTION_ADAPTER',
);
