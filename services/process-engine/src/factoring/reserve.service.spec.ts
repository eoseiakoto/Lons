/**
 * Sprint 12 Phase 3D — Reserve mechanics + debtor payment recording tests.
 *
 * Mock-Prisma unit tests covering recordDebtorPayment (full / partial / top-up
 * / idempotency / risk reassessment) and releaseReserve (standard release,
 * shortfall surplus, no-surplus rejection, manual-approval gating, dispute
 * blocking, idempotent replay).
 */

import { InvoiceStatus } from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { ReserveService } from './reserve.service';

// ─── Constants ─────────────────────────────────────────────────────────────

const TENANT = '11111111-1111-1111-1111-111111111111';
const SELLER = '22222222-2222-2222-2222-222222222222';
const DEBTOR = '33333333-3333-3333-3333-333333333333';
const PRODUCT = '44444444-4444-4444-4444-444444444444';
const INVOICE_ID = '55555555-5555-5555-5555-555555555555';
const CONTRACT = '66666666-6666-6666-6666-666666666666';
const OPERATOR = '77777777-7777-7777-7777-777777777777';

// ─── Fixtures ──────────────────────────────────────────────────────────────

interface InvoiceFixtureOpts {
  status?: InvoiceStatus;
  faceValue?: string;
  amountReceived?: string | null;
  reserveAmount?: string | null;
  reserveReleased?: string | null;
  advancedAmount?: string | null;
  discountFee?: string | null;
  serviceFee?: string | null;
  metadata?: Record<string, unknown> | null;
  factoringConfig?: Record<string, unknown> | null;
  contractId?: string | null;
}

function makeInvoice(opts: InvoiceFixtureOpts = {}): any {
  return {
    id: INVOICE_ID,
    tenantId: TENANT,
    sellerId: SELLER,
    debtorId: DEBTOR,
    productId: PRODUCT,
    contractId: opts.contractId === null ? null : opts.contractId ?? CONTRACT,
    invoiceNumber: 'INV-2026-001',
    currency: 'GHS',
    faceValue: opts.faceValue ?? '100000.00',
    amountReceived: opts.amountReceived === null ? null : opts.amountReceived ?? '0',
    reserveAmount: opts.reserveAmount === null ? null : opts.reserveAmount ?? '20000.00',
    reserveReleased: opts.reserveReleased === null ? null : opts.reserveReleased ?? '0',
    advancedAmount: opts.advancedAmount === null ? null : opts.advancedAmount ?? '80000.00',
    discountFee: opts.discountFee === null ? null : opts.discountFee ?? '0',
    serviceFee: opts.serviceFee === null ? null : opts.serviceFee ?? '0',
    status: opts.status ?? InvoiceStatus.debtor_notified,
    metadata: opts.metadata === undefined ? null : opts.metadata,
    product: {
      id: PRODUCT,
      factoringConfig:
        opts.factoringConfig === null
          ? null
          : opts.factoringConfig ?? {
              autoReserveRelease: true,
              manualReleaseAbove: '200000.00',
            },
    },
  };
}

// ─── Mock helpers ──────────────────────────────────────────────────────────

interface MakeMocksOpts {
  invoice?: any;
  /** Optional sequence — first findFirst returns invoices[0], etc. */
  invoiceSequence?: any[];
  /** Throw inside debtorService.assessRisk to exercise the safety path. */
  assessRiskError?: Error;
}

