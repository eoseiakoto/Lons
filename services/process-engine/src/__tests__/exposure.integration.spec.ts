import { ExposureService } from '../exposure/exposure.service';
import { EventType } from '@lons/event-contracts';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const tenantId = 'tenant-exp-001';
const customerId = 'customer-exp-001';
const productId = 'product-exp-001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Exposure Integration', () => {
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

  // ─── Test 1: 80000 active + 30000 request > 100000 limit → fails ──

  it('should fail exposure check when new request would exceed tenant limit', async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({
      settings: {
        exposureRules: {
          enableCrossProductCheck: true,
          maxCustomerExposure: '100000',
        },
      },
    });

    // Customer has 80000 in active contracts
    mockPrisma.contract.findMany.mockResolvedValue([
      { id: 'c1', totalOutstanding: 50000, productId: 'p1' },
      { id: 'c2', totalOutstanding: 30000, productId: 'p2' },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([
      { id: 'p1', type: 'micro_loan' },
      { id: 'p2', type: 'overdraft' },
    ]);

    const result = await service.checkExposureLimit(
      tenantId,
      customerId,
      '30000',
      productId,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('TENANT_LIMIT_EXCEEDED');
    expect(result.currentExposure).toBe('80000.0000');
    expect(result.requestedAmount).toBe('30000');
    expect(result.maxAllowed).toBe('100000');

    // Failed event emitted
    expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.EXPOSURE_LIMIT_CHECK_FAILED,
      tenantId,
      expect.objectContaining({
        customerId,
        productId,
        currentExposure: '80000.0000',
        requestedAmount: '30000',
        maxAllowed: '100000',
        exceededBy: '10000.0000',
      }),
    );
  });

  // ─── Test 2: 80000 active + 15000 request < 100000 limit → passes ─

  it('should pass exposure check when new request stays under tenant limit', async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({
      settings: {
        exposureRules: {
          enableCrossProductCheck: true,
          maxCustomerExposure: '100000',
        },
      },
    });

    // Customer has 80000 in active contracts
    mockPrisma.contract.findMany.mockResolvedValue([
      { id: 'c1', totalOutstanding: 50000, productId: 'p1' },
      { id: 'c2', totalOutstanding: 30000, productId: 'p2' },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([
      { id: 'p1', type: 'micro_loan' },
      { id: 'p2', type: 'overdraft' },
    ]);

    const result = await service.checkExposureLimit(
      tenantId,
      customerId,
      '15000',
      productId,
    );

    expect(result.allowed).toBe(true);
    expect(result.currentExposure).toBe('80000.0000');
    expect(result.requestedAmount).toBe('15000');
    expect(result.maxAllowed).toBe('100000');
    expect(parseFloat(result.headroom)).toBe(20000);
    expect(result.reason).toBeUndefined();

    // Should emit passed and possibly warning events (95000/100000 = 95% > 80%)
    expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.EXPOSURE_LIMIT_CHECK_PASSED,
      tenantId,
      expect.objectContaining({
        customerId,
        productId,
      }),
    );

    // 95% utilization triggers warning
    expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.EXPOSURE_LIMIT_WARNING,
      tenantId,
      expect.objectContaining({
        customerId,
        utilizationPercent: '95.0',
      }),
    );
  });

  // ─── Test 3: No active contracts → any amount under limit passes ───

  it('should pass when customer has no contracts and request is under limit', async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({
      settings: {
        exposureRules: {
          enableCrossProductCheck: true,
          maxCustomerExposure: '100000',
        },
      },
    });

    // No active contracts
    mockPrisma.contract.findMany.mockResolvedValue([]);
    mockPrisma.product.findMany.mockResolvedValue([]);

    const result = await service.checkExposureLimit(
      tenantId,
      customerId,
      '50000',
      productId,
    );

    expect(result.allowed).toBe(true);
    expect(result.currentExposure).toBe('0.0000');
    expect(result.requestedAmount).toBe('50000');
    expect(parseFloat(result.headroom)).toBe(100000);
    expect(result.reason).toBeUndefined();
  });

  // ─── Test 4: Cross-product check → aggregates across products ──────

  it('should aggregate exposure across different product types when cross-product check enabled', async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({
      settings: {
        exposureRules: {
          enableCrossProductCheck: true,
          maxCustomerExposure: '200000',
        },
      },
    });

    // Customer has contracts across 4 different product types
    mockPrisma.contract.findMany.mockResolvedValue([
      { id: 'c1', totalOutstanding: 30000, productId: 'p-micro' },
      { id: 'c2', totalOutstanding: 40000, productId: 'p-overdraft' },
      { id: 'c3', totalOutstanding: 25000, productId: 'p-bnpl' },
      { id: 'c4', totalOutstanding: 50000, productId: 'p-factoring' },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([
      { id: 'p-micro', type: 'micro_loan' },
      { id: 'p-overdraft', type: 'overdraft' },
      { id: 'p-bnpl', type: 'bnpl' },
      { id: 'p-factoring', type: 'invoice_factoring' },
    ]);

    const result = await service.checkExposureLimit(
      tenantId,
      customerId,
      '60000',
      'p-new',
    );

    // Total current = 30000 + 40000 + 25000 + 50000 = 145000
    // New total = 145000 + 60000 = 205000 > 200000 → should fail
    expect(result.allowed).toBe(false);
    expect(result.currentExposure).toBe('145000.0000');
    expect(result.reason).toBe('TENANT_LIMIT_EXCEEDED');

    // Verify the exposure breakdown was calculated across product types
    const exposure = await service.calculateTotalExposure(tenantId, customerId);
    expect(exposure.breakdown.microLoan).toBe('30000.0000');
    expect(exposure.breakdown.overdraft).toBe('40000.0000');
    expect(exposure.breakdown.bnpl).toBe('25000.0000');
    expect(exposure.breakdown.invoiceFactoring).toBe('50000.0000');
    expect(exposure.totalExposure).toBe('145000.0000');
    expect(exposure.activeContractCount).toBe(4);
  });
});
