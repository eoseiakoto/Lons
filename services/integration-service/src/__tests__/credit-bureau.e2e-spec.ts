import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GhanaXcbAdapter } from '../credit-bureau/ghana-xcb.adapter';
import { KenyaCrbAdapter } from '../credit-bureau/kenya-crb.adapter';
import { MockCreditBureauAdapter } from '../credit-bureau/mock-credit-bureau.adapter';
import { CreditBureauFactory } from '../credit-bureau/credit-bureau-factory';
import { ConsentService } from '../credit-bureau/consent.service';
import { CreditBureauService } from '../credit-bureau/credit-bureau.service';
import { BatchReportingService } from '../credit-bureau/batch-reporting.service';
import { BatchReportRecord } from '../credit-bureau/credit-bureau.interface';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-e2e-bureau';
const CUSTOMER_ID = 'customer-001';
const NATIONAL_ID_GH = 'GHA-1234567890';
const NATIONAL_ID_KE = 'KE-98765432';

function createMockEventBus() {
  return {
    emitAndBuild: jest.fn(),
    emit: jest.fn(),
    buildEvent: jest.fn(),
  };
}

function createMockPrismaForConsent() {
  const consents: any[] = [];

  return {
    creditBureauConsent: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = {
          id: `consent-${consents.length + 1}`,
          ...data,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        consents.push(record);
        return Promise.resolve(record);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const match = consents.find((c) => {
          if (c.tenantId !== where.tenantId) return false;
          if (c.customerId !== where.customerId) return false;
          if (c.bureauType !== where.bureauType) return false;
          if (where.consentGiven !== undefined && c.consentGiven !== where.consentGiven) return false;
          if (where.revokedAt === null && c.revokedAt !== null) return false;
          if (where.expiresAt?.gt && c.expiresAt <= where.expiresAt.gt) return false;
          return true;
        });
        return Promise.resolve(match || null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          consents.filter(
            (c) => c.tenantId === where.tenantId && c.customerId === where.customerId,
          ),
        );
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const consent = consents.find((c) => c.id === where.id);
        if (consent) Object.assign(consent, data, { updatedAt: new Date() });
        return Promise.resolve(consent);
      }),
    },
    _consents: consents,
  };
}

