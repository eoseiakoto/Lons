/**
 * Sprint 14 (S14-IF-1) — InvoiceVerificationService tests.
 *
 * Verifies the FIFO queue ordering, the claim flow's conflict
 * detection, approve/reject state transitions, the rejection-reason
 * whitelist, and the request-info append-only behaviour. Uses
 * hand-rolled Prisma + EventBus stubs.
 */
import { NotFoundError, ValidationError } from '@lons/common';

import { InvoiceVerificationService } from '../invoice-verification.service';

const TENANT = 't1';
const USER_A = 'user-a';
const USER_B = 'user-b';

function makePrisma(invoices: Array<Record<string, unknown>>) {
  let store = [...invoices];
  return {
    invoice: {
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
        return store.filter((inv) => {
          if (args.where.tenantId && inv.tenantId !== args.where.tenantId) return false;
          if (args.where.verificationStatus && inv.verificationStatus !== args.where.verificationStatus) return false;
          // S18 code-review fix I1 — the queue's "assignedTo" filter
          // now pivots on assigned_verifier_id (the claim column), not
          // verified_by (the decision column).
          if ((args.where as { assignedVerifierId?: unknown }).assignedVerifierId !== undefined) {
            const wantedBy = (args.where as { assignedVerifierId?: unknown }).assignedVerifierId;
            if (wantedBy === null && inv.assignedVerifierId !== null) return false;
            if (typeof wantedBy === 'string' && inv.assignedVerifierId !== wantedBy) return false;
          }
          return true;
        });
      }),
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        return (
          store.find((inv) => {
            for (const [k, v] of Object.entries(args.where)) {
              if ((inv as Record<string, unknown>)[k] !== v) return false;
            }
            return true;
          }) ?? null
        );
      }),
      update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        store = store.map((inv) =>
          inv.id === args.where.id ? { ...inv, ...args.data } : inv,
        );
        return store.find((inv) => inv.id === args.where.id)!;
      }),
    },
    _store: () => store,
  };
}

function makeEventBus() {
  return { emitAndBuild: jest.fn() };
}

function makePendingInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: `inv-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: TENANT,
    verificationStatus: 'pending',
    status: 'submitted',
    verifiedBy: null,
    verifiedAt: null,
    verificationNotes: null,
    // S18 code-review fix I1 — claim writes assignedVerifierId,
    // decisions write verifiedBy. Defaults both to null on a fresh
    // pending invoice.
    assignedVerifierId: null,
    sellerId: 's1',
    debtorId: 'd1',
    faceValue: '10000.0000',
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

describe('InvoiceVerificationService (S14-IF-1)', () => {
  it('queue returns only pending invoices', async () => {
    const verified = makePendingInvoice({ verificationStatus: 'verified' });
    const pending = makePendingInvoice();
    const prisma = makePrisma([pending, verified]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    const result = await service.getVerificationQueue(TENANT, {}, {});
    expect(result.items).toHaveLength(1);
    expect((result.items[0] as { id: string }).id).toBe(pending.id);
  });

  it('queue assignedTo=me filters by current user', async () => {
    // S18 code-review fix I1 — "assigned to me" now pivots on
    // assignedVerifierId (the claim column), not verifiedBy.
    const mine = makePendingInvoice({ assignedVerifierId: USER_A });
    const theirs = makePendingInvoice({ assignedVerifierId: USER_B });
    const prisma = makePrisma([mine, theirs]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    const result = await service.getVerificationQueue(
      TENANT,
      { assignedTo: 'me', currentUserId: USER_A },
      {},
    );
    expect(result.items).toHaveLength(1);
    expect((result.items[0] as { id: string }).id).toBe(mine.id);
  });

  it('queue assignedTo=unassigned filters where assignedVerifierId is null', async () => {
    const unassigned = makePendingInvoice({ assignedVerifierId: null });
    const claimed = makePendingInvoice({ assignedVerifierId: USER_A });
    const prisma = makePrisma([unassigned, claimed]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    const result = await service.getVerificationQueue(
      TENANT,
      { assignedTo: 'unassigned' },
      {},
    );
    expect(result.items).toHaveLength(1);
    expect((result.items[0] as { id: string }).id).toBe(unassigned.id);
  });

  it('claim sets assignedVerifierId (not verifiedBy)', async () => {
    const invoice = makePendingInvoice();
    const prisma = makePrisma([invoice]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    await service.claimInvoice(TENANT, invoice.id, USER_A);
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: { assignedVerifierId: USER_A },
    });
  });

  it('claim is idempotent for the same user', async () => {
    const invoice = makePendingInvoice({ assignedVerifierId: USER_A });
    const prisma = makePrisma([invoice]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    await service.claimInvoice(TENANT, invoice.id, USER_A);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('claim throws when another operator has the invoice', async () => {
    const invoice = makePendingInvoice({ assignedVerifierId: USER_B });
    const prisma = makePrisma([invoice]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    await expect(
      service.claimInvoice(TENANT, invoice.id, USER_A),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('claim throws NotFoundError when the invoice is not pending', async () => {
    const prisma = makePrisma([]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    await expect(
      service.claimInvoice(TENANT, 'missing', USER_A),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('approve transitions verificationStatus → verified, status → verified, emits event', async () => {
    const invoice = makePendingInvoice();
    const prisma = makePrisma([invoice]);
    const eventBus = makeEventBus();
    const service = new InvoiceVerificationService(
      prisma as never,
      eventBus as never,
    );

    await service.approveInvoice(TENANT, invoice.id, USER_A, {
      notes: 'all good',
      checklist: { docAuthenticity: true },
    });

    const updateArgs = prisma.invoice.update.mock.calls[0][0];
    expect(updateArgs.data.verificationStatus).toBe('verified');
    expect(updateArgs.data.status).toBe('verified');
    expect(updateArgs.data.verifiedBy).toBe(USER_A);
    expect(updateArgs.data.verifiedAt).toBeInstanceOf(Date);
    expect((updateArgs.data.metadata as Record<string, unknown>).verificationChecklist).toEqual({
      docAuthenticity: true,
    });
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'invoice.verified',
      TENANT,
      expect.objectContaining({
        invoiceId: invoice.id,
        verifiedBy: USER_A,
      }),
    );
  });

  it('reject transitions verificationStatus → failed, status → rejected, emits event', async () => {
    const invoice = makePendingInvoice();
    const prisma = makePrisma([invoice]);
    const eventBus = makeEventBus();
    const service = new InvoiceVerificationService(
      prisma as never,
      eventBus as never,
    );

    await service.rejectInvoice(TENANT, invoice.id, USER_A, {
      reason: 'duplicate_invoice',
      notes: 'already paid',
    });

    const updateArgs = prisma.invoice.update.mock.calls[0][0];
    expect(updateArgs.data.verificationStatus).toBe('failed');
    expect(updateArgs.data.status).toBe('rejected');
    expect((updateArgs.data.metadata as Record<string, unknown>).rejectionReason).toBe(
      'duplicate_invoice',
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'invoice.rejected',
      TENANT,
      expect.objectContaining({ reason: 'duplicate_invoice' }),
    );
  });

  it('reject validates the reason against the canonical list', async () => {
    const invoice = makePendingInvoice();
    const prisma = makePrisma([invoice]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    await expect(
      service.rejectInvoice(TENANT, invoice.id, USER_A, {
        reason: 'arbitrary_typo' as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('requestMoreInfo appends to metadata.infoRequests without changing status', async () => {
    const invoice = makePendingInvoice({
      metadata: { infoRequests: [{ requestedBy: USER_B, message: 'prior' }] },
    });
    const prisma = makePrisma([invoice]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    await service.requestMoreInfo(TENANT, invoice.id, USER_A, 'pls confirm');

    const updateArgs = prisma.invoice.update.mock.calls[0][0];
    const infoRequests = (updateArgs.data.metadata as Record<string, unknown>).infoRequests as Array<
      Record<string, unknown>
    >;
    expect(infoRequests).toHaveLength(2);
    expect(infoRequests[1].requestedBy).toBe(USER_A);
    expect(infoRequests[1].message).toBe('pls confirm');
    // No status mutation.
    expect(updateArgs.data.verificationStatus).toBeUndefined();
    expect(updateArgs.data.status).toBeUndefined();
  });

  it('requestMoreInfo requires a non-empty message', async () => {
    const invoice = makePendingInvoice();
    const prisma = makePrisma([invoice]);
    const service = new InvoiceVerificationService(
      prisma as never,
      makeEventBus() as never,
    );

    await expect(
      service.requestMoreInfo(TENANT, invoice.id, USER_A, '   '),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
