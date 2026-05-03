/**
 * InvoiceAgingJob — Sprint 12 Phase 6A.
 *
 * Tests the per-tenant fan-out wrapper. The aging logic itself lives in
 * `services/process-engine/src/factoring/invoice-aging.service.spec.ts`.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@lons/database';
import { InvoiceAgingService } from '@lons/process-engine';

import { InvoiceAgingJob } from './invoice-aging.job';

describe('InvoiceAgingJob', () => {
  let job: InvoiceAgingJob;
  let prisma: PrismaService;
  let invoiceAgingService: InvoiceAgingService;

  const mockTenants = [
    { id: 'tenant-1', name: 'Tenant A', status: 'active', deletedAt: null },
    { id: 'tenant-2', name: 'Tenant B', status: 'active', deletedAt: null },
  ];

  const emptyResult = {
    totalScanned: 0,
    newDefaults: [],
    transitions: 0,
    byBucket: {
      Current: 0,
      Approaching: 0,
      Due: 0,
      Grace: 0,
      Overdue: 0,
      SeriouslyOverdue: 0,
      Default: 0,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceAgingJob,
        {
          provide: PrismaService,
          useValue: {
            // Pass through enterTenantContext for both the platform-admin
            // tenant lookup and the per-tenant work — RLS isn't under test
            // here.
            enterTenantContext: jest.fn().mockImplementation(
              async (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
            ),
            tenant: { findMany: jest.fn() },
          },
        },
        {
          provide: InvoiceAgingService,
          useValue: { processAging: jest.fn() },
        },
      ],
    }).compile();

    job = module.get<InvoiceAgingJob>(InvoiceAgingJob);
    prisma = module.get<PrismaService>(PrismaService);
    invoiceAgingService = module.get<InvoiceAgingService>(InvoiceAgingService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('fans out processAging per active tenant', async () => {
    jest.spyOn(prisma.tenant, 'findMany').mockResolvedValue(mockTenants as any);
    jest
      .spyOn(invoiceAgingService, 'processAging')
      .mockResolvedValueOnce({
        totalScanned: 5,
        newDefaults: ['inv-1'],
        transitions: 2,
        byBucket: emptyResult.byBucket,
      })
      .mockResolvedValueOnce(emptyResult);

    await job.handleCron();

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active', deletedAt: null },
    });
    expect(invoiceAgingService.processAging).toHaveBeenCalledTimes(2);
    expect(invoiceAgingService.processAging).toHaveBeenCalledWith('tenant-1');
    expect(invoiceAgingService.processAging).toHaveBeenCalledWith('tenant-2');
  });

  it('continues processing remaining tenants if one tenant throws', async () => {
    jest.spyOn(prisma.tenant, 'findMany').mockResolvedValue(mockTenants as any);
    jest
      .spyOn(invoiceAgingService, 'processAging')
      .mockRejectedValueOnce(new Error('DB went away'))
      .mockResolvedValueOnce(emptyResult);

    await expect(job.handleCron()).resolves.not.toThrow();

    expect(invoiceAgingService.processAging).toHaveBeenCalledTimes(2);
    expect(invoiceAgingService.processAging).toHaveBeenNthCalledWith(
      1,
      'tenant-1',
    );
    expect(invoiceAgingService.processAging).toHaveBeenNthCalledWith(
      2,
      'tenant-2',
    );
  });

  it('handles an empty tenant list as a no-op', async () => {
    jest.spyOn(prisma.tenant, 'findMany').mockResolvedValue([]);

    await job.handleCron();

    expect(invoiceAgingService.processAging).not.toHaveBeenCalled();
  });
});
