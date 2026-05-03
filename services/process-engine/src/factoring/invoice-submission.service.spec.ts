/**
 * Sprint 12 Phase 3B — Invoice submission + verification flow tests.
 *
 * Mock-Prisma unit tests covering the validation gates, verification
 * routing decision tree (SPEC §3.3), and operator-driven manual
 * verification resolution. Idempotency replay is also exercised.
 */

import {
  CustomerStatus,
  DebtorStatus,
  InvoiceStatus,
  ProductStatus,
  ProductType,
  RecourseType,
  VerificationStatus,
} from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { InvoiceSubmissionService } from './invoice-submission.service';
import type { SubmitInvoiceInput } from './invoice-submission.types';

const TENANT = '11111111-1111-1111-1111-111111111111';
const SELLER = '22222222-2222-2222-2222-222222222222';
const DEBTOR = '33333333-3333-3333-3333-333333333333';
const PRODUCT = '44444444-4444-4444-4444-444444444444';
const INVOICE_ID = '55555555-5555-5555-5555-555555555555';
const VERIFIER = '66666666-6666-6666-6666-666666666666';

// ─── Fixtures ───────────────────────────────────────────────────────────

const sellerActive = {
  id: SELLER,
  tenantId: TENANT,
  status: CustomerStatus.active,
  deletedAt: null,
};

const sellerBlacklisted = {
  ...sellerActive,
  status: CustomerStatus.blacklisted,
};

const debtorActive = {
  id: DEBTOR,
  tenantId: TENANT,
  status: DebtorStatus.active,
  deletedAt: null,
};

const debtorSuspended = {
  ...debtorActive,
  status: DebtorStatus.suspended,
};

const productInvoiceFinancing = {
  id: PRODUCT,
  tenantId: TENANT,
  type: ProductType.invoice_financing,
  status: ProductStatus.active,
  minAmount: '1000.00',
  maxAmount: '500000.00',
  factoringConfig: {
    verificationRules: {
      autoVerifyBelow: '50000.00',
      manualVerifyAbove: '200000.00',
      manualVerifyNewSeller: true,
      manualVerifyNewDebtor: true,
    },
  },
  deletedAt: null,
};

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function baseInput(overrides: Partial<SubmitInvoiceInput> = {}): SubmitInvoiceInput {
  return {
    idempotencyKey: 'INV-IDEM-1',
    sellerId: SELLER,
    debtorId: DEBTOR,
    productId: PRODUCT,
    invoiceNumber: 'INV-2026-001',
    issueDate: pastDate(5),
    dueDate: futureDate(60),
    faceValue: '10000.00',
    currency: 'GHS',
    ...overrides,
  };
}

// ─── Mock helpers ───────────────────────────────────────────────────────

interface MakeMocksOpts {
  existingByIdem?: any;
  seller?: any;
  product?: any;
  debtor?: any;
  duplicateInvoice?: any;
  /** Count returned for the seller-history query (drives "new_seller" route). */
  sellerInvoiceCount?: number;
  /** Count returned for the debtor-history query (drives "new_debtor" route). */
  debtorInvoiceCount?: number;
  /** Used to seed `prisma.invoice.findFirst` for `resolveVerification`. */
  invoiceForResolve?: any;
  /**
   * Stubbed return value for the injected ConcentrationLimitService.
   * Defaults to `{ passed: true, violations: [] }` so existing happy-path
   * tests continue to round-trip through to the persistence step.
   */
  concentrationResult?: { passed: boolean; violations: any[] };
}

