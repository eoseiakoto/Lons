/**
 * Sprint 12 Phase 3E — Recourse enforcement & non-recourse write-off tests.
 *
 * Mock-Prisma unit tests covering:
 *   - With-recourse default → grace period started, metadata stamped,
 *     INVOICE_DEFAULTED + RECOURSE_ENFORCEMENT_INITIATED emitted
 *   - With-recourse default falls back to 7-day grace when factoringConfig
 *     is missing
 *   - Without-recourse default → write-off ledger entries, reserve return,
 *     debtor exposure decremented by negative faceValue, NON_RECOURSE_WRITE_OFF
 *     emitted
 *   - Without-recourse with debtor over-payment → loss=0, no ledger entries,
 *     event still emitted with lossAmount='0'
 *   - Idempotent on already-defaulted invoice (no DB writes, no events)
 *   - Rejects on settled / cancelled invoices
 *   - DPD computed from dueDate when input.dpd not provided
 *   - enforceGracePeriodElapsed routes to collections + stamps metadata
 *   - enforceGracePeriodElapsed rejects when grace not yet elapsed
 */

import {
  DebitCredit,
  InvoiceStatus,
  LedgerEntryType,
  Prisma,
  RecourseType,
} from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { RecourseService } from './recourse.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const INVOICE_ID = '22222222-2222-2222-2222-222222222222';
const SELLER_ID = '33333333-3333-3333-3333-333333333333';
const DEBTOR_ID = '44444444-4444-4444-4444-444444444444';
const PRODUCT_ID = '55555555-5555-5555-5555-555555555555';
const CONTRACT_ID = '66666666-6666-6666-6666-666666666666';

// ─── Fixtures ───────────────────────────────────────────────────────────

interface InvoiceFixtureOpts {
  status?: InvoiceStatus;
  recourseType?: RecourseType;
  faceValue?: string;
  amountReceived?: string;
  advancedAmount?: string;
  reserveAmount?: string;
  reserveReleased?: string;
  contractId?: string | null;
  metadata?: Record<string, unknown> | null;
  dueDate?: Date;
  defaultedAt?: Date | null;
}

