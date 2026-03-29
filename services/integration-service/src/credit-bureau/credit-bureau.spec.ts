import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GhanaXcbAdapter } from './ghana-xcb.adapter';
import { KenyaCrbAdapter } from './kenya-crb.adapter';
import { MockCreditBureauAdapter } from './mock-credit-bureau.adapter';
import { CreditBureauFactory } from './credit-bureau-factory';
import { ConsentService } from './consent.service';
import { BatchReportingService } from './batch-reporting.service';
import { CreditBureauService } from './credit-bureau.service';
import { PrismaService } from '@lons/database';
import { EventBusService } from '@lons/common';

// Mock PrismaService
const mockPrismaService = {
  creditBureauConsent: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  contract: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  repayment: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => defaultValue),
};

const mockEventBusService = {
  emit: jest.fn(),
  buildEvent: jest.fn(),
  emitAndBuild: jest.fn(),
};

describe('GhanaXcbAdapter', () => {
  let adapter: GhanaXcbAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GhanaXcbAdapter],
    }).compile();

    adapter = module.get<GhanaXcbAdapter>(GhanaXcbAdapter);
  });

  describe('getBureauType()', () => {
    it('should return GHANA_XCB', () => {
      expect(adapter.getBureauType()).toBe('GHANA_XCB');
    });
  });

  describe('getSupportedCountries()', () => {
    it('should return GH', () => {
      expect(adapter.getSupportedCountries()).toEqual(['GH']);
    });
  });

  describe('queryReport()', () => {
    it('should return null when consent is false', async () => {
      const result = await adapter.queryReport('GHA-123456-789', false);
      expect(result).toBeNull();
    });

    it('should return a realistic credit report for Ghana', async () => {
      const report = await adapter.queryReport('GHA-123456-789', true);

      expect(report).not.toBeNull();
      expect(report!.bureauScore).toBeGreaterThanOrEqual(300);
      expect(report!.bureauScore).toBeLessThanOrEqual(900);
      expect(report!.scoreRange).toEqual({ min: 300, max: 900 });
      expect(report!.bureauType).toBe('GHANA_XCB');
      expect(report!.country).toBe('GH');
      expect(report!.activeLoans).toBeGreaterThanOrEqual(0);
      expect(report!.activeLoans).toBeLessThanOrEqual(5);
      expect(report!.enquiryCount).toBeGreaterThanOrEqual(0);
      expect(report!.lastUpdated).toBeInstanceOf(Date);
      expect(typeof report!.totalOutstanding).toBe('string');
    });

    it('should generate GHS-denominated amounts', async () => {
      const report = await adapter.queryReport('GHA-999999-001', true);
      expect(report).not.toBeNull();
      // Outstanding should be a numeric string
      expect(Number(report!.totalOutstanding)).not.toBeNaN();
    });
  });

  describe('submitPositiveData()', () => {
    it('should return true on success', async () => {
      const result = await adapter.submitPositiveData({
        customerId: 'cust-1',
        contractId: 'contract-1',
        amount: '5000.00',
        status: 'active',
      });
      expect(result).toBe(true);
    });
  });

  describe('submitNegativeData()', () => {
    it('should return true on success', async () => {
      const result = await adapter.submitNegativeData({
        customerId: 'cust-1',
        contractId: 'contract-1',
        amount: '2000.00',
        reason: 'Payment default',
      });
      expect(result).toBe(true);
    });
  });
});