function makeMocks(opts: MakeMocksOpts = {}) {
  const queue = opts.invoiceSequence ?? (opts.invoice ? [opts.invoice] : [null]);
  const findFirst = jest.fn(async () => {
    return queue.length > 0 ? queue.shift() : queue[queue.length - 1] ?? null;
  });

  const update = jest.fn(async (args: any) => {
    // Merge update onto the most recently returned invoice fixture so the
    // service's downstream logic (logging, etc.) sees a consistent shape.
    const base = opts.invoice ?? opts.invoiceSequence?.[0] ?? makeInvoice();
    return { ...base, ...args.data, id: args.where.id };
  });

  const ledgerCreate = jest.fn(async (args: any) => ({ id: 'ledger-id', ...args.data }));

  const prisma = {
    invoice: { findFirst, update },
    ledgerEntry: { create: ledgerCreate },
  };

  const eventBus = { emitAndBuild: jest.fn() };

  const debtorService = {
    assessRisk: jest.fn(async () => {
      if (opts.assessRiskError) throw opts.assessRiskError;
      return {
        score: '70.00',
        averagePaymentDays: 0,
        reliabilityPercent: '100.00',
        factors: {
          paymentHistory: '0',
          industry: '0',
          country: '0',
          default: '0',
        },
      };
    }),
  };

  return { prisma, eventBus, debtorService };
}

function newService(
  prisma: any,
  eventBus: any,
  debtorService: any,
  originationService: any = { complete: jest.fn() },
): ReserveService {
  return new ReserveService(
    prisma as any,
    eventBus as any,
    debtorService as any,
    originationService as any,
  );
}

// ─── recordDebtorPayment ──────────────────────────────────────────────────

