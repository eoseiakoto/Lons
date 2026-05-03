/**
 * Sprint 12 Phase 3C — Invoice Factoring origination state-machine tests.
 *
 * Mock-Prisma unit tests covering the offer-generation math (advance rate
 * adjustments, non-recourse eligibility), state transitions, idempotency
 * replay, contract + ledger creation on disbursement, and event emission.
 */

import {
  ContractStatus,
  InvoiceStatus,
  RecourseType,
} from '@lons/database';
import { EventType } from '@lons/event-contracts';
import {
  add,
  bankersRound,
  divide,
  multiply,
  subtract,
} from '@lons/common';

import { FactoringOriginationService } from './factoring-origination.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const INVOICE_ID = '22222222-2222-2222-2222-222222222222';
const SELLER = '33333333-3333-3333-3333-333333333333';
const DEBTOR = '44444444-4444-4444-4444-444444444444';
const PRODUCT = '55555555-5555-5555-5555-555555555555';
const LENDER = '66666666-6666-6666-6666-666666666666';
const CONTRACT_ID = '77777777-7777-7777-7777-777777777777';
const LR_ID = '88888888-8888-8888-8888-888888888888';

// ─── Fixtures ───────────────────────────────────────────────────────────

function futureDate(daysFromNow: number): Date {
  const d = new Date();
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + daysFromNow,
    ),
  );
}