describe('KenyaCrbAdapter', () => {
  let adapter: KenyaCrbAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KenyaCrbAdapter],
    }).compile();

    adapter = module.get<KenyaCrbAdapter>(KenyaCrbAdapter);
  });

  describe('getBureauType()', () => {
    it('should return KENYA_CRB', () => {
      expect(adapter.getBureauType()).toBe('KENYA_CRB');
    });
  });

  describe('getSupportedCountries()', () => {
    it('should return KE', () => {
      expect(adapter.getSupportedCountries()).toEqual(['KE']);
    });
  });

  describe('queryReport()', () => {
    it('should return null when consent is false', async () => {
      const result = await adapter.queryReport('KEN-12345678', false);
      expect(result).toBeNull();
    });

    it('should return a realistic credit report for Kenya', async () => {
      const report = await adapter.queryReport('KEN-12345678', true);

      expect(report).not.toBeNull();
      expect(report!.bureauScore).toBeGreaterThanOrEqual(200);
      expect(report!.bureauScore).toBeLessThanOrEqual(900);
      expect(report!.scoreRange).toEqual({ min: 200, max: 900 });
      expect(report!.bureauType).toBe('KENYA_CRB');
      expect(report!.country).toBe('KE');
      expect(report!.activeLoans).toBeGreaterThanOrEqual(0);
      expect(report!.activeLoans).toBeLessThanOrEqual(5);
      expect(typeof report!.totalOutstanding).toBe('string');
    });

    it('should generate KES-denominated amounts', async () => {
      const report = await adapter.queryReport('KEN-87654321', true);
      expect(report).not.toBeNull();
      expect(Number(report!.totalOutstanding)).not.toBeNaN();
    });
  });

  describe('submitPositiveData()', () => {
    it('should return true on success', async () => {
      const result = await adapter.submitPositiveData({
        customerId: 'cust-1',
        contractId: 'contract-1',
        amount: '50000',
        status: 'active',
      });
      expect(result).toBe(true);
    });
  });

  describe('submitNegativeData()', () => {
    it('should return true on success', async () => {
      const result = await adapter.submitNegativeData({
        customerId: 'cust-1',
        contractId: 'contract-1',
        amount: '20000',
        reason: 'Loan default',
      });
      expect(result).toBe(true);
    });
  });
});

describe('CreditBureauFactory', () => {
  let factory: CreditBureauFactory;
  let ghanaAdapter: GhanaXcbAdapter;
  let kenyaAdapter: KenyaCrbAdapter;
  let mockAdapter: MockCreditBureauAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditBureauFactory,
        GhanaXcbAdapter,
        KenyaCrbAdapter,
        MockCreditBureauAdapter,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    factory = module.get<CreditBureauFactory>(CreditBureauFactory);
    ghanaAdapter = module.get<GhanaXcbAdapter>(GhanaXcbAdapter);
    kenyaAdapter = module.get<KenyaCrbAdapter>(KenyaCrbAdapter);
    mockAdapter = module.get<MockCreditBureauAdapter>(MockCreditBureauAdapter);
  });

  describe('getAdapter()', () => {
    it('should return Ghana adapter for GH', () => {
      const adapter = factory.getAdapter('GH');
      expect(adapter).toBe(ghanaAdapter);
    });

    it('should return Kenya adapter for KE', () => {
      const adapter = factory.getAdapter('KE');
      expect(adapter).toBe(kenyaAdapter);
    });

    it('should return mock adapter for unknown countries', () => {
      const adapter = factory.getAdapter('XX');
      expect(adapter).toBe(mockAdapter);
    });

    it('should be case-insensitive', () => {
      const adapter = factory.getAdapter('gh');
      expect(adapter).toBe(ghanaAdapter);
    });
  });

  describe('getFallbackAdapter()', () => {
    it('should return Kenya adapter as fallback for Ghana', () => {
      const adapter = factory.getFallbackAdapter('GH');
      expect(adapter).toBe(kenyaAdapter);
    });

    it('should return Ghana adapter as fallback for Kenya', () => {
      const adapter = factory.getFallbackAdapter('KE');
      expect(adapter).toBe(ghanaAdapter);
    });

    it('should return mock adapter as ultimate fallback for unknown countries', () => {
      const adapter = factory.getFallbackAdapter('XX');
      // For unknown, tries first available real adapter
      expect(adapter.getBureauType()).toBeTruthy();
    });
  });

  describe('getSupportedCountries()', () => {
    it('should list GH and KE', () => {
      const countries = factory.getSupportedCountries();
      expect(countries).toContain('GH');
      expect(countries).toContain('KE');
    });
  });
});

