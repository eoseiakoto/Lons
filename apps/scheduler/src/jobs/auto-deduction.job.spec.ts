/**
 * Sprint 15 fixes (FIX-4) — unit tests for AutoDeductionJob.
 *
 * Pinned behaviour:
 *   - Wallet adapter is called with the outstanding amount + a stable
 *     same-day idempotency reference.
 *   - Successful collection writes a Repayment row and flips the
 *     schedule entry to `paid` (or `partial`).
 *   - Failure increments deductionAttemptCount and schedules the next
 *     retry via product.bnplConfig.autoDeductionRetry intervals.
 *   - Exhausting retries emits DEDUCTION_FAILED_PERMANENTLY.
 *   - FIX-10: defaulted/cancelled/settled contracts are filtered OUT
 *     by the upstream query — covered indirectly here by asserting the
 *     `where` clause includes the contract.status `in` filter.
 */
import {
  ContractStatus,
  RepaymentScheduleStatus,
} from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { AutoDeductionJob } from './auto-deduction.job';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const CONTRACT_ID = '33333333-3333-3333-3333-333333333333';
const ENTRY_ID = '44444444-4444-4444-4444-444444444444';
const WALLET_ID = 'wallet-abc';

function makeEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ENTRY_ID,
    contractId: CONTRACT_ID,
    totalAmount: '100.0000' as unknown as { toString(): string },
    paidAmount: '0.0000' as unknown as { toString(): string },
    deductionAttemptCount: 0,
    contract: {
      customerId: CUSTOMER_ID,
      currency: 'USD',
      product: { bnplConfig: null },
    },
    ...overrides,
  };
}

function makeJob(adapter?: {
  collect: jest.Mock;
}) {
  const repaymentScheduleEntry = {
    findMany: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };
  const walletAccountMapping = {
    findFirst: jest.fn().mockResolvedValue({ walletId: WALLET_ID }),
  };
  const repayment = { create: jest.fn().mockResolvedValue({}) };
  const tenant = { findMany: jest.fn().mockResolvedValue([]) };

  const prisma = {
    repaymentScheduleEntry,
    walletAccountMapping,
    repayment,
    tenant,
    enterTenantContext: async <T,>(_: unknown, cb: () => Promise<T>) => cb(),
    $transaction: async <T,>(cb: (tx: typeof prisma) => Promise<T>) =>
      cb(prisma),
  } as any;
  const eventBus = { emitAndBuild: jest.fn() } as any;
  const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const collectionAdapter =
    adapter ??
    ({
      collect: jest.fn().mockResolvedValue({
        success: true,
        walletRef: 'mock-ref',
      }),
    } as unknown as { collect: jest.Mock });

  const job = new AutoDeductionJob(
    prisma,
    eventBus,
    auditService,
    collectionAdapter as any,
  );

  return {
    job,
    prisma,
    eventBus,
    auditService,
    collectionAdapter,
    repaymentScheduleEntry,
    walletAccountMapping,
    repayment,
  };
}

describe('AutoDeductionJob.attemptDeduction — success path', () => {
  const today = new Date('2026-05-12T00:00:00Z');

  it('marks the entry paid and emits REPAYMENT_RECEIVED on full collection', async () => {
    const {
      job,
      collectionAdapter,
      repaymentScheduleEntry,
      repayment,
      eventBus,
    } = makeJob();

    const result = await job.attemptDeduction(TENANT_ID, makeEntry(), today);

    expect(result).toBe('collected');
    expect(collectionAdapter.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: WALLET_ID,
        amount: '100.0000',
      }),
    );
    expect(repaymentScheduleEntry.update.mock.calls[0][0].data.status).toBe(
      RepaymentScheduleStatus.paid,
    );
    expect(repayment.create).toHaveBeenCalled();
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.REPAYMENT_RECEIVED,
      TENANT_ID,
      expect.objectContaining({
        contractId: CONTRACT_ID,
        method: 'auto_deduction',
      }),
    );
  });

  it('skips entries without a wallet mapping', async () => {
    const { job, walletAccountMapping, collectionAdapter } = makeJob();
    walletAccountMapping.findFirst.mockResolvedValue(null);

    const result = await job.attemptDeduction(TENANT_ID, makeEntry(), today);

    expect(result).toBe('skipped');
    expect(collectionAdapter.collect).not.toHaveBeenCalled();
  });

  it('skips entries with no balance owed', async () => {
    const { job, collectionAdapter } = makeJob();

    const result = await job.attemptDeduction(
      TENANT_ID,
      makeEntry({ totalAmount: '100.0000', paidAmount: '100.0000' }),
      today,
    );

    expect(result).toBe('skipped');
    expect(collectionAdapter.collect).not.toHaveBeenCalled();
  });
});