function makeMocks(opts: MakeMocksOpts = {}) {
  // findFirst is called multiple times depending on the path:
  //   submit():           1) idempotency lookup, 2) duplicate (sellerId,
  //                        invoiceNumber) pre-check
  //   resolveVerification(): 1) fetch invoice
  // For resolveVerification specs we only seed the invoice, so it gets
  // returned on the first call. submit() specs leave invoiceForResolve
  // undefined and get the [existingByIdem, duplicateInvoice] sequence.
  const findFirstQueue: any[] =
    opts.invoiceForResolve !== undefined
      ? [opts.invoiceForResolve]
      : [opts.existingByIdem ?? null, opts.duplicateInvoice ?? null];

  // count() is called twice when both new-seller and new-debtor flags are
  // on: first for sellerInvoiceCount, then for debtorInvoiceCount.
  const countResults = [
    opts.sellerInvoiceCount ?? 5,
    opts.debtorInvoiceCount ?? 5,
  ];

  const create = jest.fn(async (args: any) => ({
    id: INVOICE_ID,
    advancedAmount: null,
    reserveAmount: null,
    discountFee: null,
    serviceFee: null,
    netDisbursement: null,
    contractId: null,
    verifiedBy: null,
    verifiedAt: args.data.verifiedAt ?? null,
    verificationNotes: null,
    debtorNotifiedAt: null,
    debtorPaymentRef: null,
    amountReceived: '0',
    reserveReleased: '0',
    disputeReason: null,
    fundedAt: null,
    settledAt: null,
    defaultedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    issueDate: new Date(`${args.data.issueDate?.toISOString?.().slice(0, 10) ?? args.data.issueDate}`),
    dueDate: new Date(`${args.data.dueDate?.toISOString?.().slice(0, 10) ?? args.data.dueDate}`),
    ...args.data,
  }));

  const update = jest.fn(async (args: any) => ({
    id: args.where.id,
    tenantId: TENANT,
    sellerId: SELLER,
    debtorId: DEBTOR,
    productId: PRODUCT,
    invoiceNumber: 'INV-2026-001',
    currency: 'GHS',
    faceValue: '10000.00',
    advanceRatePercent: '0',
    ...args.data,
  }));

  const prisma = {
    invoice: {
      findFirst: jest.fn(async () => findFirstQueue.shift() ?? null),
      count: jest.fn(async () => countResults.shift() ?? 0),
      create,
      update,
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue(opts.seller ?? null),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue(opts.product ?? null),
    },
    debtor: {
      findFirst: jest.fn().mockResolvedValue(opts.debtor ?? null),
    },
  };

  const eventBus = { emitAndBuild: jest.fn() };

  const concentrationService = {
    checkLimits: jest
      .fn()
      .mockResolvedValue(
        opts.concentrationResult ?? { passed: true, violations: [] },
      ),
  };

  return { prisma, eventBus, concentrationService };
}

function newService(
  prisma: any,
  eventBus: any,
  concentrationService: any = { checkLimits: jest.fn().mockResolvedValue({ passed: true, violations: [] }) },
): InvoiceSubmissionService {
  return new InvoiceSubmissionService(
    prisma as any,
    eventBus as any,
    concentrationService as any,
  );
}

// ─── submit() — happy paths ─────────────────────────────────────────────

describe('InvoiceSubmissionService.submit — happy paths', () => {
  it('auto-verifies low-value invoices via the WAIVED route (faceValue < autoVerifyBelow)', async () => {
    const { prisma, eventBus } = makeMocks({
      seller: sellerActive,
      product: productInvoiceFinancing,
      debtor: debtorActive,
      // Existing history so neither new_seller nor new_debtor triggers.
      sellerInvoiceCount: 3,
      debtorInvoiceCount: 3,
    });
    const service = newService(prisma, eventBus);

    const result = await service.submit(
      TENANT,
      baseInput({ faceValue: '5000.00' }),
    );

    expect(result.status).toBe(InvoiceStatus.verified);
    expect(result.verificationStatus).toBe(VerificationStatus.waived);

    const evtNames = eventBus.emitAndBuild.mock.calls.map((c: any) => c[0]);
    expect(evtNames).toContain(EventType.INVOICE_SUBMITTED);
    expect(evtNames).toContain(EventType.INVOICE_VERIFIED);
    expect(evtNames).not.toContain(EventType.INVOICE_UNDER_REVIEW);

    const verifiedEvt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_VERIFIED,
    );
    expect(verifiedEvt?.[2]?.verificationStatus).toBe('waived');
  });

  it('routes high-value invoices to MANUAL when faceValue >= manualVerifyAbove', async () => {
    const { prisma, eventBus } = makeMocks({
      seller: sellerActive,
      product: productInvoiceFinancing,
      debtor: debtorActive,
      sellerInvoiceCount: 10,
      debtorInvoiceCount: 10,
    });
    const service = newService(prisma, eventBus);

    const result = await service.submit(
      TENANT,
      baseInput({ faceValue: '300000.00' }),
    );

    expect(result.status).toBe(InvoiceStatus.under_review);
    expect(result.verificationStatus).toBe(VerificationStatus.pending);

    const evtNames = eventBus.emitAndBuild.mock.calls.map((c: any) => c[0]);
    expect(evtNames).toContain(EventType.INVOICE_SUBMITTED);
    expect(evtNames).toContain(EventType.INVOICE_UNDER_REVIEW);
    expect(evtNames).not.toContain(EventType.INVOICE_VERIFIED);

    const reviewEvt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_UNDER_REVIEW,
    );
    expect(reviewEvt?.[2]?.reason).toBe('manual_amount_threshold');
  });

  it('routes a first-time seller to MANUAL when manualVerifyNewSeller=true', async () => {
    const { prisma, eventBus } = makeMocks({
      seller: sellerActive,
      product: productInvoiceFinancing,
      debtor: debtorActive,
      // No prior invoices for this seller — should fire new_seller.
      sellerInvoiceCount: 0,
      debtorInvoiceCount: 5,
    });
    const service = newService(prisma, eventBus);

    const result = await service.submit(
      TENANT,
      // Mid-range value so the amount-threshold rule doesn't fire first.
      baseInput({ faceValue: '75000.00' }),
    );

    expect(result.status).toBe(InvoiceStatus.under_review);
    expect(result.verificationStatus).toBe(VerificationStatus.pending);

    const reviewEvt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_UNDER_REVIEW,
    );
    expect(reviewEvt?.[2]?.reason).toBe('new_seller');
  });
});