function makeInvoice(overrides: Partial<any> = {}) {
  return {
    id: INVOICE_ID,
    tenantId: TENANT,
    sellerId: SELLER,
    debtorId: DEBTOR,
    productId: PRODUCT,
    contractId: null,
    invoiceNumber: 'INV-2026-001',
    idempotencyKey: 'INV-IDEM-1',
    issueDate: new Date('2026-04-01T00:00:00Z'),
    dueDate: futureDate(60),
    faceValue: '100000.0000',
    currency: 'GHS',
    advanceRatePercent: '0',
    advancedAmount: null,
    reserveAmount: null,
    discountFee: null,
    serviceFee: null,
    netDisbursement: null,
    status: InvoiceStatus.verified,
    verificationStatus: 'verified',
    verifiedBy: null,
    verifiedAt: new Date('2026-04-02T00:00:00Z'),
    verificationNotes: null,
    recourseType: RecourseType.with_recourse,
    debtorNotifiedAt: null,
    debtorPaymentRef: null,
    amountReceived: '0',
    reserveReleased: '0',
    disputeReason: null,
    documents: null,
    metadata: null,
    fundedAt: null,
    settledAt: null,
    defaultedAt: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

function makeProduct(overrides: Partial<any> = {}) {
  return {
    id: PRODUCT,
    tenantId: TENANT,
    lenderId: LENDER,
    deletedAt: null,
    factoringConfig: {
      advanceRatePercent: '85.00',
      minAdvanceRate: '60.00',
      maxAdvanceRate: '95.00',
      discountRateAnnual: '12.00',
      serviceFeeFlat: '500.00',
      defaultRecourseType: 'with_recourse',
      nonRecourseEligibility: {
        minDebtorRiskScore: 70,
        minDebtorPaymentHistory: 6,
        maxInvoiceTenorDays: 90,
        feeMultiplier: 1.5,
      },
    },
    ...overrides,
  };
}

function makeDebtor(overrides: Partial<any> = {}) {
  return {
    id: DEBTOR,
    tenantId: TENANT,
    companyName: 'Acme Corp',
    contactEmail: 'ap@acme.example',
    internalRiskScore: '80',
    deletedAt: null,
    ...overrides,
  };
}

// ─── Mock-builder ───────────────────────────────────────────────────────

interface MakeMocksOpts {
  invoice?: any;
  product?: any;
  debtor?: any;
  /** Settled-invoice count for the seller (drives sellerAdjustment). */
  sellerSettledCount?: number;
  /** Paid-invoice count for the debtor (drives non-recourse history check). */
  debtorPaidCount?: number;
}

function makeMocks(opts: MakeMocksOpts = {}) {
  // invoice.count is queried in two places:
  //   generateOffer: 1) sellerSettledCount, 2) (only if non-recourse asked)
  //                  debtorPaidCount.
  // We seed both so either order works.
  const countQueue: number[] = [
    opts.sellerSettledCount ?? 0,
    opts.debtorPaidCount ?? 0,
  ];

  const ledgerCreate = jest.fn(async (args: any) => ({
    id: 'ledger-' + Math.random(),
    ...args.data,
  }));

  const contractCreated: any = {
    id: CONTRACT_ID,
    tenantId: TENANT,
    contractNumber: 'IF-XYZ',
    status: ContractStatus.active,
    settledAt: null,
  };
  const contractCreate = jest.fn(async (args: any) => ({
    ...contractCreated,
    ...args.data,
  }));
  const contractUpdate = jest.fn(async (args: any) => ({
    ...contractCreated,
    ...args.data,
  }));

  const loanRequestCreate = jest.fn(async (args: any) => ({
    id: LR_ID,
    ...args.data,
  }));

  const invoiceUpdate = jest.fn(async (args: any) => ({
    ...(opts.invoice ?? makeInvoice()),
    ...args.data,
  }));

  // $transaction in our service runs a callback with a tx-scoped client.
  // The callback only touches loanRequest.create / contract.create /
  // ledgerEntry.create — proxy them to the same mocks.
  const txClient = {
    loanRequest: { create: loanRequestCreate },
    contract: { create: contractCreate, update: contractUpdate },
    ledgerEntry: { create: ledgerCreate },
  };

  const prisma = {
    invoice: {
      findFirst: jest.fn(async () => opts.invoice ?? null),
      count: jest.fn(async () => countQueue.shift() ?? 0),
      update: invoiceUpdate,
    },
    product: {
      findFirst: jest.fn(async () => opts.product ?? null),
    },
    contract: {
      update: contractUpdate,
    },
    $transaction: jest.fn(async (cb: any) => cb(txClient)),
  };

  const debtorService = {
    findById: jest.fn(async () => opts.debtor ?? makeDebtor()),
    updateExposure: jest.fn(async () => undefined),
  };

  const eventBus = { emitAndBuild: jest.fn() };

  return {
    prisma,
    eventBus,
    debtorService,
    ledgerCreate,
    contractCreate,
    contractUpdate,
    loanRequestCreate,
    invoiceUpdate,
  };
}

function newService(prisma: any, eventBus: any, debtorService: any) {
  return new FactoringOriginationService(
    prisma as any,
    eventBus as any,
    debtorService as any,
  );
}

// ─── generateOffer ───────────────────────────────────────────────────────

describe('FactoringOriginationService.generateOffer', () => {
  it('happy path: faceValue 100000, score 80, tenor 60, no seller history', async () => {
    const invoice = makeInvoice({ dueDate: futureDate(60) });
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice,
      product: makeProduct(),
      debtor: makeDebtor({ internalRiskScore: '80' }),
      sellerSettledCount: 0,
    });
    const service = newService(prisma, eventBus, debtorService);

    const offer = await service.generateOffer(TENANT, INVOICE_ID);

    // base 85 + debtor +5 (score 80) + tenor 0 (60d) + seller 0 = 90
    expect(offer.advanceRatePercent).toBe('90.00');

    const expectedAdvanced = bankersRound(
      multiply('100000.0000', divide('90.00', '100')),
      4,
    );
    expect(offer.advancedAmount).toBe(expectedAdvanced);
    expect(offer.reserveAmount).toBe(
      bankersRound(subtract('100000.0000', expectedAdvanced), 4),
    );

    const expectedDiscount = bankersRound(
      multiply(
        expectedAdvanced,
        multiply(divide('12.00', '100'), divide('60', '365')),
      ),
      4,
    );
    expect(offer.discountFee).toBe(expectedDiscount);
    expect(offer.serviceFee).toBe('500.0000');
    expect(offer.netDisbursement).toBe(
      bankersRound(
        subtract(subtract(expectedAdvanced, expectedDiscount), '500.0000'),
        4,
      ),
    );
    expect(offer.recourseType).toBe(RecourseType.with_recourse);
    expect(offer.expiresAt).toMatch(/T/);

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_OFFER_GENERATED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]?.advancedAmount).toBe(expectedAdvanced);
  });

  it('low-risk debtor (score 30) applies -5 adjustment → effectiveRate 80', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({ dueDate: futureDate(60) }),
      product: makeProduct(),
      debtor: makeDebtor({ internalRiskScore: '30' }),
      sellerSettledCount: 0,
    });
    const service = newService(prisma, eventBus, debtorService);

    const offer = await service.generateOffer(TENANT, INVOICE_ID);
    // 85 + (-5) + 0 + 0 = 80
    expect(offer.advanceRatePercent).toBe('80.00');
  });

  it('long tenor (180 days) applies -2 adjustment', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({ dueDate: futureDate(180) }),
      product: makeProduct(),
      // Mid-tier score so it contributes 0.
      debtor: makeDebtor({ internalRiskScore: '60' }),
      sellerSettledCount: 0,
    });
    const service = newService(prisma, eventBus, debtorService);

    const offer = await service.generateOffer(TENANT, INVOICE_ID);
    // 85 + 0 + (-2) + 0 = 83
    expect(offer.advanceRatePercent).toBe('83.00');
  });

  it('experienced seller (12 settled) gets +3 adjustment', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({ dueDate: futureDate(60) }),
      product: makeProduct(),
      debtor: makeDebtor({ internalRiskScore: '60' }),
      sellerSettledCount: 12,
    });
    const service = newService(prisma, eventBus, debtorService);

    const offer = await service.generateOffer(TENANT, INVOICE_ID);
    // 85 + 0 + 0 + 3 = 88
    expect(offer.advanceRatePercent).toBe('88.00');
  });

  it('clamps to minAdvanceRate when adjustments push below', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({ dueDate: futureDate(180) }),
      product: makeProduct({
        factoringConfig: {
          advanceRatePercent: '65.00',
          minAdvanceRate: '60.00',
          maxAdvanceRate: '95.00',
          discountRateAnnual: '12.00',
          serviceFeeFlat: '500.00',
          defaultRecourseType: 'with_recourse',
          nonRecourseEligibility: {
            minDebtorRiskScore: 70,
            minDebtorPaymentHistory: 6,
            maxInvoiceTenorDays: 90,
            feeMultiplier: 1.5,
          },
        },
      }),
      // score 25 → -10
      debtor: makeDebtor({ internalRiskScore: '25' }),
      sellerSettledCount: 0,
    });
    const service = newService(prisma, eventBus, debtorService);

    const offer = await service.generateOffer(TENANT, INVOICE_ID);
    // 65 + (-10) + (-2) + 0 = 53 → clamped up to 60
    expect(offer.advanceRatePercent).toBe('60.00');
  });

  it('clamps to maxAdvanceRate when adjustments push above', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({ dueDate: futureDate(30) }),
      product: makeProduct({
        factoringConfig: {
          advanceRatePercent: '92.00',
          minAdvanceRate: '60.00',
          maxAdvanceRate: '95.00',
          discountRateAnnual: '12.00',
          serviceFeeFlat: '500.00',
          defaultRecourseType: 'with_recourse',
          nonRecourseEligibility: {
            minDebtorRiskScore: 70,
            minDebtorPaymentHistory: 6,
            maxInvoiceTenorDays: 90,
            feeMultiplier: 1.5,
          },
        },
      }),
      debtor: makeDebtor({ internalRiskScore: '85' }),
      sellerSettledCount: 12,
    });
    const service = newService(prisma, eventBus, debtorService);

    const offer = await service.generateOffer(TENANT, INVOICE_ID);
    // 92 + 5 + 0 + 3 = 100 → clamped down to 95
    expect(offer.advanceRatePercent).toBe('95.00');
  });

  it('rejects when invoice is not in verified status', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice: makeInvoice({ status: InvoiceStatus.offer_generated }),
      product: makeProduct(),
      debtor: makeDebtor(),
    });
    const service = newService(prisma, eventBus, debtorService);

    await expect(service.generateOffer(TENANT, INVOICE_ID)).rejects.toThrow(
      /not verified/,
    );
  });

  it('rejects when invoice does not exist', async () => {
    const { prisma, eventBus, debtorService } = makeMocks({ invoice: null });
    const service = newService(prisma, eventBus, debtorService);

    await expect(service.generateOffer(TENANT, INVOICE_ID)).rejects.toThrow(
      /Invoice/,
    );
  });

  it('non-recourse eligible: applies feeMultiplier and sets recourseType=without_recourse', async () => {
    const invoice = makeInvoice({ dueDate: futureDate(60) });
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice,
      product: makeProduct(),
      debtor: makeDebtor({ internalRiskScore: '85' }),
      sellerSettledCount: 0,
      // Meets minDebtorPaymentHistory (6).
      debtorPaidCount: 8,
    });
    const service = newService(prisma, eventBus, debtorService);

    const offer = await service.generateOffer(TENANT, INVOICE_ID, {
      requestedRecourseType: RecourseType.without_recourse,
    });

    expect(offer.recourseType).toBe(RecourseType.without_recourse);

    // Discount fee should be 1.5× the with-recourse equivalent.
    const expectedAdvanced = bankersRound(
      multiply(String(invoice.faceValue), divide(offer.advanceRatePercent, '100')),
      4,
    );
    const baseDiscount = bankersRound(
      multiply(
        expectedAdvanced,
        multiply(divide('12.00', '100'), divide('60', '365')),
      ),
      4,
    );
    const expectedDiscount = bankersRound(multiply(baseDiscount, '1.5'), 4);
    expect(offer.discountFee).toBe(expectedDiscount);
  });

  it('non-recourse ineligible (low debtor score) falls back to with_recourse — no error', async () => {
    const invoice = makeInvoice({ dueDate: futureDate(60) });
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice,
      product: makeProduct(),
      debtor: makeDebtor({ internalRiskScore: '50' }), // < 70 threshold
      sellerSettledCount: 0,
      debtorPaidCount: 8,
    });
    const service = newService(prisma, eventBus, debtorService);

    const offer = await service.generateOffer(TENANT, INVOICE_ID, {
      requestedRecourseType: RecourseType.without_recourse,
    });

    expect(offer.recourseType).toBe(RecourseType.with_recourse);

    // Fee multiplier should NOT have been applied.
    const expectedAdvanced = bankersRound(
      multiply(String(invoice.faceValue), divide(offer.advanceRatePercent, '100')),
      4,
    );
    const baseDiscount = bankersRound(
      multiply(
        expectedAdvanced,
        multiply(divide('12.00', '100'), divide('60', '365')),
      ),
      4,
    );
    expect(offer.discountFee).toBe(baseDiscount);
  });
});