function makeInvoice(opts: InvoiceFixtureOpts = {}) {
  return {
    id: INVOICE_ID,
    tenantId: TENANT,
    sellerId: SELLER_ID,
    debtorId: DEBTOR_ID,
    productId: PRODUCT_ID,
    contractId: opts.contractId === null ? null : opts.contractId ?? CONTRACT_ID,
    invoiceNumber: 'INV-2026-001',
    issueDate: new Date('2026-01-01T00:00:00.000Z'),
    dueDate: opts.dueDate ?? daysFromNow(-90),
    faceValue: new Prisma.Decimal(opts.faceValue ?? '100000.00'),
    currency: 'GHS',
    advanceRatePercent: new Prisma.Decimal('80'),
    advancedAmount: new Prisma.Decimal(opts.advancedAmount ?? '80000.00'),
    reserveAmount: new Prisma.Decimal(opts.reserveAmount ?? '20000.00'),
    discountFee: new Prisma.Decimal('2400.00'),
    serviceFee: new Prisma.Decimal('500.00'),
    netDisbursement: new Prisma.Decimal('77100.00'),
    status: opts.status ?? InvoiceStatus.debtor_notified,
    recourseType: opts.recourseType ?? RecourseType.with_recourse,
    amountReceived: new Prisma.Decimal(opts.amountReceived ?? '0'),
    reserveReleased: new Prisma.Decimal(opts.reserveReleased ?? '0'),
    metadata: opts.metadata ?? null,
    defaultedAt: opts.defaultedAt ?? null,
    fundedAt: new Date('2026-02-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    settledAt: null,
    debtorNotifiedAt: new Date('2026-02-02T00:00:00.000Z'),
    debtorPaymentRef: null,
    disputeReason: null,
    documents: null,
    verificationStatus: 'verified',
    verifiedBy: null,
    verifiedAt: null,
    verificationNotes: null,
  };
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Mock helpers ───────────────────────────────────────────────────────

interface MockOpts {
  invoice?: any;
  /** factoringConfig JSON returned for the product fetch (if any). */
  productConfig?: Record<string, unknown> | null;
  /** When set, prisma.product.findFirst returns null (no row). */
  productMissing?: boolean;
}

function makeMocks(opts: MockOpts = {}) {
  const invoice = opts.invoice ?? makeInvoice();

  // The service may issue multiple updates against the same invoice
  // (status flip then metadata stamp). Capture the merged state so
  // assertions can read the final shape.
  let currentInvoice = { ...invoice };
  const updateInvoice = jest.fn(async (args: any) => {
    currentInvoice = { ...currentInvoice, ...args.data };
    return currentInvoice;
  });

  const productRow = opts.productMissing
    ? null
    : { factoringConfig: opts.productConfig ?? null };

  const prisma = {
    invoice: {
      findFirst: jest.fn(async () => currentInvoice),
      update: updateInvoice,
    },
    product: {
      findFirst: jest.fn(async () => productRow),
    },
    ledgerEntry: {
      create: jest.fn(async (args: any) => ({ id: 'ledger-' + Math.random(), ...args.data })),
    },
    collectionsAction: {
      create: jest.fn(async (args: any) => ({ id: 'action-1', ...args.data })),
    },
  };

  const eventBus = { emitAndBuild: jest.fn() };
  const debtorService = { updateExposure: jest.fn(async () => undefined) };

  return { prisma, eventBus, debtorService, getInvoiceState: () => currentInvoice };
}

function newService(prisma: any, eventBus: any, debtorService: any): RecourseService {
  return new RecourseService(prisma as any, eventBus as any, debtorService as any);
}

// ─── enforceDefault — with recourse ─────────────────────────────────────

describe('RecourseService.enforceDefault — with recourse', () => {
  it('starts the grace period, stamps metadata, emits lifecycle events', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({
        recourseType: RecourseType.with_recourse,
        amountReceived: '10000.00',
      }),
      productConfig: { recourseGracePeriodDays: 14 },
    });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.enforceDefault(TENANT, INVOICE_ID, { dpd: 75 });

    expect(result.recourseType).toBe('with_recourse');
    if (result.recourseType !== 'with_recourse') return;
    expect(result.action).toBe('grace_period_started');
    // outstanding = 100000 − 10000 = 90000
    expect(result.amountToRecover).toBe('90000.0000');
    expect(typeof result.graceEndAt).toBe('string');

    // First update: status flip + defaultedAt
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID },
        data: expect.objectContaining({
          status: InvoiceStatus.defaulted,
          defaultedAt: expect.any(Date),
        }),
      }),
    );
    // Second update: metadata stamp with the grace deadline + amount
    const metadataUpdate = prisma.invoice.update.mock.calls.find(
      (c: any) => c[0]?.data?.metadata !== undefined,
    );
    expect(metadataUpdate).toBeDefined();
    expect(metadataUpdate![0].data.metadata.recourseGraceEndAt).toBe(
      result.graceEndAt,
    );
    expect(metadataUpdate![0].data.metadata.recourseAmount).toBe('90000.0000');

    // Both lifecycle events fire on the with-recourse path.
    const eventNames = eventBus.emitAndBuild.mock.calls.map((c: any) => c[0]);
    expect(eventNames).toContain(EventType.INVOICE_DEFAULTED);
    expect(eventNames).toContain(EventType.RECOURSE_ENFORCEMENT_INITIATED);

    const defaultedEvt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_DEFAULTED,
    );
    expect(defaultedEvt[2]).toEqual(
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        dpd: 75,
        recourseType: 'with_recourse',
        outstandingAmount: '90000.0000',
      }),
    );

    const recourseEvt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.RECOURSE_ENFORCEMENT_INITIATED,
    );
    expect(recourseEvt[2]).toEqual(
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        sellerId: SELLER_ID,
        amountToRecover: '90000.0000',
      }),
    );

    // No write-off side effects on the with-recourse path.
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(debtorService.updateExposure).not.toHaveBeenCalled();
  });

  it('falls back to the default 7-day grace when factoringConfig is missing', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({ recourseType: RecourseType.with_recourse }),
      productMissing: true,
    });
    const service = newService(prisma, eventBus, debtorService);

    const before = Date.now();
    const result = await service.enforceDefault(TENANT, INVOICE_ID);
    const after = Date.now();

    expect(result.recourseType).toBe('with_recourse');
    if (result.recourseType !== 'with_recourse') return;

    // graceEndAt should be ~7 days after now. Allow 1s slack on each
    // side for clock drift between `before`/`after`.
    const graceEndMs = new Date(result.graceEndAt).getTime();
    const expectedMin = before + 7 * 86_400_000 - 1_000;
    const expectedMax = after + 7 * 86_400_000 + 1_000;
    expect(graceEndMs).toBeGreaterThanOrEqual(expectedMin);
    expect(graceEndMs).toBeLessThanOrEqual(expectedMax);
  });

  it('computes dpd from dueDate when input.dpd is not provided', async () => {
    const dueDate = daysFromNow(-42); // 42 days past due
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({
        recourseType: RecourseType.with_recourse,
        dueDate,
      }),
    });
    const service = newService(prisma, eventBus, debtorService);

    await service.enforceDefault(TENANT, INVOICE_ID);

    const defaultedEvt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_DEFAULTED,
    );
    expect(defaultedEvt[2].dpd).toBe(42);
  });
});