// ─── submit() — validation gates ────────────────────────────────────────

describe('InvoiceSubmissionService.submit — validation gates', () => {
  it('rejects when seller is blacklisted', async () => {
    const { prisma, eventBus } = makeMocks({
      seller: sellerBlacklisted,
      product: productInvoiceFinancing,
      debtor: debtorActive,
    });
    const service = newService(prisma, eventBus);

    await expect(service.submit(TENANT, baseInput())).rejects.toThrow(
      /blacklisted/,
    );
  });

  it('rejects when debtor is suspended', async () => {
    const { prisma, eventBus } = makeMocks({
      seller: sellerActive,
      product: productInvoiceFinancing,
      debtor: debtorSuspended,
    });
    const service = newService(prisma, eventBus);

    await expect(service.submit(TENANT, baseInput())).rejects.toThrow(
      /suspended/,
    );
  });

  it('rejects when product is not invoice_financing or not active', async () => {
    const { prisma, eventBus } = makeMocks({
      seller: sellerActive,
      // findFirst is filtered on type/status — simulate the "no match" outcome.
      product: null,
      debtor: debtorActive,
    });
    const service = newService(prisma, eventBus);

    await expect(service.submit(TENANT, baseInput())).rejects.toThrow(
      /not an active invoice_financing product/,
    );
  });

  it('rejects when faceValue is outside product min/max bounds', async () => {
    const { prisma, eventBus } = makeMocks({
      seller: sellerActive,
      product: productInvoiceFinancing,
      debtor: debtorActive,
    });
    const service = newService(prisma, eventBus);

    // Below minimum (1000.00).
    await expect(
      service.submit(TENANT, baseInput({ faceValue: '500.00' })),
    ).rejects.toThrow(/below product minimum/);

    // And above maximum (500000.00) — fresh mocks so the queue resets.
    const second = makeMocks({
      seller: sellerActive,
      product: productInvoiceFinancing,
      debtor: debtorActive,
    });
    const service2 = newService(second.prisma, second.eventBus);
    await expect(
      service2.submit(TENANT, baseInput({ faceValue: '600000.00' })),
    ).rejects.toThrow(/exceeds product maximum/);
  });

  it('rejects when dueDate is today or earlier', async () => {
    const { prisma, eventBus } = makeMocks({
      seller: sellerActive,
      product: productInvoiceFinancing,
      debtor: debtorActive,
    });
    const service = newService(prisma, eventBus);

    await expect(
      service.submit(
        TENANT,
        baseInput({
          issueDate: pastDate(10),
          dueDate: pastDate(1),
        }),
      ),
    ).rejects.toThrow(/dueDate/);
  });

  it('rejects when ConcentrationLimitService reports a breach', async () => {
    const { prisma, eventBus, concentrationService } = makeMocks({
      seller: sellerActive,
      product: productInvoiceFinancing,
      debtor: debtorActive,
      sellerInvoiceCount: 5,
      debtorInvoiceCount: 5,
      concentrationResult: {
        passed: false,
        violations: [
          {
            type: 'debtor_percent',
            current: '20.00',
            max: '15',
            message: 'Debtor would represent 20.00% of portfolio (cap 15%)',
          },
        ],
      },
    });
    const service = newService(prisma, eventBus, concentrationService);

    await expect(service.submit(TENANT, baseInput())).rejects.toThrow(
      /Concentration limit breached/,
    );
    expect(concentrationService.checkLimits).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        debtorId: DEBTOR,
        sellerId: SELLER,
        productId: PRODUCT,
      }),
    );
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('idempotency: returns the existing invoice without re-creating or re-emitting events', async () => {
    const existing = {
      id: 'prior-invoice-id',
      tenantId: TENANT,
      sellerId: SELLER,
      debtorId: DEBTOR,
      productId: PRODUCT,
      invoiceNumber: 'INV-2026-001',
      faceValue: '10000.00',
      currency: 'GHS',
      status: InvoiceStatus.verified,
      verificationStatus: VerificationStatus.verified,
      idempotencyKey: 'INV-IDEM-1',
    };
    const { prisma, eventBus } = makeMocks({
      existingByIdem: existing,
    });
    const service = newService(prisma, eventBus);

    const result = await service.submit(TENANT, baseInput());

    expect(result.id).toBe('prior-invoice-id');
    // No customer/product/debtor lookups should have run.
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
    expect(prisma.debtor.findFirst).not.toHaveBeenCalled();
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });
});

