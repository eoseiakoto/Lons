/**
 * Reconciliation Service — Unit Tests
 *
 * The reconciliation service runs nightly and matches Lōns' internal ledger
 * against external wallet provider statements. Mismatches become exceptions
 * that operators have to clear manually. Bugs here cause silent finance
 * drift, so the suite focuses on:
 *
 *   - Money is preserved as Decimal strings end-to-end (no float coercion)
 *   - Match rate calculation handles edge cases (zero txns, all matched)
 *   - Exception records are written with byte-exact amounts
 *   - Lifecycle transitions: completed vs with_exceptions
 *   - The COMPLETED event fires with the right shape
 *
 * Tests use mocked Prisma + EventBus. Live-DB integration is exercised by
 * the staging reconciliation cron once Sprint 13B brings staging back up.
 */

import { ReconciliationService } from '../reconciliation.service';

const tenantId = '11111111-1111-1111-1111-111111111111';

function makeMockPrisma() {
  return {
    disbursement: { findMany: jest.fn() },
    repayment: { findMany: jest.fn() },
    reconciliationRun: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    reconciliationException: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeMockEventBus() {
  return {
    emitAndBuild: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let prisma: ReturnType<typeof makeMockPrisma>;
  let eventBus: ReturnType<typeof makeMockEventBus>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    eventBus = makeMockEventBus();
    service = new ReconciliationService(prisma as any, eventBus as any);
  });

  describe('runDailyReconciliation', () => {
    const today = new Date('2026-04-15T12:00:00.000Z');

    it('marks the run as completed when every transaction has an external reference', async () => {
      prisma.disbursement.findMany.mockResolvedValue([
        {
          id: 'd1',
          amount: '500.0000',
          externalRef: 'EXT-DISB-001',
          completedAt: today,
          contractId: 'c1',
        },
      ]);
      prisma.repayment.findMany.mockResolvedValue([
        {
          id: 'r1',
          amount: '200.0000',
          externalRef: 'EXT-REPAY-001',
          completedAt: today,
          contractId: 'c1',
        },
      ]);
      prisma.reconciliationRun.create.mockResolvedValue({ id: 'run-1' });
      prisma.reconciliationRun.findUniqueOrThrow.mockResolvedValue({
        id: 'run-1',
        status: 'completed',
        exceptions: [],
      });

      await service.runDailyReconciliation(tenantId, today);

      expect(prisma.reconciliationRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            status: 'completed',
            totalTxns: 2,
            matchedTxns: 2,
            exceptionCount: 0,
            // 100% match → matchRate is exact integer-equivalent.
            matchRate: 100,
          }),
        }),
      );
      // No unmatched txns means no exception inserts.
      expect(prisma.reconciliationException.create).not.toHaveBeenCalled();
    });

    it('opens an exception per unmatched transaction with the original Decimal string', async () => {
      prisma.disbursement.findMany.mockResolvedValue([
        {
          id: 'd1',
          amount: '500.1234',
          externalRef: null, // <— unmatched
          completedAt: today,
          contractId: 'c1',
        },
      ]);
      prisma.repayment.findMany.mockResolvedValue([
        {
          id: 'r1',
          amount: '199.9999',
          externalRef: 'EXT-REPAY-001',
          completedAt: today,
          contractId: 'c1',
        },
      ]);
      prisma.reconciliationRun.create.mockResolvedValue({ id: 'run-2' });
      prisma.reconciliationRun.findUniqueOrThrow.mockResolvedValue({
        id: 'run-2',
        status: 'with_exceptions',
        exceptions: [],
      });

      await service.runDailyReconciliation(tenantId, today);

      expect(prisma.reconciliationRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'with_exceptions',
            totalTxns: 2,
            matchedTxns: 1,
            exceptionCount: 1,
            // 1 of 2 matched → 50%.
            matchRate: 50,
          }),
        }),
      );
      expect(prisma.reconciliationException.create).toHaveBeenCalledTimes(1);
      const exceptionArgs = prisma.reconciliationException.create.mock.calls[0][0];
      expect(exceptionArgs.data.amount).toBe('500.1234');
      expect(exceptionArgs.data.txnType).toBe('disbursement');
      expect(exceptionArgs.data.exceptionType).toBe('unmatched');
    });

    it('handles the zero-transactions case without dividing by zero', async () => {
      prisma.disbursement.findMany.mockResolvedValue([]);
      prisma.repayment.findMany.mockResolvedValue([]);
      prisma.reconciliationRun.create.mockResolvedValue({ id: 'run-empty' });
      prisma.reconciliationRun.findUniqueOrThrow.mockResolvedValue({
        id: 'run-empty',
        status: 'completed',
        exceptions: [],
      });

      await service.runDailyReconciliation(tenantId, today);

      const callArgs = prisma.reconciliationRun.create.mock.calls[0][0];
      expect(callArgs.data.matchRate).toBe(100); // 100% by definition when there's nothing to mismatch
      expect(callArgs.data.totalTxns).toBe(0);
    });

    it('emits RECONCILIATION_COMPLETED with the run summary', async () => {
      prisma.disbursement.findMany.mockResolvedValue([]);
      prisma.repayment.findMany.mockResolvedValue([
        {
          id: 'r1',
          amount: '50.0000',
          externalRef: 'EXT-OK',
          completedAt: today,
          contractId: 'c1',
        },
      ]);
      prisma.reconciliationRun.create.mockResolvedValue({ id: 'run-evt' });
      prisma.reconciliationRun.findUniqueOrThrow.mockResolvedValue({
        id: 'run-evt',
        status: 'completed',
        exceptions: [],
      });

      await service.runDailyReconciliation(tenantId, today);

      expect(eventBus.emitAndBuild).toHaveBeenCalledTimes(1);
      const [eventName, eventTenantId, payload] = eventBus.emitAndBuild.mock.calls[0];
      expect(eventName).toBeTruthy(); // EventType.RECONCILIATION_COMPLETED
      expect(eventTenantId).toBe(tenantId);
      expect(payload).toMatchObject({
        reconciliationRunId: 'run-evt',
        totalTxns: 1,
        matchedTxns: 1,
        exceptions: 0,
      });
      expect(typeof payload.date).toBe('string');
    });

    it('preserves Decimal precision through `String(d.amount)` even when Prisma returns a Decimal-like object', async () => {
      // Simulate Prisma returning a Decimal-like object whose `toString()`
      // gives a high-precision string. The service should pipe it through
      // unchanged — never via `Number()`.
      class DecimalLike {
        constructor(public readonly raw: string) {}
        toString() {
          return this.raw;
        }
      }
      prisma.disbursement.findMany.mockResolvedValue([
        {
          id: 'd1',
          amount: new DecimalLike('999999999.9999'),
          externalRef: null,
          completedAt: today,
          contractId: 'c1',
        },
      ]);
      prisma.repayment.findMany.mockResolvedValue([]);
      prisma.reconciliationRun.create.mockResolvedValue({ id: 'run-precision' });
      prisma.reconciliationRun.findUniqueOrThrow.mockResolvedValue({
        id: 'run-precision',
        exceptions: [],
      });

      await service.runDailyReconciliation(tenantId, today);

      const exceptionCall = prisma.reconciliationException.create.mock.calls[0][0];
      expect(exceptionCall.data.amount).toBe('999999999.9999');
    });
  });

  describe('resolveException', () => {
    it('marks the exception as resolved and records resolver + investigation', async () => {
      prisma.reconciliationException.findFirst.mockResolvedValue({
        id: 'exc-1',
        tenantId,
      });
      prisma.reconciliationException.update.mockResolvedValue({ id: 'exc-1' });

      await service.resolveException(tenantId, 'exc-1', 'Provider double-posted', 'op-007');

      expect(prisma.reconciliationException.update).toHaveBeenCalledWith({
        where: { id: 'exc-1' },
        data: {
          resolved: true,
          resolvedAt: expect.any(Date),
          resolvedBy: 'op-007',
          investigation: 'Provider double-posted',
        },
      });
    });

    it('throws NotFoundError when the exception does not exist', async () => {
      prisma.reconciliationException.findFirst.mockResolvedValue(null);
      await expect(
        service.resolveException(tenantId, 'missing', 'note', 'op-007'),
      ).rejects.toThrow();
      expect(prisma.reconciliationException.update).not.toHaveBeenCalled();
    });
  });

  describe('getReconciliationRun', () => {
    it('returns the run with its exceptions', async () => {
      prisma.reconciliationRun.findFirst.mockResolvedValue({
        id: 'run-1',
        tenantId,
        exceptions: [{ id: 'exc-1' }],
      });
      const out = await service.getReconciliationRun(tenantId, 'run-1');
      expect(out).toEqual(expect.objectContaining({ id: 'run-1' }));
    });

    it('throws NotFoundError when the run does not exist', async () => {
      prisma.reconciliationRun.findFirst.mockResolvedValue(null);
      await expect(service.getReconciliationRun(tenantId, 'missing')).rejects.toThrow();
    });
  });

  describe('listReconciliationRuns', () => {
    it('returns items and the hasMore flag based on the take + 1 trick', async () => {
      // Service requests `take + 1` = 21, returns first 20 with hasMore true.
      const rows = Array.from({ length: 21 }, (_, i) => ({ id: `r${i}` }));
      prisma.reconciliationRun.findMany.mockResolvedValue(rows);

      const out = await service.listReconciliationRuns(tenantId, 20);

      expect(out.items).toHaveLength(20);
      expect(out.hasMore).toBe(true);
    });

    it('reports hasMore=false when the page is not full', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}` }));
      prisma.reconciliationRun.findMany.mockResolvedValue(rows);

      const out = await service.listReconciliationRuns(tenantId, 20);

      expect(out.items).toHaveLength(5);
      expect(out.hasMore).toBe(false);
    });
  });
});
