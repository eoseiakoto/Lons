/**
 * Factoring resolver — Sprint 12 Phase 4A. Smoke tests verifying that
 * resolvers correctly delegate to their service dependencies. Service
 * logic itself is exhaustively tested in process-engine.
 */

import { FactoringResolver } from './factoring.resolver';

const TENANT = '11111111-1111-1111-1111-111111111111';
const DEBTOR_ID = '22222222-2222-2222-2222-222222222222';
const INVOICE_ID = '33333333-3333-3333-3333-333333333333';
const SELLER_ID = '44444444-4444-4444-4444-444444444444';
const PRODUCT_ID = '55555555-5555-5555-5555-555555555555';
const USER: any = { userId: 'user-1', tenantId: TENANT };

function makeResolver(overrides: Partial<any> = {}) {
  const prisma = {
    debtor: {
      findFirst: jest.fn().mockResolvedValue({ id: DEBTOR_ID }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    invoice: {
      findFirst: jest.fn().mockResolvedValue({ id: INVOICE_ID }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides.prisma,
  };
  const debtorService = {
    create: jest.fn().mockResolvedValue({ id: DEBTOR_ID, companyName: 'Acme Co' }),
    update: jest.fn().mockResolvedValue({ id: DEBTOR_ID }),
    suspend: jest.fn().mockResolvedValue({ id: DEBTOR_ID, status: 'suspended' }),
    blacklist: jest
      .fn()
      .mockResolvedValue({ id: DEBTOR_ID, status: 'blacklisted' }),
    reactivate: jest.fn().mockResolvedValue({ id: DEBTOR_ID, status: 'active' }),
    assessRisk: jest.fn().mockResolvedValue({
      score: '72.50',
      averagePaymentDays: 3,
      reliabilityPercent: '90.00',
      factors: {
        paymentHistory: '20.00',
        industry: '0',
        country: '5.00',
        default: '0',
      },
    }),
    ...overrides.debtorService,
  };
  const submissionService = {
    submit: jest.fn().mockResolvedValue({ id: INVOICE_ID, status: 'verified' }),
    resolveVerification: jest
      .fn()
      .mockResolvedValue({ id: INVOICE_ID, status: 'verified' }),
    ...overrides.submissionService,
  };
  const originationService = {
    generateOffer: jest.fn().mockResolvedValue({
      invoiceId: INVOICE_ID,
      faceValue: '100000.0000',
      advanceRatePercent: '85.00',
      advancedAmount: '85000.0000',
      reserveAmount: '15000.0000',
      discountFee: '500.0000',
      serviceFee: '500.0000',
      netDisbursement: '84000.0000',
      recourseType: 'with_recourse',
      dueDate: '2026-08-01',
      currency: 'GHS',
    }),
    acceptOffer: jest
      .fn()
      .mockResolvedValue({ id: INVOICE_ID, status: 'offer_accepted' }),
    declineOffer: jest
      .fn()
      .mockResolvedValue({ id: INVOICE_ID, status: 'cancelled' }),
    disburseAdvance: jest
      .fn()
      .mockResolvedValue({ id: INVOICE_ID, status: 'funded' }),
    notifyDebtor: jest
      .fn()
      .mockResolvedValue({ id: INVOICE_ID, status: 'debtor_notified' }),
    dispute: jest
      .fn()
      .mockResolvedValue({ id: INVOICE_ID, status: 'disputed' }),
    ...overrides.originationService,
  };
  const reserveService = {
    recordDebtorPayment: jest
      .fn()
      .mockResolvedValue({ id: INVOICE_ID, status: 'payment_received' }),
    releaseReserve: jest
      .fn()
      .mockResolvedValue({ id: INVOICE_ID, status: 'reserve_released' }),
    ...overrides.reserveService,
  };
  const recourseService = {
    enforceDefault: jest.fn(),
    enforceGracePeriodElapsed: jest.fn(),
    ...overrides.recourseService,
  };
  const concentrationService = {
    checkLimits: jest.fn(),
    getConcentrationSummary: jest.fn().mockResolvedValue({
      topDebtors: [],
      industryBreakdown: [],
      topSellerDebtors: [],
      limitUtilization: [],
    }),
    ...overrides.concentrationService,
  };
  const resolver = new FactoringResolver(
    prisma as any,
    debtorService as any,
    submissionService as any,
    originationService as any,
    reserveService as any,
    recourseService as any,
    concentrationService as any,
  );
  return {
    resolver,
    prisma,
    debtorService,
    submissionService,
    originationService,
    reserveService,
    recourseService,
    concentrationService,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────

describe('FactoringResolver — queries', () => {
  it('debtors paginates and applies filters', async () => {
    const items = [
      { id: 'd1', createdAt: new Date() },
      { id: 'd2', createdAt: new Date() },
      { id: 'd3', createdAt: new Date() },
    ];
    const { resolver, prisma } = makeResolver({
      prisma: {
        debtor: {
          findMany: jest.fn().mockResolvedValue(items),
          count: jest.fn().mockResolvedValue(items.length),
          findFirst: jest.fn(),
        },
      },
    });
    const out = await resolver.debtors(
      TENANT,
      { status: 'active' as any, country: 'GHA' },
      { first: 2 },
    );
    expect(out.edges).toHaveLength(2);
    expect(out.pageInfo.hasNextPage).toBe(true);
    expect(out.totalCount).toBe(3);
    expect(prisma.debtor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          deletedAt: null,
          status: 'active',
          country: 'GHA',
        }),
      }),
    );
  });

  it('debtor returns null when not found', async () => {
    const { resolver } = makeResolver({
      prisma: {
        debtor: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn(),
          count: jest.fn(),
        },
      },
    });
    const result = await resolver.debtor(TENANT, DEBTOR_ID);
    expect(result).toBeNull();
  });

  it('debtorRiskAssessment delegates to DebtorService.assessRisk', async () => {
    const { resolver, debtorService } = makeResolver();
    const out = await resolver.debtorRiskAssessment(TENANT, DEBTOR_ID);
    expect(debtorService.assessRisk).toHaveBeenCalledWith(TENANT, DEBTOR_ID);
    expect(out.score).toBe('72.50');
    expect(out.averagePaymentDays).toBe(3);
  });

  it('invoices applies status + sellerId filters and paginates', async () => {
    const items = [
      { id: 'i1', createdAt: new Date() },
      { id: 'i2', createdAt: new Date() },
    ];
    const { resolver, prisma } = makeResolver({
      prisma: {
        invoice: {
          findMany: jest.fn().mockResolvedValue(items),
          count: jest.fn().mockResolvedValue(items.length),
          findFirst: jest.fn(),
        },
      },
    });
    const out = await resolver.invoices(
      TENANT,
      { status: 'funded' as any, sellerId: SELLER_ID },
      { first: 5 },
    );
    expect(out.edges).toHaveLength(2);
    expect(out.pageInfo.hasNextPage).toBe(false);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          status: 'funded',
          sellerId: SELLER_ID,
        }),
      }),
    );
  });

  it('invoice returns null when not found', async () => {
    const { resolver } = makeResolver({
      prisma: {
        invoice: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn(),
          count: jest.fn(),
        },
      },
    });
    const result = await resolver.invoice(TENANT, INVOICE_ID);
    expect(result).toBeNull();
  });

  it('concentrationSummary delegates to ConcentrationLimitService', async () => {
    const { resolver, concentrationService } = makeResolver();
    const out = await resolver.concentrationSummary(TENANT);
    expect(concentrationService.getConcentrationSummary).toHaveBeenCalledWith(
      TENANT,
    );
    expect(out.topDebtors).toEqual([]);
    expect(out.industryBreakdown).toEqual([]);
  });
});

