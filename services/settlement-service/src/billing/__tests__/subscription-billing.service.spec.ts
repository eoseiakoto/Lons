/**
 * Sprint 14 (S14-12) — SubscriptionBillingService tests.
 *
 * Focuses on the pro-rata math, idempotency, and the event-emit path.
 * Mocks Prisma so we can verify invoice + line-item payload shapes
 * without a DB. All amounts are Decimal-as-string per CLAUDE.md.
 */
import { SubscriptionBillingService } from '../subscription-billing.service';

function makeBillingConfig(overrides: Record<string, unknown> = {}) {
  return {
    planTier: 'starter',
    subscriptionAmountUsd: '500.0000',
    billingCurrency: 'USD',
    paymentTermsDays: 15,
    contractStartDate: new Date('2026-01-01T00:00:00.000Z'),
    contractEndDate: null as Date | null,
    ...overrides,
  };
}

function makePrisma(existingInvoice: unknown = null) {
  const createdInvoices: Array<Record<string, unknown>> = [];
  return {
    billingInvoice: {
      findFirst: jest.fn(async () => existingInvoice),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        createdInvoices.push(args.data);
        return { id: 'inv-1', invoiceNumber: 'INV-2026-0001', ...args.data };
      }),
      update: jest.fn(),
    },
    createdInvoices,
  } as unknown as {
    billingInvoice: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    createdInvoices: Array<Record<string, unknown>>;
  };
}