function createMockPrismaForBatch() {
  return {
    contract: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (where.status === 'default_status') {
          return Promise.resolve([
            {
              id: 'contract-default-001',
              tenantId: TENANT_ID,
              customerId: CUSTOMER_ID,
              principalAmount: '5000.0000',
              totalOutstanding: '6200.0000',
              status: 'default_status',
              customer: { nationalId: NATIONAL_ID_GH },
              product: { currency: 'GHS' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]);
        }
        if (where.status?.in) {
          return Promise.resolve([
            {
              id: 'contract-closed-001',
              tenantId: TENANT_ID,
              customerId: CUSTOMER_ID,
              principalAmount: '3000.0000',
              status: 'settled',
              customer: { nationalId: NATIONAL_ID_GH },
              product: { currency: 'GHS' },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]);
        }
        // New originations
        return Promise.resolve([
          {
            id: 'contract-new-001',
            tenantId: TENANT_ID,
            customerId: CUSTOMER_ID,
            principalAmount: '10000.0000',
            status: 'active',
            customer: { nationalId: NATIONAL_ID_GH },
            product: { currency: 'GHS' },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      }),
    },
    repayment: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'repayment-001',
          tenantId: TENANT_ID,
          contractId: 'contract-new-001',
          amount: '1500.0000',
          status: 'completed',
          contract: {
            customerId: CUSTOMER_ID,
            customer: { nationalId: NATIONAL_ID_GH },
            product: { currency: 'GHS' },
          },
          createdAt: new Date(),
        },
      ]),
    },
    creditBureauConsent: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Ghana XCB Adapter Tests
// ---------------------------------------------------------------------------

describe('Ghana XCB Adapter (E2E)', () => {
  let adapter: GhanaXcbAdapter;

  beforeAll(() => {
    adapter = new GhanaXcbAdapter();
  });

  it('should report bureau type as GHANA_XCB', () => {
    expect(adapter.getBureauType()).toBe('GHANA_XCB');
  });

  it('should support GH country', () => {
    expect(adapter.getSupportedCountries()).toContain('GH');
  });

  it('should return a credit report with score in range 300-900 and GHS amounts', async () => {
    const report = await adapter.queryReport(NATIONAL_ID_GH, true);

    expect(report).not.toBeNull();
    expect(report!.bureauScore).toBeGreaterThanOrEqual(300);
    expect(report!.bureauScore).toBeLessThanOrEqual(900);
    expect(report!.scoreRange).toEqual({ min: 300, max: 900 });
    expect(report!.bureauType).toBe('GHANA_XCB');
    expect(report!.country).toBe('GH');
    expect(typeof report!.totalOutstanding).toBe('string');
    expect(report!.activeLoans).toBeGreaterThanOrEqual(0);
    expect(report!.defaultHistory).toBeDefined();
    expect(typeof report!.defaultHistory.totalAmount).toBe('string');
    expect(report!.lastUpdated).toBeInstanceOf(Date);
  });

  it('should return null when consent is false', async () => {
    const report = await adapter.queryReport(NATIONAL_ID_GH, false);
    expect(report).toBeNull();
  });

  it('should submit positive data successfully', async () => {
    const success = await adapter.submitPositiveData({
      customerId: CUSTOMER_ID,
      contractId: 'contract-001',
      amount: '5000.0000',
      status: 'active',
    });
    expect(success).toBe(true);
  });

  it('should submit negative data successfully', async () => {
    const success = await adapter.submitNegativeData({
      customerId: CUSTOMER_ID,
      contractId: 'contract-001',
      amount: '2500.0000',
      reason: 'Payment default',
    });
    expect(success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Kenya CRB Adapter Tests
// ---------------------------------------------------------------------------

describe('Kenya CRB Adapter (E2E)', () => {
  let adapter: KenyaCrbAdapter;

  beforeAll(() => {
    adapter = new KenyaCrbAdapter();
  });

  it('should report bureau type as KENYA_CRB', () => {
    expect(adapter.getBureauType()).toBe('KENYA_CRB');
  });

  it('should support KE country', () => {
    expect(adapter.getSupportedCountries()).toContain('KE');
  });

  it('should return a credit report with score in range 200-900 and KES amounts', async () => {
    const report = await adapter.queryReport(NATIONAL_ID_KE, true);

    expect(report).not.toBeNull();
    expect(report!.bureauScore).toBeGreaterThanOrEqual(200);
    expect(report!.bureauScore).toBeLessThanOrEqual(900);
    expect(report!.scoreRange).toEqual({ min: 200, max: 900 });
    expect(report!.bureauType).toBe('KENYA_CRB');
    expect(report!.country).toBe('KE');
    expect(typeof report!.totalOutstanding).toBe('string');
    expect(report!.lastUpdated).toBeInstanceOf(Date);
  });

  it('should return null when consent is false', async () => {
    const report = await adapter.queryReport(NATIONAL_ID_KE, false);
    expect(report).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Credit Bureau Factory Tests
// ---------------------------------------------------------------------------

describe('CreditBureauFactory (E2E)', () => {
  let module: TestingModule;
  let factory: CreditBureauFactory;
  let ghanaAdapter: GhanaXcbAdapter;
  let kenyaAdapter: KenyaCrbAdapter;
  let mockAdapter: MockCreditBureauAdapter;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        CreditBureauFactory,
        GhanaXcbAdapter,
        KenyaCrbAdapter,
        MockCreditBureauAdapter,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sandbox') },
        },
      ],
    }).compile();

    factory = module.get(CreditBureauFactory);
    ghanaAdapter = module.get(GhanaXcbAdapter);
    kenyaAdapter = module.get(KenyaCrbAdapter);
    mockAdapter = module.get(MockCreditBureauAdapter);
  });

  afterAll(async () => {
    await module.close();
  });

  it('should select GhanaXcbAdapter for country GH', () => {
    const adapter = factory.getAdapter('GH');
    expect(adapter.getBureauType()).toBe('GHANA_XCB');
  });

  it('should select KenyaCrbAdapter for country KE', () => {
    const adapter = factory.getAdapter('KE');
    expect(adapter.getBureauType()).toBe('KENYA_CRB');
  });

  it('should fall back to MockCreditBureauAdapter for unsupported country', () => {
    const adapter = factory.getAdapter('NG');
    expect(adapter.getBureauType()).toBe('MOCK');
  });

  it('should be case-insensitive for country code', () => {
    const adapter = factory.getAdapter('gh');
    expect(adapter.getBureauType()).toBe('GHANA_XCB');
  });

  it('should return supported countries GH and KE', () => {
    const countries = factory.getSupportedCountries();
    expect(countries).toContain('GH');
    expect(countries).toContain('KE');
  });

  it('should return all real adapters', () => {
    const adapters = factory.getAllAdapters();
    expect(adapters.length).toBe(2);
    const types = adapters.map((a) => a.getBureauType());
    expect(types).toContain('GHANA_XCB');
    expect(types).toContain('KENYA_CRB');
  });

  describe('queryWithFallback', () => {
    it('should return report from primary adapter on success', async () => {
      const report = await factory.queryWithFallback(
        TENANT_ID,
        CUSTOMER_ID,
        NATIONAL_ID_GH,
        'GH',
      );

      expect(report).not.toBeNull();
      expect(report!.bureauType).toBe('GHANA_XCB');
      expect(report!.country).toBe('GH');
    });

    it('should fall back to another adapter when primary fails', async () => {
      // Create a spy that makes the Ghana adapter throw
      jest
        .spyOn(ghanaAdapter, 'queryReport')
        .mockRejectedValueOnce(new Error('Bureau API down'));

      const report = await factory.queryWithFallback(
        TENANT_ID,
        CUSTOMER_ID,
        NATIONAL_ID_GH,
        'GH',
      );

      // Should get a report from fallback adapter (Kenya or Mock)
      expect(report).not.toBeNull();
      expect(['KENYA_CRB', 'MOCK']).toContain(report!.bureauType);

      // Restore
      jest.restoreAllMocks();
    });

    it('should return null when all adapters fail', async () => {
      jest
        .spyOn(ghanaAdapter, 'queryReport')
        .mockRejectedValue(new Error('Ghana bureau down'));
      jest
        .spyOn(kenyaAdapter, 'queryReport')
        .mockRejectedValue(new Error('Kenya bureau down'));
      jest
        .spyOn(mockAdapter, 'queryReport')
        .mockRejectedValue(new Error('Mock bureau down'));

      const report = await factory.queryWithFallback(
        TENANT_ID,
        CUSTOMER_ID,
        NATIONAL_ID_GH,
        'GH',
      );

      expect(report).toBeNull();

      jest.restoreAllMocks();
    });
  });

  describe('getFallbackAdapter', () => {
    it('should return a different adapter when primary country has an adapter', () => {
      const fallback = factory.getFallbackAdapter('GH');
      // For GH, fallback should be KE (the other registered adapter)
      expect(fallback.getBureauType()).not.toBe('GHANA_XCB');
    });

    it('should return mock adapter when no other adapters available', () => {
      // For a non-existent country, getAdapter returns mock already.
      // getFallbackAdapter for a real country returns the other registered adapter.
      // The mock path is only hit when iterating yields nothing; with 2 adapters,
      // at least one will be different.
      const fallback = factory.getFallbackAdapter('KE');
      expect(fallback.getBureauType()).toBe('GHANA_XCB');
    });
  });
});

// ---------------------------------------------------------------------------
// Consent Service Tests
// ---------------------------------------------------------------------------

describe('ConsentService (E2E)', () => {
  let service: ConsentService;
  let mockPrisma: ReturnType<typeof createMockPrismaForConsent>;

  beforeEach(() => {
    mockPrisma = createMockPrismaForConsent();
    service = new ConsentService(mockPrisma as any);
  });

  it('should grant consent and confirm it is valid', async () => {
    await service.grantConsent(TENANT_ID, CUSTOMER_ID, 'GHANA_XCB');

    const hasConsent = await service.hasValidConsent(TENANT_ID, CUSTOMER_ID, 'GHANA_XCB');
    expect(hasConsent).toBe(true);
  });

  it('should revoke consent and confirm it is no longer valid', async () => {
    await service.grantConsent(TENANT_ID, CUSTOMER_ID, 'GHANA_XCB');

    const revoked = await service.revokeConsent(TENANT_ID, CUSTOMER_ID, 'GHANA_XCB');
    expect(revoked).toBe(true);

    const hasConsent = await service.hasValidConsent(TENANT_ID, CUSTOMER_ID, 'GHANA_XCB');
    expect(hasConsent).toBe(false);
  });

  it('should return false for hasValidConsent when no consent exists', async () => {
    const hasConsent = await service.hasValidConsent(TENANT_ID, 'unknown-customer', 'GHANA_XCB');
    expect(hasConsent).toBe(false);
  });

  it('should block expired consent', async () => {
    // Grant consent with expiry in the past
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 1);

    // Directly manipulate the mock store to simulate an expired consent
    mockPrisma._consents.push({
      id: 'consent-expired',
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      bureauType: 'KENYA_CRB',
      consentGiven: true,
      consentDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      expiresAt: pastDate,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const hasConsent = await service.hasValidConsent(TENANT_ID, CUSTOMER_ID, 'KENYA_CRB');
    expect(hasConsent).toBe(false);
  });

  it('should return false when revoking non-existent consent', async () => {
    const revoked = await service.revokeConsent(TENANT_ID, 'no-one', 'MOCK');
    expect(revoked).toBe(false);
  });

  it('should list all consents for a customer', async () => {
    await service.grantConsent(TENANT_ID, CUSTOMER_ID, 'GHANA_XCB');
    await service.grantConsent(TENANT_ID, CUSTOMER_ID, 'KENYA_CRB');

    const consents = await service.getConsents(TENANT_ID, CUSTOMER_ID);
    expect(consents.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// CreditBureauService Tests
// ---------------------------------------------------------------------------

describe('CreditBureauService (E2E)', () => {
  let module: TestingModule;
  let creditBureauService: CreditBureauService;
  let consentService: ConsentService;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let mockPrisma: ReturnType<typeof createMockPrismaForConsent>;

  beforeAll(async () => {
    mockPrisma = createMockPrismaForConsent();
    eventBus = createMockEventBus();

    module = await Test.createTestingModule({
      providers: [
        CreditBureauService,
        CreditBureauFactory,
        GhanaXcbAdapter,
        KenyaCrbAdapter,
        MockCreditBureauAdapter,
        {
          provide: ConsentService,
          useFactory: () => new ConsentService(mockPrisma as any),
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sandbox') },
        },
        { provide: 'EventBusService', useValue: eventBus },
      ],
    })
      .overrideProvider('EventBusService')
      .useValue(eventBus)
      .compile();

    creditBureauService = new CreditBureauService(
      module.get(CreditBureauFactory),
      new ConsentService(mockPrisma as any),
      eventBus as any,
    );
    consentService = new ConsentService(mockPrisma as any);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    creditBureauService.clearCache();
    eventBus.emitAndBuild.mockClear();
  });

  it('should return a report when customer has valid consent', async () => {
    await consentService.grantConsent(TENANT_ID, CUSTOMER_ID, 'GHANA_XCB');

    const report = await creditBureauService.queryReport(
      TENANT_ID,
      CUSTOMER_ID,
      NATIONAL_ID_GH,
      'GH',
    );

    expect(report).not.toBeNull();
    expect(report!.bureauType).toBe('GHANA_XCB');
    expect(report!.bureauScore).toBeGreaterThanOrEqual(300);
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'credit_bureau.report_received',
      TENANT_ID,
      expect.objectContaining({
        customerId: CUSTOMER_ID,
        bureauType: 'GHANA_XCB',
        country: 'GH',
      }),
    );
  });

  it('should return null when customer has no consent', async () => {
    // Use a customer with no consent records
    const report = await creditBureauService.queryReport(
      TENANT_ID,
      'customer-no-consent',
      'GHA-0000000000',
      'GH',
    );

    expect(report).toBeNull();
    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('should cache report and return cached version on second call', async () => {
    await consentService.grantConsent(TENANT_ID, 'customer-cache', 'GHANA_XCB');

    const report1 = await creditBureauService.queryReport(
      TENANT_ID,
      'customer-cache',
      'GHA-CACHE-001',
      'GH',
    );

    const report2 = await creditBureauService.queryReport(
      TENANT_ID,
      'customer-cache',
      'GHA-CACHE-001',
      'GH',
    );

    // Both should return a report; the second should be the cached version
    expect(report1).not.toBeNull();
    expect(report2).not.toBeNull();
    expect(report2!.bureauScore).toBe(report1!.bureauScore);
  });

  it('should clear cache when requested', async () => {
    await consentService.grantConsent(TENANT_ID, 'customer-clear', 'GHANA_XCB');

    await creditBureauService.queryReport(
      TENANT_ID,
      'customer-clear',
      'GHA-CLEAR-001',
      'GH',
    );

    creditBureauService.clearCache('GH:GHA-CLEAR-001');

    // Next query will be a fresh lookup (not from cache)
    const freshReport = await creditBureauService.queryReport(
      TENANT_ID,
      'customer-clear',
      'GHA-CLEAR-001',
      'GH',
    );

    expect(freshReport).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Batch Reporting Service Tests
// ---------------------------------------------------------------------------

describe('BatchReportingService (E2E)', () => {
  let service: BatchReportingService;
  let mockPrisma: ReturnType<typeof createMockPrismaForBatch>;
  let factory: CreditBureauFactory;

  beforeAll(async () => {
    mockPrisma = createMockPrismaForBatch();

    const module = await Test.createTestingModule({
      providers: [
        CreditBureauFactory,
        GhanaXcbAdapter,
        KenyaCrbAdapter,
        MockCreditBureauAdapter,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sandbox') },
        },
      ],
    }).compile();

    factory = module.get(CreditBureauFactory);
    service = new BatchReportingService(mockPrisma as any, factory);
  });

  it('should generate batch report records from contracts and repayments', async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const records = await service.generateBatchReport(TENANT_ID, since);

    expect(records.length).toBeGreaterThan(0);

    // Should contain originations, repayments, defaults, and closures
    const types = records.map((r) => r.type);
    expect(types).toContain('origination');
    expect(types).toContain('repayment');
    expect(types).toContain('default');
    expect(types).toContain('closure');

    // Verify amounts are strings
    for (const record of records) {
      expect(typeof record.amount).toBe('string');
      expect(typeof record.currency).toBe('string');
    }
  });

  it('should submit batch records to the Ghana bureau', async () => {
    const records: BatchReportRecord[] = [
      {
        customerId: CUSTOMER_ID,
        contractId: 'contract-001',
        nationalId: NATIONAL_ID_GH,
        amount: '10000.0000',
        currency: 'GHS',
        type: 'origination',
        status: 'active',
        eventDate: new Date(),
      },
      {
        customerId: CUSTOMER_ID,
        contractId: 'contract-001',
        nationalId: NATIONAL_ID_GH,
        amount: '1500.0000',
        currency: 'GHS',
        type: 'repayment',
        status: 'completed',
        eventDate: new Date(),
      },
      {
        customerId: CUSTOMER_ID,
        contractId: 'contract-002',
        nationalId: NATIONAL_ID_GH,
        amount: '3000.0000',
        currency: 'GHS',
        type: 'default',
        status: 'default',
        reason: 'Payment default',
        eventDate: new Date(),
      },
    ];

    const result = await service.submitBatch(TENANT_ID, 'GH', records);

    expect(result.totalRecords).toBe(3);
    expect(result.successCount).toBe(3);
    expect(result.failureCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should submit default records as negative data', async () => {
    const records: BatchReportRecord[] = [
      {
        customerId: CUSTOMER_ID,
        contractId: 'contract-default-001',
        nationalId: NATIONAL_ID_GH,
        amount: '6200.0000',
        currency: 'GHS',
        type: 'default',
        status: 'default',
        reason: 'Overdue > 90 days',
        eventDate: new Date(),
      },
    ];

    const ghanaAdapter = factory.getAdapter('GH');
    const submitNegSpy = jest.spyOn(ghanaAdapter, 'submitNegativeData');

    const result = await service.submitBatch(TENANT_ID, 'GH', records);

    expect(result.successCount).toBe(1);
    expect(submitNegSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: CUSTOMER_ID,
        amount: '6200.0000',
        reason: 'Overdue > 90 days',
      }),
    );

    submitNegSpy.mockRestore();
  });

  it('should handle individual record failures within a batch', async () => {
    const ghanaAdapter = factory.getAdapter('GH');
    jest
      .spyOn(ghanaAdapter, 'submitPositiveData')
      .mockRejectedValueOnce(new Error('Bureau timeout'));

    const records: BatchReportRecord[] = [
      {
        customerId: CUSTOMER_ID,
        contractId: 'contract-fail-001',
        nationalId: NATIONAL_ID_GH,
        amount: '500.0000',
        currency: 'GHS',
        type: 'origination',
        status: 'active',
        eventDate: new Date(),
      },
      {
        customerId: CUSTOMER_ID,
        contractId: 'contract-ok-001',
        nationalId: NATIONAL_ID_GH,
        amount: '800.0000',
        currency: 'GHS',
        type: 'repayment',
        status: 'completed',
        eventDate: new Date(),
      },
    ];

    const result = await service.submitBatch(TENANT_ID, 'GH', records);

    expect(result.totalRecords).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].recordIndex).toBe(0);
    expect(result.errors[0].error).toContain('Bureau timeout');

    jest.restoreAllMocks();
  });
});