// ─── acceptOffer ─────────────────────────────────────────────────────────

describe('FactoringOriginationService.acceptOffer', () => {
  it('happy path: status → offer_accepted, emits INVOICE_OFFER_ACCEPTED', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.offer_generated });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.acceptOffer(TENANT, INVOICE_ID, 'idem-1');

    expect(result.status).toBe(InvoiceStatus.offer_accepted);
    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_OFFER_ACCEPTED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]?.invoiceId).toBe(INVOICE_ID);
  });

  it('idempotency: replay on already-accepted invoice returns it without re-emitting', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.offer_accepted });
    const { prisma, eventBus, debtorService, invoiceUpdate } = makeMocks({
      invoice,
    });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.acceptOffer(TENANT, INVOICE_ID, 'idem-1');

    expect(result.status).toBe(InvoiceStatus.offer_accepted);
    expect(invoiceUpdate).not.toHaveBeenCalled();
    const accepted = eventBus.emitAndBuild.mock.calls.filter(
      (c: any) => c[0] === EventType.INVOICE_OFFER_ACCEPTED,
    );
    expect(accepted.length).toBe(0);
  });

  it('rejects when invoice is not in offer_generated status', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.verified });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.acceptOffer(TENANT, INVOICE_ID, 'idem-1'),
    ).rejects.toThrow(/not offer_generated/);
  });
});

