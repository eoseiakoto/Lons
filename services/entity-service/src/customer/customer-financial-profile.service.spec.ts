/**
 * S17-9 / FR-CM-002.1 — CustomerFinancialProfileService unit tests.
 *
 * Covers:
 *   - Aggregation with no contracts (new customer) — counts are 0,
 *     repaymentScore is null (not 0%), defaultRate is 0.
 *   - Aggregation with mixed contract statuses — active vs defaulted
 *     counts are right, defaultRate is the integer percentage.
 *   - Repayment score = paid / total scheduled (integer %).
 *   - Money math returns strings, not numbers.
 *   - Latest EMI snapshot fields are surfaced when present, null when
 *     absent.
 *   - Cache write + hit + invalidation round-trip.
 *   - Event-driven invalidation handler tolerates malformed payloads.
 */
import { CustomerFinancialProfileService } from './customer-financial-profile.service';

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

function makeService(prismaOverrides: Partial<Record<string, any>> = {}) {
  const prisma: any = {
    contract: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({
        _avg: { principalAmount: null },
        _sum: { totalOutstanding: null },
      }),
    },
    repaymentScheduleEntry: {
      count: jest.fn().mockResolvedValue(0),
    },
    customerFinancialData: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    ...prismaOverrides,
  };
  const redis = new FakeRedis() as any;
  const service = new CustomerFinancialProfileService(prisma, redis);
  return { service, prisma, redis };
}

