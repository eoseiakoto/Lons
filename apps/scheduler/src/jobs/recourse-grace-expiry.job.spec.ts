/**
 * RecourseGraceExpiryJob — Sprint 13 S13-3.
 *
 * Tests the per-tenant fan-out wrapper. Mirrors the structure of
 * invoice-offer-expiry.job.spec.ts (same enterTenantContext pass-through
 * mock) and covers:
 *   - should be defined
 *   - should call enforceGracePeriodElapsed for invoices past their
 *     grace end and not yet enforced
 *   - should skip invoices where grace has not elapsed yet
 *   - should skip invoices already enforced (recourseEnforcedAt present)
 *   - should continue processing other invoices/tenants if one throws
 *   - should handle no candidate invoices gracefully
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, InvoiceStatus, RecourseType } from '@lons/database';
import { RecourseService } from '@lons/process-engine';

import { RecourseGraceExpiryJob } from './recourse-grace-expiry.job';

describe('RecourseGraceExpiryJob', () => {
  let job: RecourseGraceExpiryJob;
  let prisma: any;
  let recourseService: any;

  const mockTenants = [
    { id: 'tenant-1', name: 'Tenant A', status: 'active', deletedAt: null },
    { id: 'tenant-2', name: 'Tenant B', status: 'active', deletedAt: null },
  ];

  const yesterday = () =>
    new Date(Date.now() - 1 * 86_400_000).toISOString();
  const tomorrow = () =>
    new Date(Date.now() + 1 * 86_400_000).toISOString();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecourseGraceExpiryJob,
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
            invoice: { findMany: jest.fn() },
          },
        },
        {
          provide: RecourseService,
          useValue: {
            enforceGracePeriodElapsed: jest.fn(),
          },
        },
      ],
    }).compile();

    job = module.get(RecourseGraceExpiryJob);
    prisma = module.get(PrismaService);
    recourseService = module.get(RecourseService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('should call enforceGracePeriodElapsed for invoices past their grace end and not yet enforced', async () => {
    prisma.tenant.findMany.mockResolvedValue(mockTenants);
    // Tenant A has 2 invoices ready for enforcement, tenant B has 1.
    prisma.invoice.findMany
      .mockResolvedValueOnce([
        {
          id: 'inv-A1',
          tenantId: 'tenant-1',
          metadata: {
            recourseGraceEndAt: yesterday(),
            recourseAmount: '90000.0000',
          },
        },
        {
          id: 'inv-A2',
          tenantId: 'tenant-1',
          metadata: {
            recourseGraceEndAt: yesterday(),
            recourseAmount: '50000.0000',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'inv-B1',
          tenantId: 'tenant-2',
          metadata: {
            recourseGraceEndAt: yesterday(),
            recourseAmount: '12000.0000',
          },
        },
      ]);

    recourseService.enforceGracePeriodElapsed.mockResolvedValue({
      action: 'collections_routed',
      amount: '0',
    });

    await job.handleCron();

    // Tenant lookup ran under platform-admin, then once per tenant.
    expect(prisma.enterTenantContext).toHaveBeenCalledTimes(3);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active', deletedAt: null },
    });

    // Each candidate invoice gets enforced.
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledTimes(3);
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledWith(
      'tenant-1',
      'inv-A1',
    );
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledWith(
      'tenant-1',
      'inv-A2',
    );
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledWith(
      'tenant-2',
      'inv-B1',
    );

    // The findMany predicate filters by status + recourseType + JSON path.
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: InvoiceStatus.defaulted,
          recourseType: RecourseType.with_recourse,
          metadata: expect.objectContaining({
            path: ['recourseGraceEndAt'],
          }),
        }),
      }),
    );
  });

  it('should skip invoices where grace has not elapsed yet', async () => {
    prisma.tenant.findMany.mockResolvedValue([mockTenants[0]]);
    prisma.invoice.findMany.mockResolvedValueOnce([
      {
        id: 'inv-future',
        tenantId: 'tenant-1',
        metadata: {
          recourseGraceEndAt: tomorrow(),
          recourseAmount: '90000.0000',
        },
      },
      {
        id: 'inv-past',
        tenantId: 'tenant-1',
        metadata: {
          recourseGraceEndAt: yesterday(),
          recourseAmount: '90000.0000',
        },
      },
    ]);

    recourseService.enforceGracePeriodElapsed.mockResolvedValue({
      action: 'collections_routed',
      amount: '0',
    });

    await job.handleCron();

    // Only the past-grace invoice gets enforced.
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledTimes(1);
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledWith(
      'tenant-1',
      'inv-past',
    );
  });

  it('should skip invoices already enforced (recourseEnforcedAt present)', async () => {
    prisma.tenant.findMany.mockResolvedValue([mockTenants[0]]);
    prisma.invoice.findMany.mockResolvedValueOnce([
      {
        id: 'inv-already',
        tenantId: 'tenant-1',
        metadata: {
          recourseGraceEndAt: yesterday(),
          recourseAmount: '90000.0000',
          recourseEnforcedAt: yesterday(), // already done
        },
      },
      {
        id: 'inv-fresh',
        tenantId: 'tenant-1',
        metadata: {
          recourseGraceEndAt: yesterday(),
          recourseAmount: '50000.0000',
        },
      },
    ]);

    recourseService.enforceGracePeriodElapsed.mockResolvedValue({
      action: 'collections_routed',
      amount: '0',
    });

    await job.handleCron();

    // Only the fresh invoice gets enforced; already-enforced is skipped.
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledTimes(1);
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledWith(
      'tenant-1',
      'inv-fresh',
    );
  });

  it('should continue processing other invoices/tenants if one throws', async () => {
    prisma.tenant.findMany.mockResolvedValue(mockTenants);
    // Tenant A: first invoice errors, second succeeds.
    prisma.invoice.findMany
      .mockResolvedValueOnce([
        {
          id: 'inv-A1',
          tenantId: 'tenant-1',
          metadata: {
            recourseGraceEndAt: yesterday(),
            recourseAmount: '1.0000',
          },
        },
        {
          id: 'inv-A2',
          tenantId: 'tenant-1',
          metadata: {
            recourseGraceEndAt: yesterday(),
            recourseAmount: '2.0000',
          },
        },
      ])
      // Tenant B's findMany throws — whole tenant is isolated.
      .mockRejectedValueOnce(new Error('DB error'));

    recourseService.enforceGracePeriodElapsed
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        action: 'collections_routed',
        amount: '2.0000',
      });

    await job.handleCron();

    // Both A1 (failed) and A2 (succeeded) were attempted; tenant B's
    // failure didn't stop tenant A's run-completion.
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledTimes(2);
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledWith(
      'tenant-1',
      'inv-A1',
    );
    expect(recourseService.enforceGracePeriodElapsed).toHaveBeenCalledWith(
      'tenant-1',
      'inv-A2',
    );
  });

  it('should handle no candidate invoices gracefully', async () => {
    prisma.tenant.findMany.mockResolvedValue(mockTenants);
    prisma.invoice.findMany.mockResolvedValue([]);

    await job.handleCron();

    expect(recourseService.enforceGracePeriodElapsed).not.toHaveBeenCalled();
  });
});
