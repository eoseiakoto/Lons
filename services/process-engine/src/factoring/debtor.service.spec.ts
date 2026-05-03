/**
 * DebtorService — Sprint 12 Phase 3A.
 *
 * Mock-Prisma unit tests covering CRUD, status transitions, risk
 * assessment math, and exposure tracking.
 */

import { DebtorService } from './debtor.service';
import { DebtorStatus, InvoiceStatus, Prisma } from '@lons/database';
import { EventType } from '@lons/event-contracts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const DEBTOR_ID = '22222222-2222-2222-2222-222222222222';
const OPERATOR = '33333333-3333-3333-3333-333333333333';

function makeDebtor(overrides: Partial<any> = {}) {
  return {
    id: DEBTOR_ID,
    tenantId: TENANT,
    companyName: 'Acme Corp',
    tradingName: null,
    registrationNumber: 'REG-001',
    taxId: null,
    country: 'GHA',
    industrySector: 'manufacturing',
    contactEmail: null,
    contactPhone: null,
    contactName: null,
    address: null,
    paymentTerms: null,
    averagePaymentDays: null,
    externalCreditRating: null,
    internalRiskScore: null,
    totalExposure: new Prisma.Decimal('0'),
    exposureLimit: null,
    status: DebtorStatus.active,
    verifiedAt: null,
    metadata: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

// ─── create ──────────────────────────────────────────────────────────────

describe('DebtorService.create', () => {
  it('rejects when companyName is missing', async () => {
    const service = new DebtorService({} as any, { emitAndBuild: jest.fn() } as any);
    await expect(
      service.create(TENANT, { companyName: '', country: 'GHA' }),
    ).rejects.toThrow(/companyName/);
  });

  it('rejects when country is missing', async () => {
    const service = new DebtorService({} as any, { emitAndBuild: jest.fn() } as any);
    await expect(
      service.create(TENANT, { companyName: 'Acme', country: '' }),
    ).rejects.toThrow(/country/);
  });

  it('happy path creates the debtor and emits DEBTOR_CREATED', async () => {
    const created = makeDebtor();
    const prisma = {
      debtor: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new DebtorService(prisma as any, eventBus as any);

    const result = await service.create(TENANT, {
      companyName: 'Acme Corp',
      country: 'GHA',
      registrationNumber: 'REG-001',
      industrySector: 'manufacturing',
    });

    expect(result.id).toBe(DEBTOR_ID);
    expect(prisma.debtor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          companyName: 'Acme Corp',
          country: 'GHA',
          registrationNumber: 'REG-001',
          industrySector: 'manufacturing',
          status: DebtorStatus.active,
        }),
      }),
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_CREATED,
      TENANT,
      expect.objectContaining({
        debtorId: DEBTOR_ID,
        companyName: 'Acme Corp',
        country: 'GHA',
        industrySector: 'manufacturing',
      }),
    );
  });

  it('idempotency: second call with same companyName + regNumber returns existing without re-emitting', async () => {
    const existing = makeDebtor();
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new DebtorService(prisma as any, eventBus as any);

    const result = await service.create(TENANT, {
      companyName: 'Acme Corp',
      country: 'GHA',
      registrationNumber: 'REG-001',
      idempotencyKey: 'idem-key-1',
    });

    expect(result.id).toBe(DEBTOR_ID);
    expect(prisma.debtor.create).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });
});

// ─── findById ────────────────────────────────────────────────────────────