describe('CustomerFinancialProfileService (S17-9)', () => {
  it('returns zeros and null score for a brand-new customer', async () => {
    const { service } = makeService();
    const profile = await service.getProfile(TENANT_ID, CUSTOMER_ID);
    expect(profile.totalLoans).toBe(0);
    expect(profile.activeContracts).toBe(0);
    expect(profile.defaultedContracts).toBe(0);
    // No schedule entries → repaymentScore is null, NOT 0. A 0%
    // score would incorrectly penalise a brand-new customer.
    expect(profile.repaymentScore).toBeNull();
    expect(profile.defaultRate).toBe(0);
    expect(profile.averageLoanSize).toBe('0');
    expect(profile.totalOutstandingBalance).toBe('0');
  });

  it('aggregates contract counts by status', async () => {
    const { service, prisma } = makeService();
    // contract.count is called 3x: total, active, defaulted.
    prisma.contract.count
      .mockResolvedValueOnce(10) // totalLoans
      .mockResolvedValueOnce(4) // activeContracts
      .mockResolvedValueOnce(2); // defaultedContracts
    prisma.repaymentScheduleEntry.count
      .mockResolvedValueOnce(20) // totalScheduleEntries
      .mockResolvedValueOnce(18); // onTimeEntries
    prisma.contract.aggregate
      .mockResolvedValueOnce({ _avg: { principalAmount: { toString: () => '500.0000' } } })
      .mockResolvedValueOnce({ _sum: { totalOutstanding: { toString: () => '1200.5000' } } });

    const profile = await service.getProfile(TENANT_ID, CUSTOMER_ID);

    expect(profile.totalLoans).toBe(10);
    expect(profile.activeContracts).toBe(4);
    expect(profile.defaultedContracts).toBe(2);
    expect(profile.repaymentScore).toBe(90); // 18/20 = 90%
    expect(profile.defaultRate).toBe(20); // 2/10 = 20%
    expect(profile.averageLoanSize).toBe('500.0000');
    expect(profile.totalOutstandingBalance).toBe('1200.5000');
  });

  it('surfaces EMI snapshot fields when present', async () => {
    const { service, prisma } = makeService();
    prisma.customerFinancialData.findFirst.mockResolvedValue({
      currentBalance: { toString: () => '750.0000' },
      averageBalance30d: { toString: () => '600.0000' },
      transactionCount30d: 47,
      incomeConsistency: 85,
    });

    const profile = await service.getProfile(TENANT_ID, CUSTOMER_ID);

    expect(profile.latestWalletBalance).toBe('750.0000');
    expect(profile.averageBalance30d).toBe('600.0000');
    expect(profile.transactionCount30d).toBe(47);
    expect(profile.incomeConsistency).toBe(85);
  });

  it('returns null EMI fields when no snapshot exists', async () => {
    const { service } = makeService();
    const profile = await service.getProfile(TENANT_ID, CUSTOMER_ID);
    expect(profile.latestWalletBalance).toBeNull();
    expect(profile.averageBalance30d).toBeNull();
    expect(profile.transactionCount30d).toBeNull();
    expect(profile.incomeConsistency).toBeNull();
  });

  it('all monetary fields are strings (no number leakage)', async () => {
    const { service, prisma } = makeService();
    prisma.contract.aggregate
      .mockResolvedValueOnce({ _avg: { principalAmount: { toString: () => '100.5500' } } })
      .mockResolvedValueOnce({ _sum: { totalOutstanding: { toString: () => '50.2500' } } });
    const profile = await service.getProfile(TENANT_ID, CUSTOMER_ID);
    expect(typeof profile.averageLoanSize).toBe('string');
    expect(typeof profile.totalOutstandingBalance).toBe('string');
  });

  it('caches and replays from cache on the second call', async () => {
    const { service, prisma } = makeService();
    prisma.contract.count.mockResolvedValue(3);

    const first = await service.getProfile(TENANT_ID, CUSTOMER_ID);
    expect(prisma.contract.count).toHaveBeenCalled();

    // Reset call counts, then ask again — second call should hit cache.
    jest.clearAllMocks();
    const second = await service.getProfile(TENANT_ID, CUSTOMER_ID);

    expect(prisma.contract.count).not.toHaveBeenCalled();
    expect(second.totalLoans).toBe(first.totalLoans);
  });

  it('invalidate() removes the cached entry, forcing a recompute', async () => {
    const { service, prisma } = makeService();
    prisma.contract.count.mockResolvedValue(1);

    await service.getProfile(TENANT_ID, CUSTOMER_ID);
    await service.invalidate(TENANT_ID, CUSTOMER_ID);

    jest.clearAllMocks();
    prisma.contract.count.mockResolvedValue(7);

    const refreshed = await service.getProfile(TENANT_ID, CUSTOMER_ID);
    expect(prisma.contract.count).toHaveBeenCalled();
    expect(refreshed.totalLoans).toBe(7);
  });

  it('refreshProfile() returns a freshly-computed value', async () => {
    const { service, prisma } = makeService();
    prisma.contract.count.mockResolvedValue(1);

    await service.getProfile(TENANT_ID, CUSTOMER_ID);
    prisma.contract.count.mockResolvedValue(9);

    const refreshed = await service.refreshProfile(TENANT_ID, CUSTOMER_ID);
    expect(refreshed.totalLoans).toBe(9);
  });

  it('event invalidation: well-formed event → cache cleared', async () => {
    const { service, prisma, redis } = makeService();
    prisma.contract.count.mockResolvedValue(1);
    await service.getProfile(TENANT_ID, CUSTOMER_ID);
    expect(
      await redis.get(`fin_profile:${TENANT_ID}:${CUSTOMER_ID}`),
    ).not.toBeNull();

    await service.handleInvalidationEvent({
      tenantId: TENANT_ID,
      data: { customerId: CUSTOMER_ID },
    });

    expect(
      await redis.get(`fin_profile:${TENANT_ID}:${CUSTOMER_ID}`),
    ).toBeNull();
  });

  it('event invalidation: malformed event is silently ignored', async () => {
    const { service, prisma, redis } = makeService();
    prisma.contract.count.mockResolvedValue(1);
    await service.getProfile(TENANT_ID, CUSTOMER_ID);

    // Missing customerId
    await service.handleInvalidationEvent({ tenantId: TENANT_ID });
    // Missing tenantId
    await service.handleInvalidationEvent({ data: { customerId: CUSTOMER_ID } });
    // Not even an object
    await service.handleInvalidationEvent(null);

    // Cache still populated.
    expect(
      await redis.get(`fin_profile:${TENANT_ID}:${CUSTOMER_ID}`),
    ).not.toBeNull();
  });
});
