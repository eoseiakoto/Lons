/**
 * InvoiceAgingService — Sprint 12 Phase 6A.
 *
 * Mock-Prisma unit tests covering DPD bucketing per the 7 buckets in
 * SPEC-invoice-factoring.md §7.1, transition tracking via metadata,
 * default-threshold first-crossing detection, and skipping of terminal
 * statuses.
 */

import { InvoiceAgingService } from './invoice-aging.service';
import { InvoiceStatus } from '@lons/database';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PRODUCT_ID = '22222222-2222-2222-2222-222222222222';

/** UTC midnight for "today" so the service and the test use the same epoch. */
function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Build a Date offset from today by `days` (positive = future, negative =
 * past). Returned as a Date object representing UTC midnight of that day.
 */
function dateOffsetDays(days: number): Date {
  const t = todayUtc();
  return new Date(t.getTime() + days * 86_400_000);
}

interface MakeInvoiceArgs {
  id?: string;
  status?: InvoiceStatus;
  dueDateOffsetDays: number;
  metadata?: Record<string, unknown> | null;
  factoringConfig?: Record<string, unknown> | null;
}

function makeInvoice(args: MakeInvoiceArgs) {
  return {
    id: args.id ?? 'invoice-1',
    tenantId: TENANT,
    productId: PRODUCT_ID,
    status: args.status ?? InvoiceStatus.debtor_notified,
    dueDate: dateOffsetDays(args.dueDateOffsetDays),
    metadata: args.metadata ?? null,
    product: {
      id: PRODUCT_ID,
      factoringConfig: args.factoringConfig ?? null,
    },
  };
}

/** Build a fresh PrismaService mock that records `update` calls. */
function buildPrismaMock(invoices: ReturnType<typeof makeInvoice>[]) {
  const updates: { id: string; data: any }[] = [];
  return {
    prisma: {
      invoice: {
        findMany: jest.fn().mockResolvedValue(invoices),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          updates.push({ id: where.id, data });
          return { id: where.id };
        }),
      },
    } as any,
    updates,
  };
}

function buildEventBusMock() {
  return { emitAndBuild: jest.fn() } as any;
}

// ─── empty portfolio ────────────────────────────────────────────────────

describe('InvoiceAgingService.processAging — empty', () => {
  it('returns zero counts and no defaults when there are no active invoices', async () => {
    const { prisma } = buildPrismaMock([]);
    const eventBus = buildEventBusMock();
    const service = new InvoiceAgingService(prisma, eventBus, { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.totalScanned).toBe(0);
    expect(result.newDefaults).toEqual([]);
    expect(result.transitions).toBe(0);
    expect(result.byBucket.Default).toBe(0);
    expect(result.byBucket.Approaching).toBe(0);
    expect(result.byBucket.Due).toBe(0);
    expect(result.byBucket.Grace).toBe(0);
    expect(result.byBucket.Overdue).toBe(0);
    expect(result.byBucket.SeriouslyOverdue).toBe(0);
    expect(result.byBucket.Current).toBe(0);
    // Empty portfolio = no DB writes.
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });
});

// ─── per-bucket DPD classification (default thresholds 7/30/60) ────────

describe('InvoiceAgingService.processAging — per-bucket DPD', () => {
  it('classifies dueDate = today + 5 as Approaching and does not change status', async () => {
    const inv = makeInvoice({ dueDateOffsetDays: 5 });
    const { prisma, updates } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.Approaching).toBe(1);
    expect(result.totalScanned).toBe(1);
    expect(result.newDefaults).toEqual([]);
    // Metadata was updated, but `status` was not touched.
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toEqual({
      metadata: expect.objectContaining({
        agingBucket: 'Approaching',
        agingLastCheckedAt: expect.any(String),
      }),
    });
    expect(updates[0].data.status).toBeUndefined();
  });

  it('classifies dueDate = today (DPD = 0) as Due', async () => {
    const inv = makeInvoice({ dueDateOffsetDays: 0 });
    const { prisma } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.Due).toBe(1);
    expect(result.byBucket.Approaching).toBe(0);
    expect(result.byBucket.Grace).toBe(0);
  });

  it('classifies 5 DPD as Grace', async () => {
    const inv = makeInvoice({ dueDateOffsetDays: -5 });
    const { prisma } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.Grace).toBe(1);
  });

  it('classifies 20 DPD as Overdue with default thresholds 7/30/60', async () => {
    const inv = makeInvoice({ dueDateOffsetDays: -20 });
    const { prisma } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.Overdue).toBe(1);
    expect(result.byBucket.Grace).toBe(0);
    expect(result.byBucket.SeriouslyOverdue).toBe(0);
  });

  it('classifies 45 DPD as SeriouslyOverdue', async () => {
    const inv = makeInvoice({ dueDateOffsetDays: -45 });
    const { prisma } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.SeriouslyOverdue).toBe(1);
    expect(result.byBucket.Default).toBe(0);
  });
});

// ─── default crossing ──────────────────────────────────────────────────

