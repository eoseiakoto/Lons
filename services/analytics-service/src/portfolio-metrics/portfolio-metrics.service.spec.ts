import { Test, TestingModule } from '@nestjs/testing';
import { ContractClassification, ContractStatus, PrismaService } from '@lons/database';

import { PortfolioMetricsService } from './portfolio-metrics.service';
import { PortfolioMetricsFilters } from './portfolio-metrics.types';

/**
 * S18-10 — PortfolioMetricsService specs.
 *
 * Strategy: fully mock prisma.contract.findMany, return canned contract
 * arrays, and assert the derived aggregates. We also capture the `where`
 * clause to verify the filter shape going into Prisma matches the
 * expected AND semantics.
 */
describe('PortfolioMetricsService', () => {
  let service: PortfolioMetricsService;
  let findMany: jest.Mock;

  const tenantId = 'tenant-1';

  const contract = (overrides: any = {}) => ({
    id: overrides.id ?? `c-${Math.random()}`,
    daysPastDue: 0,
    totalOutstanding: '1000.0000',
    outstandingPrincipal: '900.0000',
    classification: ContractClassification.performing,
    ...overrides,
  });

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioMetricsService,
        { provide: PrismaService, useValue: { contract: { findMany } } },
      ],
    }).compile();
    service = module.get<PortfolioMetricsService>(PortfolioMetricsService);
  });

  describe('no filters (backward compat)', () => {
    it('returns zero metrics for empty contract set', async () => {
      const result = await service.getMetrics(tenantId);
      expect(result.activeLoans).toBe(0);
      expect(result.activeOutstanding).toBe('0.0000');
      expect(result.nplRatio).toBe('0.0000');
      expect(result.provisioning.total).toBe('0.0000');
    });

    it('computes activeLoans and activeOutstanding correctly', async () => {
      findMany.mockResolvedValue([
        contract({ totalOutstanding: '1000.0000', outstandingPrincipal: '900.0000' }),
        contract({ totalOutstanding: '500.0000', outstandingPrincipal: '400.0000' }),
      ]);
      const result = await service.getMetrics(tenantId);
      expect(result.activeLoans).toBe(2);
      expect(result.activeOutstanding).toBe('1500.0000');
    });

    it('computes PAR buckets at all thresholds', async () => {
      findMany.mockResolvedValue([
        contract({ daysPastDue: 0, outstandingPrincipal: '1000.0000' }),
        contract({ daysPastDue: 5, outstandingPrincipal: '500.0000' }),
        contract({ daysPastDue: 35, outstandingPrincipal: '300.0000' }),
        contract({ daysPastDue: 95, outstandingPrincipal: '200.0000' }),
      ]);
      const result = await service.getMetrics(tenantId);

      // Total principal = 2000
      expect(result.parAt1.count).toBe(3); // dpd >= 1: 5, 35, 95
      expect(result.parAt1.amount).toBe('1000.0000'); // 500+300+200
      expect(result.parAt1.pct).toBe('0.5000'); // 1000 / 2000

      expect(result.parAt7.count).toBe(2); // dpd >= 7: 35, 95
      expect(result.parAt30.count).toBe(2); // dpd >= 30: 35, 95
      expect(result.parAt60.count).toBe(1); // dpd >= 60: 95
      expect(result.parAt90.count).toBe(1); // dpd >= 90: 95
      expect(result.parAt90.amount).toBe('200.0000');
      expect(result.parAt90.pct).toBe('0.1000'); // 200 / 2000
    });

    it('computes NPL ratio across substandard + doubtful + loss', async () => {
      findMany.mockResolvedValue([
        contract({ classification: ContractClassification.performing, outstandingPrincipal: '1000.0000' }),
        contract({ classification: ContractClassification.substandard, outstandingPrincipal: '300.0000' }),
        contract({ classification: ContractClassification.doubtful, outstandingPrincipal: '200.0000' }),
        contract({ classification: ContractClassification.loss, outstandingPrincipal: '100.0000' }),
      ]);
      const result = await service.getMetrics(tenantId);
      // NPL = 300 + 200 + 100 = 600. Total = 1600. Ratio = 600/1600 = 0.375
      expect(result.nplRatio).toBe('0.3750');
    });

    it('computes provisioning per classification', async () => {
      findMany.mockResolvedValue([
        contract({ classification: ContractClassification.performing, outstandingPrincipal: '10000.0000' }),
        contract({ classification: ContractClassification.special_mention, outstandingPrincipal: '5000.0000' }),
        contract({ classification: ContractClassification.substandard, outstandingPrincipal: '2000.0000' }),
        contract({ classification: ContractClassification.doubtful, outstandingPrincipal: '1000.0000' }),
        contract({ classification: ContractClassification.loss, outstandingPrincipal: '500.0000' }),
      ]);
      const result = await service.getMetrics(tenantId);
      // performing: 10000 * 1% = 100
      // special_mention: 5000 * 5% = 250
      // substandard: 2000 * 20% = 400
      // doubtful: 1000 * 50% = 500
      // loss: 500 * 100% = 500
      // total = 1750
      expect(result.provisioning.performing).toBe('100.0000');
      expect(result.provisioning.specialMention).toBe('250.0000');
      expect(result.provisioning.substandard).toBe('400.0000');
      expect(result.provisioning.doubtful).toBe('500.0000');
      expect(result.provisioning.loss).toBe('500.0000');
      expect(result.provisioning.total).toBe('1750.0000');
    });

    it('always scopes to tenantId and active statuses', async () => {
      await service.getMetrics(tenantId);
      const callArgs = findMany.mock.calls[0][0];
      expect(callArgs.where.tenantId).toBe(tenantId);
      expect(callArgs.where.status.in).toContain(ContractStatus.active);
      expect(callArgs.where.status.in).toContain(ContractStatus.performing);
      expect(callArgs.where.status.in).toContain(ContractStatus.overdue);
      // Note: Contract has no `deletedAt` column — inactive contracts are
      // filtered out via the status enum, not a soft-delete flag.
      expect(callArgs.where.deletedAt).toBeUndefined();
    });
  });

  describe('filtering', () => {
    it('filters by productId', async () => {
      await service.getMetrics(tenantId, { productId: 'product-9' });
      expect(findMany.mock.calls[0][0].where.productId).toBe('product-9');
    });

    it('filters by productType via nested product.type clause', async () => {
      await service.getMetrics(tenantId, { productType: 'micro_loan' });
      // Schema column is Product.type (enum), exposed at the resolver
      // boundary as `productType` for readability.
      expect(findMany.mock.calls[0][0].where.product).toEqual({ type: 'micro_loan' });
    });

    it('filters by lenderId', async () => {
      await service.getMetrics(tenantId, { lenderId: 'lender-1' });
      expect(findMany.mock.calls[0][0].where.lenderId).toBe('lender-1');
    });

    it('filters by region via nested customer clause', async () => {
      await service.getMetrics(tenantId, { region: 'Greater Accra' });
      expect(findMany.mock.calls[0][0].where.customer).toEqual({ region: 'Greater Accra' });
    });

    it('filters by customerSegment via nested customer clause', async () => {
      await service.getMetrics(tenantId, { customerSegment: 'sme' });
      expect(findMany.mock.calls[0][0].where.customer).toEqual({ segment: 'sme' });
    });

    it('merges region + customerSegment into one customer clause (not overwrite)', async () => {
      await service.getMetrics(tenantId, {
        region: 'Greater Accra',
        customerSegment: 'sme',
      });
      expect(findMany.mock.calls[0][0].where.customer).toEqual({
        region: 'Greater Accra',
        segment: 'sme',
      });
    });

    it('applies dateFrom / dateTo as createdAt range', async () => {
      const from = new Date('2026-01-01');
      const to = new Date('2026-03-31');
      await service.getMetrics(tenantId, { dateFrom: from, dateTo: to });
      expect(findMany.mock.calls[0][0].where.createdAt).toEqual({ gte: from, lte: to });
    });

    it('combines multiple filters with AND semantics', async () => {
      const filters: PortfolioMetricsFilters = {
        productId: 'product-9',
        productType: 'micro_loan',
        lenderId: 'lender-1',
        region: 'Greater Accra',
        customerSegment: 'sme',
      };
      await service.getMetrics(tenantId, filters);
      const where = findMany.mock.calls[0][0].where;
      expect(where.productId).toBe('product-9');
      expect(where.product).toEqual({ type: 'micro_loan' });
      expect(where.lenderId).toBe('lender-1');
      expect(where.customer).toEqual({ region: 'Greater Accra', segment: 'sme' });
    });

    it('ignores undefined / null / empty-string filter values', async () => {
      await service.getMetrics(tenantId, {
        productId: undefined,
        productType: null,
        lenderId: '',
      });
      const where = findMany.mock.calls[0][0].where;
      expect(where.productId).toBeUndefined();
      expect(where.product).toBeUndefined();
      expect(where.lenderId).toBeUndefined();
    });

    it('returns empty metrics when filters match no contracts', async () => {
      findMany.mockResolvedValue([]);
      const result = await service.getMetrics(tenantId, { productId: 'nonexistent' });
      expect(result.activeLoans).toBe(0);
      expect(result.parAt30.count).toBe(0);
      expect(result.nplRatio).toBe('0.0000');
    });
  });

  describe('PII safety', () => {
    it('never selects customer-identifying fields', async () => {
      await service.getMetrics(tenantId);
      const selected = findMany.mock.calls[0][0].select;
      // We only select aggregation-relevant fields. No fullName, no
      // nationalId, no phone — anything that would leak PII.
      expect(selected).toEqual({
        id: true,
        daysPastDue: true,
        totalOutstanding: true,
        outstandingPrincipal: true,
        classification: true,
      });
    });
  });
});