// ─── Debtor mutations ───────────────────────────────────────────────────

describe('FactoringResolver — debtor mutations', () => {
  it('createDebtor passes the idempotencyKey through to the service', async () => {
    const { resolver, debtorService } = makeResolver();
    await resolver.createDebtor(
      TENANT,
      { companyName: 'Acme Co', country: 'GHA' },
      'idem-create-1',
    );
    expect(debtorService.create).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        companyName: 'Acme Co',
        country: 'GHA',
        idempotencyKey: 'idem-create-1',
      }),
    );
  });

  it('updateDebtor forwards the patch fields and tenantId', async () => {
    const { resolver, debtorService } = makeResolver();
    await resolver.updateDebtor(
      TENANT,
      DEBTOR_ID,
      { contactEmail: 'ops@acme.example' },
      'idem-update-1',
    );
    expect(debtorService.update).toHaveBeenCalledWith(
      TENANT,
      DEBTOR_ID,
      expect.objectContaining({ contactEmail: 'ops@acme.example' }),
    );
  });

  it('suspendDebtor passes operatorId from CurrentUser', async () => {
    const { resolver, debtorService } = makeResolver();
    await resolver.suspendDebtor(
      TENANT,
      USER,
      DEBTOR_ID,
      'fraud_detected',
      'idem-1',
    );
    expect(debtorService.suspend).toHaveBeenCalledWith(
      TENANT,
      DEBTOR_ID,
      'fraud_detected',
      USER.userId,
    );
  });

  it('blacklistDebtor passes operatorId from CurrentUser', async () => {
    const { resolver, debtorService } = makeResolver();
    await resolver.blacklistDebtor(
      TENANT,
      USER,
      DEBTOR_ID,
      'irrecoverable',
      'idem-1',
    );
    expect(debtorService.blacklist).toHaveBeenCalledWith(
      TENANT,
      DEBTOR_ID,
      'irrecoverable',
      USER.userId,
    );
  });

  it('reactivateDebtor delegates with tenantId + debtorId', async () => {
    const { resolver, debtorService } = makeResolver();
    await resolver.reactivateDebtor(TENANT, DEBTOR_ID, 'idem-1');
    expect(debtorService.reactivate).toHaveBeenCalledWith(TENANT, DEBTOR_ID);
  });
});

