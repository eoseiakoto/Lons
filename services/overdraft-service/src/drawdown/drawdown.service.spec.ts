/**
 * Drawdown service — pure-function tests for `calculateTransactionFee`.
 * The full drawdown flow (concurrency, partial-drawdown, wallet failure
 * rollback) requires a live DB and is covered by Sprint 11 integration
 * tests; here we lock down the fee calculation contract.
 */

import { DrawdownService } from './drawdown.service';
import { DrawdownStatus } from '@lons/database';

describe('DrawdownService.calculateTransactionFee', () => {
  const service = new DrawdownService(null as any, null as any, null as any);

  it('returns "0" when product has no fee config', () => {
    expect(service.calculateTransactionFee({ overdraftConfig: null }, '100.00')).toBe('0');
  });

  it('returns the flat amount, banker-rounded to 4dp', () => {
    expect(
      service.calculateTransactionFee(
        { overdraftConfig: { transactionFee: { type: 'flat', amount: '0.50' } } } as any,
        '100.00',
      ),
    ).toBe('0.5000');
  });

  it('computes percentage fees with Decimal precision', () => {
    // 100.00 × 0.005 = 0.5000
    expect(
      service.calculateTransactionFee(
        { overdraftConfig: { transactionFee: { type: 'percentage', rate: '0.005' } } } as any,
        '100.00',
      ),
    ).toBe('0.5000');
  });

  it('handles fractional shortfall * percentage rate without precision loss', () => {
    // 12345.6789 × 0.0125 = 154.32098625 → banker-rounded to 4dp = 154.3210
    expect(
      service.calculateTransactionFee(
        { overdraftConfig: { transactionFee: { type: 'percentage', rate: '0.0125' } } } as any,
        '12345.6789',
      ),
    ).toBe('154.3210');
  });

  it('returns "0" for unrecognized fee types', () => {
    expect(
      service.calculateTransactionFee(
        { overdraftConfig: { transactionFee: { type: 'tiered', amount: '5' } } } as any,
        '100.00',
      ),
    ).toBe('0');
  });
});

