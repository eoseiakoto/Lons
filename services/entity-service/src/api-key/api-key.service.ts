import { Injectable, BadRequestException, NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import * as crypto from 'crypto';

import { QuotaEnforcementService } from '../plan-tier/quota-enforcement.service';

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

/**
 * Security Hardening (SEC-3): API key creation now also returns a
 * companion `plaintextSecret`. The pair (key, secret) is the integrator's
 * credential — both are required at every authenticated REST call. Like
 * the key, the secret is shown only once on creation; we store its
 * SHA-256 hash and verify it via `crypto.timingSafeEqual` on every
 * `validateApiKey()` call.
 */
export interface ICreateApiKeyOutput extends IApiKeyResponse {
  plaintext: string; // key — only on creation
  plaintextSecret: string; // secret — only on creation
}

@Injectable()
export class ApiKeyService {
  constructor(
    private prisma: PrismaService,
    // Sprint 14 (S14-10): API-key quota enforcement.
    private quotaEnforcementService: QuotaEnforcementService,
  ) {}

  /**
   * Generate a new API key (lons_ prefix + 32 random bytes hex)
   * Store SHA-256 hash in database, return plaintext only once
   */
  async createApiKey(
    tenantId: string,
    input: ICreateApiKeyInput,
  ): Promise<ICreateApiKeyOutput> {
    // Sprint 14 (S14-10): plan-tier quota gate before any DB work or
    // entropy generation. Fail fast at the boundary.
    await this.quotaEnforcementService.checkEntityLimit(tenantId, 'api_keys');

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
    const keyBytes = crypto.randomBytes(32).toString('hex');
    const plaintextKey = `lons_${keyBytes}`;

    // Security Hardening (SEC-3): generate a separate plaintext secret.
    // The two are independent credentials — disclosing one doesn't reveal
    // the other. `lons_secret_` prefix lets integrators tell them apart
    // when they appear side-by-side in onboarding output.
    const secretBytes = crypto.randomBytes(32).toString('hex');
    const plaintextSecret = `lons_secret_${secretBytes}`;

    // Hash both for storage. SHA-256 is appropriate here because the
    // input is high-entropy random material — slow KDFs (bcrypt/argon2)
    // are unnecessary against brute force.
    const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');
    const secretHash = crypto.createHash('sha256').update(plaintextSecret).digest('hex');

    // Store in database
    const apiKey = await (this.prisma as any).apiKey.create({
      data: {
        tenantId,
        name: input.name,
        keyHash,
        secretHash,
        rateLimitPerMinute: input.rateLimitPerMin ?? 60,
        expiresAt: input.expiresAt,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyHash: this.maskKeyHash(apiKey.keyHash),
      plaintext: plaintextKey, // Only return plaintext on creation
      plaintextSecret, // Only return secret on creation (SEC-3)
      rateLimitPerMin: apiKey.rateLimitPerMinute,
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
      // SEC-3: schema column is `rateLimitPerMinute`; the previous
      // `key.rateLimitPerMin` reference was a typo that returned undefined.
      rateLimitPerMin: key.rateLimitPerMinute,
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
      rateLimitPerMin: key.rateLimitPerMinute,
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
   * Validate an API key + secret pair and return tenant context.
   *
   * Security Hardening (SEC-3): the previous implementation took only the
   * key — the X-API-Secret header in `ApiKeyGuard` was extracted but
   * never compared. Two-factor auth was security theater. We now require
   * both; the secret hash is compared with `crypto.timingSafeEqual` to
   * neutralise timing side channels.
   *
   * Generic `Invalid API credentials` errors avoid telling an attacker
   * which factor failed. We also short-circuit `lastUsedAt` updates on
   * authentication failure so a brute-force attempt doesn't pollute the
   * audit timeline.
   *
   * Used by `ApiKeyGuard` (REST) and any future GraphQL guard.
   */
  async validateApiKey(
    plaintextKey: string,
    plaintextSecret: string,
  ): Promise<{ tenantId: string; rateLimitPerMin: number; apiKeyId: string }> {
    if (!plaintextKey || !plaintextKey.startsWith('lons_')) {
      throw new ForbiddenException('Invalid API key format');
    }
    if (!plaintextSecret) {
      throw new UnauthorizedException('API secret is required');
    }

    const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');

    const apiKey = await (this.prisma as any).apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey) {
      // Generic message — do not leak whether key or secret was wrong.
      throw new ForbiddenException('Invalid API credentials');
    }

    // Check if revoked
    if (apiKey.revokedAt) {
      throw new ForbiddenException('API key is revoked');
    }

    // Check if expired
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new ForbiddenException('API key is expired');
    }

    // SEC-3: legacy keys created before the secret_hash column was added
    // carry an empty placeholder. They cannot authenticate at all — they
    // must be rotated. Fail closed with a clear-but-non-leaky message.
    if (!apiKey.secretHash || apiKey.secretHash.length === 0) {
      throw new ForbiddenException(
        'API key is missing a secret — rotate the key via the admin portal',
      );
    }

    // SEC-3: compute the candidate secret hash and compare with
    // timingSafeEqual. Both buffers must be the same length, which they
    // always are here (SHA-256 → 32 bytes / 64 hex chars), but we still
    // length-check before the compare to satisfy the API contract.
    const candidateSecretHash = crypto
      .createHash('sha256')
      .update(plaintextSecret)
      .digest('hex');
    const expected = Buffer.from(apiKey.secretHash, 'hex');
    const candidate = Buffer.from(candidateSecretHash, 'hex');
    if (
      expected.length !== candidate.length ||
      !crypto.timingSafeEqual(expected, candidate)
    ) {
      throw new ForbiddenException('Invalid API credentials');
    }

    // Update lastUsedAt (only after successful auth — see docstring).
    await (this.prisma as any).apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      tenantId: apiKey.tenantId,
      rateLimitPerMin: apiKey.rateLimitPerMinute,
      apiKeyId: apiKey.id,
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