describe('ConsentService', () => {
  let service: ConsentService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ConsentService>(ConsentService);
  });

  describe('recordConsent()', () => {
    it('should create a consent record with expiry', async () => {
      mockPrismaService.creditBureauConsent.create.mockResolvedValue({
        id: 'consent-1',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        bureauType: 'GHANA_XCB',
        consentGiven: true,
      });

      const result = await service.recordConsent('tenant-1', 'cust-1', 'GHANA_XCB', 12);

      expect(result).toBeDefined();
      expect(mockPrismaService.creditBureauConsent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          customerId: 'cust-1',
          bureauType: 'GHANA_XCB',
          consentGiven: true,
          consentDate: expect.any(Date),
          expiresAt: expect.any(Date),
        }),
      });

      // Verify expiry is approximately 12 months from now
      const callData = mockPrismaService.creditBureauConsent.create.mock.calls[0][0].data;
      const diffMs = callData.expiresAt.getTime() - callData.consentDate.getTime();
      const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30);
      expect(diffMonths).toBeGreaterThan(11);
      expect(diffMonths).toBeLessThan(13);
    });
  });

  describe('hasValidConsent()', () => {
    it('should return true when valid consent exists', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue({
        id: 'consent-1',
        consentGiven: true,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      const result = await service.hasValidConsent('tenant-1', 'cust-1', 'GHANA_XCB');
      expect(result).toBe(true);
    });

    it('should return false when no consent exists', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue(null);

      const result = await service.hasValidConsent('tenant-1', 'cust-1', 'GHANA_XCB');
      expect(result).toBe(false);
    });
  });

  describe('revokeConsent()', () => {
    it('should set revokedAt on active consent', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue({
        id: 'consent-1',
        consentGiven: true,
        revokedAt: null,
      });
      mockPrismaService.creditBureauConsent.update.mockResolvedValue({});

      const result = await service.revokeConsent('tenant-1', 'cust-1', 'GHANA_XCB');

      expect(result).toBe(true);
      expect(mockPrismaService.creditBureauConsent.update).toHaveBeenCalledWith({
        where: { id: 'consent-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should return false when no active consent to revoke', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue(null);

      const result = await service.revokeConsent('tenant-1', 'cust-1', 'GHANA_XCB');
      expect(result).toBe(false);
    });
  });

  describe('getConsents()', () => {
    it('should return all consents for a customer', async () => {
      const consents = [
        { id: 'c1', bureauType: 'GHANA_XCB' },
        { id: 'c2', bureauType: 'KENYA_CRB' },
      ];
      mockPrismaService.creditBureauConsent.findMany.mockResolvedValue(consents);

      const result = await service.getConsents('tenant-1', 'cust-1');
      expect(result).toHaveLength(2);
    });
  });
});

