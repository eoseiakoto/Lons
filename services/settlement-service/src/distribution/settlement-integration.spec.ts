import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaService,
  RepaymentStatus,
  RevenueDistributionModel,
  SettlementStatus,
} from '@lons/database';
import { EventBusService } from '@lons/common';

import { SettlementService } from '../settlement.service';
import { RevenueDistributionService } from './revenue-distribution.service';
import { PercentageSplitStrategy } from './strategies/percentage-split.strategy';
import { TieredStrategy } from './strategies/tiered.strategy';
import { FixedFeeStrategy } from './strategies/fixed-fee.strategy';
import { WaterfallStrategy } from './strategies/waterfall.strategy';

/**
 * S18-9 — End-to-end SettlementService integration with each of the four
 * distribution models. Each test wires a different RevenueDistributionConfig
 * row, runs `calculateSettlement`, and asserts the persisted SettlementLine
 * shape matches the strategy's output.
 *
 * The Prisma mock here is intentionally narrower than the broader pipeline
 * test in `__tests__/post-processing.integration.spec.ts` — we only need
 * the surface SettlementService touches: repayment.findMany, tenant,
 * disbursement.aggregate, settlementRun.create, settlementLine.create,
 * product.findUnique, revenueDistributionConfig.findFirst.
 */