describe('SubscriptionBillingService (S14-12)', () => {
  it('generates a full-month subscription invoice when contract started before this month', async () => {
    const prisma = makePrisma();
    const eventBus = { emitAndBuild: jest.fn() };
    const numberer = {
      getNextInvoiceNumber: jest.fn(async () => 'INV-2026-0001'),
    } as never;

    const service = new SubscriptionBillingService(
      prisma as never,
      eventBus as never,
      numberer,
    );

    const invoice = await service.generateSubscriptionInvoice(
      't1',
      makeBillingConfig(),
      new Date('2026-05-15T12:00:00.000Z'),
    );

    expect(invoice).toBeDefined();
    const createArgs = prisma.billingInvoice.create.mock.calls[0][0];
    expect(createArgs.data.type).toBe('subscription');
    // 2026-05 has 31 days, full month billable.
    expect(createArgs.data.subtotal).toBe('500.0000');
    expect(createArgs.data.total).toBe('500.0000');
    expect(createArgs.data.status).toBe('issued');
    expect(createArgs.data.currency).toBe('USD');
    // Line items shape — single subscription line.
    const lineItems = createArgs.data.lineItems.create;
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].type).toBe('subscription');
    expect(lineItems[0].amount).toBe('500.0000');
  });

  it('pro-rates when contract starts mid-month', async () => {
    const prisma = makePrisma();
    const eventBus = { emitAndBuild: jest.fn() };
    const numberer = {
      getNextInvoiceNumber: jest.fn(async () => 'INV-2026-0002'),
    } as never;

    const service = new SubscriptionBillingService(
      prisma as never,
      eventBus as never,
      numberer,
    );

    await service.generateSubscriptionInvoice(
      't1',
      makeBillingConfig({
        // Contract starts on the 15th of the same month.
        contractStartDate: new Date('2026-05-15T00:00:00.000Z'),
      }),
      new Date('2026-05-20T12:00:00.000Z'),
    );

    const createArgs = prisma.billingInvoice.create.mock.calls[0][0];
    // 2026-05 has 31 days. Starting on the 15th → 17 billable days.
    // $500 * (17/31) = $274.1935 (banker's rounded to 4dp).
    expect(createArgs.data.subtotal).toBe('274.1935');
  });

  it('pro-rates when contract ends mid-month', async () => {
    const prisma = makePrisma();
    const eventBus = { emitAndBuild: jest.fn() };
    const numberer = {
      getNextInvoiceNumber: jest.fn(async () => 'INV-2026-0003'),
    } as never;

    const service = new SubscriptionBillingService(
      prisma as never,
      eventBus as never,
      numberer,
    );

    await service.generateSubscriptionInvoice(
      't1',
      makeBillingConfig({
        // Contract ends on the 10th.
        contractEndDate: new Date('2026-05-10T23:59:59.000Z'),
      }),
      new Date('2026-05-01T01:00:00.000Z'),
    );

    const createArgs = prisma.billingInvoice.create.mock.calls[0][0];
    // 10 billable days out of 31 → $500 * (10/31) = $161.2903.
    expect(createArgs.data.subtotal).toBe('161.2903');
  });

  it('returns existing invoice without creating a new one (idempotency)', async () => {
    const existing = { id: 'existing-1', invoiceNumber: 'INV-2026-0001' };
    const prisma = makePrisma(existing);
    const eventBus = { emitAndBuild: jest.fn() };
    const numberer = {
      getNextInvoiceNumber: jest.fn(async () => 'INV-2026-0002'),
    } as never;

    const service = new SubscriptionBillingService(
      prisma as never,
      eventBus as never,
      numberer,
    );

    const result = await service.generateSubscriptionInvoice(
      't1',
      makeBillingConfig(),
      new Date('2026-05-01T01:00:00.000Z'),
    );

    expect(result).toBe(existing);
    expect(prisma.billingInvoice.create).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('emits BILLING_INVOICE_GENERATED with Decimal-as-string total', async () => {
    const prisma = makePrisma();
    const eventBus = { emitAndBuild: jest.fn() };
    const numberer = {
      getNextInvoiceNumber: jest.fn(async () => 'INV-2026-0001'),
    } as never;

    const service = new SubscriptionBillingService(
      prisma as never,
      eventBus as never,
      numberer,
    );

    await service.generateSubscriptionInvoice(
      't1',
      makeBillingConfig(),
      new Date('2026-05-15T12:00:00.000Z'),
    );

    expect(eventBus.emitAndBuild).toHaveBeenCalledTimes(1);
    const args = (eventBus.emitAndBuild as jest.Mock).mock.calls[0];
    expect(args[0]).toBe('billing.invoice.generated');
    expect(args[1]).toBe('t1');
    expect(args[2].total).toBe('500.0000');
    expect(args[2].currency).toBe('USD');
    expect(args[2].type).toBe('subscription');
  });

  it('computes a future due date from paymentTermsDays', async () => {
    const prisma = makePrisma();
    const eventBus = { emitAndBuild: jest.fn() };
    const numberer = {
      getNextInvoiceNumber: jest.fn(async () => 'INV-2026-0001'),
    } as never;

    const service = new SubscriptionBillingService(
      prisma as never,
      eventBus as never,
      numberer,
    );

    await service.generateSubscriptionInvoice(
      't1',
      makeBillingConfig({ paymentTermsDays: 30 }),
      new Date('2026-05-15T12:00:00.000Z'),
    );

    const args = prisma.billingInvoice.create.mock.calls[0][0];
    const dueDate = args.data.dueDate as Date;
    // Period start is 2026-05-01 (UTC); +30 days → 2026-05-31.
    expect(dueDate.toISOString().slice(0, 10)).toBe('2026-05-31');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S18-ENH — getBillingHistory + calculateNextBillingDate + estimateCurrentPeriodFees
// ─────────────────────────────────────────────────────────────────────────────

function makeFullPrisma(overrides: Record<string, unknown> = {}) {
  return {
    billingInvoice: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        ...args.data,
      })),
      update: jest.fn(),
    },
    tenantBillingConfig: {
      findUnique: jest.fn(async () => null),
    },
    disbursement: {
      findMany: jest.fn(async () => []),
    },
    ...overrides,
  } as unknown as any;
}