describe('ReserveService.recordDebtorPayment', () => {
  it('full payment (100k face, 100k received) → status payment_received, emits INVOICE_PAYMENT_RECEIVED with isPartial=false', async () => {
    const invoice = makeInvoice({ faceValue: '100000.00', amountReceived: '0' });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.recordDebtorPayment(TENANT, INVOICE_ID, {
      amountReceived: '100000.00',
      paymentRef: 'PAY-FULL-1',
      operatorId: OPERATOR,
      idempotencyKey: 'IDEM-1',
    });

    expect(result.status).toBe(InvoiceStatus.payment_received);
    expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(1);

    const ledgerArgs = prisma.ledgerEntry.create.mock.calls[0][0];
    expect(ledgerArgs.data.entryType).toBe('repayment');
    expect(ledgerArgs.data.debitCredit).toBe('credit');
    expect(ledgerArgs.data.amount).toBe('100000.00');
    expect(ledgerArgs.data.referenceId).toBe(INVOICE_ID);

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_PAYMENT_RECEIVED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]).toMatchObject({
      invoiceId: INVOICE_ID,
      amountReceived: '100000.00',
      totalReceivedToDate: '100000.0000',
      isPartial: false,
    });
    // Should NOT have emitted the partial event.
    expect(
      eventBus.emitAndBuild.mock.calls.find(
        (c: any) => c[0] === EventType.INVOICE_PAYMENT_PARTIAL,
      ),
    ).toBeUndefined();
  });

  it('partial payment (100k face, 70k received) → status stays debtor_notified, emits INVOICE_PAYMENT_PARTIAL with remainingFaceValue=30000', async () => {
    const invoice = makeInvoice({ faceValue: '100000.00', amountReceived: '0' });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.recordDebtorPayment(TENANT, INVOICE_ID, {
      amountReceived: '70000.00',
      paymentRef: 'PAY-PARTIAL-1',
      operatorId: OPERATOR,
      idempotencyKey: 'IDEM-PARTIAL-1',
    });

    // Status should NOT have moved to payment_received.
    expect(result.status).toBe(InvoiceStatus.debtor_notified);

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_PAYMENT_PARTIAL,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]).toMatchObject({
      invoiceId: INVOICE_ID,
      amountReceived: '70000.00',
      totalReceivedToDate: '70000.0000',
      remainingFaceValue: '30000.0000',
      isPartial: true,
    });
    expect(
      eventBus.emitAndBuild.mock.calls.find(
        (c: any) => c[0] === EventType.INVOICE_PAYMENT_RECEIVED,
      ),
    ).toBeUndefined();
  });

  it('second top-up (70k partial then 30k more = 100k total) → status moves to payment_received on the second call', async () => {
    // First call: 70k partial. Second call: 30k arrives, should close out.
    const initialInvoice = makeInvoice({
      faceValue: '100000.00',
      amountReceived: '0',
    });
    const afterPartial = makeInvoice({
      faceValue: '100000.00',
      amountReceived: '70000.00',
      status: InvoiceStatus.debtor_notified,
    });

    const { prisma, eventBus, debtorService } = makeMocks({
      invoiceSequence: [initialInvoice, afterPartial],
    });
    const service = newService(prisma, eventBus, debtorService);

    const first = await service.recordDebtorPayment(TENANT, INVOICE_ID, {
      amountReceived: '70000.00',
      paymentRef: 'PAY-1',
      operatorId: OPERATOR,
      idempotencyKey: 'IDEM-A',
    });
    expect(first.status).toBe(InvoiceStatus.debtor_notified);

    const second = await service.recordDebtorPayment(TENANT, INVOICE_ID, {
      amountReceived: '30000.00',
      paymentRef: 'PAY-2',
      operatorId: OPERATOR,
      idempotencyKey: 'IDEM-B',
    });
    expect(second.status).toBe(InvoiceStatus.payment_received);

    const fullEvts = eventBus.emitAndBuild.mock.calls.filter(
      (c: any) => c[0] === EventType.INVOICE_PAYMENT_RECEIVED,
    );
    expect(fullEvts).toHaveLength(1);
    expect(fullEvts[0][2]).toMatchObject({
      amountReceived: '30000.00',
      totalReceivedToDate: '100000.0000',
      isPartial: false,
    });

    const partialEvts = eventBus.emitAndBuild.mock.calls.filter(
      (c: any) => c[0] === EventType.INVOICE_PAYMENT_PARTIAL,
    );
    expect(partialEvts).toHaveLength(1);
  });

  it('rejects negative or zero amount', async () => {
    const invoice = makeInvoice();
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.recordDebtorPayment(TENANT, INVOICE_ID, {
        amountReceived: '0',
        paymentRef: 'PAY-X',
        operatorId: OPERATOR,
        idempotencyKey: 'IDEM-X',
      }),
    ).rejects.toThrow(/positive/);

    const second = makeMocks({ invoice });
    const service2 = newService(second.prisma, second.eventBus, second.debtorService);
    await expect(
      service2.recordDebtorPayment(TENANT, INVOICE_ID, {
        amountReceived: '-100.00',
        paymentRef: 'PAY-Y',
        operatorId: OPERATOR,
        idempotencyKey: 'IDEM-Y',
      }),
    ).rejects.toThrow(/positive/);

    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('idempotency: same idempotencyKey returns same invoice without double-recording', async () => {
    const replayedInvoice = makeInvoice({
      faceValue: '100000.00',
      amountReceived: '50000.00',
      metadata: { lastPaymentIdempotencyKey: 'IDEM-REPLAY' },
    });
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: replayedInvoice,
    });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.recordDebtorPayment(TENANT, INVOICE_ID, {
      amountReceived: '50000.00',
      paymentRef: 'PAY-REPLAY',
      operatorId: OPERATOR,
      idempotencyKey: 'IDEM-REPLAY',
    });

    expect(result.id).toBe(INVOICE_ID);
    expect(result.amountReceived).toBe('50000.00');
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
    expect(debtorService.assessRisk).not.toHaveBeenCalled();
  });

  it('triggers debtor risk reassessment after recording payment', async () => {
    const invoice = makeInvoice({ faceValue: '100000.00', amountReceived: '0' });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await service.recordDebtorPayment(TENANT, INVOICE_ID, {
      amountReceived: '40000.00',
      paymentRef: 'PAY-RISK',
      operatorId: OPERATOR,
      idempotencyKey: 'IDEM-RISK',
    });

    expect(debtorService.assessRisk).toHaveBeenCalledTimes(1);
    expect(debtorService.assessRisk).toHaveBeenCalledWith(TENANT, DEBTOR);
  });

  it('does NOT fail if assessRisk throws (logs and continues)', async () => {
    const invoice = makeInvoice({ faceValue: '100000.00', amountReceived: '0' });
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice,
      assessRiskError: new Error('downstream blew up'),
    });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.recordDebtorPayment(TENANT, INVOICE_ID, {
      amountReceived: '100000.00',
      paymentRef: 'PAY-SAFE',
      operatorId: OPERATOR,
      idempotencyKey: 'IDEM-SAFE',
    });

    // Payment still committed and event still emitted.
    expect(result.status).toBe(InvoiceStatus.payment_received);
    expect(
      eventBus.emitAndBuild.mock.calls.find(
        (c: any) => c[0] === EventType.INVOICE_PAYMENT_RECEIVED,
      ),
    ).toBeDefined();
    expect(debtorService.assessRisk).toHaveBeenCalled();
  });

  it('rejects when invoice is not in debtor_notified or payment_received', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.funded });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.recordDebtorPayment(TENANT, INVOICE_ID, {
        amountReceived: '100.00',
        paymentRef: 'PAY-Z',
        operatorId: OPERATOR,
        idempotencyKey: 'IDEM-Z',
      }),
    ).rejects.toThrow(/debtor payment can only be recorded/);
  });

  it('throws NotFoundError when invoice does not exist', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({ invoice: null });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.recordDebtorPayment(TENANT, INVOICE_ID, {
        amountReceived: '100.00',
        paymentRef: 'PAY-N',
        operatorId: OPERATOR,
        idempotencyKey: 'IDEM-N',
      }),
    ).rejects.toThrow(/Invoice/);
  });
});

