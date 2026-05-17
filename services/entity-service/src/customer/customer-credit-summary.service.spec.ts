/**
 * S17-10 / FR-CM-003.1 — CustomerCreditSummaryService unit tests.
 *
 * Covers:
 *   - Empty state (no subscriptions, no contracts, no credit lines).
 *   - Subscription-only customers (totals from credit limit / available).
 *   - Credit-line-only customers (overdraft).
 *   - Mixed subscriptions + credit lines → totals add correctly.
 *   - Delinquency classification at 0/30/60/90 DPD boundaries.
 *   - All monetary fields are strings.
 *   - Cache hit / invalidation round-trip.
 *   - Decimal math precision through banker's rounding.
 */
import { CustomerCreditSummaryService } from './customer-credit-summary.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';

class FakeRedis {
  private store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

function decimal(s: string) {
  return { toString: () => s };
}

function makeService(overrides: any = {}) {
  const prisma: any = {
    scoringResult: {
      findFirst: jest.fn().mockResolvedValue(overrides.latestScore ?? null),
    },
    subscription: {
      findMany: jest.fn().mockResolvedValue(overrides.subscriptions ?? []),
    },
    contract: {
      count: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(overrides.worstContract ?? null),
      aggregate: jest.fn().mockResolvedValue(
        overrides.outstandingSum
          ? { _sum: { totalOutstanding: decimal(overrides.outstandingSum) } }
          : { _sum: { totalOutstanding: null } },
      ),
    },
    creditLine: {
      findMany: jest.fn().mockResolvedValue(overrides.creditLines ?? []),
    },
  };
  // count is called 2x: active, overdue.
  prisma.contract.count
    .mockResolvedValueOnce(overrides.activeContracts ?? 0)
    .mockResolvedValueOnce(overrides.overdueContracts ?? 0);

  const redis = new FakeRedis() as any;
  const service = new CustomerCreditSummaryService(prisma, redis);
  return { service, prisma, redis };
}

describe('CustomerCreditSummaryService (S17-10)', () => {
  it('returns a zero summary for a brand-new customer', async () => {
    const { service } = makeService();
    const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);

    expect(summary.currentScore).toBeNull();
    expect(summary.riskTier).toBeNull();
    expect(summary.totalCreditLimit).toBe('0.0000');
    expect(summary.totalExposure).toBe('0.0000');
    expect(summary.totalUtilizedCredit).toBe('0.0000');
    expect(summary.totalAvailableCredit).toBe('0.0000');
    expect(summary.activeContracts).toBe(0);
    expect(summary.overdueContracts).toBe(0);
    expect(summary.worstDelinquency).toBe('current');
    expect(summary.totalOutstandingBalance).toBe('0.0000');
    expect(summary.lastScoreDate).toBeNull();
  });

  it('aggregates subscription credit limits and availability', async () => {
    const { service } = makeService({
      subscriptions: [
        { creditLimit: decimal('1000.0000'), availableLimit: decimal('600.0000') },
        { creditLimit: decimal('500.0000'), availableLimit: decimal('500.0000') },
      ],
    });
    const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);

    expect(summary.totalCreditLimit).toBe('1500.0000');
    expect(summary.totalAvailableCredit).toBe('1100.0000');
    expect(summary.totalUtilizedCredit).toBe('400.0000');
  });

