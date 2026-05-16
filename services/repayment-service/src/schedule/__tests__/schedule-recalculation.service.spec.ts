/**
 * Sprint 16 fixes (FIX-5) — unit tests for `ScheduleRecalculationService`.
 *
 * Pinned behaviour:
 *   - Remaining principal redistributes EVENLY across pending+partial
 *     installments (paid/waived untouched).
 *   - Last installment absorbs the rounding remainder so the sum
 *     exactly matches contract.outstandingPrincipal.
 *   - Per-installment interest = runningPrincipal × (rate / 1200).
 *   - contract.metadata.scheduleHistory captures the snapshot with
 *     timestamp + trigger.
 *   - All writes happen in a single $transaction (atomicity guarantee).
 *   - Already-settled / no-pending-installments → no-op.
 */
import { RepaymentScheduleStatus } from '@lons/database';

import { ScheduleRecalculationService } from '../schedule-recalculation.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CONTRACT_ID = '22222222-2222-2222-2222-222222222222';

function makeEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'entry-1',
    installmentNumber: 1,
    principalAmount: '100',
    interestAmount: '10',
    feeAmount: '0',
    totalAmount: '110',
    status: RepaymentScheduleStatus.pending,
    dueDate: new Date('2026-06-01'),
    ...overrides,
  };
}

function makeContract(opts: {
  outstandingPrincipal?: string;
  interestRate?: string;
  schedule: ReturnType<typeof makeEntry>[];
  metadata?: Record<string, unknown>;
}) {
  return {
    id: CONTRACT_ID,
    tenantId: TENANT_ID,
    outstandingPrincipal: opts.outstandingPrincipal ?? '900.0000',
    interestRate: opts.interestRate ?? '12',
    metadata: opts.metadata ?? null,
    repaymentSchedule: opts.schedule,
  };
}

function makeService(opts: {
  contract?: any;
} = {}) {
  const contract = {
    findFirst: jest.fn().mockResolvedValue(opts.contract ?? null),
    update: jest.fn().mockResolvedValue({}),
  };
  const repaymentScheduleEntry = {
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  };
  // `$transaction(promiseArray)` semantics — pass through.
  const prisma = {
    contract,
    repaymentScheduleEntry,
    $transaction: jest.fn(async (promises: any) => Promise.all(promises)),
  } as any;
  const service = new ScheduleRecalculationService(prisma);
  return { service, prisma, contract, repaymentScheduleEntry };
}

