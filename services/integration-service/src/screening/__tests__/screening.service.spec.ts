import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { ScreeningService } from '../screening.service';
import { ScreeningAdapterResolver } from '../screening-adapter.resolver';
import { IScreeningResult, ScreeningMatchType } from '../screening.interface';

// Mock PrismaService
const mockPrisma = {
  customer: {
    findFirst: jest.fn(),
  },
  screeningResult: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

// Mock EventBusService
const mockEventBus = {
  emitAndBuild: jest.fn(),
};

// Mock adapter
const mockAdapter = {
  screenCustomer: jest.fn(),
  getScreeningStatus: jest.fn(),
  getProviderName: jest.fn().mockReturnValue('mock'),
};

// Mock adapter resolver
const mockAdapterResolver = {
  resolve: jest.fn().mockReturnValue(mockAdapter),
  getProviderName: jest.fn().mockReturnValue('mock'),
};

const mockConfigService = {
  get: jest.fn((key: string, def: string) => {
    if (key === 'SCREENING_CACHE_TTL_HOURS') return '24';
    return def;
  }),
} as unknown as ConfigService;

describe('ScreeningService', () => {
  let service: ScreeningService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ScreeningService(
      mockPrisma as any,
      mockEventBus as any,
      mockAdapterResolver as unknown as ScreeningAdapterResolver,
      mockConfigService,
    );
  });

  describe('screenCustomer', () => {
    const tenantId = 'tenant-001';
    const customerId = 'cust-001';

    const mockCustomer = {
      id: customerId,
      tenantId,
      fullName: 'John Doe',
      externalId: 'ext-001',
      dateOfBirth: null,
      nationalId: null,
      country: 'GH',
      deletedAt: null,
    };

    const clearResult: IScreeningResult = {
      customerId,
      tenantId,
      screeningId: 'scr-001',
      status: 'CLEAR',
      riskLevel: 'LOW',
      matches: [],
      provider: 'mock',
      screenedAt: new Date(),
    };

    it('should return cached CLEAR result if within TTL', async () => {
      const recentScreening = {
        id: 'db-scr-001',
        tenantId,
        customerId,
        status: 'CLEAR',
        riskLevel: 'LOW',
        matchCount: 0,
        matchDetails: [],
        rawResponse: null,
        provider: 'mock',
        screenedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        reviewedBy: null,
        reviewedAt: null,
        reviewDecision: null,
      };

      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(recentScreening);

      const result = await service.screenCustomer(tenantId, customerId);

      expect(result.status).toBe('CLEAR');
      expect(result.screeningId).toBe('db-scr-001');
      // The adapter should NOT have been called (cache hit)
      expect(mockAdapter.screenCustomer).not.toHaveBeenCalled();
    });

    it('should call adapter when no cached result exists', async () => {
      // No cached result
      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(null);
      // Customer lookup
      mockPrisma.customer.findFirst.mockResolvedValueOnce(mockCustomer);
      // Adapter returns CLEAR
      mockAdapter.screenCustomer.mockResolvedValueOnce(clearResult);
      // DB create
      mockPrisma.screeningResult.create.mockResolvedValueOnce({
        id: 'db-scr-002',
        ...clearResult,
      });

      const result = await service.screenCustomer(tenantId, customerId);

      expect(mockAdapter.screenCustomer).toHaveBeenCalledTimes(1);
      expect(mockPrisma.screeningResult.create).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('CLEAR');
    });

    it('should throw NotFoundException when customer does not exist', async () => {
      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(null);
      mockPrisma.customer.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.screenCustomer(tenantId, customerId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should emit SCREENING_INITIATED and SCREENING_CLEAR events for a clear result', async () => {
      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(null);
      mockPrisma.customer.findFirst.mockResolvedValueOnce(mockCustomer);
      mockAdapter.screenCustomer.mockResolvedValueOnce(clearResult);
      mockPrisma.screeningResult.create.mockResolvedValueOnce({
        id: 'db-scr-003',
        ...clearResult,
      });

      await service.screenCustomer(tenantId, customerId);

      // SCREENING_INITIATED + SCREENING_CLEAR = 2 calls
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledTimes(2);
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'screening.initiated',
        tenantId,
        expect.objectContaining({ customerId, provider: 'mock' }),
      );
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'screening.clear',
        tenantId,
        expect.objectContaining({ customerId, status: 'CLEAR' }),
      );
    });

    it('should emit MATCH_FOUND event for a MATCH result', async () => {
      const matchResult: IScreeningResult = {
        ...clearResult,
        status: 'MATCH',
        riskLevel: 'CRITICAL',
        matches: [
          {
            matchId: 'm-1',
            matchType: ScreeningMatchType.SANCTIONS,
            entityName: 'Test',
            matchScore: 95,
            source: 'OFAC',
          },
        ],
      };

      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(null);
      mockPrisma.customer.findFirst.mockResolvedValueOnce(mockCustomer);
      mockAdapter.screenCustomer.mockResolvedValueOnce(matchResult);
      mockPrisma.screeningResult.create.mockResolvedValueOnce({
        id: 'db-scr-004',
        ...matchResult,
      });

      await service.screenCustomer(tenantId, customerId);

      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'screening.match.found',
        tenantId,
        expect.objectContaining({ customerId, status: 'MATCH' }),
      );
    });

    it('should emit POTENTIAL_MATCH and MANUAL_REVIEW_REQUIRED events', async () => {
      const potentialResult: IScreeningResult = {
        ...clearResult,
        status: 'POTENTIAL_MATCH',
        riskLevel: 'HIGH',
        matches: [
          {
            matchId: 'm-2',
            matchType: ScreeningMatchType.PEP,
            entityName: 'Test PEP',
            matchScore: 75,
            source: 'PEP DB',
          },
        ],
      };

      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(null);
      mockPrisma.customer.findFirst.mockResolvedValueOnce(mockCustomer);
      mockAdapter.screenCustomer.mockResolvedValueOnce(potentialResult);
      mockPrisma.screeningResult.create.mockResolvedValueOnce({
        id: 'db-scr-005',
        ...potentialResult,
      });

      await service.screenCustomer(tenantId, customerId);

      // INITIATED + POTENTIAL_MATCH + MANUAL_REVIEW_REQUIRED = 3 calls
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledTimes(3);
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'screening.potential_match',
        tenantId,
        expect.objectContaining({ status: 'POTENTIAL_MATCH' }),
      );
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'screening.manual_review.required',
        tenantId,
        expect.objectContaining({ customerId }),
      );
    });

    it('should store result in database with correct fields', async () => {
      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(null);
      mockPrisma.customer.findFirst.mockResolvedValueOnce(mockCustomer);
      mockAdapter.screenCustomer.mockResolvedValueOnce(clearResult);
      mockPrisma.screeningResult.create.mockResolvedValueOnce({
        id: 'db-scr-006',
        ...clearResult,
      });

      await service.screenCustomer(tenantId, customerId);

      expect(mockPrisma.screeningResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          customerId,
          provider: 'mock',
          status: 'CLEAR',
          riskLevel: 'LOW',
          matchCount: 0,
          matchDetails: [],
          externalId: 'scr-001',
        }),
      });
    });
  });

  describe('getLatestScreening', () => {
    it('should return null when no screenings exist', async () => {
      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(null);

      const result = await service.getLatestScreening('tenant-001', 'cust-001');

      expect(result).toBeNull();
    });

    it('should return mapped result when screening exists', async () => {
      const dbRecord = {
        id: 'db-001',
        tenantId: 'tenant-001',
        customerId: 'cust-001',
        status: 'CLEAR',
        riskLevel: 'LOW',
        matchDetails: [],
        rawResponse: null,
        provider: 'mock',
        screenedAt: new Date(),
      };

      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(dbRecord);

      const result = await service.getLatestScreening('tenant-001', 'cust-001');

      expect(result).not.toBeNull();
      expect(result!.screeningId).toBe('db-001');
      expect(result!.status).toBe('CLEAR');
    });
  });

  describe('getScreeningsForReview', () => {
    it('should query for POTENTIAL_MATCH screenings without reviews', async () => {
      mockPrisma.screeningResult.findMany.mockResolvedValueOnce([]);

      await service.getScreeningsForReview('tenant-001');

      expect(mockPrisma.screeningResult.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-001',
          status: 'POTENTIAL_MATCH',
          reviewedAt: null,
        },
        orderBy: { screenedAt: 'desc' },
        take: 50,
      });
    });
  });

  describe('submitReview', () => {
    it('should update the screening with review details', async () => {
      const dbRecord = {
        id: 'scr-001',
        tenantId: 'tenant-001',
        customerId: 'cust-001',
        status: 'POTENTIAL_MATCH',
        riskLevel: 'HIGH',
        matchDetails: [],
        rawResponse: null,
        provider: 'mock',
        screenedAt: new Date(),
        reviewedBy: null,
        reviewedAt: null,
        reviewDecision: null,
      };

      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(dbRecord);
      mockPrisma.screeningResult.update.mockResolvedValueOnce({
        ...dbRecord,
        reviewedBy: 'user-001',
        reviewedAt: new Date(),
        reviewDecision: 'false_positive',
      });

      await service.submitReview(
        'tenant-001',
        'scr-001',
        'false_positive',
        'user-001',
      );

      expect(mockPrisma.screeningResult.update).toHaveBeenCalledWith({
        where: { id: 'scr-001' },
        data: expect.objectContaining({
          reviewedBy: 'user-001',
          reviewDecision: 'false_positive',
        }),
      });
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'screening.manual_review.completed',
        'tenant-001',
        expect.objectContaining({
          screeningId: 'scr-001',
          decision: 'false_positive',
          reviewedBy: 'user-001',
        }),
      );
    });

    it('should throw NotFoundException for unknown screening ID', async () => {
      mockPrisma.screeningResult.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.submitReview('tenant-001', 'unknown', 'clear', 'user-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