describe('DebtorService.findById', () => {
  it('throws NotFoundError when debtor is missing', async () => {
    const prisma = {
      debtor: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new DebtorService(prisma as any, {} as any);
    await expect(service.findById(TENANT, DEBTOR_ID)).rejects.toThrow(/not found/);
  });

  it('throws NotFoundError when debtor exists in another tenant', async () => {
    const prisma = {
      // findFirst with tenant filter returns null (we never see other-tenant rows).
      debtor: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new DebtorService(prisma as any, {} as any);
    await expect(
      service.findById('99999999-9999-9999-9999-999999999999', DEBTOR_ID),
    ).rejects.toThrow(/not found/);
    expect(prisma.debtor.findFirst).toHaveBeenCalledWith({
      where: {
        id: DEBTOR_ID,
        tenantId: '99999999-9999-9999-9999-999999999999',
        deletedAt: null,
      },
    });
  });

  it('returns the debtor when present', async () => {
    const debtor = makeDebtor();
    const prisma = {
      debtor: { findFirst: jest.fn().mockResolvedValue(debtor) },
    };
    const service = new DebtorService(prisma as any, {} as any);
    const result = await service.findById(TENANT, DEBTOR_ID);
    expect(result).toBe(debtor);
  });
});

// ─── update ──────────────────────────────────────────────────────────────

describe('DebtorService.update', () => {
  it('rejects mutating registrationNumber on a verified debtor', async () => {
    const verified = makeDebtor({
      verifiedAt: new Date('2026-04-15T00:00:00Z'),
      registrationNumber: 'REG-001',
    });
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(verified),
        update: jest.fn(),
      },
    };
    const service = new DebtorService(prisma as any, {} as any);
    await expect(
      service.update(TENANT, DEBTOR_ID, { registrationNumber: 'REG-002' }),
    ).rejects.toThrow(/registrationNumber.*verified/);
    expect(prisma.debtor.update).not.toHaveBeenCalled();
  });

  it('rejects mutating country on a verified debtor', async () => {
    const verified = makeDebtor({
      verifiedAt: new Date('2026-04-15T00:00:00Z'),
      country: 'GHA',
    });
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(verified),
        update: jest.fn(),
      },
    };
    const service = new DebtorService(prisma as any, {} as any);
    await expect(
      service.update(TENANT, DEBTOR_ID, { country: 'KEN' }),
    ).rejects.toThrow(/country.*verified/);
  });

  it('allows changing contactEmail on a verified debtor', async () => {
    const verified = makeDebtor({ verifiedAt: new Date('2026-04-15T00:00:00Z') });
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(verified),
        update: jest
          .fn()
          .mockImplementation(async (args: any) => ({ ...verified, ...args.data })),
      },
    };
    const service = new DebtorService(prisma as any, {} as any);
    const result = await service.update(TENANT, DEBTOR_ID, {
      contactEmail: 'ops@acme.test',
    });
    expect(result.contactEmail).toBe('ops@acme.test');
  });

  it('allows registrationNumber change before verification', async () => {
    const unverified = makeDebtor({
      verifiedAt: null,
      registrationNumber: 'REG-001',
    });
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(unverified),
        update: jest
          .fn()
          .mockImplementation(async (args: any) => ({ ...unverified, ...args.data })),
      },
    };
    const service = new DebtorService(prisma as any, {} as any);
    const result = await service.update(TENANT, DEBTOR_ID, {
      registrationNumber: 'REG-002',
    });
    expect(result.registrationNumber).toBe('REG-002');
  });
});

// ─── status transitions ────────────────────────────────────────────────────

describe('DebtorService.suspend', () => {
  it('moves an active debtor to suspended and emits DEBTOR_SUSPENDED', async () => {
    const active = makeDebtor();
    const suspended = { ...active, status: DebtorStatus.suspended };
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(active),
        update: jest.fn().mockResolvedValue(suspended),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new DebtorService(prisma as any, eventBus as any);

    const result = await service.suspend(TENANT, DEBTOR_ID, 'fraud_flag', OPERATOR);

    expect(result.status).toBe(DebtorStatus.suspended);
    expect(prisma.debtor.update).toHaveBeenCalledWith({
      where: { id: DEBTOR_ID },
      data: { status: DebtorStatus.suspended },
    });
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_SUSPENDED,
      TENANT,
      { debtorId: DEBTOR_ID, reason: 'fraud_flag', suspendedBy: OPERATOR },
    );
  });

  it('refuses to suspend a blacklisted debtor', async () => {
    const blacklisted = makeDebtor({ status: DebtorStatus.blacklisted });
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(blacklisted),
        update: jest.fn(),
      },
    };
    const service = new DebtorService(prisma as any, { emitAndBuild: jest.fn() } as any);
    await expect(
      service.suspend(TENANT, DEBTOR_ID, 'reason', OPERATOR),
    ).rejects.toThrow(/blacklisted/);
    expect(prisma.debtor.update).not.toHaveBeenCalled();
  });
});

