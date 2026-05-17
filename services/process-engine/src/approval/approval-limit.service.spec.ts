import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { REDIS_CLIENT } from '@lons/common';

import { ApprovalLimitService } from './approval-limit.service';

/**
 * Sprint 18 — S18-6 unit tests.
 *
 * The service guards approval mutations on four dimensions. Each
 * `describe` block isolates one dimension; the Redis client is a
 * hand-rolled in-memory mock so we can assert exact key shapes and
 * TTLs without standing up ioredis-mock.
 */
describe('ApprovalLimitService', () => {
  let service: ApprovalLimitService;
  let prisma: jest.Mocked<any>;
  let redis: any;
  let redisStore: Map<string, string>;
  let redisTTLs: Map<string, number>;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const operatorId = '22222222-2222-2222-2222-222222222222';

  const baseLimits = {
    id: 'limit-1',
    tenantId,
    userId: operatorId,
    maxApprovalAmount: '10000.0000',
    maxApprovalsPerDay: null as number | null,
    allowedProductTypes: null as string[] | null,
    canApproveEscalated: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const makeLoanRequest = (
    overrides: Partial<{ amount: string; productType: string; status: string }> = {},
  ) => ({
    requestedAmount: overrides.amount ?? '5000.0000',
    product: { productType: overrides.productType ?? 'micro_loan' },
    status: overrides.status ?? 'manual_review',
  });

  beforeEach(async () => {
    redisStore = new Map();
    redisTTLs = new Map();
    redis = {
      get: jest.fn(async (k: string) => redisStore.get(k) ?? null),
      set: jest.fn(async (k: string, v: string, _ex?: string, ttl?: number) => {
        redisStore.set(k, v);
        if (ttl) redisTTLs.set(k, ttl);
        return 'OK';
      }),
      del: jest.fn(async (k: string) => {
        const had = redisStore.delete(k);
        redisTTLs.delete(k);
        return had ? 1 : 0;
      }),
      incr: jest.fn(async (k: string) => {
        const next = (parseInt(redisStore.get(k) ?? '0', 10) || 0) + 1;
        redisStore.set(k, String(next));
        return next;
      }),
      expire: jest.fn(async (k: string, ttl: number) => {
        redisTTLs.set(k, ttl);
        return 1;
      }),
      ttl: jest.fn(async (k: string) => redisTTLs.get(k) ?? -1),
    };

    prisma = {
      operatorApprovalLimit: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      loanRequest: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalLimitService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(ApprovalLimitService);
  });

  describe('validateOperatorAction — no limits configured', () => {
    it('returns silently when operator has no limits row (backward compat)', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue(null);
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest({ amount: '999999.9999' }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('validateOperatorAction — isActive flag', () => {
    it('throws OPERATOR_SUSPENDED when isActive=false', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue({
        ...baseLimits,
        isActive: false,
      });
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest(),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('validateOperatorAction — amount limit', () => {
    it('passes when requested amount equals the cap', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue(baseLimits);
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest({ amount: '10000.0000' }),
        ),
      ).resolves.toBeUndefined();
    });

    it('throws APPROVAL_LIMIT_EXCEEDED when amount exceeds the cap', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue(baseLimits);
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest({ amount: '10000.0001' }),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'APPROVAL_LIMIT_EXCEEDED',
        }),
      });
    });

    it('skips amount check for non-approve actions', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue(baseLimits);
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'reject',
          makeLoanRequest({ amount: '999999.9999' }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('validateOperatorAction — daily approval count', () => {
    it('throws DAILY_APPROVAL_LIMIT_REACHED when count >= max', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue({
        ...baseLimits,
        maxApprovalsPerDay: 3,
      });
      // Redis miss → DB fallback
      prisma.loanRequest.count.mockResolvedValue(3);
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest(),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'DAILY_APPROVAL_LIMIT_REACHED',
        }),
      });
    });

    it('passes when count < max', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue({
        ...baseLimits,
        maxApprovalsPerDay: 10,
      });
      prisma.loanRequest.count.mockResolvedValue(5);
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest(),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('validateOperatorAction — product type restriction', () => {
    it('throws PRODUCT_TYPE_NOT_ALLOWED when product not in allowed list', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue({
        ...baseLimits,
        allowedProductTypes: ['overdraft'],
      });
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest({ productType: 'micro_loan' }),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'PRODUCT_TYPE_NOT_ALLOWED',
        }),
      });
    });

    it('passes when product is in allowed list', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue({
        ...baseLimits,
        allowedProductTypes: ['overdraft', 'micro_loan'],
      });
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest({ productType: 'micro_loan' }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('validateOperatorAction — escalated restriction', () => {
    it('throws CANNOT_APPROVE_ESCALATED for escalated requests when flag off', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue({
        ...baseLimits,
        canApproveEscalated: false,
      });
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest({ status: 'escalated' }),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CANNOT_APPROVE_ESCALATED',
        }),
      });
    });

    it('passes for escalated requests when canApproveEscalated=true', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue({
        ...baseLimits,
        canApproveEscalated: true,
      });
      await expect(
        service.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest({ status: 'escalated' }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('cache behaviour', () => {
    it('writes limits to Redis after a DB read', async () => {
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue(baseLimits);
      await service.getOperatorLimits(tenantId, operatorId);
      expect(redis.set).toHaveBeenCalledWith(
        `approval_limits:${tenantId}:${operatorId}`,
        expect.any(String),
        'EX',
        300,
      );
    });

    it('reads limits from Redis on subsequent calls (no DB hit)', async () => {
      redisStore.set(
        `approval_limits:${tenantId}:${operatorId}`,
        JSON.stringify(baseLimits),
      );
      await service.getOperatorLimits(tenantId, operatorId);
      expect(prisma.operatorApprovalLimit.findUnique).not.toHaveBeenCalled();
    });

    it('invalidates cache on setLimits', async () => {
      redisStore.set(
        `approval_limits:${tenantId}:${operatorId}`,
        JSON.stringify(baseLimits),
      );
      prisma.operatorApprovalLimit.upsert.mockResolvedValue(baseLimits);
      await service.setLimits(tenantId, operatorId, {
        maxApprovalAmount: '20000.0000',
      });
      expect(redis.del).toHaveBeenCalledWith(
        `approval_limits:${tenantId}:${operatorId}`,
      );
    });
  });

  describe('incrementDailyCount', () => {
    it('increments the counter and sets a 24h TTL on first increment', async () => {
      await service.incrementDailyCount(tenantId, operatorId);
      const today = new Date().toISOString().split('T')[0];
      const key = `approval_count:${tenantId}:${operatorId}:${today}`;
      expect(redis.incr).toHaveBeenCalledWith(key);
      expect(redis.expire).toHaveBeenCalledWith(key, 86400);
    });

    it('does not reset TTL on subsequent increments', async () => {
      const today = new Date().toISOString().split('T')[0];
      const key = `approval_count:${tenantId}:${operatorId}:${today}`;
      redisStore.set(key, '1');
      redisTTLs.set(key, 50000);
      await service.incrementDailyCount(tenantId, operatorId);
      // Should call ttl(); since TTL > 0, expire() is NOT called again.
      expect(redis.ttl).toHaveBeenCalledWith(key);
      expect(redis.expire).not.toHaveBeenCalled();
    });
  });

  describe('Redis-down fallback', () => {
    it('still validates when Redis is absent', async () => {
      // Re-build service without REDIS_CLIENT
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApprovalLimitService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      const noRedisService = module.get(ApprovalLimitService);
      prisma.operatorApprovalLimit.findUnique.mockResolvedValue(baseLimits);
      await expect(
        noRedisService.validateOperatorAction(
          tenantId,
          operatorId,
          'approve',
          makeLoanRequest({ amount: '99999.9999' }),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'APPROVAL_LIMIT_EXCEEDED',
        }),
      });
    });
  });
});