// ─── resolveVerification() ──────────────────────────────────────────────

describe('InvoiceSubmissionService.resolveVerification', () => {
  const underReviewInvoice = {
    id: INVOICE_ID,
    tenantId: TENANT,
    sellerId: SELLER,
    debtorId: DEBTOR,
    productId: PRODUCT,
    status: InvoiceStatus.under_review,
    verificationStatus: VerificationStatus.pending,
    recourseType: RecourseType.with_recourse,
  };

  it('approve path: marks the invoice verified and emits INVOICE_VERIFIED', async () => {
    const { prisma, eventBus } = makeMocks({
      invoiceForResolve: underReviewInvoice,
    });
    const service = newService(prisma, eventBus);

    const result = await service.resolveVerification(TENANT, INVOICE_ID, {
      approved: true,
      verifierId: VERIFIER,
      notes: 'looks good',
    });

    expect(result.status).toBe(InvoiceStatus.verified);
    expect(result.verificationStatus).toBe(VerificationStatus.verified);
    expect(result.verifiedBy).toBe(VERIFIER);

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_VERIFIED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]?.verifiedBy).toBe(VERIFIER);
  });

  it('reject path: marks the invoice rejected and emits INVOICE_REJECTED', async () => {
    const { prisma, eventBus } = makeMocks({
      invoiceForResolve: underReviewInvoice,
    });
    const service = newService(prisma, eventBus);

    const result = await service.resolveVerification(TENANT, INVOICE_ID, {
      approved: false,
      verifierId: VERIFIER,
      notes: 'invoice looks fabricated',
    });

    expect(result.status).toBe(InvoiceStatus.rejected);
    expect(result.verificationStatus).toBe(VerificationStatus.failed);

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_REJECTED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]?.reason).toBe('invoice looks fabricated');
    expect(evt?.[2]?.rejectedBy).toBe(VERIFIER);
  });

  it('rejects when invoice is not in under_review status', async () => {
    const verifiedInvoice = {
      ...underReviewInvoice,
      status: InvoiceStatus.verified,
      verificationStatus: VerificationStatus.verified,
    };
    const { prisma, eventBus } = makeMocks({
      invoiceForResolve: verifiedInvoice,
    });
    const service = newService(prisma, eventBus);

    await expect(
      service.resolveVerification(TENANT, INVOICE_ID, {
        approved: true,
        verifierId: VERIFIER,
      }),
    ).rejects.toThrow(/not under_review/);

    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });
});