describe('ScheduleRecalculationService.recalculate', () => {
  it('throws NotFoundError when contract is missing', async () => {
    const { service } = makeService();
    await expect(
      service.recalculate(TENANT_ID, CONTRACT_ID, 'early_payment'),
    ).rejects.toThrow(/Contract/);
  });

  it('no-op when all installments are paid (returns existing schedule)', async () => {
    const schedule = [
      makeEntry({
        id: 'e-1',
        status: RepaymentScheduleStatus.paid,
      }),
    ];
    const { service, contract, repaymentScheduleEntry } = makeService({
      contract: makeContract({ schedule }),
    });
    // findMany returns the existing schedule (no recalc).
    repaymentScheduleEntry.findMany.mockResolvedValue([]);
    const result = await service.recalculate(
      TENANT_ID,
      CONTRACT_ID,
      'early_payment',
    );
    // Service returns schedule directly (no DB hit, no $transaction).
    expect(result).toBe(schedule);
    expect(contract.update).not.toHaveBeenCalled();
    expect(repaymentScheduleEntry.update).not.toHaveBeenCalled();
  });

  it('equal redistribution: 3 pending installments, 900 remaining → 300 principal each', async () => {
    const schedule = [
      makeEntry({ id: 'e-1', installmentNumber: 1 }),
      makeEntry({ id: 'e-2', installmentNumber: 2 }),
      makeEntry({ id: 'e-3', installmentNumber: 3 }),
    ];
    const { service, repaymentScheduleEntry } = makeService({
      contract: makeContract({ outstandingPrincipal: '900', schedule }),
    });
    repaymentScheduleEntry.findMany.mockResolvedValue([]);

    await service.recalculate(TENANT_ID, CONTRACT_ID, 'early_payment');

    // First two installments get 300 each; last one absorbs remainder.
    const updates = repaymentScheduleEntry.update.mock.calls.map((c: any) => c[0]);
    expect(updates).toHaveLength(3);
    expect(Number(updates[0].data.principalAmount)).toBe(300);
    expect(Number(updates[1].data.principalAmount)).toBe(300);
    expect(Number(updates[2].data.principalAmount)).toBe(300);
  });

  it('rounding absorption: 1000 ÷ 3 → first two get 333.3333, last gets 333.3334', async () => {
    const schedule = [
      makeEntry({ id: 'e-1', installmentNumber: 1 }),
      makeEntry({ id: 'e-2', installmentNumber: 2 }),
      makeEntry({ id: 'e-3', installmentNumber: 3 }),
    ];
    const { service, repaymentScheduleEntry } = makeService({
      contract: makeContract({ outstandingPrincipal: '1000.0000', schedule }),
    });
    repaymentScheduleEntry.findMany.mockResolvedValue([]);

    await service.recalculate(TENANT_ID, CONTRACT_ID, 'early_payment');

    const updates = repaymentScheduleEntry.update.mock.calls.map((c: any) => c[0]);
    // First two get the banker-rounded even split.
    expect(updates[0].data.principalAmount).toBe('333.3333');
    expect(updates[1].data.principalAmount).toBe('333.3333');
    // Last absorbs the residual so sum == outstandingPrincipal.
    const sum =
      Number(updates[0].data.principalAmount) +
      Number(updates[1].data.principalAmount) +
      Number(updates[2].data.principalAmount);
    expect(sum).toBeCloseTo(1000, 4);
  });

  it('paid + waived installments are NOT touched', async () => {
    const schedule = [
      makeEntry({ id: 'e-paid', installmentNumber: 1, status: RepaymentScheduleStatus.paid }),
      makeEntry({ id: 'e-pending', installmentNumber: 2 }),
    ];
    const { service, repaymentScheduleEntry } = makeService({
      contract: makeContract({ outstandingPrincipal: '500', schedule }),
    });
    repaymentScheduleEntry.findMany.mockResolvedValue([]);

    await service.recalculate(TENANT_ID, CONTRACT_ID, 'early_payment');

    const updateIds = repaymentScheduleEntry.update.mock.calls.map((c: any) => c[0].where.id);
    expect(updateIds).toContain('e-pending');
    expect(updateIds).not.toContain('e-paid');
  });

  it('partial-status installments DO get recalculated', async () => {
    const schedule = [
      makeEntry({ id: 'e-partial', installmentNumber: 1, status: RepaymentScheduleStatus.partial }),
      makeEntry({ id: 'e-pending', installmentNumber: 2 }),
    ];
    const { service, repaymentScheduleEntry } = makeService({
      contract: makeContract({ outstandingPrincipal: '500', schedule }),
    });
    repaymentScheduleEntry.findMany.mockResolvedValue([]);

    await service.recalculate(TENANT_ID, CONTRACT_ID, 'early_payment');

    const updateIds = repaymentScheduleEntry.update.mock.calls.map((c: any) => c[0].where.id);
    expect(updateIds).toContain('e-partial');
    expect(updateIds).toContain('e-pending');
  });

  it('snapshots the pre-recalc schedule into contract.metadata.scheduleHistory', async () => {
    const schedule = [makeEntry({ id: 'e-1', installmentNumber: 1 })];
    const { service, contract } = makeService({
      contract: makeContract({ outstandingPrincipal: '100', schedule }),
    });

    await service.recalculate(TENANT_ID, CONTRACT_ID, 'penalty_applied');

    const contractUpdate = contract.update.mock.calls[0][0];
    const history = (contractUpdate.data.metadata as any).scheduleHistory;
    expect(history).toHaveLength(1);
    expect(history[0].trigger).toBe('penalty_applied');
    expect(history[0].timestamp).toBeDefined();
    expect(history[0].originalSchedule).toHaveLength(1);
  });

  it('preserves prior schedule-history snapshots (append-only)', async () => {
    const existing = { foo: 'bar', scheduleHistory: [{ trigger: 'previous' }] };
    const schedule = [makeEntry({ id: 'e-1', installmentNumber: 1 })];
    const { service, contract } = makeService({
      contract: makeContract({
        outstandingPrincipal: '100',
        schedule,
        metadata: existing,
      }),
    });

    await service.recalculate(TENANT_ID, CONTRACT_ID, 'restructuring');

    const newMetadata = contract.update.mock.calls[0][0].data.metadata as any;
    expect(newMetadata.foo).toBe('bar');
    expect(newMetadata.scheduleHistory).toHaveLength(2);
    expect(newMetadata.scheduleHistory[0].trigger).toBe('previous');
    expect(newMetadata.scheduleHistory[1].trigger).toBe('restructuring');
  });

  it('all updates happen inside a single $transaction (atomicity)', async () => {
    const schedule = [
      makeEntry({ id: 'e-1', installmentNumber: 1 }),
      makeEntry({ id: 'e-2', installmentNumber: 2 }),
    ];
    const { service, prisma } = makeService({
      contract: makeContract({ outstandingPrincipal: '200', schedule }),
    });

    await service.recalculate(TENANT_ID, CONTRACT_ID, 'early_payment');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // $transaction received an array of 3 promises (2 entry updates + contract update).
    const txArg = prisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(3);
  });

  it('interest is recomputed at monthlyRate × runningPrincipal', async () => {
    // Single installment with 1200 principal and 12% APR.
    // monthly rate = 12 / 1200 = 0.01 → interest = 1200 × 0.01 = 12.0000.
    const schedule = [makeEntry({ id: 'e-1', installmentNumber: 1 })];
    const { service, repaymentScheduleEntry } = makeService({
      contract: makeContract({
        outstandingPrincipal: '1200',
        interestRate: '12',
        schedule,
      }),
    });

    await service.recalculate(TENANT_ID, CONTRACT_ID, 'early_payment');

    const update = repaymentScheduleEntry.update.mock.calls[0][0];
    expect(Number(update.data.interestAmount)).toBeCloseTo(12, 4);
  });
});