describe('BatchReportingService', () => {
  let service: BatchReportingService;
  let factory: CreditBureauFactory;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.contract.findMany.mockResolvedValue([]);
    mockPrismaService.repayment.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchReportingService,
        CreditBureauFactory,
        GhanaXcbAdapter,
        KenyaCrbAdapter,
        MockCreditBureauAdapter,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<BatchReportingService>(BatchReportingService);
    factory = module.get<CreditBureauFactory>(CreditBureauFactory);
  });

  describe('generateBatchReport()', () => {
    it('should collect originations from new contracts', async () => {
      mockPrismaService.contract.findMany
        .mockResolvedValueOnce([
          {
            id: 'contract-1',
            customerId: 'cust-1',
            principalAmount: '5000.00',
            status: 'active',
            createdAt: new Date(),
            customer: { nationalId: 'GHA-123' },
            product: { currency: 'GHS' },
          },
        ])
        .mockResolvedValueOnce([]) // defaults
        .mockResolvedValueOnce([]); // closures
      mockPrismaService.repayment.findMany.mockResolvedValue([]);

      const records = await service.generateBatchReport('tenant-1', new Date('2026-03-01'));
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records[0].type).toBe('origination');
      expect(records[0].contractId).toBe('contract-1');
    });

    it('should return empty array when no events', async () => {
      const records = await service.generateBatchReport('tenant-1', new Date());
      expect(records).toEqual([]);
    });
  });

  describe('submitBatch()', () => {
    it('should submit records to the correct adapter', async () => {
      const records = [
        {
          customerId: 'cust-1',
          contractId: 'contract-1',
          nationalId: 'GHA-123',
          amount: '5000.00',
          currency: 'GHS',
          type: 'origination' as const,
          status: 'active',
          eventDate: new Date(),
        },
      ];

      const result = await service.submitBatch('tenant-1', 'GH', records);

      expect(result.totalRecords).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
    });

    it('should submit negative data for default records', async () => {
      const records = [
        {
          customerId: 'cust-1',
          contractId: 'contract-1',
          nationalId: 'GHA-123',
          amount: '3000.00',
          currency: 'GHS',
          type: 'default' as const,
          status: 'default',
          reason: 'Payment default',
          eventDate: new Date(),
        },
      ];

      const result = await service.submitBatch('tenant-1', 'GH', records);

      expect(result.totalRecords).toBe(1);
      expect(result.successCount).toBe(1);
    });

    it('should track failures in results', async () => {
      // Use a spy to make the adapter throw
      const adapter = factory.getAdapter('GH');
      jest.spyOn(adapter, 'submitPositiveData').mockRejectedValueOnce(new Error('Network error'));

      const records = [
        {
          customerId: 'cust-1',
          contractId: 'contract-1',
          nationalId: 'GHA-123',
          amount: '5000.00',
          currency: 'GHS',
          type: 'origination' as const,
          status: 'active',
          eventDate: new Date(),
        },
      ];

      const result = await service.submitBatch('tenant-1', 'GH', records);

      expect(result.failureCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Network error');
    });
  });
});

describe('CreditBureauService (refactored)', () => {
  let service: CreditBureauService;
  let consentService: ConsentService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditBureauService,
        CreditBureauFactory,
        ConsentService,
        GhanaXcbAdapter,
        KenyaCrbAdapter,
        MockCreditBureauAdapter,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventBusService, useValue: mockEventBusService },
      ],
    }).compile();

    service = module.get<CreditBureauService>(CreditBureauService);
    consentService = module.get<ConsentService>(ConsentService);
  });

  describe('queryReport()', () => {
    it('should return null when no consent exists', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue(null);

      const result = await service.queryReport('GHA-123', true);
      expect(result).toBeNull();
    });

    it('should return a report when consent exists', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue({
        id: 'consent-1',
        consentGiven: true,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      const result = await service.queryReport('GHA-123', true);

      expect(result).not.toBeNull();
      expect(result!.bureauType).toBe('GHANA_XCB');
      expect(result!.country).toBe('GH');
    });

    it('should use cache for subsequent queries', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue({
        id: 'consent-1',
        consentGiven: true,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      const result1 = await service.queryReport('GHA-123', true);
      const result2 = await service.queryReport('GHA-123', true);

      // Both should be the same cached report
      expect(result1).toEqual(result2);
    });

    it('should use Kenya adapter for KE country', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue({
        id: 'consent-1',
        consentGiven: true,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      const result = await service.queryReport('KEN-12345678', true);

      expect(result).not.toBeNull();
      expect(result!.bureauType).toBe('KENYA_CRB');
      expect(result!.country).toBe('KE');
    });

    it('should emit CREDIT_BUREAU_REPORT_RECEIVED event on successful query', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue({
        id: 'consent-1',
        consentGiven: true,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
      });

      // Force a fresh query by using a unique national ID
      const result = await service.queryReport('GHA-EVENT-TEST', true);

      expect(result).not.toBeNull();
      expect(mockEventBusService.emitAndBuild).toHaveBeenCalledWith(
        'credit_bureau.report_received',
        'tenant-1',
        expect.objectContaining({
          customerId: 'cust-1',
          bureauType: 'GHANA_XCB',
          country: 'GH',
        }),
      );
    });

    it('should not emit event when consent is missing', async () => {
      mockPrismaService.creditBureauConsent.findFirst.mockResolvedValue(null);

      await service.queryReport('GHA-123', true);

      expect(mockEventBusService.emitAndBuild).not.toHaveBeenCalled();
    });
  });
});

