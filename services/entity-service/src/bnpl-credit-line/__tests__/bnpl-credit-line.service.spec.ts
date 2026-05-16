/**
 * Sprint 15 fixes (FIX-4) — unit tests for `BnplCreditLineService`.
 *
 * The service was shipped in Sprint 15 without unit tests, and the PM
 * review flagged it. These tests pin the behaviour contract:
 *   - create() is idempotent on (tenant, customer, subscription) and
 *     filters soft-deleted rows (FIX-9).
 *   - updateStatus() enforces the terminal-closed rule and event-emits
 *     on every transition.
 *   - findBy*() helpers stay tenant-scoped and respect soft-delete.
 *   - All emission paths fire the right EventType.
 *
 * The Prisma client is mocked — these are pure logic tests. Integration
 * coverage lives in the regression suite.
 */
import { BnplCreditLineStatus } from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { BnplCreditLineService } from '../bnpl-credit-line.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const SUBSCRIPTION_ID = '33333333-3333-3333-3333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-4444-444444444444';
const LINE_ID = '55555555-5555-5555-5555-555555555555';

function makeLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LINE_ID,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    subscriptionId: SUBSCRIPTION_ID,
    productId: PRODUCT_ID,
    approvedLimit: '1000.0000' as unknown as { toString(): string },
    availableLimit: '1000.0000' as unknown as { toString(): string },
    currency: 'USD',
    status: BnplCreditLineStatus.active,
    lastReviewedAt: null,
    nextReviewAt: new Date('2026-08-01'),
    suspendedAt: null,
    suspendedReason: null,
    closedAt: null,
    closedReason: null,
    metadata: null,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makeService() {
  const bnplCreditLine = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { bnplCreditLine } as any;
  const eventBus = { emitAndBuild: jest.fn() } as any;
  const service = new BnplCreditLineService(prisma, eventBus);
  return { service, prisma, eventBus, bnplCreditLine };
}

describe('BnplCreditLineService.create', () => {
  it('rejects non-positive approvedLimit', async () => {
    const { service } = makeService();
    await expect(
      service.create(TENANT_ID, {
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        productId: PRODUCT_ID,
        approvedLimit: '0',
        currency: 'USD',
      }),
    ).rejects.toThrow(/approvedLimit must be positive/);
    await expect(
      service.create(TENANT_ID, {
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        productId: PRODUCT_ID,
        approvedLimit: '-100',
        currency: 'USD',
      }),
    ).rejects.toThrow(/approvedLimit must be positive/);
  });

  it('returns the existing row on duplicate (idempotency)', async () => {
    const { service, bnplCreditLine } = makeService();
    const existing = makeLine();
    bnplCreditLine.findFirst.mockResolvedValue(existing);

    const result = await service.create(TENANT_ID, {
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      productId: PRODUCT_ID,
      approvedLimit: '1000.0000',
      currency: 'USD',
    });

    expect(result).toBe(existing);
    expect(bnplCreditLine.create).not.toHaveBeenCalled();
  });

  it('FIX-9: idempotency filter excludes soft-deleted rows', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(null);
    bnplCreditLine.create.mockResolvedValue(makeLine());

    await service.create(TENANT_ID, {
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      productId: PRODUCT_ID,
      approvedLimit: '1000.0000',
      currency: 'USD',
    });

    expect(bnplCreditLine.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        deletedAt: null,
      },
    });
  });

  it('initialises availableLimit to approvedLimit and emits CREATED event', async () => {
    const { service, bnplCreditLine, eventBus } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(null);
    bnplCreditLine.create.mockResolvedValue(makeLine());

    await service.create(TENANT_ID, {
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      productId: PRODUCT_ID,
      approvedLimit: '500.0000',
      currency: 'GHS',
    });

    const createArgs = bnplCreditLine.create.mock.calls[0][0];
    expect(createArgs.data.approvedLimit).toBe('500.0000');
    expect(createArgs.data.availableLimit).toBe('500.0000');
    expect(createArgs.data.status).toBe(BnplCreditLineStatus.active);

    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.BNPL_CREDIT_LINE_CREATED,
      TENANT_ID,
      expect.objectContaining({
        creditLineId: LINE_ID,
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
      }),
    );
  });

  it('defaults nextReviewAt to ~90 days when omitted', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(null);
    bnplCreditLine.create.mockResolvedValue(makeLine());

    const before = Date.now();
    await service.create(TENANT_ID, {
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      productId: PRODUCT_ID,
      approvedLimit: '1000.0000',
      currency: 'USD',
    });
    const after = Date.now();

    const createArgs = bnplCreditLine.create.mock.calls[0][0];
    const next = (createArgs.data.nextReviewAt as Date).getTime();
    // Should be ~90 days from now (allow ±1 day tolerance for the
    // test's wall-clock window).
    expect(next).toBeGreaterThanOrEqual(before + 89 * 86_400_000);
    expect(next).toBeLessThanOrEqual(after + 91 * 86_400_000);
  });
});

