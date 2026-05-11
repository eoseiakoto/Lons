/**
 * Sprint 13 S13-1 — Unit tests for the inbound debtor-payment matching
 * waterfall. Stubs Prisma + EventBus + ReserveService and walks each branch
 * of `matchAndApply`:
 *   - exact invoice-number match
 *   - currency mismatch on invoice number
 *   - debtorRef + FIFO via registrationNumber / taxId / UUID id
 *   - waterfall priority (invoiceNumber wins over debtorRef)
 *   - no-match → UNMATCHED reason `no_matching_invoice`
 *   - duplicate webhook idempotency relies on ReserveService's existing key
 */

import { InvoiceStatus } from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { DebtorPaymentMatchingService } from './debtor-payment-matching.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const INVOICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEBTOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INVOICE_ID_OLD = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const INVOICE_ID_NEW = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

interface InvoiceFixture {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  currency: string;
  status: InvoiceStatus;
  debtorId: string;
  dueDate: Date;
}

interface DebtorFixture {
  id: string;
  tenantId: string;
  registrationNumber: string | null;
  taxId: string | null;
}

/**
 * S13B-2 + Security Hardening (SEC-5): lookups route through HMAC-SHA-256
 * hash columns. The mock derives the hash from the fixture's plaintext
 * with the same util the production code uses, keeping the test in
 * sync with any future hash-algorithm changes (e.g. pepper rotation).
 *
 * `computeSearchableHash` reads `HASH_PEPPER` from the environment; the
 * package's jest.setup.ts seeds a deterministic value before any module
 * loads, so this works without explicit beforeEach setup.
 */
import { computeSearchableHash } from '@lons/common';

function fixtureHash(value: string | null): string | null {
  return computeSearchableHash(value);
}

function makeService(opts: {
  invoices?: InvoiceFixture[];
  debtors?: DebtorFixture[];
}) {
  const invoices = opts.invoices ?? [];
  const debtors = opts.debtors ?? [];

  const invoiceFindFirst = jest.fn(async (args: any) => {
    const where = args.where ?? {};
    const matchingStatuses: InvoiceStatus[] = where.status?.in ?? [];
    let candidates = invoices.filter((i) => {
      if (i.tenantId !== where.tenantId) return false;
      if (where.invoiceNumber && i.invoiceNumber !== where.invoiceNumber)
        return false;
      if (where.currency && i.currency !== where.currency) return false;
      if (where.debtorId && i.debtorId !== where.debtorId) return false;
      if (matchingStatuses.length && !matchingStatuses.includes(i.status))
        return false;
      return true;
    });
    if (args.orderBy?.dueDate === 'asc') {
      candidates = candidates
        .slice()
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    }
    if (args.select) {
      const inv = candidates[0];
      if (!inv) return null;
      const out: any = {};
      for (const key of Object.keys(args.select)) {
        out[key] = (inv as any)[key];
      }
      return out;
    }
    return candidates[0] ?? null;
  });

  const debtorFindFirst = jest.fn(async (args: any) => {
    const where = args.where ?? {};
    const orClauses: Array<Record<string, unknown>> = where.OR ?? [];
    const found = debtors.find((d) => {
      if (d.tenantId !== where.tenantId) return false;
      return orClauses.some((cl) => {
        // S13B-2: production code queries the hash columns. Mock matches
        // by deriving the hash from the fixture's plaintext.
        if ('registrationNumberHash' in cl) {
          return (
            fixtureHash(d.registrationNumber) === cl.registrationNumberHash
          );
        }
        if ('taxIdHash' in cl) {
          return fixtureHash(d.taxId) === cl.taxIdHash;
        }
        // Legacy paths kept for back-compat with any tests that still
        // probe the old shape.
        if ('registrationNumber' in cl)
          return d.registrationNumber === cl.registrationNumber;
        if ('taxId' in cl) return d.taxId === cl.taxId;
        if ('id' in cl) return d.id === cl.id;
        return false;
      });
    });
    return found ?? null;
  });

  const prisma = {
    invoice: { findFirst: invoiceFindFirst },
    debtor: { findFirst: debtorFindFirst },
  } as any;

  const eventBus = { emitAndBuild: jest.fn() } as any;
  const reserveService = {
    recordDebtorPayment: jest.fn(async (_t: string, _id: string, _input: any) => ({
      id: _id,
      status: InvoiceStatus.payment_received,
    })),
  } as any;
  // S13B-1: AuditService dependency for webhook-activity audit writes.
  const auditService = { log: jest.fn(async (_input: unknown) => {}) } as any;

  const service = new DebtorPaymentMatchingService(
    prisma,
    eventBus,
    reserveService,
    auditService,
  );

  return { service, prisma, eventBus, reserveService, auditService };
}