// ─── declineOffer ────────────────────────────────────────────────────────

describe('FactoringOriginationService.declineOffer', () => {
  it('happy path: status → cancelled, emits INVOICE_OFFER_DECLINED', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.offer_generated });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.declineOffer(TENANT, INVOICE_ID, 'too low');

    expect(result.status).toBe(InvoiceStatus.cancelled);
    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_OFFER_DECLINED,
    );
    expect(evt).toBeDefined();
  });

  it('rejects when invoice is not in offer_generated status', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.verified });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(service.declineOffer(TENANT, INVOICE_ID)).rejects.toThrow(
      /not offer_generated/,
    );
  });
});

// ─── disburseAdvance ─────────────────────────────────────────────────────

describe('FactoringOriginationService.disburseAdvance', () => {
  function acceptedInvoice(overrides: Partial<any> = {}) {
    return makeInvoice({
      status: InvoiceStatus.offer_accepted,
      advancedAmount: '90000.0000',
      reserveAmount: '10000.0000',
      discountFee: '1716.1644',
      serviceFee: '500.0000',
      netDisbursement: '87783.8356',
      recourseType: RecourseType.with_recourse,
      ...overrides,
    });
  }

  it('happy path: creates Contract, ledger entries (4), updates invoice, calls debtor exposure, emits INVOICE_FUNDED', async () => {
    const invoice = acceptedInvoice();
    const {
      prisma,
      eventBus,
      debtorService,
      ledgerCreate,
      contractCreate,
      loanRequestCreate,
    } = makeMocks({ invoice, product: makeProduct() });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.disburseAdvance(TENANT, INVOICE_ID, 'idem-fund');

    expect(loanRequestCreate).toHaveBeenCalledTimes(1);
    expect(contractCreate).toHaveBeenCalledTimes(1);
    expect(ledgerCreate).toHaveBeenCalledTimes(4);

    // Each ledger entry references the invoice.
    for (const call of ledgerCreate.mock.calls) {
      expect(call[0]?.data?.referenceType).toBe('invoice');
      expect(call[0]?.data?.referenceId).toBe(INVOICE_ID);
    }

    // Debtor exposure: positive faceValue.
    expect(debtorService.updateExposure).toHaveBeenCalledWith(
      TENANT,
      DEBTOR,
      String(invoice.faceValue),
      INVOICE_ID,
    );

    expect(result.status).toBe(InvoiceStatus.funded);
    expect(result.contractId).toBe(CONTRACT_ID);

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_FUNDED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]?.contractId).toBe(CONTRACT_ID);
    expect(evt?.[2]?.advancedAmount).toBe('90000.0000');
  });

  it('idempotency: skipped when invoice already funded', async () => {
    const invoice = acceptedInvoice({
      status: InvoiceStatus.funded,
      contractId: CONTRACT_ID,
    });
    const { prisma, eventBus, debtorService, contractCreate, ledgerCreate } =
      makeMocks({ invoice, product: makeProduct() });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.disburseAdvance(TENANT, INVOICE_ID, 'idem-fund');

    expect(result.status).toBe(InvoiceStatus.funded);
    expect(contractCreate).not.toHaveBeenCalled();
    expect(ledgerCreate).not.toHaveBeenCalled();
    expect(debtorService.updateExposure).not.toHaveBeenCalled();
    const fundedEvts = eventBus.emitAndBuild.mock.calls.filter(
      (c: any) => c[0] === EventType.INVOICE_FUNDED,
    );
    expect(fundedEvts.length).toBe(0);
  });

  it('rejects when invoice is not offer_accepted', async () => {
    const invoice = acceptedInvoice({ status: InvoiceStatus.verified });
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice,
      product: makeProduct(),
    });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.disburseAdvance(TENANT, INVOICE_ID, 'idem-fund'),
    ).rejects.toThrow(/not offer_accepted/);
  });
});