// ─── releaseReserve ───────────────────────────────────────────────────────

describe('ReserveService.releaseReserve', () => {
  it('standard flow (spec §6.1: 100k face, 80k advance, 20k reserve, 100k received) → reserveReleased=20000, status=reserve_released, emits event', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.payment_received,
      faceValue: '100000.00',
      amountReceived: '100000.00',
      advancedAmount: '80000.00',
      reserveAmount: '20000.00',
      reserveReleased: '0',
      discountFee: '2400.00',
      serviceFee: '500.00',
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.releaseReserve(TENANT, INVOICE_ID, {
      idempotencyKey: 'REL-1',
    });

    expect(result.status).toBe(InvoiceStatus.reserve_released);
    expect(result.reserveReleased).toBe('20000.0000');
    expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(2);

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_RESERVE_RELEASED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]).toMatchObject({
      invoiceId: INVOICE_ID,
      releasedAmount: '20000.0000',
      totalReleased: '20000.0000',
    });
  });

  it('partial-payment release with no surplus (spec §6.2: 100k face, 80k advance + 1k fees, 70k received) → throws InsufficientDebtorPayment', async () => {
    // Defensive code path — the public status guard normally keeps us out
    // of this branch, but if a future code path lands the invoice in
    // payment_received with a true shortfall (e.g. an operator manually
    // moved status), the math still has to refuse.
    const invoice = makeInvoice({
      status: InvoiceStatus.payment_received,
      faceValue: '100000.00',
      amountReceived: '70000.00',
      advancedAmount: '80000.00',
      reserveAmount: '20000.00',
      reserveReleased: '0',
      discountFee: '500.00',
      serviceFee: '500.00',
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.releaseReserve(TENANT, INVOICE_ID, { idempotencyKey: 'REL-NS' }),
    ).rejects.toThrow(/Insufficient debtor payment/);

    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('partial-payment release with surplus (100k face, 50k advance, 60k received → surplus = 10k, released)', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.payment_received,
      faceValue: '100000.00',
      amountReceived: '60000.00',
      advancedAmount: '50000.00',
      reserveAmount: '50000.00',
      reserveReleased: '0',
      discountFee: '0',
      serviceFee: '0',
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.releaseReserve(TENANT, INVOICE_ID, {
      idempotencyKey: 'REL-SURPLUS',
    });

    expect(result.status).toBe(InvoiceStatus.reserve_released);
    expect(result.reserveReleased).toBe('10000.0000');
    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_RESERVE_RELEASED,
    );
    expect(evt?.[2]).toMatchObject({
      releasedAmount: '10000.0000',
      totalReleased: '10000.0000',
    });
  });

  it('requires operator when manual approval threshold breached (faceValue > manualReleaseAbove and operatorId missing → throws ValidationError)', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.payment_received,
      faceValue: '300000.00',
      amountReceived: '300000.00',
      advancedAmount: '240000.00',
      reserveAmount: '60000.00',
      reserveReleased: '0',
      factoringConfig: {
        autoReserveRelease: true,
        manualReleaseAbove: '200000.00',
      },
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.releaseReserve(TENANT, INVOICE_ID, { idempotencyKey: 'REL-MAN' }),
    ).rejects.toThrow(/operator approval/);

    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('allows manual release when operator is supplied above threshold', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.payment_received,
      faceValue: '300000.00',
      amountReceived: '300000.00',
      advancedAmount: '240000.00',
      reserveAmount: '60000.00',
      reserveReleased: '0',
      factoringConfig: {
        autoReserveRelease: true,
        manualReleaseAbove: '200000.00',
      },
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.releaseReserve(TENANT, INVOICE_ID, {
      operatorId: OPERATOR,
      idempotencyKey: 'REL-MAN-OK',
    });

    expect(result.status).toBe(InvoiceStatus.reserve_released);
    expect(result.reserveReleased).toBe('60000.0000');
    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_RESERVE_RELEASED,
    );
    expect(evt?.[2]?.releasedBy).toBe(OPERATOR);
  });

  it('allows auto-release when below threshold', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.payment_received,
      faceValue: '50000.00',
      amountReceived: '50000.00',
      advancedAmount: '40000.00',
      reserveAmount: '10000.00',
      reserveReleased: '0',
      factoringConfig: {
        autoReserveRelease: true,
        manualReleaseAbove: '200000.00',
      },
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.releaseReserve(TENANT, INVOICE_ID, {
      idempotencyKey: 'REL-AUTO',
    });

    expect(result.status).toBe(InvoiceStatus.reserve_released);
    expect(result.reserveReleased).toBe('10000.0000');
  });

  it('blocks when invoice is in disputed status', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.disputed,
      faceValue: '100000.00',
      amountReceived: '100000.00',
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.releaseReserve(TENANT, INVOICE_ID, {
        idempotencyKey: 'REL-DISPUTE',
      }),
    ).rejects.toThrow(/disputed/);

    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('idempotency: re-run on already fully-released invoice returns invoice as-is', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.reserve_released,
      faceValue: '100000.00',
      amountReceived: '100000.00',
      advancedAmount: '80000.00',
      reserveAmount: '20000.00',
      reserveReleased: '20000.00',
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.releaseReserve(TENANT, INVOICE_ID, {
      idempotencyKey: 'REL-IDEM',
    });

    expect(result.id).toBe(INVOICE_ID);
    expect(result.reserveReleased).toBe('20000.00');
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('rejects when invoice is not in payment_received or reserve_released', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.debtor_notified,
      faceValue: '100000.00',
      amountReceived: '50000.00',
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.releaseReserve(TENANT, INVOICE_ID, { idempotencyKey: 'REL-BAD' }),
    ).rejects.toThrow(/can only be released from payment_received/);
  });

  it('throws NotFoundError when invoice does not exist', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({ invoice: null });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.releaseReserve(TENANT, INVOICE_ID, { idempotencyKey: 'REL-NF' }),
    ).rejects.toThrow(/Invoice/);
  });
});