describe('BnplCreditLineService.findById*', () => {
  it('findById filters by tenant and deletedAt', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(null);

    await service.findById(TENANT_ID, LINE_ID);

    expect(bnplCreditLine.findFirst).toHaveBeenCalledWith({
      where: { id: LINE_ID, tenantId: TENANT_ID, deletedAt: null },
    });
  });

  it('findByIdOrThrow throws NotFoundError when missing', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(null);
    await expect(service.findByIdOrThrow(TENANT_ID, LINE_ID)).rejects.toThrow(
      /BnplCreditLine/,
    );
  });

  it('findByCustomerId orders newest first', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findMany.mockResolvedValue([]);

    await service.findByCustomerId(TENANT_ID, CUSTOMER_ID);

    expect(bnplCreditLine.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('BnplCreditLineService.updateStatus', () => {
  it('rejects status change on a closed line (terminal)', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(
      makeLine({ status: BnplCreditLineStatus.closed }),
    );

    await expect(
      service.updateStatus(
        TENANT_ID,
        LINE_ID,
        BnplCreditLineStatus.active,
        'reopen',
      ),
    ).rejects.toThrow(/closed credit line/);
  });

  it('returns existing row unchanged when same-status (idempotent)', async () => {
    const { service, bnplCreditLine, eventBus } = makeService();
    const existing = makeLine({ status: BnplCreditLineStatus.active });
    bnplCreditLine.findFirst.mockResolvedValue(existing);

    const result = await service.updateStatus(
      TENANT_ID,
      LINE_ID,
      BnplCreditLineStatus.active,
    );

    expect(result).toBe(existing);
    expect(bnplCreditLine.update).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('requires a reason when suspending', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(makeLine());

    await expect(
      service.updateStatus(TENANT_ID, LINE_ID, BnplCreditLineStatus.suspended),
    ).rejects.toThrow(/Reason is required/);
  });

  it('suspending stamps suspendedAt + suspendedReason and emits', async () => {
    const { service, bnplCreditLine, eventBus } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(makeLine());
    bnplCreditLine.update.mockResolvedValue(
      makeLine({ status: BnplCreditLineStatus.suspended }),
    );

    await service.updateStatus(
      TENANT_ID,
      LINE_ID,
      BnplCreditLineStatus.suspended,
      'fraud_alert',
    );

    const args = bnplCreditLine.update.mock.calls[0][0];
    expect(args.where.id).toBe(LINE_ID);
    expect(args.data.status).toBe(BnplCreditLineStatus.suspended);
    expect(args.data.suspendedReason).toBe('fraud_alert');
    expect(args.data.suspendedAt).toBeInstanceOf(Date);
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.BNPL_CREDIT_LINE_STATUS_CHANGED,
      TENANT_ID,
      expect.objectContaining({
        creditLineId: LINE_ID,
        previousStatus: BnplCreditLineStatus.active,
        newStatus: BnplCreditLineStatus.suspended,
        reason: 'fraud_alert',
      }),
    );
  });

  it('reactivating clears suspendedAt + suspendedReason', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(
      makeLine({
        status: BnplCreditLineStatus.suspended,
        suspendedAt: new Date(),
        suspendedReason: 'fraud_alert',
      }),
    );
    bnplCreditLine.update.mockResolvedValue(makeLine());

    await service.updateStatus(
      TENANT_ID,
      LINE_ID,
      BnplCreditLineStatus.active,
    );

    const args = bnplCreditLine.update.mock.calls[0][0];
    expect(args.data.suspendedAt).toBeNull();
    expect(args.data.suspendedReason).toBeNull();
  });

  it('closing stamps closedAt + closedReason', async () => {
    const { service, bnplCreditLine } = makeService();
    bnplCreditLine.findFirst.mockResolvedValue(makeLine());
    bnplCreditLine.update.mockResolvedValue(
      makeLine({ status: BnplCreditLineStatus.closed }),
    );

    await service.updateStatus(
      TENANT_ID,
      LINE_ID,
      BnplCreditLineStatus.closed,
      'customer_request',
    );

    const args = bnplCreditLine.update.mock.calls[0][0];
    expect(args.data.status).toBe(BnplCreditLineStatus.closed);
    expect(args.data.closedReason).toBe('customer_request');
    expect(args.data.closedAt).toBeInstanceOf(Date);
  });
});
