/**
 * Sprint 12 Phase 4B — FactoringController unit tests.
 *
 * The controller is exercised in isolation: services and PrismaService are
 * jest.fn() mocks, the ApiKeyGuard is bypassed by passing a request stub
 * with `tenantId` already populated. This mirrors the wallet-webhook
 * controller spec pattern (no Nest test module setup needed).
 */

import { NotFoundException } from '@nestjs/common';

import { FactoringController } from './factoring.controller';

const TENANT = '11111111-1111-1111-1111-111111111111';

function makeReq(): any {
  return { tenantId: TENANT };
}

function makeMocks() {
  const debtorService = {
    create: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
  };
  const invoiceSubmission = {
    submit: jest.fn(),
  };
  const origination = {
    acceptOffer: jest.fn(),
    declineOffer: jest.fn(),
  };
  const prisma = {
    invoice: {
      findFirst: jest.fn(),
    },
  };
  const controller = new FactoringController(
    debtorService as any,
    invoiceSubmission as any,
    origination as any,
    prisma as any,
  );
  return { controller, debtorService, invoiceSubmission, origination, prisma };
}

describe('FactoringController (Sprint 12 Phase 4B)', () => {
  // ─── POST /v1/invoices/submit ────────────────────────────────────────

  describe('POST /v1/invoices/submit', () => {
    const submitBody = {
      idempotencyKey: 'k-001',
      sellerId: 'seller-1',
      debtorId: 'debtor-1',
      productId: 'product-1',
      invoiceNumber: 'INV-001',
      issueDate: '2026-04-01',
      dueDate: '2026-07-01',
      faceValue: '100000.00',
      currency: 'GHS',
      recourseType: 'with_recourse' as const,
    };

    it('returns the invoice from InvoiceSubmissionService.submit', async () => {
      const { controller, invoiceSubmission } = makeMocks();
      const fake = { id: 'inv-1', status: 'verified', advanceRatePercent: '85.00' };
      invoiceSubmission.submit.mockResolvedValue(fake);

      const result = await controller.submitInvoice(makeReq(), submitBody);

      expect(result).toBe(fake);
    });

    it('forwards tenantId from request.tenantId (never from body)', async () => {
      const { controller, invoiceSubmission } = makeMocks();
      invoiceSubmission.submit.mockResolvedValue({});

      await controller.submitInvoice(makeReq(), submitBody);

      const [tenantArg, payloadArg] = invoiceSubmission.submit.mock.calls[0];
      expect(tenantArg).toBe(TENANT);
      // Sanity: no tenantId leaks into the payload from the DTO.
      expect((payloadArg as any).tenantId).toBeUndefined();
    });

    it('forwards the idempotencyKey to the service', async () => {
      const { controller, invoiceSubmission } = makeMocks();
      invoiceSubmission.submit.mockResolvedValue({});

      await controller.submitInvoice(makeReq(), submitBody);

      expect(invoiceSubmission.submit.mock.calls[0][1]).toMatchObject({
        idempotencyKey: 'k-001',
      });
    });

    it('throws when the guard did not populate tenantId (defensive)', async () => {
      const { controller } = makeMocks();
      await expect(
        controller.submitInvoice({} as any, submitBody),
      ).rejects.toThrow(/ApiKeyGuard did not populate/);
    });
  });

  // ─── GET /v1/invoices/:id ────────────────────────────────────────────

  describe('GET /v1/invoices/:id', () => {
    it('returns the invoice from a tenant-scoped Prisma lookup', async () => {
      const { controller, prisma } = makeMocks();
      const fake = { id: 'inv-1', tenantId: TENANT, status: 'funded' };
      prisma.invoice.findFirst.mockResolvedValue(fake);

      const result = await controller.getInvoice(makeReq(), 'inv-1');

      expect(result).toBe(fake);
      expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: 'inv-1', tenantId: TENANT },
      });
    });

    it('throws NotFoundException when the invoice is missing or belongs to another tenant', async () => {
      const { controller, prisma } = makeMocks();
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        controller.getInvoice(makeReq(), 'inv-missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── POST /v1/invoices/:id/accept ────────────────────────────────────

  describe('POST /v1/invoices/:id/accept', () => {
    it('forwards tenantId, invoiceId, and idempotencyKey to FactoringOriginationService.acceptOffer', async () => {
      const { controller, origination } = makeMocks();
      const fake = { id: 'inv-1', status: 'offer_accepted' };
      origination.acceptOffer.mockResolvedValue(fake);

      const result = await controller.acceptOffer(makeReq(), 'inv-1', {
        idempotencyKey: 'accept-key-001',
      });

      expect(result).toBe(fake);
      expect(origination.acceptOffer).toHaveBeenCalledWith(
        TENANT,
        'inv-1',
        'accept-key-001',
      );
    });
  });

  // ─── POST /v1/invoices/:id/decline ───────────────────────────────────

  describe('POST /v1/invoices/:id/decline', () => {
    it('forwards an optional reason to FactoringOriginationService.declineOffer', async () => {
      const { controller, origination } = makeMocks();
      const fake = { id: 'inv-1', status: 'cancelled' };
      origination.declineOffer.mockResolvedValue(fake);

      const result = await controller.declineOffer(makeReq(), 'inv-1', {
        reason: 'Rate too high',
      });

      expect(result).toBe(fake);
      expect(origination.declineOffer).toHaveBeenCalledWith(
        TENANT,
        'inv-1',
        'Rate too high',
      );
    });

    it('passes undefined reason when the body is empty', async () => {
      const { controller, origination } = makeMocks();
      origination.declineOffer.mockResolvedValue({});

      await controller.declineOffer(makeReq(), 'inv-1', {});

      expect(origination.declineOffer).toHaveBeenCalledWith(
        TENANT,
        'inv-1',
        undefined,
      );
    });
  });

  // ─── GET /v1/debtors ─────────────────────────────────────────────────

  describe('GET /v1/debtors', () => {
    it('returns { data, nextCursor } from DebtorService.findMany', async () => {
      const { controller, debtorService } = makeMocks();
      const items = [{ id: 'debtor-1' }, { id: 'debtor-2' }];
      debtorService.findMany.mockResolvedValue({
        items,
        nextCursor: 'debtor-2',
      });

      const result = await controller.listDebtors(makeReq(), {
        limit: 2,
        cursor: 'debtor-0',
      });

      expect(result).toEqual({ data: items, nextCursor: 'debtor-2' });
    });

    it('forwards tenantId, filters, and pagination to DebtorService.findMany', async () => {
      const { controller, debtorService } = makeMocks();
      debtorService.findMany.mockResolvedValue({ items: [], nextCursor: null });

      await controller.listDebtors(makeReq(), {
        cursor: 'cursor-1',
        limit: 50,
        status: 'active',
        industrySector: 'retail',
        country: 'GHA',
        search: 'Acme',
      });

      expect(debtorService.findMany).toHaveBeenCalledWith(
        TENANT,
        {
          status: 'active',
          industrySector: 'retail',
          country: 'GHA',
          search: 'Acme',
        },
        { cursor: 'cursor-1', limit: 50 },
      );
    });
  });

  // ─── POST /v1/debtors ────────────────────────────────────────────────

  describe('POST /v1/debtors', () => {
    it('forwards tenantId and full payload to DebtorService.create', async () => {
      const { controller, debtorService } = makeMocks();
      const fake = { id: 'debtor-1', companyName: 'Acme', country: 'GHA' };
      debtorService.create.mockResolvedValue(fake);

      const result = await controller.createDebtor(makeReq(), {
        companyName: 'Acme',
        country: 'GHA',
        idempotencyKey: 'k-debtor-001',
      });

      expect(result).toBe(fake);
      const [tenantArg, payload] = debtorService.create.mock.calls[0];
      expect(tenantArg).toBe(TENANT);
      expect(payload).toMatchObject({
        companyName: 'Acme',
        country: 'GHA',
        idempotencyKey: 'k-debtor-001',
      });
    });
  });

  // ─── GET /v1/debtors/:id ─────────────────────────────────────────────

  describe('GET /v1/debtors/:id', () => {
    it('forwards tenantId + id to DebtorService.findById', async () => {
      const { controller, debtorService } = makeMocks();
      const fake = { id: 'debtor-1', companyName: 'Acme' };
      debtorService.findById.mockResolvedValue(fake);

      const result = await controller.getDebtor(makeReq(), 'debtor-1');

      expect(result).toBe(fake);
      expect(debtorService.findById).toHaveBeenCalledWith(TENANT, 'debtor-1');
    });
  });
});
