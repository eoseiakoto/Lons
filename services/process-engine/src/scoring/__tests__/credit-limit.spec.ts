import { CreditLimitService } from '../credit-limit.service';

const mockPrisma = {
  product: {
    findFirst: jest.fn(),
  },
  contract: {
    findMany: jest.fn(),
  },
};

describe('CreditLimitService', () => {
  let service: CreditLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CreditLimitService(mockPrisma as any);
  });

  describe('deriveLimit', () => {
    beforeEach(() => {
      mockPrisma.product.findFirst.mockResolvedValue({ eligibilityRules: null });
    });

    it('should return 0 for scores 0-399', async () => {
      const result = await service.deriveLimit('350.00', 'prod-1', 'tenant-1', '1000.0000');
      expect(result).toBe('0.0000');
    });

    it('should return 1.5x for scores 400-599', async () => {
      const result = await service.deriveLimit('500.00', 'prod-1', 'tenant-1', '1000.0000');
      expect(result).toBe('1500.0000');
    });

    it('should return 3x for scores 600-799', async () => {
      const result = await service.deriveLimit('700.00', 'prod-1', 'tenant-1', '1000.0000');
      expect(result).toBe('3000.0000');
    });

    it('should return 5x for scores 800-1000', async () => {
      const result = await service.deriveLimit('850.00', 'prod-1', 'tenant-1', '1000.0000');
      expect(result).toBe('5000.0000');
    });

    it('should return 0 for score at boundary (0)', async () => {
      const result = await service.deriveLimit('0.00', 'prod-1', 'tenant-1', '1000.0000');
      expect(result).toBe('0.0000');
    });

    it('should return 5x for score at boundary (1000)', async () => {
      const result = await service.deriveLimit('1000.00', 'prod-1', 'tenant-1', '1000.0000');
      expect(result).toBe('5000.0000');
    });

    it('should use Decimal strings and avoid floating point errors', async () => {
      // 333.33 * 1.5 = 499.995 -> banker's round to 499.9950
      const result = await service.deriveLimit('500.00', 'prod-1', 'tenant-1', '333.3300');
      expect(result).toBe('499.9950');
    });

    it('should use product-specific limit bands when available', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        eligibilityRules: {
          limitBands: [
            { minScore: 500, maxScore: 1000, limitMultiplier: '10.0000' },
            { minScore: 0, maxScore: 499, limitMultiplier: '0.5000' },
          ],
        },
      });

      const result = await service.deriveLimit('600.00', 'prod-1', 'tenant-1', '1000.0000');
      expect(result).toBe('10000.0000');
    });

    it('should fall back to defaults when product config fails', async () => {
      mockPrisma.product.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await service.deriveLimit('850.00', 'prod-1', 'tenant-1', '1000.0000');
      expect(result).toBe('5000.0000');
    });
  });

  describe('calculateExposureCap', () => {
    it('should return 0 when customer has no active contracts', async () => {
      mockPrisma.contract.findMany.mockResolvedValue([]);

      const result = await service.calculateExposureCap('customer-1', 'tenant-1');
      expect(result).toBe('0.0000');
    });

    it('should sum principal amounts of active contracts', async () => {
      mockPrisma.contract.findMany.mockResolvedValue([
        { principalAmount: '5000.0000' },
        { principalAmount: '3000.0000' },
        { principalAmount: '2000.0000' },
      ]);

      const result = await service.calculateExposureCap('customer-1', 'tenant-1');
      expect(result).toBe('10000.0000');
    });

    it('should handle Decimal principal amounts correctly', async () => {
      mockPrisma.contract.findMany.mockResolvedValue([
        { principalAmount: '1234.5678' },
        { principalAmount: '8765.4322' },
      ]);

      const result = await service.calculateExposureCap('customer-1', 'tenant-1');
      expect(result).toBe('10000.0000');
    });

    it('should filter by tenantId and active statuses', async () => {
      mockPrisma.contract.findMany.mockResolvedValue([]);

      await service.calculateExposureCap('customer-1', 'tenant-1');

      expect(mockPrisma.contract.findMany).toHaveBeenCalledWith({
        where: {
          customerId: 'customer-1',
          tenantId: 'tenant-1',
          status: { in: ['active', 'performing', 'due', 'overdue'] },
        },
        select: { principalAmount: true },
      });
    });
  });

  describe('applyExposureCap', () => {
    it('should return recommended limit when under cap', () => {
      const result = service.applyExposureCap('5000.0000', '10000.0000', '50000.0000');
      expect(result).toBe('5000.0000');
    });

    it('should cap the limit when it would exceed max exposure', () => {
      // Current exposure: 45000, max: 50000, recommended: 10000
      // Remaining capacity: 5000, so cap at 5000
      const result = service.applyExposureCap('10000.0000', '45000.0000', '50000.0000');
      expect(result).toBe('5000.0000');
    });

    it('should return 0 when already at max exposure', () => {
      const result = service.applyExposureCap('5000.0000', '50000.0000', '50000.0000');
      expect(result).toBe('0.0000');
    });

    it('should return 0 when over max exposure', () => {
      const result = service.applyExposureCap('5000.0000', '55000.0000', '50000.0000');
      expect(result).toBe('0.0000');
    });

    it('should handle exact remaining capacity', () => {
      // Remaining = 50000 - 47000 = 3000, recommended = 3000 -> exactly 3000
      const result = service.applyExposureCap('3000.0000', '47000.0000', '50000.0000');
      expect(result).toBe('3000.0000');
    });

    it('should use Decimal string arithmetic (no floating point errors)', () => {
      // 0.1 + 0.2 != 0.3 in float, but should work with Decimal strings
      const result = service.applyExposureCap('0.3000', '0.1000', '0.3000');
      expect(result).toBe('0.2000');
    });

    it('should handle zero recommended limit', () => {
      const result = service.applyExposureCap('0.0000', '10000.0000', '50000.0000');
      expect(result).toBe('0.0000');
    });
  });
});
