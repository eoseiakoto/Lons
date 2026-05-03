/**
 * Wallet webhook controller — Sprint 11 A10 tests for the dual-path
 * wallet→customer resolver. The fast path uses the new
 * `wallet_account_mappings` table; the legacy fallback scans
 * `customer.metadata.walletId` so deployments without a backfill still
 * route correctly.
 */

import { WalletWebhookController } from './wallet-webhook.controller';

describe('WalletWebhookController.resolveWallet (Sprint 11 A10)', () => {
  const TENANT = '11111111-1111-1111-1111-111111111111';
  const CUSTOMER = '22222222-2222-2222-2222-222222222222';

  function makePrisma(opts: { mapping?: any; legacyMatches?: any[] } = {}) {
    const prisma = {
      enterTenantContext: jest.fn(async (_ctx: any, fn: any) => fn()),
      walletAccountMapping: {
        findUnique: jest.fn().mockResolvedValue(opts.mapping ?? null),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue(opts.legacyMatches ?? []),
      },
    };
    return prisma;
  }

  function makeController(prisma: any) {
    const eventBus = { emitAndBuild: jest.fn() };
    return new WalletWebhookController(prisma as any, eventBus as any);
  }

  it('resolves via the indexed wallet_account_mappings table when present (fast path)', async () => {
    const prisma = makePrisma({
      mapping: { tenantId: TENANT, customerId: CUSTOMER },
    });
    const controller = makeController(prisma);

    const result = await (controller as any).resolveWallet('wallet-abc', 'mtn_momo');

    expect(result).toEqual({ tenantId: TENANT, customerId: CUSTOMER });
    expect(prisma.walletAccountMapping.findUnique).toHaveBeenCalledWith({
      where: { provider_walletId: { provider: 'mtn_momo', walletId: 'wallet-abc' } },
      select: { tenantId: true, customerId: true },
    });
    // Legacy scan must NOT run when the fast path hits.
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('falls back to customer.metadata scan when no mapping row exists (transition period)', async () => {
    const prisma = makePrisma({
      mapping: null,
      legacyMatches: [{ id: CUSTOMER, tenantId: TENANT }],
    });
    const controller = makeController(prisma);

    const result = await (controller as any).resolveWallet('wallet-abc', 'mtn_momo');

    expect(result).toEqual({ tenantId: TENANT, customerId: CUSTOMER });
    expect(prisma.customer.findMany).toHaveBeenCalled();
  });

  it('returns null when neither path finds a customer', async () => {
    const prisma = makePrisma({ mapping: null, legacyMatches: [] });
    const controller = makeController(prisma);

    const result = await (controller as any).resolveWallet('wallet-unknown', 'mtn_momo');

    expect(result).toBeNull();
  });

  it('refuses to route when the legacy scan finds multiple customers (data integrity guard)', async () => {
    const prisma = makePrisma({
      mapping: null,
      legacyMatches: [
        { id: 'a', tenantId: TENANT },
        { id: 'b', tenantId: 'other-tenant' },
      ],
    });
    const controller = makeController(prisma);

    const result = await (controller as any).resolveWallet('wallet-abc', 'mtn_momo');

    expect(result).toBeNull();
  });

  it('disambiguates by provider — same walletId on two providers is two distinct mappings', async () => {
    // Critical correctness guarantee: provider is part of the unique key
    // so the same walletId string can exist on different providers without
    // collision. Verify the lookup includes provider.
    const prisma = makePrisma({
      mapping: { tenantId: TENANT, customerId: CUSTOMER },
    });
    const controller = makeController(prisma);

    await (controller as any).resolveWallet('wallet-abc', 'mpesa');

    expect(prisma.walletAccountMapping.findUnique).toHaveBeenCalledWith({
      where: { provider_walletId: { provider: 'mpesa', walletId: 'wallet-abc' } },
      select: { tenantId: true, customerId: true },
    });
  });
});