const baseInvoice: InvoiceFixture = {
  id: INVOICE_ID,
  tenantId: TENANT,
  invoiceNumber: 'INV-2026-001',
  currency: 'GHS',
  status: InvoiceStatus.debtor_notified,
  debtorId: DEBTOR_ID,
  dueDate: new Date('2026-06-01T00:00:00Z'),
};

describe('DebtorPaymentMatchingService.matchAndApply', () => {
  // ── Strategy 1: exact invoice number match ─────────────────────────────

  it('exact invoice-number match → calls reserveService.recordDebtorPayment + emits MATCHED', async () => {
    const { service, eventBus, reserveService } = makeService({
      invoices: [baseInvoice],
    });

    const result = await service.matchAndApply(TENANT, {
      transactionRef: 'TX-1',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-2026-001',
    });

    expect(result).toEqual({
      matched: true,
      invoiceId: INVOICE_ID,
      matchStrategy: 'invoice_number',
    });
    expect(reserveService.recordDebtorPayment).toHaveBeenCalledTimes(1);
    expect(reserveService.recordDebtorPayment).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      {
        amountReceived: '10000.00',
        paymentRef: 'TX-1',
        operatorId: 'system:webhook',
        idempotencyKey: 'TX-1',
      },
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_PAYMENT_MATCHED,
      TENANT,
      expect.objectContaining({
        invoiceId: INVOICE_ID,
        amount: '10000.00',
        currency: 'GHS',
        transactionRef: 'TX-1',
        matchStrategy: 'invoice_number',
      }),
    );
  });

  it('currency mismatch on invoice-number lookup → emits UNMATCHED reason currency_mismatch and does NOT apply', async () => {
    const { service, eventBus, reserveService } = makeService({
      invoices: [{ ...baseInvoice, currency: 'USD' }],
    });

    const result = await service.matchAndApply(TENANT, {
      transactionRef: 'TX-2',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-2026-001',
    });

    expect(result).toEqual({ matched: false, reason: 'currency_mismatch' });
    expect(reserveService.recordDebtorPayment).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_PAYMENT_UNMATCHED,
      TENANT,
      expect.objectContaining({
        transactionRef: 'TX-2',
        currency: 'GHS',
        reason: 'currency_mismatch',
      }),
    );
    expect(eventBus.emitAndBuild).not.toHaveBeenCalledWith(
      EventType.DEBTOR_PAYMENT_MATCHED,
      expect.anything(),
      expect.anything(),
    );
  });

  // ── Strategy 2: debtor ref + FIFO ─────────────────────────────────────

  it('FIFO match by debtorRef + registrationNumber picks the oldest outstanding invoice', async () => {
    const oldInvoice: InvoiceFixture = {
      ...baseInvoice,
      id: INVOICE_ID_OLD,
      invoiceNumber: 'INV-OLD',
      dueDate: new Date('2026-04-01T00:00:00Z'),
    };
    const newInvoice: InvoiceFixture = {
      ...baseInvoice,
      id: INVOICE_ID_NEW,
      invoiceNumber: 'INV-NEW',
      dueDate: new Date('2026-08-01T00:00:00Z'),
    };
    const { service, eventBus, reserveService } = makeService({
      invoices: [newInvoice, oldInvoice], // not pre-sorted on purpose
      debtors: [
        {
          id: DEBTOR_ID,
          tenantId: TENANT,
          registrationNumber: 'REG-ACME-1',
          taxId: null,
        },
      ],
    });

    const result = await service.matchAndApply(TENANT, {
      transactionRef: 'TX-3',
      amount: '5000.00',
      currency: 'GHS',
      debtorRef: 'REG-ACME-1',
    });

    expect(result).toEqual({
      matched: true,
      invoiceId: INVOICE_ID_OLD,
      matchStrategy: 'fifo',
    });
    expect(reserveService.recordDebtorPayment).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID_OLD,
      expect.objectContaining({ idempotencyKey: 'TX-3' }),
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_PAYMENT_MATCHED,
      TENANT,
      expect.objectContaining({ matchStrategy: 'fifo' }),
    );
  });

  it('FIFO match by debtorRef + taxId resolves the same debtor', async () => {
    const { service, reserveService } = makeService({
      invoices: [baseInvoice],
      debtors: [
        {
          id: DEBTOR_ID,
          tenantId: TENANT,
          registrationNumber: null,
          taxId: 'TAX-123',
        },
      ],
    });

    const result = await service.matchAndApply(TENANT, {
      transactionRef: 'TX-4',
      amount: '10000.00',
      currency: 'GHS',
      debtorRef: 'TAX-123',
    });

    expect(result.matched).toBe(true);
    expect(result.matchStrategy).toBe('fifo');
    expect(reserveService.recordDebtorPayment).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      expect.any(Object),
    );
  });

  it('FIFO match by debtorRef + UUID id resolves the same debtor', async () => {
    const { service, reserveService } = makeService({
      invoices: [baseInvoice],
      debtors: [
        {
          id: DEBTOR_ID,
          tenantId: TENANT,
          registrationNumber: null,
          taxId: null,
        },
      ],
    });

    const result = await service.matchAndApply(TENANT, {
      transactionRef: 'TX-5',
      amount: '10000.00',
      currency: 'GHS',
      debtorRef: DEBTOR_ID,
    });

    expect(result.matched).toBe(true);
    expect(result.matchStrategy).toBe('fifo');
    expect(reserveService.recordDebtorPayment).toHaveBeenCalled();
  });

  // ── No match ──────────────────────────────────────────────────────────

  it('no invoice-number, no debtor → UNMATCHED reason no_matching_invoice', async () => {
    const { service, eventBus, reserveService } = makeService({
      invoices: [],
      debtors: [],
    });

    const result = await service.matchAndApply(TENANT, {
      transactionRef: 'TX-6',
      amount: '10000.00',
      currency: 'GHS',
      paymentRef: 'SOME-REF',
    });

    expect(result).toEqual({ matched: false, reason: 'no_matching_invoice' });
    expect(reserveService.recordDebtorPayment).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_PAYMENT_UNMATCHED,
      TENANT,
      expect.objectContaining({
        transactionRef: 'TX-6',
        reason: 'no_matching_invoice',
      }),
    );
  });

  // ── Waterfall priority ────────────────────────────────────────────────

  it('when both invoiceNumber and debtorRef are present, invoiceNumber wins', async () => {
    const direct: InvoiceFixture = {
      ...baseInvoice,
      id: INVOICE_ID,
      invoiceNumber: 'INV-DIRECT',
    };
    const fifoCandidate: InvoiceFixture = {
      ...baseInvoice,
      id: INVOICE_ID_OLD,
      invoiceNumber: 'INV-OTHER',
      dueDate: new Date('2026-01-01T00:00:00Z'),
    };

    const { service, reserveService, eventBus } = makeService({
      invoices: [direct, fifoCandidate],
      debtors: [
        {
          id: DEBTOR_ID,
          tenantId: TENANT,
          registrationNumber: 'REG-X',
          taxId: null,
        },
      ],
    });

    const result = await service.matchAndApply(TENANT, {
      transactionRef: 'TX-7',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-DIRECT',
      debtorRef: 'REG-X',
    });

    expect(result).toEqual({
      matched: true,
      invoiceId: INVOICE_ID,
      matchStrategy: 'invoice_number',
    });
    expect(reserveService.recordDebtorPayment).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      expect.any(Object),
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_PAYMENT_MATCHED,
      TENANT,
      expect.objectContaining({ matchStrategy: 'invoice_number' }),
    );
  });

  // ── Idempotency ───────────────────────────────────────────────────────

  it('duplicate webhook (same transactionRef) is forwarded to ReserveService whose existing key check handles dedup', async () => {
    // The matching layer doesn't dedup itself — it relies on ReserveService's
    // idempotency check on the supplied idempotencyKey. We simulate a replay
    // by mocking recordDebtorPayment to return the cached invoice on the
    // second call without side effects, and verify both calls reach it with
    // the same key.
    const { service, reserveService, eventBus } = makeService({
      invoices: [baseInvoice],
    });

    const callOne = await service.matchAndApply(TENANT, {
      transactionRef: 'DUP-TX',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-2026-001',
    });
    const callTwo = await service.matchAndApply(TENANT, {
      transactionRef: 'DUP-TX',
      amount: '10000.00',
      currency: 'GHS',
      invoiceNumber: 'INV-2026-001',
    });

    expect(callOne.matched).toBe(true);
    expect(callTwo.matched).toBe(true);
    // Both calls reach recordDebtorPayment with the same idempotencyKey.
    // ReserveService's existing key check is what makes the second call a no-op.
    expect(reserveService.recordDebtorPayment).toHaveBeenCalledTimes(2);
    expect(reserveService.recordDebtorPayment).toHaveBeenNthCalledWith(
      1,
      TENANT,
      INVOICE_ID,
      expect.objectContaining({ idempotencyKey: 'DUP-TX' }),
    );
    expect(reserveService.recordDebtorPayment).toHaveBeenNthCalledWith(
      2,
      TENANT,
      INVOICE_ID,
      expect.objectContaining({ idempotencyKey: 'DUP-TX' }),
    );
    // MATCHED is emitted on each successful match — the matching layer
    // doesn't dedup, that's ReserveService's job.
    const matched = (eventBus.emitAndBuild as jest.Mock).mock.calls.filter(
      ([type]) => type === EventType.DEBTOR_PAYMENT_MATCHED,
    );
    expect(matched).toHaveLength(2);
  });
});
