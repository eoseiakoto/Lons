import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import * as crypto from 'crypto';

export interface ICreateApiKeyInput {
  name: string;
  rateLimitPerMin?: number;
  expiresAt?: Date;
}

export interface IApiKeyResponse {
  id: string;
  name: string;
  keyHash: string; // masked
  rateLimitPerMin: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface ICreateApiKeyOutput extends IApiKeyResponse {
  plaintext: string; // only on creation
}

@Injectable()
export class ApiKeyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate a new API key (lons_ prefix + 32 random bytes hex)
   * Store SHA-256 hash in database, return plaintext only once
   */
  async createApiKey(
    tenantId: string,
    input: ICreateApiKeyInput,
  ): Promise<ICreateApiKeyOutput> {
    // Validate input
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestException('API key name is required');
    }

    if (input.name.length > 255) {
      throw new BadRequestException('API key name must be 255 characters or less');
    }

    // Check for duplicate name in tenant
    const existing = await (this.prisma as any).apiKey.findFirst({
      where: {
        tenantId,
        name: input.name,
        revokedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException('API key with this name already exists');
    }

    // Validate expiry
    if (input.expiresAt && input.expiresAt <= new Date()) {
      throw new BadRequestException('Expiry date must be in the future');
    }

    // Generate plaintext key: lons_ + 32 random bytes (64 hex chars)
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const plaintextKey = `lons_${randomBytes}`;

    // Hash the key for storage
    const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');

    // Store in database
    const apiKey = await (this.prisma as any).apiKey.create({
      data: {
        tenantId,
        name: input.name,
        keyHash,
        rateLimitPerMin: input.rateLimitPerMin ?? 60,
        expiresAt: input.expiresAt,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyHash: this.maskKeyHash(apiKey.keyHash),
      plaintext: plaintextKey, // Only return plaintext on creation
      rateLimitPerMin: apiKey.rateLimitPerMin,
      expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
      createdAt: apiKey.createdAt.toISOString(),
    };
  }

  /**
   * List API keys for a tenant (masked)
   */
  async listApiKeys(tenantId: string) {
    const keys = await (this.prisma as any).apiKey.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return keys.map((key: any) => ({
      id: key.id,
      name: key.name,
      keyHash: this.maskKeyHash(key.keyHash),
      rateLimitPerMin: key.rateLimitPerMin,
      expiresAt: key.expiresAt ? key.expiresAt.toISOString() : null,
      revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
      lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
      createdAt: key.createdAt.toISOString(),
      updatedAt: key.updatedAt.toISOString(),
    }));
  }

  /**
   * Get a single API key by ID (masked)
   */
  async getApiKey(tenantId: string, apiKeyId: string) {
    const key = await (this.prisma as any).apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!key || key.tenantId !== tenantId) {
      throw new NotFoundException('API key not found');
    }

    return {
      id: key.id,
      name: key.name,
      keyHash: this.maskKeyHash(key.keyHash),
      rateLimitPerMin: key.rateLimitPerMin,
      expiresAt: key.expiresAt ? key.expiresAt.toISOString() : null,
      revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
      lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
      createdAt: key.createdAt.toISOString(),
      updatedAt: key.updatedAt.toISOString(),
    };
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(tenantId: string, apiKeyId: string): Promise<void> {
    const key = await (this.prisma as any).apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!key || key.tenantId !== tenantId) {
      throw new NotFoundException('API key not found');
    }

    if (key.revokedAt) {
      throw new BadRequestException('API key is already revoked');
    }

    await (this.prisma as any).apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Validate an API key and return tenant context
   * Used by API key authentication middleware
   */
  async validateApiKey(plaintextKey: string): Promise<{ tenantId: string; rateLimitPerMin: number }> {
    if (!plaintextKey.startsWith('lons_')) {
      throw new ForbiddenException('Invalid API key format');
    }

    const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');

    const apiKey = await (this.prisma as any).apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey) {
      throw new ForbiddenException('Invalid API key');
    }

    // Check if revoked
    if (apiKey.revokedAt) {
      throw new ForbiddenException('API key is revoked');
    }

    // Check if expired
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new ForbiddenException('API key is expired');
    }

    // Update lastUsedAt
    await (this.prisma as any).apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      tenantId: apiKey.tenantId,
      rateLimitPerMin: apiKey.rateLimitPerMin,
    };
  }

  /**
   * Mask the key hash for display (show first 4 and last 4 chars)
   */
  private maskKeyHash(hash: string): string {
    if (hash.length < 8) return '****';
    return `${hash.substring(0, 4)}...${hash.substring(hash.length - 4)}`;
  }
}