describe('DrawdownService.reverseDrawdown — Sprint 11 A3', () => {
  const TENANT = '11111111-1111-1111-1111-111111111111';
  const CREDIT_LINE_ID = '22222222-2222-2222-2222-222222222222';
  const DRAWDOWN_ID = '33333333-3333-3333-3333-333333333333';
  const CUSTOMER_ID = '44444444-4444-4444-4444-444444444444';
  const PRODUCT_ID = '55555555-5555-5555-5555-555555555555';

  function makeMocks(drawdown: any) {
    const updatedCreditLine = {
      id: CREDIT_LINE_ID,
      tenantId: TENANT,
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      currency: 'GHS',
      status: 'active',
      approvedLimit: '1000',
      availableBalance: '900',
      outstandingAmount: '100',
      interestRate: '0.10',
    };
    const prisma = {
      drawdown: {
        findFirst: jest.fn().mockResolvedValue(drawdown),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) =>
        fn({
          drawdown: { update: jest.fn() },
          creditLine: { update: jest.fn(async () => updatedCreditLine) },
        }),
      ),
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const cache = { put: jest.fn() };
    return { prisma, eventBus, cache };
  }

  it('restores balances and emits CREDITLINE_DRAWDOWN_REVERSED for a completed drawdown', async () => {
    const completedDrawdown = {
      id: DRAWDOWN_ID,
      tenantId: TENANT,
      creditLineId: CREDIT_LINE_ID,
      amount: '100',
      feeAmount: '5',
      transactionRef: 'txn-abc',
      status: DrawdownStatus.completed,
    };
    const { prisma, eventBus, cache } = makeMocks(completedDrawdown);

    const service = new DrawdownService(prisma as any, eventBus as any, cache as any);
    const result = await service.reverseDrawdown(TENANT, DRAWDOWN_ID, 'wallet_provider_reversed');

    expect(result).toEqual({ drawdownId: DRAWDOWN_ID, creditLineId: CREDIT_LINE_ID });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(cache.put).toHaveBeenCalled();
    const emit = eventBus.emitAndBuild.mock.calls[0];
    expect(emit[0]).toBe('creditline.drawdown.reversed');
    expect(emit[2]).toMatchObject({
      drawdownId: DRAWDOWN_ID,
      creditLineId: CREDIT_LINE_ID,
      amount: '100',
      feeAmount: '5',
      reason: 'wallet_provider_reversed',
    });
  });

  it('rejects reversing an initiated drawdown', async () => {
    const initiated = {
      id: DRAWDOWN_ID,
      tenantId: TENANT,
      creditLineId: CREDIT_LINE_ID,
      amount: '100',
      feeAmount: '5',
      transactionRef: 'txn-abc',
      status: DrawdownStatus.initiated,
    };
    const { prisma, eventBus, cache } = makeMocks(initiated);

    const service = new DrawdownService(prisma as any, eventBus as any, cache as any);
    await expect(service.reverseDrawdown(TENANT, DRAWDOWN_ID, 'x')).rejects.toThrow(
      /only completed drawdowns can be reversed/,
    );
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('throws when drawdown is not found in the tenant', async () => {
    const { prisma, eventBus, cache } = makeMocks(null);

    const service = new DrawdownService(prisma as any, eventBus as any, cache as any);
    await expect(service.reverseDrawdown(TENANT, DRAWDOWN_ID, 'x')).rejects.toThrow(/not found/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sprint 11 A12 — processDrawdown integration tests (mocked Prisma)
// ───────────────────────────────────────────────────────────────────────────

describe('DrawdownService.processDrawdown — A12 integration', () => {
  const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const PRODUCT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const CUSTOMER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const CL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const insufficientEvent = {
    customerId: CUSTOMER_ID,
    walletId: 'wallet-x',
    transactionAmount: '120',
    availableBalance: '20',
    shortfall: '100',
    transactionRef: 'txn-1',
    walletProvider: 'mtn_momo',
  };

  function makeProduct(overrides: any = {}) {
    return {
      id: PRODUCT_ID,
      tenantId: TENANT,
      currency: 'GHS',
      overdraftConfig: {
        transactionFee: { type: 'percentage', rate: '0.02' },
        partialDrawdownEnabled: false,
      },
      ...overrides,
    };
  }

  function makeCl(overrides: any = {}) {
    return {
      id: CL_ID,
      status: 'active',
      currency: 'GHS',
      approvedLimit: '1000',
      availableBalance: '1000',
      outstandingAmount: '0',
      interestRate: '0.10',
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      ...overrides,
    };
  }

  function makeMocks(opts: { cl: any | null; product: any | null; reserveOk?: boolean }) {
    const updatedCl = makeCl({
      availableBalance: '895',
      outstandingAmount: '100',
    });
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(opts.product) },
      creditLine: {
        findUnique: jest.fn().mockResolvedValue(opts.cl),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedCl),
      },
      drawdown: { update: jest.fn() },
      $transaction: jest.fn(async (fn: any) => {
        if (typeof fn === 'function') {
          return fn({
            $queryRaw: jest.fn(async () => {
              if (opts.reserveOk === false) return [];
              return [{
                available_balance: opts.cl?.availableBalance ?? '1000',
                status: opts.cl?.status ?? 'active',
                outstanding_amount: opts.cl?.outstandingAmount ?? '0',
                fees_outstanding: '0',
              }];
            }),
            creditLine: { update: jest.fn() },
            drawdown: {
              create: jest.fn(async () => ({ id: 'drawdown-1' })),
              update: jest.fn(),
            },
          });
        }
        return Array.isArray(fn) ? fn.map(() => ({})) : fn;
      }),
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const cache = {
      get: jest.fn().mockResolvedValue(opts.cl),
      put: jest.fn(),
      invalidate: jest.fn(),
      tryReserve: jest.fn().mockResolvedValue(
        opts.reserveOk === false
          ? { ok: false, reason: 'cache_miss' }
          : { ok: true, entry: opts.cl },
      ),
    };
    return { prisma, eventBus, cache };
  }

  it('declines invalid_amount when shortfall is non-positive', async () => {
    const { prisma, eventBus, cache } = makeMocks({ cl: null, product: null });
    const service = new DrawdownService(prisma as any, eventBus as any, cache as any);

    const result = await service.processDrawdown(
      TENANT,
      { ...insufficientEvent, shortfall: '0' },
      PRODUCT_ID,
      { disburse: jest.fn() } as any,
    );

    expect(result).toEqual({ status: 'declined', reason: 'invalid_amount' });
    const declineEvt = eventBus.emitAndBuild.mock.calls.find(
      (c) => c[0] === 'wallet.overdraft.declined',
    );
    expect(declineEvt).toBeDefined();
  });

  it('declines no_credit_line when the customer has no overdraft credit line', async () => {
    const { prisma, eventBus, cache } = makeMocks({ cl: null, product: null });
    cache.get = jest.fn().mockResolvedValue(undefined);
    const service = new DrawdownService(prisma as any, eventBus as any, cache as any);

    const result = await service.processDrawdown(
      TENANT,
      insufficientEvent,
      PRODUCT_ID,
      { disburse: jest.fn() } as any,
    );

    expect(result).toEqual({ status: 'declined', reason: 'no_credit_line' });
  });

  it('declines inactive_credit_line when the line is frozen/expired', async () => {
    const cl = makeCl({ status: 'frozen' });
    const { prisma, eventBus, cache } = makeMocks({ cl, product: makeProduct() });
    const service = new DrawdownService(prisma as any, eventBus as any, cache as any);

    const result = await service.processDrawdown(
      TENANT,
      insufficientEvent,
      PRODUCT_ID,
      { disburse: jest.fn() } as any,
    );

    expect(result).toEqual({ status: 'declined', reason: 'inactive_credit_line' });
  });

  it('declines insufficient_limit without partial drawdown when fullCharge exceeds availableBalance', async () => {
    const cl = makeCl({ availableBalance: '50', outstandingAmount: '950' });
    const product = makeProduct(); // partialDrawdownEnabled: false
    const { prisma, eventBus, cache } = makeMocks({ cl, product });
    const service = new DrawdownService(prisma as any, eventBus as any, cache as any);

    const result = await service.processDrawdown(
      TENANT,
      insufficientEvent,
      PRODUCT_ID,
      { disburse: jest.fn() } as any,
    );

    expect(result).toEqual({ status: 'declined', reason: 'insufficient_limit' });
  });

  it('approves a drawdown end-to-end and emits the completion event', async () => {
    const cl = makeCl();
    const product = makeProduct();
    const { prisma, eventBus, cache } = makeMocks({ cl, product });
    const adapter = {
      disburse: jest.fn().mockResolvedValue({ success: true, walletRef: 'mock-1' }),
    };
    const service = new DrawdownService(prisma as any, eventBus as any, cache as any);

    const result = await service.processDrawdown(
      TENANT,
      insufficientEvent,
      PRODUCT_ID,
      adapter as any,
    );

    expect(result.status).toBe('approved');
    expect(adapter.disburse).toHaveBeenCalled();
    const eventNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('creditline.drawdown.initiated');
    expect(eventNames).toContain('creditline.drawdown.completed');
  });

  it('rolls back balances when wallet disbursement fails after reservation', async () => {
    const cl = makeCl();
    const product = makeProduct();
    const { prisma, eventBus, cache } = makeMocks({ cl, product });

    // Override $transaction so the rollback path runs the second-call inner.
    const txCallTrack: any[] = [];
    prisma.$transaction = jest.fn(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn(async () => [{
          available_balance: '1000',
          status: 'active',
          outstanding_amount: '0',
          fees_outstanding: '0',
        }]),
        creditLine: { update: jest.fn(async () => makeCl({ status: 'active' })) },
        drawdown: {
          create: jest.fn(async () => ({ id: 'drawdown-rollback' })),
          update: jest.fn(),
        },
      };
      txCallTrack.push(tx);
      const result = await fn(tx);
      return result ?? makeCl();
    });

    const adapter = {
      disburse: jest.fn().mockResolvedValue({ success: false, reason: 'wallet_offline' }),
    };
    const service = new DrawdownService(prisma as any, eventBus as any, cache as any);

    const result = await service.processDrawdown(
      TENANT,
      insufficientEvent,
      PRODUCT_ID,
      adapter as any,
    );

    expect(result.status).toBe('declined');
    expect(adapter.disburse).toHaveBeenCalled();
    const eventNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(eventNames).toContain('creditline.drawdown.failed');
  });
});