// ─── enforceDefault — without recourse ──────────────────────────────────

describe('RecourseService.enforceDefault — without recourse', () => {
  it('writes off the loss, returns the unreleased reserve, and decrements debtor exposure', async () => {
    const { prisma, eventBus, debtorService, getInvoiceState } = makeMocks({
      invoice: makeInvoice({
        recourseType: RecourseType.without_recourse,
        amountReceived: '15000.00',
        // 80k advanced, 15k received → 65k loss
        // 20k reserve, 5k already released → 15k unreleased to return
        reserveReleased: '5000.00',
      }),
    });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.enforceDefault(TENANT, INVOICE_ID);

    expect(result.recourseType).toBe('without_recourse');
    if (result.recourseType !== 'without_recourse') return;
    expect(result.action).toBe('written_off');
    expect(result.lossAmount).toBe('65000.0000');
    expect(result.reserveReturnedToSeller).toBe('15000.0000');

    // Two ledger entries: debit + credit, both write_off, both 65k.
    expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(2);
    const calls = prisma.ledgerEntry.create.mock.calls.map((c: any) => c[0].data);
    const debit = calls.find((d: any) => d.debitCredit === DebitCredit.debit);
    const credit = calls.find((d: any) => d.debitCredit === DebitCredit.credit);
    expect(debit).toBeDefined();
    expect(credit).toBeDefined();
    expect(debit.entryType).toBe(LedgerEntryType.write_off);
    expect(credit.entryType).toBe(LedgerEntryType.write_off);
    expect(String(debit.amount)).toBe('65000');
    expect(String(credit.amount)).toBe('65000');
    expect(debit.tenantId).toBe(TENANT);
    expect(debit.referenceId).toBe(INVOICE_ID);

    // Reserve return: invoice.reserveReleased bumped from 5k → 20k.
    const reserveUpdate = prisma.invoice.update.mock.calls.find(
      (c: any) => c[0]?.data?.reserveReleased !== undefined,
    );
    expect(reserveUpdate).toBeDefined();
    expect(String(reserveUpdate![0].data.reserveReleased)).toBe('20000');
    void getInvoiceState; // touched to avoid "unused" lint when not asserted

    // Exposure decremented by NEGATIVE faceValue.
    expect(debtorService.updateExposure).toHaveBeenCalledWith(
      TENANT,
      DEBTOR_ID,
      '-100000.0000',
      INVOICE_ID,
    );

    // NON_RECOURSE_WRITE_OFF emitted with the right amounts.
    const writeOffEvt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.NON_RECOURSE_WRITE_OFF,
    );
    expect(writeOffEvt).toBeDefined();
    expect(writeOffEvt[2]).toEqual({
      invoiceId: INVOICE_ID,
      lossAmount: '65000.0000',
      reserveReturnedToSeller: '15000.0000',
    });

    // INVOICE_DEFAULTED still fires too, with recourseType = without_recourse.
    const defaultedEvt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_DEFAULTED,
    );
    expect(defaultedEvt[2].recourseType).toBe('without_recourse');

    // The grace-period event should NOT fire on this path.
    const eventNames = eventBus.emitAndBuild.mock.calls.map((c: any) => c[0]);
    expect(eventNames).not.toContain(EventType.RECOURSE_ENFORCEMENT_INITIATED);
  });

  it('handles the "debtor paid more than the advance" edge case: loss=0, no write-off ledger, event still fires', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({
        recourseType: RecourseType.without_recourse,
        // Debtor paid 90k > 80k advance → no loss to write off.
        amountReceived: '90000.00',
        // Already released the full reserve, so nothing to return.
        reserveReleased: '20000.00',
      }),
    });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.enforceDefault(TENANT, INVOICE_ID);

    expect(result.recourseType).toBe('without_recourse');
    if (result.recourseType !== 'without_recourse') return;
    expect(result.lossAmount).toBe('0');
    expect(result.reserveReturnedToSeller).toBe('0');

    // No ledger entries when there's no loss.
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();

    // Event still fires for audit/observability completeness.
    const writeOffEvt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.NON_RECOURSE_WRITE_OFF,
    );
    expect(writeOffEvt).toBeDefined();
    expect(writeOffEvt[2].lossAmount).toBe('0');
    expect(writeOffEvt[2].reserveReturnedToSeller).toBe('0');

    // Exposure still decremented — receivable is gone regardless.
    expect(debtorService.updateExposure).toHaveBeenCalledWith(
      TENANT,
      DEBTOR_ID,
      '-100000.0000',
      INVOICE_ID,
    );
  });
});

