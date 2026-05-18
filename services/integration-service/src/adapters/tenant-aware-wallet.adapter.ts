import { Inject, Injectable, Logger } from '@nestjs/common';

import { getTenantId } from '@lons/common';
import type {
  BalanceInfo,
  CollectionParams,
  IWalletAdapter,
  TransactionStatusResult,
  TransferParams,
  TransferResult,
} from '@lons/process-engine';

import { WalletAdapterResolver } from './wallet-adapter-resolver.service';

/**
 * S18-FIX-10 — Production proxy for the singleton `WALLET_ADAPTER` token.
 *
 * The disbursement service injects `WALLET_ADAPTER` as a single
 * `IWalletAdapter`, but each tenant routes through a different upstream
 * (MTN MoMo, M-Pesa, generic, mock). This proxy bridges the two: it
 * implements `IWalletAdapter` and, for every call, resolves the
 * current tenant's adapter via {@link WalletAdapterResolver}.
 *
 * Tenant context is read from the AsyncLocalStorage `requestContext`
 * populated by `CorrelationIdMiddleware` for HTTP and by GraphQL
 * resolvers' tenant-binding wrappers. If no tenant is in context (e.g.
 * direct service-to-service call missing the bridge) the proxy throws
 * — failing loud is preferable to silently routing to the mock.
 *
 * Wiring lives in the graphql-server composition root; see the
 * WALLET_ADAPTER override in `apps/graphql-server/src/app.module.ts`.
 */
@Injectable()
export class TenantAwareWalletAdapter implements IWalletAdapter {
  private readonly logger = new Logger(TenantAwareWalletAdapter.name);

  constructor(
    @Inject(WalletAdapterResolver)
    private readonly resolver: WalletAdapterResolver,
  ) {}

  async transfer(params: TransferParams): Promise<TransferResult> {
    const adapter = await this.resolveCurrent();
    return adapter.transfer(params);
  }

  async collect(params: CollectionParams): Promise<TransferResult> {
    const adapter = await this.resolveCurrent();
    if (!adapter.collect) {
      throw new Error(
        'Resolved wallet adapter does not support collect()',
      );
    }
    return adapter.collect(params);
  }

  async getBalance(walletId: string): Promise<BalanceInfo> {
    const adapter = await this.resolveCurrent();
    if (!adapter.getBalance) {
      throw new Error(
        'Resolved wallet adapter does not support getBalance()',
      );
    }
    return adapter.getBalance(walletId);
  }

  async getTransactionStatus(
    reference: string,
  ): Promise<TransactionStatusResult> {
    const adapter = await this.resolveCurrent();
    if (!adapter.getTransactionStatus) {
      throw new Error(
        'Resolved wallet adapter does not support getTransactionStatus()',
      );
    }
    return adapter.getTransactionStatus(reference);
  }

  private async resolveCurrent(): Promise<IWalletAdapter> {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error(
        'TenantAwareWalletAdapter: no tenant in requestContext — caller must run inside a tenant-bound async scope',
      );
    }
    return this.resolver.resolve(tenantId);
  }
}