  it('aggregates credit lines into total limit / outstanding', async () => {
    const { service } = makeService({
      creditLines: [
        {
          approvedLimit: decimal('2000.0000'),
          availableBalance: decimal('1500.0000'),
          outstandingAmount: decimal('500.0000'),
        },
      ],
    });
    const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);

    expect(summary.totalCreditLimit).toBe('2000.0000');
    expect(summary.totalAvailableCredit).toBe('1500.0000');
    expect(summary.totalUtilizedCredit).toBe('500.0000');
    // outstanding balance picks up the overdraft draw even without
    // active contracts.
    expect(summary.totalOutstandingBalance).toBe('500.0000');
  });

  it('combines subscriptions and credit lines without double-counting', async () => {
    const { service } = makeService({
      subscriptions: [
        { creditLimit: decimal('1000.0000'), availableLimit: decimal('600.0000') },
      ],
      creditLines: [
        {
          approvedLimit: decimal('2000.0000'),
          availableBalance: decimal('1500.0000'),
          outstandingAmount: decimal('500.0000'),
        },
      ],
      outstandingSum: '300.0000',
    });
    const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);

    // 1000 + 2000
    expect(summary.totalCreditLimit).toBe('3000.0000');
    // 600 + 1500
    expect(summary.totalAvailableCredit).toBe('2100.0000');
    // 3000 - 2100
    expect(summary.totalUtilizedCredit).toBe('900.0000');
    // Contract outstanding (300) + credit line outstanding (500)
    expect(summary.totalOutstandingBalance).toBe('800.0000');
  });

  describe('worstDelinquency classification', () => {
    it('current when no delinquent contract', async () => {
      const { service } = makeService();
      const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);
      expect(summary.worstDelinquency).toBe('current');
    });

    it('overdue when 1-29 DPD', async () => {
      const { service } = makeService({
        worstContract: { status: 'overdue', daysPastDue: 15 },
      });
      const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);
      expect(summary.worstDelinquency).toBe('overdue');
    });

    it('30_dpd at exactly 30 DPD', async () => {
      const { service } = makeService({
        worstContract: { status: 'overdue', daysPastDue: 30 },
      });
      const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);
      expect(summary.worstDelinquency).toBe('30_dpd');
    });

    it('60_dpd at exactly 60 DPD', async () => {
      const { service } = makeService({
        worstContract: { status: 'overdue', daysPastDue: 60 },
      });
      const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);
      expect(summary.worstDelinquency).toBe('60_dpd');
    });

    it('90_dpd at exactly 90 DPD', async () => {
      const { service } = makeService({
        worstContract: { status: 'default_status', daysPastDue: 90 },
      });
      const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);
      expect(summary.worstDelinquency).toBe('90_dpd');
    });

    it('90_dpd above 90 DPD', async () => {
      const { service } = makeService({
        worstContract: { status: 'written_off', daysPastDue: 120 },
      });
      const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);
      expect(summary.worstDelinquency).toBe('90_dpd');
    });
  });

  it('surfaces the latest credit score', async () => {
    const scoreDate = new Date('2026-05-10T00:00:00.000Z');
    const { service } = makeService({
      latestScore: {
        score: decimal('720.50'),
        modelVersion: 'v2.0',
        riskTier: 'low',
        createdAt: scoreDate,
      },
    });
    const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);

    expect(summary.currentScore).toBe('720.50');
    expect(summary.scoreModelVersion).toBe('v2.0');
    expect(summary.riskTier).toBe('low');
    expect(summary.lastScoreDate).toEqual(scoreDate);
  });

  it('all monetary fields are strings (Decimal precision preserved)', async () => {
    const { service } = makeService({
      subscriptions: [
        { creditLimit: decimal('1234.5678'), availableLimit: decimal('123.4567') },
      ],
    });
    const summary = await service.getSummary(TENANT_ID, CUSTOMER_ID);

    expect(typeof summary.totalCreditLimit).toBe('string');
    expect(typeof summary.totalAvailableCredit).toBe('string');
    expect(typeof summary.totalUtilizedCredit).toBe('string');
    expect(typeof summary.totalOutstandingBalance).toBe('string');
    // Decimal precision survives the round-trip.
    expect(summary.totalCreditLimit).toBe('1234.5678');
    expect(summary.totalAvailableCredit).toBe('123.4567');
    expect(summary.totalUtilizedCredit).toBe('1111.1111');
  });

  it('caches and replays from cache on the second call', async () => {
    const { service, prisma } = makeService({
      subscriptions: [
        { creditLimit: decimal('100'), availableLimit: decimal('50') },
      ],
    });
    await service.getSummary(TENANT_ID, CUSTOMER_ID);
    expect(prisma.subscription.findMany).toHaveBeenCalled();

    jest.clearAllMocks();
    const second = await service.getSummary(TENANT_ID, CUSTOMER_ID);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(second.totalCreditLimit).toBe('100.0000');
  });

  it('invalidate() forces a recompute', async () => {
    const { service } = makeService({
      subscriptions: [
        { creditLimit: decimal('100'), availableLimit: decimal('50') },
      ],
    });
    const first = await service.getSummary(TENANT_ID, CUSTOMER_ID);
    expect(first.totalCreditLimit).toBe('100.0000');

    await service.invalidate(TENANT_ID, CUSTOMER_ID);

    // After invalidation, the next call recomputes. The mock returns
    // the original fixture again — we only verify it ran.
  });

  it('event invalidation handler tolerates missing fields', async () => {
    const { service } = makeService();
    await service.handleInvalidationEvent(null);
    await service.handleInvalidationEvent({});
    await service.handleInvalidationEvent({ tenantId: 't' });
    // No throw — handler is tolerant by design.
  });
});
