/**
 * InvoiceOfferExpiryJob — Sprint 12 pre-S13 FIX 1 (F-IF-1).
 *
 * Tests the per-tenant fan-out wrapper. Mirrors the structure of
 * cooling-off-expiry.job.spec.ts (with the corrected enterTenantContext
 * mock from FIX-COOLING-OFF-EXPIRY-TESTS-2026-05-03.md).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, InvoiceStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { InvoiceOfferExpiryJob } from './invoice-offer-expiry.job';

describe('InvoiceOfferExpiryJob', () => {
  let job: InvoiceOfferExpiryJob;
  let prisma: any;
  let eventBus: any;

  const mockTenants = [
    { id: 'tenant-1', name: 'Tenant A', status: 'active', deletedAt: null },
    { id: 'tenant-2', name: 'Tenant B', status: 'active', deletedAt: null },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceOfferExpiryJob,
        {
          provide: PrismaService,
          useValue: {
            // Pass-through enterTenantContext for both the platform-admin
            // tenant lookup and the per-tenant work — RLS isn't relevant
            // to unit tests.
            enterTenantContext: jest.fn().mockImplementation(
              async (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
            ),
            tenant: { findMany: jest.fn() },
            invoice: {
              findMany: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: EventBusService,
          useValue: { emitAndBuild: jest.fn() },
        },
      ],
    }).compile();

    job = module.get(InvoiceOfferExpiryJob);
    prisma = module.get(PrismaService);
    eventBus = module.get(EventBusService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('should cancel expired offers for each active tenant', async () => {
    prisma.tenant.findMany.mockResolvedValue(mockTenants);
    // Tenant A has 2 expired offers, tenant B has 1.
    prisma.invoice.findMany
      .mockResolvedValueOnce([
        { id: 'inv-A1', tenantId: 'tenant-1' },
        { id: 'inv-A2', tenantId: 'tenant-1' },
      ])
      .mockResolvedValueOnce([
        { id: 'inv-B1', tenantId: 'tenant-2' },
      ]);

    await job.handleCron();

    // Tenant lookup ran under platform-admin, then once per tenant.
    expect(prisma.enterTenantContext).toHaveBeenCalledTimes(3);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active', deletedAt: null },
    });

    // Each expired invoice updated + INVOICE_CANCELLED emitted.
    expect(prisma.invoice.update).toHaveBeenCalledTimes(3);
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-A1' },
      data: { status: InvoiceStatus.cancelled },
    });
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.INVOICE_CANCELLED,
      'tenant-1',
      { invoiceId: 'inv-A1', reason: 'offer_expired' },
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.INVOICE_CANCELLED,
      'tenant-2',
      { invoiceId: 'inv-B1', reason: 'offer_expired' },
    );
    expect(eventBus.emitAndBuild).toHaveBeenCalledTimes(3);

    // The findMany predicate filters by status + offerExpiresAt < now.
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: InvoiceStatus.offer_generated,
          offerExpiresAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });

  it('should continue processing other tenants if one fails', async () => {
    prisma.tenant.findMany.mockResolvedValue(mockTenants);
    // Tenant A's findMany throws; tenant B should still process.
    prisma.invoice.findMany
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce([{ id: 'inv-B1', tenantId: 'tenant-2' }]);

    await job.handleCron();

    // Tenant B's invoice still processed.
    expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
    expect(eventBus.emitAndBuild).toHaveBeenCalledTimes(1);
  });

  it('should handle no expired offers gracefully', async () => {
    prisma.tenant.findMany.mockResolvedValue(mockTenants);
    prisma.invoice.findMany.mockResolvedValue([]);

    await job.handleCron();

    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });
});
