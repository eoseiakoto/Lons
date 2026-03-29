import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import * as crypto from 'crypto';
import { ApiKeyService } from './api-key.service';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let prisma: PrismaService;

  const mockTenantId = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: PrismaService,
          useValue: {
            apiKey: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('createApiKey', () => {
    it('should create a new API key with generated plaintext', async () => {
      const input = {
        name: 'Test Key',
        rateLimitPerMin: 100,
      };

      jest.spyOn((prisma as any).apiKey, 'findFirst').mockResolvedValue(null);
      jest.spyOn((prisma as any).apiKey, 'create').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: input.name,
        keyHash: 'somehash',
        rateLimitPerMin: input.rateLimitPerMin,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createApiKey(mockTenantId, input);

      expect(result.id).toBeDefined();
      expect(result.name).toBe(input.name);
      expect(result.plaintext).toBeDefined();
      expect(result.plaintext).toMatch(/^lons_[a-f0-9]{64}$/);
      expect(result.keyHash).toMatch(/^[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/);
      expect(result.rateLimitPerMin).toBe(input.rateLimitPerMin);
      expect((prisma as any).apiKey.create).toHaveBeenCalled();
    });

    it('should use default rate limit of 60 if not specified', async () => {
      const input = { name: 'Default Rate Limit Key' };

      jest.spyOn((prisma as any).apiKey, 'findFirst').mockResolvedValue(null);
      const createSpy = jest.spyOn((prisma as any).apiKey, 'create').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: input.name,
        keyHash: 'somehash',
        rateLimitPerMin: 60,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createApiKey(mockTenantId, input);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rateLimitPerMin: 60,
          }),
        }),
      );
    });

    it('should throw if name is empty', async () => {
      await expect(service.createApiKey(mockTenantId, { name: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if name is too long', async () => {
      const longName = 'a'.repeat(256);
      await expect(service.createApiKey(mockTenantId, { name: longName })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if duplicate name exists', async () => {
      const input = { name: 'Existing Key' };

      jest.spyOn((prisma as any).apiKey, 'findFirst').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000003',
        tenantId: mockTenantId,
        name: input.name,
        keyHash: 'existinghash',
        rateLimitPerMin: 60,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.createApiKey(mockTenantId, input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if expiry date is in the past', async () => {
      const input = {
        name: 'Expired Key',
        expiresAt: new Date(Date.now() - 1000),
      };

      jest.spyOn((prisma as any).apiKey, 'findFirst').mockResolvedValue(null);

      await expect(service.createApiKey(mockTenantId, input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should accept valid future expiry date', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const input = {
        name: 'Future Expiry Key',
        expiresAt: futureDate,
      };

      jest.spyOn((prisma as any).apiKey, 'findFirst').mockResolvedValue(null);
      jest.spyOn((prisma as any).apiKey, 'create').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: input.name,
        keyHash: 'somehash',
        rateLimitPerMin: 60,
        expiresAt: futureDate,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createApiKey(mockTenantId, input);
      expect(result.expiresAt).toBe(futureDate.toISOString());
    });

    it('should hash the plaintext key for storage', async () => {
      const input = { name: 'Hashed Key' };

      jest.spyOn((prisma as any).apiKey, 'findFirst').mockResolvedValue(null);
      const createSpy = jest.spyOn((prisma as any).apiKey, 'create').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: input.name,
        keyHash: 'somehash',
        rateLimitPerMin: 60,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createApiKey(mockTenantId, input);

      const createCall = createSpy.mock.calls[0] as any[];
      const keyHash = createCall[0].data.keyHash;

      expect(keyHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 is 64 hex chars
    });
  });

  describe('listApiKeys', () => {
    it('should return list of API keys for tenant', async () => {
      const mockKeys = [
        {
          id: '00000000-0000-0000-0000-000000000002',
          tenantId: mockTenantId,
          name: 'Key 1',
          keyHash: 'hash1',
          rateLimitPerMin: 60,
          expiresAt: null,
          revokedAt: null,
          lastUsedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          tenantId: mockTenantId,
          name: 'Key 2',
          keyHash: 'hash2',
          rateLimitPerMin: 100,
          expiresAt: new Date(),
          revokedAt: null,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn((prisma as any).apiKey, 'findMany').mockResolvedValue(mockKeys);

      const result = await service.listApiKeys(mockTenantId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Key 1');
      expect(result[1].name).toBe('Key 2');
      expect((prisma as any).apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: mockTenantId },
        }),
      );
    });

    it('should mask key hashes in list', async () => {
      const mockKeys = [
        {
          id: '00000000-0000-0000-0000-000000000002',
          tenantId: mockTenantId,
          name: 'Key 1',
          keyHash: 'abcdef0123456789abcdef0123456789',
          rateLimitPerMin: 60,
          expiresAt: null,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn((prisma as any).apiKey, 'findMany').mockResolvedValue(mockKeys);

      const result = await service.listApiKeys(mockTenantId);

      expect(result[0].keyHash).toMatch(/^[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/);
    });
  });

  describe('getApiKey', () => {
    it('should return a single API key', async () => {
      const mockKey = {
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: 'Single Key',
        keyHash: 'somehash',
        rateLimitPerMin: 60,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(mockKey);

      const result = await service.getApiKey(mockTenantId, mockKey.id);

      expect(result.name).toBe('Single Key');
      expect((prisma as any).apiKey.findUnique).toHaveBeenCalledWith({
        where: { id: mockKey.id },
      });
    });

    it('should throw if API key not found', async () => {
      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(null);

      await expect(service.getApiKey(mockTenantId, 'nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if API key belongs to different tenant', async () => {
      const mockKey = {
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: '00000000-0000-0000-0000-000000000099', // different tenant
        name: 'Other Tenant Key',
        keyHash: 'somehash',
        rateLimitPerMin: 60,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(mockKey);

      await expect(service.getApiKey(mockTenantId, mockKey.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an active API key', async () => {
      const mockKey = {
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: 'To Revoke',
        keyHash: 'somehash',
        rateLimitPerMin: 60,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(mockKey);
      const updateSpy = jest.spyOn((prisma as any).apiKey, 'update').mockResolvedValue({
        ...mockKey,
        revokedAt: new Date(),
      });

      await service.revokeApiKey(mockTenantId, mockKey.id);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockKey.id },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should throw if API key not found', async () => {
      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(null);

      await expect(service.revokeApiKey(mockTenantId, 'nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if already revoked', async () => {
      const mockKey = {
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: 'Already Revoked',
        keyHash: 'somehash',
        rateLimitPerMin: 60,
        expiresAt: null,
        revokedAt: new Date(),
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(mockKey);

      await expect(service.revokeApiKey(mockTenantId, mockKey.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateApiKey', () => {
    it('should validate a valid API key', async () => {
      const plaintextKey = 'lons_' + crypto.randomBytes(32).toString('hex');
      const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');

      const mockKey = {
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: 'Valid Key',
        keyHash,
        rateLimitPerMin: 100,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(mockKey);
      const updateSpy = jest.spyOn((prisma as any).apiKey, 'update').mockResolvedValue({
        ...mockKey,
        lastUsedAt: new Date(),
      });

      const result = await service.validateApiKey(plaintextKey);

      expect(result.tenantId).toBe(mockTenantId);
      expect(result.rateLimitPerMin).toBe(100);
      expect(updateSpy).toHaveBeenCalled();
    });

    it('should throw if key does not start with lons_', async () => {
      await expect(service.validateApiKey('invalid_key')).rejects.toThrow(ForbiddenException);
    });

    it('should throw if key not found', async () => {
      const plaintextKey = 'lons_' + crypto.randomBytes(32).toString('hex');
      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(null);

      await expect(service.validateApiKey(plaintextKey)).rejects.toThrow(ForbiddenException);
    });

    it('should throw if key is revoked', async () => {
      const plaintextKey = 'lons_' + crypto.randomBytes(32).toString('hex');
      const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');

      const mockKey = {
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: 'Revoked Key',
        keyHash,
        rateLimitPerMin: 60,
        expiresAt: null,
        revokedAt: new Date(),
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(mockKey);

      await expect(service.validateApiKey(plaintextKey)).rejects.toThrow(ForbiddenException);
    });

    it('should throw if key is expired', async () => {
      const plaintextKey = 'lons_' + crypto.randomBytes(32).toString('hex');
      const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');

      const mockKey = {
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: 'Expired Key',
        keyHash,
        rateLimitPerMin: 60,
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(mockKey);

      await expect(service.validateApiKey(plaintextKey)).rejects.toThrow(ForbiddenException);
    });

    it('should update lastUsedAt on validation', async () => {
      const plaintextKey = 'lons_' + crypto.randomBytes(32).toString('hex');
      const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');

      const mockKey = {
        id: '00000000-0000-0000-0000-000000000002',
        tenantId: mockTenantId,
        name: 'Active Key',
        keyHash,
        rateLimitPerMin: 60,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn((prisma as any).apiKey, 'findUnique').mockResolvedValue(mockKey);
      const updateSpy = jest.spyOn((prisma as any).apiKey, 'update').mockResolvedValue({
        ...mockKey,
        lastUsedAt: new Date(),
      });

      await service.validateApiKey(plaintextKey);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockKey.id },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });
});