// ─── Invoice mutations ──────────────────────────────────────────────────

describe('FactoringResolver — invoice mutations', () => {
  it('submitInvoice delegates to InvoiceSubmissionService.submit', async () => {
    const { resolver, submissionService } = makeResolver();
    await resolver.submitInvoice(TENANT, {
      idempotencyKey: 'idem-submit-1',
      sellerId: SELLER_ID,
      debtorId: DEBTOR_ID,
      productId: PRODUCT_ID,
      invoiceNumber: 'INV-001',
      issueDate: '2026-04-01',
      dueDate: '2026-08-01',
      faceValue: '100000.00',
      currency: 'GHS',
    });
    expect(submissionService.submit).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        idempotencyKey: 'idem-submit-1',
        sellerId: SELLER_ID,
        debtorId: DEBTOR_ID,
        productId: PRODUCT_ID,
        invoiceNumber: 'INV-001',
        faceValue: '100000.00',
        currency: 'GHS',
      }),
    );
  });

  it('resolveInvoiceVerification passes verifierId from CurrentUser', async () => {
    const { resolver, submissionService } = makeResolver();
    await resolver.resolveInvoiceVerification(
      TENANT,
      USER,
      INVOICE_ID,
      true,
      'idem-1',
      'looks good',
    );
    expect(submissionService.resolveVerification).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      expect.objectContaining({
        approved: true,
        verifierId: USER.userId,
        notes: 'looks good',
      }),
    );
  });

  it('generateInvoiceOffer forwards requestedRecourseType to the service', async () => {
    const { resolver, originationService } = makeResolver();
    await resolver.generateInvoiceOffer(
      TENANT,
      INVOICE_ID,
      'idem-1',
      'without_recourse' as any,
    );
    expect(originationService.generateOffer).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      expect.objectContaining({ requestedRecourseType: 'without_recourse' }),
    );
  });

  it('acceptInvoiceOffer passes idempotencyKey through to the service', async () => {
    const { resolver, originationService } = makeResolver();
    await resolver.acceptInvoiceOffer(TENANT, INVOICE_ID, 'idem-accept-1');
    expect(originationService.acceptOffer).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      'idem-accept-1',
    );
  });

  it('declineInvoiceOffer forwards reason when supplied', async () => {
    const { resolver, originationService } = makeResolver();
    await resolver.declineInvoiceOffer(TENANT, INVOICE_ID, 'idem-1', 'too low');
    expect(originationService.declineOffer).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      'too low',
    );
  });

  it('disburseInvoiceAdvance passes idempotencyKey through to the service', async () => {
    const { resolver, originationService } = makeResolver();
    await resolver.disburseInvoiceAdvance(TENANT, INVOICE_ID, 'idem-fund-1');
    expect(originationService.disburseAdvance).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      'idem-fund-1',
    );
  });

  it('notifyInvoiceDebtor delegates with tenantId + invoiceId', async () => {
    const { resolver, originationService } = makeResolver();
    await resolver.notifyInvoiceDebtor(TENANT, INVOICE_ID, 'idem-1');
    expect(originationService.notifyDebtor).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
    );
  });

  it('recordInvoiceDebtorPayment passes operatorId from CurrentUser + idempotencyKey', async () => {
    const { resolver, reserveService } = makeResolver();
    await resolver.recordInvoiceDebtorPayment(TENANT, USER, INVOICE_ID, {
      amountReceived: '50000.00',
      paymentRef: 'BANK-REF-001',
      idempotencyKey: 'idem-pay-1',
    });
    expect(reserveService.recordDebtorPayment).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      expect.objectContaining({
        amountReceived: '50000.00',
        paymentRef: 'BANK-REF-001',
        idempotencyKey: 'idem-pay-1',
        operatorId: USER.userId,
      }),
    );
  });

  it('releaseInvoiceReserve passes operatorId + idempotencyKey through to the service', async () => {
    const { resolver, reserveService } = makeResolver();
    await resolver.releaseInvoiceReserve(
      TENANT,
      USER,
      INVOICE_ID,
      'idem-release-1',
    );
    expect(reserveService.releaseReserve).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      expect.objectContaining({
        idempotencyKey: 'idem-release-1',
        operatorId: USER.userId,
      }),
    );
  });

  it('disputeInvoice passes raisedBy from CurrentUser', async () => {
    const { resolver, originationService } = makeResolver();
    await resolver.disputeInvoice(
      TENANT,
      USER,
      INVOICE_ID,
      'goods_undelivered',
      'idem-1',
    );
    expect(originationService.dispute).toHaveBeenCalledWith(
      TENANT,
      INVOICE_ID,
      'goods_undelivered',
      USER.userId,
    );
  });
});