// ─── enforceDefault — guards ────────────────────────────────────────────

describe('RecourseService.enforceDefault — guards', () => {
  it('is idempotent: re-running on an already-defaulted invoice returns existing result without re-emission', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({
        status: InvoiceStatus.defaulted,
        recourseType: RecourseType.with_recourse,
        amountReceived: '10000.00',
        defaultedAt: new Date('2026-04-01T00:00:00.000Z'),
        metadata: {
          recourseGraceEndAt: '2026-04-08T00:00:00.000Z',
          recourseAmount: '90000.0000',
        },
      }),
    });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.enforceDefault(TENANT, INVOICE_ID);

    expect(result.recourseType).toBe('with_recourse');
    if (result.recourseType !== 'with_recourse') return;
    expect(result.action).toBe('already_defaulted');
    expect(result.graceEndAt).toBe('2026-04-08T00:00:00.000Z');
    expect(result.amountToRecover).toBe('90000.0000');

    // No DB writes, no events.
    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(prisma.collectionsAction.create).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
    expect(debtorService.updateExposure).not.toHaveBeenCalled();
  });

  it('rejects on a settled invoice', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({ status: InvoiceStatus.settled }),
    });
    const service = newService(prisma, eventBus, debtorService);

    await expect(service.enforceDefault(TENANT, INVOICE_ID)).rejects.toThrow(
      /settled/,
    );
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('rejects on a cancelled invoice', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({ status: InvoiceStatus.cancelled }),
    });
    const service = newService(prisma, eventBus, debtorService);

    await expect(service.enforceDefault(TENANT, INVOICE_ID)).rejects.toThrow(
      /cancelled/,
    );
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });
});

// ─── enforceGracePeriodElapsed ──────────────────────────────────────────