function makeService(prisma: any) {
  const eventBus = { emitAndBuild: jest.fn() };
  const numberer = {
    getNextInvoiceNumber: jest.fn(async () => 'INV-2026-0001'),
  } as never;
  return new SubscriptionBillingService(prisma as never, eventBus as never, numberer);
}

describe('SubscriptionBillingService — getBillingHistory (S18-ENH)', () => {
  it('returns all invoices for tenant when no filters applied', async () => {
    const invoices = [
      { id: 'inv-1', type: 'subscription', billingPeriodStart: new Date('2026-04-01') },
      { id: 'inv-2', type: 'usage', billingPeriodStart: new Date('2026-05-01') },
    ];
    const prisma = makeFullPrisma();
    prisma.billingInvoice.findMany.mockResolvedValue(invoices);

    const service = makeService(prisma);
    const result = await service.getBillingHistory('tenant-1', {});

    expect(result).toHaveLength(2);
    expect(prisma.billingInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
    );
  });

  it('filters by type when provided', async () => {
    const prisma = makeFullPrisma();
    prisma.billingInvoice.findMany.mockResolvedValue([]);

    const service = makeService(prisma);
    await service.getBillingHistory('tenant-1', { type: 'subscription' });

    expect(prisma.billingInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', type: 'subscription' },
      }),
    );
  });

  it('filters by dateFrom and dateTo', async () => {
    const prisma = makeFullPrisma();
    prisma.billingInvoice.findMany.mockResolvedValue([]);

    const service = makeService(prisma);
    const dateFrom = new Date('2026-01-01');
    const dateTo = new Date('2026-06-01');
    await service.getBillingHistory('tenant-1', { dateFrom, dateTo });

    const args = prisma.billingInvoice.findMany.mock.calls[0][0];
    expect(args.where.billingPeriodStart).toEqual({ gte: dateFrom, lte: dateTo });
  });
});

describe('SubscriptionBillingService — calculateNextBillingDate (S18-ENH)', () => {
  const plan = {
    id: 'plan-1',
    planTier: 'starter',
    billingModel: 'per_disbursement',
    subscriptionAmountUsd: '500.0000',
    billingCurrency: 'USD',
    paymentTermsDays: 15,
    contractStartDate: new Date('2026-01-01T00:00:00.000Z'),
    contractEndDate: null,
    perDisbursementBps: null,
  } as any;

  it('returns null when plan is null', () => {
    const prisma = makeFullPrisma();
    const service = makeService(prisma);
    expect(service.calculateNextBillingDate(null)).toBeNull();
  });

  it('returns 1st of next month when a latest invoice exists', () => {
    const prisma = makeFullPrisma();
    const service = makeService(prisma);
    const latestInvoice = {
      billingPeriodEnd: new Date('2026-05-31T00:00:00.000Z'),
    } as any;
    const next = service.calculateNextBillingDate(plan, latestInvoice);
    expect(next?.toISOString().slice(0, 10)).toBe('2026-06-01');
  });

  it('returns 1st of month after contractStartDate when no invoices exist', () => {
    const prisma = makeFullPrisma();
    const service = makeService(prisma);
    const next = service.calculateNextBillingDate(plan, null);
    expect(next?.toISOString().slice(0, 10)).toBe('2026-02-01');
  });

  it('advances across year boundary correctly (Dec → Jan)', () => {
    const prisma = makeFullPrisma();
    const service = makeService(prisma);
    const latestInvoice = {
      billingPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
    } as any;
    const next = service.calculateNextBillingDate(plan, latestInvoice);
    expect(next?.toISOString().slice(0, 10)).toBe('2027-01-01');
  });
});