describe('InvoiceAgingService.processAging — default crossing', () => {
  it('flags 75 DPD as Default, includes id in newDefaults, sets defaultThresholdCrossedAt, leaves status unchanged', async () => {
    const inv = makeInvoice({ id: 'inv-default', dueDateOffsetDays: -75 });
    const { prisma, updates } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.Default).toBe(1);
    expect(result.newDefaults).toEqual(['inv-default']);
    expect(result.transitions).toBe(1);

    expect(updates).toHaveLength(1);
    expect(updates[0].data).toEqual({
      metadata: expect.objectContaining({
        agingBucket: 'Default',
        defaultThresholdCrossedAt: expect.any(String),
        agingLastCheckedAt: expect.any(String),
      }),
    });
    // Critically: status is NOT mutated here — recourseService owns that.
    expect(updates[0].data.status).toBeUndefined();
  });

  it('does not re-add to newDefaults when invoice is already in Default bucket', async () => {
    const inv = makeInvoice({
      id: 'inv-already-default',
      dueDateOffsetDays: -75,
      metadata: {
        agingBucket: 'Default',
        defaultThresholdCrossedAt: '2026-04-01T00:00:00.000Z',
      },
    });
    const { prisma, updates } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.Default).toBe(1);
    expect(result.newDefaults).toEqual([]); // not a first crossing
    expect(result.transitions).toBe(0);
    // Metadata still updated for the lastCheckedAt breadcrumb, but the
    // existing defaultThresholdCrossedAt is preserved (not overwritten).
    expect(updates[0].data.metadata).toEqual(
      expect.objectContaining({
        agingLastCheckedAt: expect.any(String),
        defaultThresholdCrossedAt: '2026-04-01T00:00:00.000Z',
      }),
    );
  });
});

// ─── config overrides ──────────────────────────────────────────────────

describe('InvoiceAgingService.processAging — config overrides', () => {
  it('respects factoringConfig.agingThresholds overrides', async () => {
    // With a tighter window (grace=3, overdue=10, seriously=20, default=20),
    // 12 DPD lands in SeriouslyOverdue rather than the default-config Overdue.
    const inv = makeInvoice({
      dueDateOffsetDays: -12,
      factoringConfig: {
        agingThresholds: {
          graceEndDpd: 3,
          overdueEndDpd: 10,
          seriouslyOverdueEndDpd: 20,
          defaultDpd: 20,
        },
      },
    });
    const { prisma } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.SeriouslyOverdue).toBe(1);
    expect(result.byBucket.Overdue).toBe(0);
  });

  it('treats DPD ≥ defaultDpd as Default even when overrides differ from spec', async () => {
    const inv = makeInvoice({
      dueDateOffsetDays: -22,
      factoringConfig: {
        agingThresholds: {
          graceEndDpd: 3,
          overdueEndDpd: 10,
          seriouslyOverdueEndDpd: 20,
          defaultDpd: 20,
        },
      },
    });
    const { prisma } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.Default).toBe(1);
  });
});

// ─── status filtering ──────────────────────────────────────────────────

describe('InvoiceAgingService.processAging — status filtering', () => {
  it('skips already-defaulted, settled, cancelled, rejected invoices', async () => {
    // The service filters by status in the Prisma query; verify the
    // `where.status.in` predicate excludes terminal statuses and
    // includes the three active statuses (funded was added by F-IF-6
    // pre-S13 fix so the gap between funding and debtor notification
    // doesn't silently miss aging).
    const { prisma } = buildPrismaMock([]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    await service.processAging(TENANT);

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          status: {
            in: [
              InvoiceStatus.funded,
              InvoiceStatus.debtor_notified,
              InvoiceStatus.payment_received,
            ],
          },
        }),
      }),
    );
  });

  // F-IF-6: funded invoices (pre-debtor-notification) must be included
  // in the aging scan so the pre-due → Approaching → Due transitions
  // happen for them too.
  it('includes funded invoices in aging scan', async () => {
    const inv = makeInvoice({
      status: InvoiceStatus.funded,
      dueDateOffsetDays: 5, // future-dated → Approaching bucket
    });
    const { prisma } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.totalScanned).toBe(1);
    expect(result.byBucket.Approaching).toBe(1);
    // Status is left untouched — aging never mutates invoice.status.
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: inv.id },
        data: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
  });
});

// ─── event-bus contract ────────────────────────────────────────────────

describe('InvoiceAgingService.processAging — event bus', () => {
  it('does not emit any events on bucket transitions (logging only for v1)', async () => {
    const inv = makeInvoice({ dueDateOffsetDays: -75 });
    const { prisma } = buildPrismaMock([inv]);
    const eventBus = buildEventBusMock();
    const service = new InvoiceAgingService(prisma, eventBus, { enforceDefault: jest.fn() } as any);

    await service.processAging(TENANT);

    // Sprint 12 Phase 2B did not add an aging-specific event; the
    // INVOICE_DEFAULTED event fires from RecourseService when the
    // integration layer calls it. Aging itself is logging-only.
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });
});

// ─── transition tracking ───────────────────────────────────────────────

describe('InvoiceAgingService.processAging — transition tracking', () => {
  it('counts the move from Grace → Overdue as a single transition', async () => {
    const inv = makeInvoice({
      dueDateOffsetDays: -15,
      metadata: { agingBucket: 'Grace' },
    });
    const { prisma } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.Overdue).toBe(1);
    expect(result.transitions).toBe(1);
  });

  it('does not count a no-op (same bucket as last run) as a transition', async () => {
    const inv = makeInvoice({
      dueDateOffsetDays: -15,
      metadata: { agingBucket: 'Overdue' },
    });
    const { prisma } = buildPrismaMock([inv]);
    const service = new InvoiceAgingService(prisma, buildEventBusMock(), { enforceDefault: jest.fn() } as any);

    const result = await service.processAging(TENANT);

    expect(result.byBucket.Overdue).toBe(1);
    expect(result.transitions).toBe(0);
  });
});