describe('RecourseService.enforceGracePeriodElapsed', () => {
  it('routes to collections, stamps metadata, returns the recourse amount', async () => {
    const elapsedAt = new Date(Date.now() - 86_400_000).toISOString(); // 1 day ago
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({
        status: InvoiceStatus.defaulted,
        recourseType: RecourseType.with_recourse,
        amountReceived: '10000.00',
        metadata: {
          recourseGraceEndAt: elapsedAt,
          recourseAmount: '90000.0000',
        },
      }),
    });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.enforceGracePeriodElapsed(TENANT, INVOICE_ID);

    expect(result.action).toBe('collections_routed');
    expect(result.amount).toBe('90000.0000');

    // CollectionsAction inserted against the contract with the right type.
    expect(prisma.collectionsAction.create).toHaveBeenCalledTimes(1);
    const actionCall = prisma.collectionsAction.create.mock.calls[0][0];
    expect(actionCall.data.tenantId).toBe(TENANT);
    expect(actionCall.data.actionType).toBe('factoring_recourse');
    expect(actionCall.data.contract).toEqual({
      connect: { id: CONTRACT_ID },
    });
    expect(actionCall.data.metadata).toEqual(
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        sellerId: SELLER_ID,
        recourseAmount: '90000.0000',
        category: 'factoring_recourse',
      }),
    );

    // Metadata stamped with `recourseEnforced` + timestamp.
    const metadataUpdate = prisma.invoice.update.mock.calls.find(
      (c: any) => c[0]?.data?.metadata !== undefined,
    );
    expect(metadataUpdate).toBeDefined();
    expect(metadataUpdate![0].data.metadata.recourseEnforced).toBe(true);
    expect(typeof metadataUpdate![0].data.metadata.recourseEnforcedAt).toBe(
      'string',
    );
    // Existing metadata keys preserved.
    expect(metadataUpdate![0].data.metadata.recourseGraceEndAt).toBe(elapsedAt);
  });

  it('stamps recourseEnforcedAt while preserving recourseGraceEndAt and recourseAmount', async () => {
    const elapsedAt = new Date(Date.now() - 86_400_000).toISOString(); // 1 day ago
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({
        status: InvoiceStatus.defaulted,
        recourseType: RecourseType.with_recourse,
        amountReceived: '10000.00',
        metadata: {
          recourseGraceEndAt: elapsedAt,
          recourseAmount: '90000.0000',
          // Unrelated key that must also survive the merge.
          customNote: 'preserve me',
        },
      }),
    });
    const service = newService(prisma, eventBus, debtorService);

    const before = Date.now();
    await service.enforceGracePeriodElapsed(TENANT, INVOICE_ID);
    const after = Date.now();

    const metadataUpdate = prisma.invoice.update.mock.calls.find(
      (c: any) => c[0]?.data?.metadata !== undefined,
    );
    expect(metadataUpdate).toBeDefined();
    const meta = metadataUpdate![0].data.metadata;

    // New stamp present and a valid recent ISO string.
    expect(typeof meta.recourseEnforcedAt).toBe('string');
    const stampedMs = new Date(meta.recourseEnforcedAt).getTime();
    expect(stampedMs).toBeGreaterThanOrEqual(before - 1_000);
    expect(stampedMs).toBeLessThanOrEqual(after + 1_000);

    // The two keys the scheduler relies on must be preserved verbatim.
    expect(meta.recourseGraceEndAt).toBe(elapsedAt);
    expect(meta.recourseAmount).toBe('90000.0000');
    // Unrelated metadata also preserved (not clobbered by the merge).
    expect(meta.customNote).toBe('preserve me');
  });

  it('rejects when the grace period has not yet elapsed', async () => {
    const futureGrace = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({
        status: InvoiceStatus.defaulted,
        recourseType: RecourseType.with_recourse,
        metadata: {
          recourseGraceEndAt: futureGrace,
          recourseAmount: '90000.0000',
        },
      }),
    });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.enforceGracePeriodElapsed(TENANT, INVOICE_ID),
    ).rejects.toThrow(/grace period has not yet elapsed/);

    expect(prisma.collectionsAction.create).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });
});