describe('SettlementService — distribution integration', () => {
  let settlement: SettlementService;
  let prisma: any;
  let createdLines: any[];

  const tenantId = 'tenant-7';
  const periodStart = new Date('2026-05-01');
  const periodEnd = new Date('2026-05-31');

  const buildRepayment = (overrides: any = {}) => ({
    id: 'r1',
    tenantId,
    status: RepaymentStatus.completed,
    completedAt: new Date('2026-05-15'),
    allocatedInterest: '8000.0000',
    allocatedFees: '1500.0000',
    allocatedPenalties: '500.0000',
    contract: { product: { id: 'p1' } },
    ...overrides,
  });

  beforeEach(async () => {
    createdLines = [];
    prisma = {
      repayment: { findMany: jest.fn().mockResolvedValue([buildRepayment()]) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ platformFeePercent: '5' }) },
      disbursement: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: '1200000.0000' } }),
      },
      settlementRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'run-1', lines: createdLines }),
      },
      settlementLine: {
        create: jest.fn().mockImplementation((args: any) => {
          createdLines.push(args.data);
          return Promise.resolve(args.data);
        }),
      },
      product: { findUnique: jest.fn().mockResolvedValue(null) }, // no per-product splits
      revenueDistributionConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        RevenueDistributionService,
        PercentageSplitStrategy,
        TieredStrategy,
        FixedFeeStrategy,
        WaterfallStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: { emitAndBuild: jest.fn() } },
      ],
    }).compile();

    settlement = module.get<SettlementService>(SettlementService);
  });

  describe('legacy fallback (no config rows)', () => {
    it('produces platform + sp lines with platform on interest only', async () => {
      await settlement.calculateSettlement(tenantId, periodStart, periodEnd);

      // total interest = 8000, platform fee = 5% of 8000 = 400
      // sp = 10000 - 400 = 9600
      expect(createdLines).toHaveLength(2);
      expect(createdLines[0]).toMatchObject({
        partyType: 'platform',
        shareAmount: '400.0000',
        grossRevenue: '8000.0000',
      });
      expect(createdLines[1]).toMatchObject({
        partyType: 'sp',
        partyId: tenantId,
        shareAmount: '9600.0000',
      });
    });
  });

  describe('tenant-default percentage_split', () => {
    it('applies percentage_split to total revenue (not just interest)', async () => {
      prisma.revenueDistributionConfig.findFirst.mockImplementation(({ where }: any) => {
        if (where.productId === null) {
          return Promise.resolve({
            id: 'cfg-tenant',
            model: RevenueDistributionModel.percentage_split,
            config: {
              parties: [
                { partyType: 'platform', partyId: 'lons-platform', percentage: '10.0000' },
                { partyType: 'sp', partyId: tenantId, percentage: '90.0000' },
              ],
            },
          });
        }
        return Promise.resolve(null);
      });

      await settlement.calculateSettlement(tenantId, periodStart, periodEnd);

      // total = 10000. platform = 10% = 1000. sp = 90% = 9000.
      expect(createdLines).toHaveLength(2);
      expect(createdLines[0]).toMatchObject({ partyType: 'platform', shareAmount: '1000.0000' });
      expect(createdLines[1]).toMatchObject({ partyType: 'sp', shareAmount: '9000.0000' });
    });
  });

  describe('tenant-default tiered', () => {
    it('selects the correct rate band by disbursement volume', async () => {
      prisma.revenueDistributionConfig.findFirst.mockImplementation(({ where }: any) => {
        if (where.productId === null) {
          return Promise.resolve({
            id: 'cfg-tiered',
            model: RevenueDistributionModel.tiered,
            config: {
              tiers: [
                { upTo: '500000.0000', platformPercentage: '8.0000' },
                { upTo: '2000000.0000', platformPercentage: '5.0000' },
                { upTo: null, platformPercentage: '3.0000' },
              ],
            },
          });
        }
        return Promise.resolve(null);
      });
      // Volume mock = 1.2M → falls in middle tier (5%).
      await settlement.calculateSettlement(tenantId, periodStart, periodEnd);

      expect(createdLines).toHaveLength(2);
      expect(createdLines[0]).toMatchObject({ partyType: 'platform', shareAmount: '500.0000' });
      expect(createdLines[1]).toMatchObject({ partyType: 'sp', shareAmount: '9500.0000' });
    });
  });

  describe('tenant-default fixed_fee', () => {
    it('deducts fixed fees in order and routes remainder', async () => {
      prisma.revenueDistributionConfig.findFirst.mockImplementation(({ where }: any) => {
        if (where.productId === null) {
          return Promise.resolve({
            id: 'cfg-fee',
            model: RevenueDistributionModel.fixed_fee,
            config: {
              fixedFees: [
                { partyType: 'platform', partyId: 'lons-platform', amount: '2500.0000' },
              ],
              remainderParty: { partyType: 'sp', partyId: tenantId },
            },
          });
        }
        return Promise.resolve(null);
      });

      await settlement.calculateSettlement(tenantId, periodStart, periodEnd);

      expect(createdLines).toHaveLength(2);
      expect(createdLines[0]).toMatchObject({ partyType: 'platform', shareAmount: '2500.0000' });
      expect(createdLines[1]).toMatchObject({ partyType: 'sp', shareAmount: '7500.0000' });
    });
  });

  describe('tenant-default waterfall', () => {
    it('walks deductions sequentially', async () => {
      prisma.revenueDistributionConfig.findFirst.mockImplementation(({ where }: any) => {
        if (where.productId === null) {
          return Promise.resolve({
            id: 'cfg-water',
            model: RevenueDistributionModel.waterfall,
            config: {
              waterfall: [
                { partyType: 'platform', partyId: 'lons-platform', deduction: { type: 'percentage', value: '5.0000' } },
                { partyType: 'lender', partyId: 'lender-1', deduction: { type: 'fixed', value: '1000.0000' } },
                { partyType: 'sp', partyId: tenantId, deduction: { type: 'remainder' } },
              ],
            },
          });
        }
        return Promise.resolve(null);
      });

      await settlement.calculateSettlement(tenantId, periodStart, periodEnd);

      // 10000 → 5% = 500 platform, remaining 9500 → fixed 1000 lender,
      // remaining 8500 → remainder sp
      expect(createdLines).toHaveLength(3);
      expect(createdLines[0]).toMatchObject({ partyType: 'platform', shareAmount: '500.0000' });
      expect(createdLines[1]).toMatchObject({ partyType: 'lender', shareAmount: '1000.0000' });
      expect(createdLines[2]).toMatchObject({ partyType: 'sp', shareAmount: '8500.0000' });
    });
  });

  describe('settlement run metadata', () => {
    it('creates a single SettlementRun per call (idempotency preserved)', async () => {
      await settlement.calculateSettlement(tenantId, periodStart, periodEnd);
      expect(prisma.settlementRun.create).toHaveBeenCalledTimes(1);
      expect(prisma.settlementRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            periodStart,
            periodEnd,
            status: SettlementStatus.calculated,
            totalRevenue: '10000.0000',
          }),
        }),
      );
    });
  });
});