// ─── notifyDebtor ────────────────────────────────────────────────────────

describe('FactoringOriginationService.notifyDebtor', () => {
  it('happy path: status → debtor_notified, emits INVOICE_DEBTOR_NOTIFIED', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.funded });
    const { prisma, eventBus, debtorService } = makeMocks({
      invoice,
      debtor: makeDebtor({ contactEmail: 'ap@acme.example' }),
    });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.notifyDebtor(TENANT, INVOICE_ID);

    expect(result.status).toBe(InvoiceStatus.debtor_notified);
    expect(result.debtorNotifiedAt).toBeInstanceOf(Date);

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_DEBTOR_NOTIFIED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]?.channel).toBe('email');
    expect(evt?.[2]?.debtorId).toBe(DEBTOR);
  });

  it('rejects when invoice is not funded', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.offer_accepted });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(service.notifyDebtor(TENANT, INVOICE_ID)).rejects.toThrow(
      /not funded/,
    );
  });
});

// ─── complete ────────────────────────────────────────────────────────────

describe('FactoringOriginationService.complete', () => {
  it('happy path: calls debtor exposure with NEGATIVE faceValue, status → settled, emits INVOICE_SETTLED', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.reserve_released,
      contractId: CONTRACT_ID,
      faceValue: '100000.0000',
    });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.complete(TENANT, INVOICE_ID);

    expect(result.status).toBe(InvoiceStatus.settled);
    expect(result.settledAt).toBeInstanceOf(Date);

    // Negative delta — exposure released.
    expect(debtorService.updateExposure).toHaveBeenCalledWith(
      TENANT,
      DEBTOR,
      multiply('100000.0000', '-1'),
      INVOICE_ID,
    );

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_SETTLED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]?.contractId).toBe(CONTRACT_ID);
  });

  it('updates contract → settled', async () => {
    const invoice = makeInvoice({
      status: InvoiceStatus.reserve_released,
      contractId: CONTRACT_ID,
    });
    const { prisma, eventBus, debtorService, contractUpdate } = makeMocks({
      invoice,
    });
    const service = newService(prisma, eventBus, debtorService);

    await service.complete(TENANT, INVOICE_ID);

    expect(contractUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONTRACT_ID },
        data: expect.objectContaining({ status: ContractStatus.settled }),
      }),
    );
  });

  it('rejects when invoice is not reserve_released', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.funded });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(service.complete(TENANT, INVOICE_ID)).rejects.toThrow(
      /not reserve_released/,
    );
  });
});