describe('SubscriptionBillingService — estimateCurrentPeriodFees (S18-ENH)', () => {
  it('returns zero fees when no plan exists', async () => {
    const prisma = makeFullPrisma();
    prisma.tenantBillingConfig.findUnique.mockResolvedValue(null);

    const service = makeService(prisma);
    const fees = await service.estimateCurrentPeriodFees('tenant-1');

    expect(fees.baseFee).toBe('0');
    expect(fees.transactionFees).toBe('0');
    expect(fees.totalEstimated).toBe('0');
  });

  it('returns base fee only when no disbursements this period', async () => {
    const prisma = makeFullPrisma();
    prisma.tenantBillingConfig.findUnique.mockResolvedValue({
      id: 'plan-1',
      subscriptionAmountUsd: '500.0000',
      billingCurrency: 'USD',
      perDisbursementBps: null,
      contractStartDate: new Date('2026-01-01'),
      contractEndDate: null,
    });
    prisma.billingInvoice.findFirst.mockResolvedValue(null);
    prisma.disbursement.findMany.mockResolvedValue([]);

    const service = makeService(prisma);
    const fees = await service.estimateCurrentPeriodFees('tenant-1');

    expect(fees.baseFee).toBe('500.0000');
    expect(fees.transactionFees).toBe('0');
    expect(fees.totalEstimated).toBe('500.0000');
    expect(fees.disbursementCount).toBe(0);
  });

  it('sums base fee + transaction fees using Decimal math (no floats)', async () => {
    const prisma = makeFullPrisma();
    prisma.tenantBillingConfig.findUnique.mockResolvedValue({
      id: 'plan-1',
      subscriptionAmountUsd: '200.0000',
      billingCurrency: 'USD',
      perDisbursementBps: '50', // 0.5% per disbursement
      contractStartDate: new Date('2026-01-01'),
      contractEndDate: null,
    });
    prisma.billingInvoice.findFirst.mockResolvedValue(null);
    // 2 disbursements of $1000 each → fee = $2000 * 0.5% = $10
    prisma.disbursement.findMany.mockResolvedValue([
      { amount: '1000.0000' },
      { amount: '1000.0000' },
    ]);

    const service = makeService(prisma);
    const fees = await service.estimateCurrentPeriodFees('tenant-1');

    expect(fees.disbursementCount).toBe(2);
    expect(fees.baseFee).toBe('200.0000');
    expect(fees.transactionFees).toBe('10.0000');
    expect(fees.totalEstimated).toBe('210.0000');
    // All values must be strings (no numeric leakage).
    expect(typeof fees.baseFee).toBe('string');
    expect(typeof fees.transactionFees).toBe('string');
    expect(typeof fees.totalEstimated).toBe('string');
  });

  it('carries forward disbursements since last invoice period end', async () => {
    const prisma = makeFullPrisma();
    prisma.tenantBillingConfig.findUnique.mockResolvedValue({
      id: 'plan-1',
      subscriptionAmountUsd: '100.0000',
      billingCurrency: 'USD',
      perDisbursementBps: '100', // 1%
      contractStartDate: new Date('2026-01-01'),
      contractEndDate: null,
    });
    // Last invoice covered through April 30
    const lastInvoice = {
      billingPeriodEnd: new Date('2026-04-30T00:00:00.000Z'),
      billingPeriodStart: new Date('2026-04-01T00:00:00.000Z'),
      type: 'subscription',
    } as any;
    prisma.billingInvoice.findFirst.mockResolvedValue(lastInvoice);
    // Disbursements after May 1 (current period)
    prisma.disbursement.findMany.mockResolvedValue([{ amount: '500.0000' }]);

    const service = makeService(prisma);
    const fees = await service.estimateCurrentPeriodFees('tenant-1');

    expect(fees.disbursementCount).toBe(1);
    expect(fees.transactionFees).toBe('5.0000'); // $500 * 1% = $5
    // Verify the query was scoped to after periodStart (May 1)
    const disbQuery = prisma.disbursement.findMany.mock.calls[0][0];
    expect(disbQuery.where.completedAt.gte.toISOString().slice(0, 10)).toBe('2026-05-01');
  });
});
