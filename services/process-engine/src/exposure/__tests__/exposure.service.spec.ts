import { ExposureService } from '../exposure.service';

describe('ExposureService', () => {
  let service: ExposureService;
  let mockPrisma: any;
  let mockEventBus: any;

  beforeEach(() => {
    mockPrisma = {
      contract: { findMany: jest.fn() },
      product: { findMany: jest.fn() },
      tenant: { findFirst: jest.fn() },
    };
    mockEventBus = {
      emitAndBuild: jest.fn(),
    };
    service = new ExposureService(mockPrisma, mockEventBus);
  });

  describe('calculateTotalExposure', () => {
    it('should return zero exposure when customer has no active contracts', async () => {
      mockPrisma.contract.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);

      const result = await service.calculateTotalExposure('tenant-1', 'cust-1');

      expect(result.customerId).toBe('cust-1');
      expect(result.totalExposure).toBe('0.0000');
      expect(result.activeContractCount).toBe(0);
      expect(result.breakdown.microLoan).toBe('0.0000');
      expect(result.breakdown.overdraft).toBe('0.0000');
      expect(result.breakdown.bnpl).toBe('0.0000');
      expect(result.breakdown.invoiceFactoring).toBe('0.0000');
    });

    it('should aggregate outstanding amounts across multiple contracts', async () => {
      mockPrisma.contract.findMany.mockResolvedValue([
        { id: 'c1', totalOutstanding: 10000, productId: 'p1' },
        { id: 'c2', totalOutstanding: 25000, productId: 'p2' },
        { id: 'c3', totalOutstanding: 5000, productId: 'p1' },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', type: 'micro_loan' },
        { id: 'p2', type: 'overdraft' },
      ]);

      const result = await service.calculateTotalExposure('tenant-1', 'cust-1');

      expect(result.totalExposure).toBe('40000.0000');
      expect(result.activeContractCount).toBe(3);
      expect(result.breakdown.microLoan).toBe('15000.0000');
      expect(result.breakdown.overdraft).toBe('25000.0000');
      expect(result.breakdown.bnpl).toBe('0.0000');
      expect(result.breakdown.invoiceFactoring).toBe('0.0000');
    });

    it('should handle all product types correctly', async () => {
      mockPrisma.contract.findMany.mockResolvedValue([
        { id: 'c1', totalOutstanding: 100, productId: 'p1' },
        { id: 'c2', totalOutstanding: 200, productId: 'p2' },
        { id: 'c3', totalOutstanding: 300, productId: 'p3' },
        { id: 'c4', totalOutstanding: 400, productId: 'p4' },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', type: 'micro_loan' },
        { id: 'p2', type: 'overdraft' },
        { id: 'p3', type: 'bnpl' },
        { id: 'p4', type: 'invoice_factoring' },
      ]);

      const result = await service.calculateTotalExposure('tenant-1', 'cust-1');

      expect(result.totalExposure).toBe('1000.0000');
      expect(result.breakdown.microLoan).toBe('100.0000');
      expect(result.breakdown.overdraft).toBe('200.0000');
      expect(result.breakdown.bnpl).toBe('300.0000');
      expect(result.breakdown.invoiceFactoring).toBe('400.0000');
    });
  });

  describe('checkExposureLimit', () => {
    it('should allow when cross-product check is disabled', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        settings: { exposureRules: { enableCrossProductCheck: false } },
      });

      const result = await service.checkExposureLimit('tenant-1', 'cust-1', '50000', 'prod-1');

      expect(result.allowed).toBe(true);
      expect(mockPrisma.contract.findMany).not.toHaveBeenCalled();
    });

    it('should allow when no limit is configured', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        settings: { exposureRules: { enableCrossProductCheck: true, maxCustomerExposure: '0' } },
      });

      const result = await service.checkExposureLimit('tenant-1', 'cust-1', '50000', 'prod-1');

      expect(result.allowed).toBe(true);
    });

    it('should allow when total exposure is under the limit', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        settings: { exposureRules: { enableCrossProductCheck: true, maxCustomerExposure: '500000' } },
      });
      mockPrisma.contract.findMany.mockResolvedValue([
        { id: 'c1', totalOutstanding: 100000, productId: 'p1' },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', type: 'micro_loan' },
      ]);

      const result = await service.checkExposureLimit('tenant-1', 'cust-1', '50000', 'prod-1');

      expect(result.allowed).toBe(true);
      expect(result.currentExposure).toBe('100000.0000');
      expect(result.maxAllowed).toBe('500000');
      expect(parseFloat(result.headroom)).toBe(400000);
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'exposure.limit.check.passed',
        'tenant-1',
        expect.objectContaining({ customerId: 'cust-1' }),
      );
    });

    it('should deny when total exposure would exceed the limit', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        settings: { exposureRules: { enableCrossProductCheck: true, maxCustomerExposure: '500000' } },
      });
      mockPrisma.contract.findMany.mockResolvedValue([
        { id: 'c1', totalOutstanding: 450000, productId: 'p1' },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', type: 'micro_loan' },
      ]);

      const result = await service.checkExposureLimit('tenant-1', 'cust-1', '100000', 'prod-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('TENANT_LIMIT_EXCEEDED');
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'exposure.limit.check.failed',
        'tenant-1',
        expect.objectContaining({
          customerId: 'cust-1',
          exceededBy: '50000.0000',
        }),
      );
    });

    it('should allow when total exposure exactly equals the limit', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        settings: { exposureRules: { enableCrossProductCheck: true, maxCustomerExposure: '500000' } },
      });
      mockPrisma.contract.findMany.mockResolvedValue([
        { id: 'c1', totalOutstanding: 400000, productId: 'p1' },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', type: 'micro_loan' },
      ]);

      const result = await service.checkExposureLimit('tenant-1', 'cust-1', '100000', 'prod-1');

      expect(result.allowed).toBe(true);
      expect(result.headroom).toBe('100000.0000');
    });

    it('should emit warning when approaching 80% of limit', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        settings: { exposureRules: { enableCrossProductCheck: true, maxCustomerExposure: '100000' } },
      });
      mockPrisma.contract.findMany.mockResolvedValue([
        { id: 'c1', totalOutstanding: 75000, productId: 'p1' },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', type: 'micro_loan' },
      ]);

      await service.checkExposureLimit('tenant-1', 'cust-1', '10000', 'prod-1');

      // Should emit both warning and passed events
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'exposure.limit.warning',
        'tenant-1',
        expect.objectContaining({ utilizationPercent: '85.0' }),
      );
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'exposure.limit.check.passed',
        'tenant-1',
        expect.any(Object),
      );
    });

    it('should handle missing tenant settings gracefully', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue(null);

      const result = await service.checkExposureLimit('tenant-1', 'cust-1', '50000', 'prod-1');

      expect(result.allowed).toBe(true);
    });

    it('should return zero headroom when already over the limit', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        settings: { exposureRules: { enableCrossProductCheck: true, maxCustomerExposure: '50000' } },
      });
      mockPrisma.contract.findMany.mockResolvedValue([
        { id: 'c1', totalOutstanding: 60000, productId: 'p1' },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', type: 'micro_loan' },
      ]);

      const result = await service.checkExposureLimit('tenant-1', 'cust-1', '10000', 'prod-1');

      expect(result.allowed).toBe(false);
      expect(result.headroom).toBe('0.0000');
    });
  });
});