describe('CreditBureauFactory - queryWithFallback', () => {
  let factory: CreditBureauFactory;
  let ghanaAdapter: GhanaXcbAdapter;
  let kenyaAdapter: KenyaCrbAdapter;
  let mockAdapter: MockCreditBureauAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditBureauFactory,
        GhanaXcbAdapter,
        KenyaCrbAdapter,
        MockCreditBureauAdapter,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    factory = module.get<CreditBureauFactory>(CreditBureauFactory);
    ghanaAdapter = module.get<GhanaXcbAdapter>(GhanaXcbAdapter);
    kenyaAdapter = module.get<KenyaCrbAdapter>(KenyaCrbAdapter);
    mockAdapter = module.get<MockCreditBureauAdapter>(MockCreditBureauAdapter);
  });

  it('should return report from primary adapter on success', async () => {
    const report = await factory.queryWithFallback('tenant-1', 'cust-1', 'GHA-123', 'GH');

    expect(report).not.toBeNull();
    expect(report!.bureauType).toBe('GHANA_XCB');
  });

  it('should fallback to other adapters when primary fails', async () => {
    jest.spyOn(ghanaAdapter, 'queryReport').mockRejectedValueOnce(new Error('Primary down'));

    const report = await factory.queryWithFallback('tenant-1', 'cust-1', 'GHA-123', 'GH');

    expect(report).not.toBeNull();
    // Should have gotten a report from a fallback adapter
    expect(report!.bureauType).toBeTruthy();
  });

  it('should return null when all adapters fail', async () => {
    jest.spyOn(ghanaAdapter, 'queryReport').mockRejectedValue(new Error('Ghana down'));
    jest.spyOn(kenyaAdapter, 'queryReport').mockRejectedValue(new Error('Kenya down'));
    jest.spyOn(mockAdapter, 'queryReport').mockRejectedValue(new Error('Mock down'));

    const report = await factory.queryWithFallback('tenant-1', 'cust-1', 'GHA-123', 'GH');

    expect(report).toBeNull();
  });

  it('should try adapters in order: primary, then others, then mock', async () => {
    const callOrder: string[] = [];

    jest.spyOn(ghanaAdapter, 'queryReport').mockImplementation(async () => {
      callOrder.push('GH');
      throw new Error('Ghana down');
    });
    jest.spyOn(kenyaAdapter, 'queryReport').mockImplementation(async () => {
      callOrder.push('KE');
      throw new Error('Kenya down');
    });
    jest.spyOn(mockAdapter, 'queryReport').mockImplementation(async () => {
      callOrder.push('MOCK');
      return null;
    });

    await factory.queryWithFallback('tenant-1', 'cust-1', 'GHA-123', 'GH');

    expect(callOrder[0]).toBe('GH');
    expect(callOrder).toContain('KE');
    expect(callOrder).toContain('MOCK');
  });
});

describe('BatchReportingService - scheduled job', () => {
  let service: BatchReportingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.contract.findMany.mockResolvedValue([]);
    mockPrismaService.repayment.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchReportingService,
        CreditBureauFactory,
        GhanaXcbAdapter,
        KenyaCrbAdapter,
        MockCreditBureauAdapter,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<BatchReportingService>(BatchReportingService);
  });

  it('should handle scheduled batch report with no active tenants', async () => {
    mockPrismaService.contract.findMany.mockResolvedValue([]);

    await expect(service.handleScheduledBatchReport()).resolves.not.toThrow();
  });

  it('should process active tenants in scheduled run', async () => {
    // First call: distinct tenants; subsequent calls: batch data
    mockPrismaService.contract.findMany
      .mockResolvedValueOnce([{ tenantId: 'tenant-1' }]) // distinct tenants
      .mockResolvedValue([]); // batch data queries

    mockPrismaService.repayment.findMany.mockResolvedValue([]);

    await expect(service.handleScheduledBatchReport()).resolves.not.toThrow();
  });

  it('should handle errors gracefully during scheduled run', async () => {
    mockPrismaService.contract.findMany.mockRejectedValueOnce(new Error('DB error'));

    await expect(service.handleScheduledBatchReport()).resolves.not.toThrow();
  });
});