// ─── dispute ─────────────────────────────────────────────────────────────

describe('FactoringOriginationService.dispute', () => {
  it('happy path: from funded → disputed, emits INVOICE_DISPUTED', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.funded });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.dispute(
      TENANT,
      INVOICE_ID,
      'goods not delivered',
      'user-1',
    );

    expect(result.status).toBe(InvoiceStatus.disputed);
    expect(result.disputeReason).toBe('goods not delivered');

    const evt = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === EventType.INVOICE_DISPUTED,
    );
    expect(evt).toBeDefined();
    expect(evt?.[2]?.reason).toBe('goods not delivered');
    expect(evt?.[2]?.raisedBy).toBe('user-1');
  });

  it('allows dispute from debtor_notified', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.debtor_notified });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    const result = await service.dispute(
      TENANT,
      INVOICE_ID,
      'wrong amount',
      'user-1',
    );
    expect(result.status).toBe(InvoiceStatus.disputed);
  });

  it('rejects when invoice is already settled', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.settled });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.dispute(TENANT, INVOICE_ID, 'late', 'user-1'),
    ).rejects.toThrow(/disputed/);
  });

  it('rejects empty reason', async () => {
    const invoice = makeInvoice({ status: InvoiceStatus.funded });
    const { prisma, eventBus, debtorService } = makeMocks({ invoice });
    const service = newService(prisma, eventBus, debtorService);

    await expect(
      service.dispute(TENANT, INVOICE_ID, '   ', 'user-1'),
    ).rejects.toThrow(/reason/);
  });
});

// Silence unused-import warnings if helpers are only used in some paths.
void add;
