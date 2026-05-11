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
