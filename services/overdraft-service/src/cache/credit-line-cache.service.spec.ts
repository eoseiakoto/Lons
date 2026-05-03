/**
 * Cache service — focuses on `tryReserve`, the atomic balance reservation
 * used by the drawdown hot path. The principal/fee split (Sprint 11 A7)
 * is locked down here so a regression can't silently re-introduce the bug
 * where fees were added to `outstandingAmount`.
 */

import { CreditLineCacheService, CreditLineCacheEntry } from './credit-line-cache.service';

class FakeRedis {
  private store = new Map<string, string>();

  async watch(_key: string): Promise<'OK'> {
    return 'OK';
  }

  async unwatch(): Promise<'OK'> {
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, _mode?: string, _ttl?: number): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const self = this;
    return {
      set(key: string, value: string, mode?: string, ttl?: number) {
        ops.push(() => self.set(key, value, mode, ttl));
        return this;
      },
      async exec(): Promise<Array<unknown> | null> {
        const results: unknown[] = [];
        for (const op of ops) results.push(await op());
        return results;
      },
    };
  }

  // Helper for tests
  _seed(key: string, entry: CreditLineCacheEntry): void {
    this.store.set(key, JSON.stringify(entry));
  }

  _read(key: string): CreditLineCacheEntry | undefined {
    const raw = this.store.get(key);
    return raw ? (JSON.parse(raw) as CreditLineCacheEntry) : undefined;
  }
}

describe('CreditLineCacheService.tryReserve — Sprint 11 A7', () => {
  const TENANT = '11111111-1111-1111-1111-111111111111';
  const CUSTOMER = '22222222-2222-2222-2222-222222222222';
  const PRODUCT = '33333333-3333-3333-3333-333333333333';
  const KEY = `creditline:${TENANT}:${CUSTOMER}:${PRODUCT}`;

  function setup(seed: Partial<CreditLineCacheEntry> = {}) {
    const redis = new FakeRedis();
    const service = new CreditLineCacheService(redis as any);
    redis._seed(KEY, {
      id: 'cl-1',
      status: 'active',
      currency: 'GHS',
      approvedLimit: '1000.0000',
      availableBalance: '500.0000',
      outstandingAmount: '500.0000',
      interestRate: '0.10',
      ...seed,
    });
    return { redis, service };
  }

  it('debits availableBalance by shortfall + feeAmount and outstanding by shortfall only', async () => {
    const { redis, service } = setup();

    const result = await service.tryReserve(TENANT, CUSTOMER, PRODUCT, '100', '5');
    expect(result.ok).toBe(true);

    const updated = redis._read(KEY)!;
    // availableBalance: 500.0000 - (100 + 5) = 395.0000
    expect(updated.availableBalance).toBe('395.0000');
    // outstandingAmount: 500.0000 + 100 = 600.0000 — fee NOT added here
    expect(updated.outstandingAmount).toBe('600.0000');
  });

  it('returns insufficient_limit when availableBalance < shortfall + fee', async () => {
    const { service } = setup({ availableBalance: '50.0000' });

    const result = await service.tryReserve(TENANT, CUSTOMER, PRODUCT, '100', '5');
    expect(result).toEqual({ ok: false, reason: 'insufficient_limit' });
  });

  it('returns inactive when status is not active', async () => {
    const { service } = setup({ status: 'frozen' });

    const result = await service.tryReserve(TENANT, CUSTOMER, PRODUCT, '100', '5');
    expect(result).toEqual({ ok: false, reason: 'inactive' });
  });

  it('returns cache_miss when the key is not present', async () => {
    const redis = new FakeRedis();
    const service = new CreditLineCacheService(redis as any);

    const result = await service.tryReserve(TENANT, CUSTOMER, PRODUCT, '100', '5');
    expect(result).toEqual({ ok: false, reason: 'cache_miss' });
  });

  it('returns cache_miss when redis is not configured (degraded mode)', async () => {
    const service = new CreditLineCacheService();

    const result = await service.tryReserve(TENANT, CUSTOMER, PRODUCT, '100', '5');
    expect(result).toEqual({ ok: false, reason: 'cache_miss' });
  });

  it('treats fee as a charge against availability without contaminating outstanding (regression)', async () => {
    // Pre-A7, the outstandingAmount was credited with shortfall + fee. With
    // a 10% transaction fee this would silently inflate the borrower's
    // recorded principal — material money over time.
    const { redis, service } = setup({
      availableBalance: '1000.0000',
      outstandingAmount: '0.0000',
    });

    await service.tryReserve(TENANT, CUSTOMER, PRODUCT, '100', '10');
    const updated = redis._read(KEY)!;
    expect(updated.outstandingAmount).toBe('100.0000');
    expect(updated.availableBalance).toBe('890.0000');
  });
});