describe('DebtorService.blacklist', () => {
  it('moves a debtor to blacklisted and emits DEBTOR_BLACKLISTED', async () => {
    const active = makeDebtor();
    const bl = { ...active, status: DebtorStatus.blacklisted };
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(active),
        update: jest.fn().mockResolvedValue(bl),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new DebtorService(prisma as any, eventBus as any);

    const result = await service.blacklist(
      TENANT,
      DEBTOR_ID,
      'repeated_default',
      OPERATOR,
    );

    expect(result.status).toBe(DebtorStatus.blacklisted);
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_BLACKLISTED,
      TENANT,
      {
        debtorId: DEBTOR_ID,
        reason: 'repeated_default',
        blacklistedBy: OPERATOR,
      },
    );
  });
});

describe('DebtorService.reactivate', () => {
  it('moves a suspended debtor back to active', async () => {
    const suspended = makeDebtor({ status: DebtorStatus.suspended });
    const reactivated = { ...suspended, status: DebtorStatus.active };
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(suspended),
        update: jest.fn().mockResolvedValue(reactivated),
      },
    };
    const service = new DebtorService(prisma as any, { emitAndBuild: jest.fn() } as any);

    const result = await service.reactivate(TENANT, DEBTOR_ID);
    expect(result.status).toBe(DebtorStatus.active);
    expect(prisma.debtor.update).toHaveBeenCalledWith({
      where: { id: DEBTOR_ID },
      data: { status: DebtorStatus.active },
    });
  });

  it('refuses to reactivate a blacklisted debtor', async () => {
    const bl = makeDebtor({ status: DebtorStatus.blacklisted });
    const prisma = {
      debtor: { findFirst: jest.fn().mockResolvedValue(bl), update: jest.fn() },
    };
    const service = new DebtorService(prisma as any, { emitAndBuild: jest.fn() } as any);
    await expect(service.reactivate(TENANT, DEBTOR_ID)).rejects.toThrow(/blacklisted/);
    expect(prisma.debtor.update).not.toHaveBeenCalled();
  });
});

// ─── assessRisk ─────────────────────────────────────────────────────────────

describe('DebtorService.assessRisk', () => {
  /** Helper to build a paid invoice with a specific days-late offset. */
  function paidInvoice(daysLate: number, dueDate = new Date('2026-04-10T00:00:00Z')) {
    const updatedAt = new Date(dueDate.getTime() + daysLate * 86_400_000);
    return {
      id: `inv-${Math.random()}`,
      status: InvoiceStatus.settled,
      dueDate,
      updatedAt,
    };
  }

  it('5 invoices, 4 paid on time → reliability ~80, score ~80', async () => {
    const debtor = makeDebtor({ industrySector: 'manufacturing', country: 'GHA' });
    const invoices = [
      paidInvoice(0),
      paidInvoice(-1), // paid early
      paidInvoice(0),
      paidInvoice(0),
      paidInvoice(7), // late
    ];
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(debtor),
        update: jest.fn().mockResolvedValue(debtor),
      },
      invoice: { findMany: jest.fn().mockResolvedValue(invoices) },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new DebtorService(prisma as any, eventBus as any);

    const result = await service.assessRisk(TENANT, DEBTOR_ID);

    // 4 of 5 on time = 80%
    expect(result.reliabilityPercent).toBe('80.00');
    // score = 50 + (80-50)*1 + 0 (manufacturing) + 0 (GHA) + 0 = 80.00
    expect(result.score).toBe('80.00');
    expect(result.factors.paymentHistory).toBe('30.00');
    expect(result.factors.industry).toBe('0.00');
    expect(result.factors.country).toBe('0.00');
    expect(result.factors.default).toBe('0.00');
    // averagePaymentDays = round((0 + -1 + 0 + 0 + 7) / 5) = 1
    expect(result.averagePaymentDays).toBe(1);

    expect(prisma.debtor.update).toHaveBeenCalledWith({
      where: { id: DEBTOR_ID },
      data: { internalRiskScore: '80.00', averagePaymentDays: 1 },
    });
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_RISK_ASSESSED,
      TENANT,
      expect.objectContaining({
        debtorId: DEBTOR_ID,
        internalRiskScore: '80.00',
      }),
    );
  });

  it('5 invoices, 0 on time, 2 defaulted → reliability 0, score < 30', async () => {
    const debtor = makeDebtor({ industrySector: 'manufacturing', country: 'GHA' });
    const dueDate = new Date('2026-04-10T00:00:00Z');
    const invoices = [
      paidInvoice(10, dueDate),
      paidInvoice(20, dueDate),
      paidInvoice(15, dueDate),
      // Defaulted invoices: not in PAID list, so they don't count toward
      // paid/onTime aggregation but DO contribute to defaultCount.
      { id: 'd1', status: InvoiceStatus.defaulted, dueDate, updatedAt: dueDate },
      { id: 'd2', status: InvoiceStatus.defaulted, dueDate, updatedAt: dueDate },
    ];
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(debtor),
        update: jest.fn().mockResolvedValue(debtor),
      },
      invoice: { findMany: jest.fn().mockResolvedValue(invoices) },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new DebtorService(prisma as any, eventBus as any);

    const result = await service.assessRisk(TENANT, DEBTOR_ID);

    // 0/3 on-time among paid invoices = 0%
    expect(result.reliabilityPercent).toBe('0.00');
    // paymentHistory = clamp((0 - 50) * 1, -50, 50) = -50
    // defaultFactor = -10 * 2 = -20
    // score = clamp(50 + (-50) + 0 + 0 + (-20), 0, 100) = 0
    expect(Number(result.score)).toBeLessThan(30);
    expect(result.factors.paymentHistory).toBe('-50.00');
    expect(result.factors.default).toBe('-20.00');
  });

  it('returns neutral score when there is no payment history', async () => {
    const debtor = makeDebtor({ industrySector: 'manufacturing', country: 'GHA' });
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(debtor),
        update: jest.fn().mockResolvedValue(debtor),
      },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DebtorService(prisma as any, { emitAndBuild: jest.fn() } as any);
    const result = await service.assessRisk(TENANT, DEBTOR_ID);
    expect(result.reliabilityPercent).toBe('50.00');
    expect(result.averagePaymentDays).toBeNull();
    // 50 + 0 + 0 + 0 + 0 = 50
    expect(result.score).toBe('50.00');
  });
});

