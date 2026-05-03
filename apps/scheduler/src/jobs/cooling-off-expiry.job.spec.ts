import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@lons/database';
import { CoolingOffService } from '@lons/process-engine';

import { CoolingOffExpiryJob } from './cooling-off-expiry.job';

describe('CoolingOffExpiryJob', () => {
  let job: CoolingOffExpiryJob;
  let prisma: PrismaService;
  let coolingOffService: CoolingOffService;

  const mockTenants = [
    { id: 'tenant-1', name: 'Tenant A', status: 'active', deletedAt: null },
    { id: 'tenant-2', name: 'Tenant B', status: 'active', deletedAt: null },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoolingOffExpiryJob,
        {
          provide: PrismaService,
          useValue: {
            tenant: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: CoolingOffService,
          useValue: {
            expireCoolingOffContracts: jest.fn(),
          },
        },
      ],
    }).compile();

    job = module.get<CoolingOffExpiryJob>(CoolingOffExpiryJob);
    prisma = module.get<PrismaService>(PrismaService);
    coolingOffService = module.get<CoolingOffService>(CoolingOffService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('should call expireCoolingOffContracts for each active tenant', async () => {
    jest.spyOn(prisma.tenant, 'findMany').mockResolvedValue(mockTenants as any);
    jest.spyOn(coolingOffService, 'expireCoolingOffContracts')
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);

    await job.handleCron();

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active', deletedAt: null },
    });
    expect(coolingOffService.expireCoolingOffContracts).toHaveBeenCalledTimes(2);
    expect(coolingOffService.expireCoolingOffContracts).toHaveBeenCalledWith('tenant-1');
    expect(coolingOffService.expireCoolingOffContracts).toHaveBeenCalledWith('tenant-2');
  });

  it('should continue processing other tenants if one fails', async () => {
    jest.spyOn(prisma.tenant, 'findMany').mockResolvedValue(mockTenants as any);
    jest.spyOn(coolingOffService, 'expireCoolingOffContracts')
      .mockRejectedValueOnce(new Error('DB Error'))
      .mockResolvedValueOnce(1);

    await job.handleCron();

    expect(coolingOffService.expireCoolingOffContracts).toHaveBeenCalledTimes(2);
  });

  it('should handle no active tenants gracefully', async () => {
    jest.spyOn(prisma.tenant, 'findMany').mockResolvedValue([]);

    await job.handleCron();

    expect(coolingOffService.expireCoolingOffContracts).not.toHaveBeenCalled();
  });
});
