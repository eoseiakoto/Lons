import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, RevenueDistributionModel } from '@lons/database';

import { RevenueDistributionService } from './revenue-distribution.service';
import { PercentageSplitStrategy } from './strategies/percentage-split.strategy';
import { TieredStrategy } from './strategies/tiered.strategy';
import { FixedFeeStrategy } from './strategies/fixed-fee.strategy';
import { WaterfallStrategy } from './strategies/waterfall.strategy';

describe('RevenueDistributionService', () => {
  let service: RevenueDistributionService;
  let prisma: {
    revenueDistributionConfig: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    tenant: { findUnique: jest.Mock };
  };

  const tenantId = 'tenant-1';
  const productId = 'product-9';

  const baseInput = {
    totalRevenue: '10000.0000',
    periodStart: new Date('2026-05-01'),
    periodEnd: new Date('2026-05-31'),
  };

  beforeEach(async () => {
    prisma = {
      revenueDistributionConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ platformFeePercent: '5' }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenueDistributionService,
        PercentageSplitStrategy,
        TieredStrategy,
        FixedFeeStrategy,
        WaterfallStrategy,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<RevenueDistributionService>(RevenueDistributionService);
  });

  describe('resolution chain', () => {
    it('uses product-specific config when present', async () => {
      const productConfig = {
        id: 'cfg-prod',
        tenantId,
        productId,
        model: RevenueDistributionModel.fixed_fee,
        config: {
          fixedFees: [{ partyType: 'platform', partyId: 'lons-platform', amount: '500.0000' }],
          remainderParty: { partyType: 'sp', partyId: tenantId },
        },
        priority: 0,
        isActive: true,
      };
      prisma.revenueDistributionConfig.findFirst
        .mockResolvedValueOnce(productConfig) // product lookup
        .mockResolvedValue(null);

      const result = await service.distribute(tenantId, productId, baseInput);

      expect(result.source).toBe('product');
      expect(result.model).toBe(RevenueDistributionModel.fixed_fee);
      expect(result.lines[0].partyType).toBe('platform');
      expect(result.lines[0].shareAmount).toBe('500.0000');
      expect(result.lines[1].shareAmount).toBe('9500.0000');
    });

    it('falls back to tenant-default when product config absent', async () => {
      const tenantConfig = {
        id: 'cfg-tenant',
        tenantId,
        productId: null,
        model: RevenueDistributionModel.percentage_split,
        config: {
          parties: [
            { partyType: 'platform', partyId: 'lons-platform', percentage: '10.0000' },
            { partyType: 'sp', partyId: tenantId, percentage: '90.0000' },
          ],
        },
        priority: 0,
        isActive: true,
      };
      prisma.revenueDistributionConfig.findFirst
        .mockResolvedValueOnce(null) // product lookup
        .mockResolvedValueOnce(tenantConfig); // tenant lookup

      const result = await service.distribute(tenantId, productId, baseInput);

      expect(result.source).toBe('tenant');
      expect(result.model).toBe(RevenueDistributionModel.percentage_split);
      expect(result.lines[0].shareAmount).toBe('1000.0000');
      expect(result.lines[1].shareAmount).toBe('9000.0000');
    });

    it('falls back to legacy percentage_split from tenant.platformFeePercent', async () => {
      prisma.revenueDistributionConfig.findFirst.mockResolvedValue(null);
      prisma.tenant.findUnique.mockResolvedValue({ platformFeePercent: '7.5' });

      const result = await service.distribute(tenantId, productId, baseInput);

      expect(result.source).toBe('legacy');
      expect(result.model).toBe(RevenueDistributionModel.percentage_split);
      expect(result.config).toBeNull(); // no DB row
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toMatchObject({ partyType: 'platform', shareAmount: '750.0000' });
      expect(result.lines[1]).toMatchObject({ partyType: 'sp', partyId: tenantId, shareAmount: '9250.0000' });
    });

    it('legacy fallback uses 0% when tenant has no platformFeePercent', async () => {
      prisma.revenueDistributionConfig.findFirst.mockResolvedValue(null);
      prisma.tenant.findUnique.mockResolvedValue({ platformFeePercent: null });

      const result = await service.distribute(tenantId, null, baseInput);

      expect(result.lines[0].shareAmount).toBe('0.0000');
      expect(result.lines[1].shareAmount).toBe('10000.0000');
    });

    it('skips product lookup when productId is null', async () => {
      prisma.revenueDistributionConfig.findFirst.mockResolvedValue(null);
      await service.distribute(tenantId, null, baseInput);

      // Only one findFirst call (tenant default), no product lookup.
      expect(prisma.revenueDistributionConfig.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.revenueDistributionConfig.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ productId: null }),
        }),
      );
    });
  });

  describe('strategy dispatch', () => {
    it('routes tiered model to TieredStrategy', async () => {
      prisma.revenueDistributionConfig.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          model: RevenueDistributionModel.tiered,
          config: {
            tiers: [
              { upTo: '1000000.0000', platformPercentage: '6.0000' },
              { upTo: null, platformPercentage: '3.0000' },
            ],
          },
        });

      const result = await service.distribute(tenantId, productId, {
        ...baseInput,
        monthlyDisbursementVolume: '500000',
      });

      expect(result.model).toBe(RevenueDistributionModel.tiered);
      expect(result.lines[0].sharePercentage).toBe('6.0000');
    });

    it('routes waterfall model to WaterfallStrategy', async () => {
      prisma.revenueDistributionConfig.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          model: RevenueDistributionModel.waterfall,
          config: {
            waterfall: [
              { partyType: 'p', partyId: 'p', deduction: { type: 'fixed', value: '1000.0000' } },
              { partyType: 's', partyId: 's', deduction: { type: 'remainder' } },
            ],
          },
        });

      const result = await service.distribute(tenantId, productId, baseInput);

      expect(result.model).toBe(RevenueDistributionModel.waterfall);
      expect(result.lines[0].shareAmount).toBe('1000.0000');
      expect(result.lines[1].shareAmount).toBe('9000.0000');
    });
  });

  describe('listConfigs', () => {
    it('returns active configs for the tenant', async () => {
      const cfgs = [{ id: 'a' }, { id: 'b' }];
      prisma.revenueDistributionConfig.findMany.mockResolvedValue(cfgs);
      const result = await service.listConfigs(tenantId);
      expect(result).toBe(cfgs);
      expect(prisma.revenueDistributionConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId, deletedAt: null }),
        }),
      );
    });

    it('filters by productId when provided', async () => {
      await service.listConfigs(tenantId, productId);
      expect(prisma.revenueDistributionConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ productId }),
        }),
      );
    });

    it('filters by null productId (tenant-default only) when productId is null', async () => {
      await service.listConfigs(tenantId, null);
      expect(prisma.revenueDistributionConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ productId: null }),
        }),
      );
    });
  });
});