describe('AutoDeductionJob.attemptDeduction — failure path', () => {
  const today = new Date('2026-05-12T00:00:00Z');

  it('first failure stamps retry for ~2h from now (default config)', async () => {
    const { job, repaymentScheduleEntry } = makeJob({
      collect: jest
        .fn()
        .mockResolvedValue({ success: false, reason: 'insufficient_balance' }),
    });
    const before = Date.now();

    const result = await job.attemptDeduction(TENANT_ID, makeEntry(), today);
    const after = Date.now();

    expect(result).toBe('failed');
    const update = repaymentScheduleEntry.update.mock.calls[0][0];
    expect(update.data.deductionAttemptCount).toBe(1);
    expect(update.data.nextDeductionRetryAt).toBeInstanceOf(Date);
    const next = (update.data.nextDeductionRetryAt as Date).getTime();
    // 2 hours ± 1s tolerance.
    expect(next).toBeGreaterThanOrEqual(before + 2 * 3600 * 1000 - 1000);
    expect(next).toBeLessThanOrEqual(after + 2 * 3600 * 1000 + 1000);
  });

  it('escalates to permanent failure when retries are exhausted', async () => {
    const { job, eventBus, repaymentScheduleEntry } = makeJob({
      collect: jest
        .fn()
        .mockResolvedValue({ success: false, reason: 'insufficient_balance' }),
    });

    // Already at maxRetries (3) → next failure exhausts.
    await job.attemptDeduction(
      TENANT_ID,
      makeEntry({ deductionAttemptCount: 3 }),
      today,
    );

    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEDUCTION_FAILED_PERMANENTLY,
      TENANT_ID,
      expect.objectContaining({
        contractId: CONTRACT_ID,
        attempts: 4,
        lastFailureReason: 'insufficient_balance',
      }),
    );
    // Once exhausted, nextDeductionRetryAt is cleared.
    expect(
      repaymentScheduleEntry.update.mock.calls[0][0].data
        .nextDeductionRetryAt,
    ).toBeNull();
  });

  it('reads custom retry config from product.bnplConfig.autoDeductionRetry', async () => {
    const { job, repaymentScheduleEntry } = makeJob({
      collect: jest
        .fn()
        .mockResolvedValue({ success: false, reason: 'declined' }),
    });

    const before = Date.now();
    await job.attemptDeduction(
      TENANT_ID,
      makeEntry({
        contract: {
          customerId: CUSTOMER_ID,
          currency: 'USD',
          product: {
            bnplConfig: {
              autoDeductionRetry: {
                maxRetries: 5,
                retryIntervalsHours: [1, 1, 1, 1, 1],
              },
            },
          },
        },
      }),
      today,
    );

    const next = (
      repaymentScheduleEntry.update.mock.calls[0][0].data
        .nextDeductionRetryAt as Date
    ).getTime();
    // 1h from now (rather than the 2h default).
    expect(next).toBeLessThan(before + 90 * 60 * 1000);
  });
});

describe('AutoDeductionJob.runForTenant — query filters', () => {
  const today = new Date('2026-05-12T00:00:00Z');

  it('FIX-10: filters by contract.status in collectable set', async () => {
    const { job, repaymentScheduleEntry } = makeJob();
    repaymentScheduleEntry.findMany.mockResolvedValue([]);

    await job.runForTenant(TENANT_ID, today);

    const where = repaymentScheduleEntry.findMany.mock.calls[0][0].where;
    expect(where.contract.status.in).toEqual(
      expect.arrayContaining([
        ContractStatus.active,
        ContractStatus.performing,
        ContractStatus.due,
        ContractStatus.overdue,
        ContractStatus.delinquent,
      ]),
    );
    expect(where.contract.status.in).not.toContain(ContractStatus.cancelled);
    expect(where.contract.status.in).not.toContain(ContractStatus.settled);
    expect(where.contract.status.in).not.toContain(
      ContractStatus.written_off,
    );
  });

  it('filters by product.repaymentMethod=auto_deduction', async () => {
    const { job, repaymentScheduleEntry } = makeJob();
    repaymentScheduleEntry.findMany.mockResolvedValue([]);
    await job.runForTenant(TENANT_ID, today);
    const where = repaymentScheduleEntry.findMany.mock.calls[0][0].where;
    expect(where.contract.product.repaymentMethod).toBe('auto_deduction');
  });

  it('idempotency filter excludes entries already attempted today', async () => {
    const { job, repaymentScheduleEntry } = makeJob();
    repaymentScheduleEntry.findMany.mockResolvedValue([]);
    await job.runForTenant(TENANT_ID, today);
    const where = repaymentScheduleEntry.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { lastDeductionAttemptAt: null },
      { lastDeductionAttemptAt: { lt: today } },
    ]);
  });
});