// ─── updateExposure ─────────────────────────────────────────────────────────

describe('DebtorService.updateExposure', () => {
  it('atomically applies a positive delta and emits DEBTOR_EXPOSURE_CHANGED', async () => {
    const before = makeDebtor({ totalExposure: new Prisma.Decimal('1000.0000') });
    const after = { ...before, totalExposure: new Prisma.Decimal('1500.0000') };
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(before),
        update: jest.fn().mockResolvedValue(after),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new DebtorService(prisma as any, eventBus as any);

    await service.updateExposure(TENANT, DEBTOR_ID, '500.0000', 'invoice-abc');

    // Atomic increment via Prisma operator
    expect(prisma.debtor.update).toHaveBeenCalledWith({
      where: { id: DEBTOR_ID },
      data: { totalExposure: { increment: expect.any(Object) } },
    });
    const callArgs = prisma.debtor.update.mock.calls[0][0];
    expect(String(callArgs.data.totalExposure.increment)).toBe('500');

    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_EXPOSURE_CHANGED,
      TENANT,
      {
        debtorId: DEBTOR_ID,
        previousExposure: '1000',
        newExposure: '1500',
        delta: '500.0000',
        invoiceId: 'invoice-abc',
      },
    );
  });

  it('applies a negative delta (exposure released)', async () => {
    const before = makeDebtor({ totalExposure: new Prisma.Decimal('1000.0000') });
    const after = { ...before, totalExposure: new Prisma.Decimal('700.0000') };
    const prisma = {
      debtor: {
        findFirst: jest.fn().mockResolvedValue(before),
        update: jest.fn().mockResolvedValue(after),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new DebtorService(prisma as any, eventBus as any);

    await service.updateExposure(TENANT, DEBTOR_ID, '-300.0000');

    const callArgs = prisma.debtor.update.mock.calls[0][0];
    expect(String(callArgs.data.totalExposure.increment)).toBe('-300');
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.DEBTOR_EXPOSURE_CHANGED,
      TENANT,
      expect.objectContaining({
        delta: '-300.0000',
        previousExposure: '1000',
        newExposure: '700',
      }),
    );
  });

  it('zero-delta is a no-op (no DB write, no event)', async () => {
    const prisma = {
      debtor: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new DebtorService(prisma as any, eventBus as any);

    await service.updateExposure(TENANT, DEBTOR_ID, '0');
    expect(prisma.debtor.findFirst).not.toHaveBeenCalled();
    expect(prisma.debtor.update).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });
});
