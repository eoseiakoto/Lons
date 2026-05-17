import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { AuditActionType, AuditResourceType } from '@lons/common';
import * as crypto from 'crypto';

import { AuditService } from '../audit/audit.service';

@Injectable()
export class ApiKeyRotationService {
  private readonly logger = new Logger(ApiKeyRotationService.name);

  constructor(
    private prisma: PrismaService,
    // S17-FIX-BA-3 — FR-SEC-002.3 mandates audit trail for credential
    // lifecycle events. Both rotation and revocation now write an
    // entry via AuditService — never including key values or hashes,
    // only IDs and lifecycle metadata.
    private auditService: AuditService,
  ) {}

  async rotateApiKey(
    tenantId: string,
    apiKeyId: string,
    gracePeriodHours = 24,
  ): Promise<{ id: string; key: string; secret: string; name: string; createdAt: Date }> {
    const existingKey = await (this.prisma as any).apiKey.findFirst({
      where: { id: apiKeyId, tenantId, revokedAt: null },
    });

    if (!existingKey) {
      throw new NotFoundException(`API key ${apiKeyId} not found or already revoked`);
    }

    // Security Hardening (SEC-3): generate independent key + secret. The
    // previous implementation combined them into a single hash
    // (`hash(key:secret)`), which was incompatible with `validateApiKey`'s
    // two-column timing-safe comparison and silently broke rotated keys.
    const newKey = `lons_${crypto.randomBytes(32).toString('hex')}`;
    const newSecret = `lons_secret_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(newKey).digest('hex');
    const secretHash = crypto.createHash('sha256').update(newSecret).digest('hex');

    const gracePeriodMs = gracePeriodHours * 60 * 60 * 1000;

    // Transaction: create new key + set grace period on old key
    const [newApiKey] = await this.prisma.$transaction([
      (this.prisma as any).apiKey.create({
        data: {
          tenantId,
          name: existingKey.name,
          keyHash,
          // SEC-3: store the secret hash alongside the key hash.
          secretHash,
          // SEC-3: schema column is `rateLimitPerMinute`; the previous
          // `rateLimitPerMin` was a typo that wrote to no column.
          rateLimitPerMinute: existingKey.rateLimitPerMinute ?? 60,
        },
      }),
      // Rename old key to avoid unique constraint, set expiry for grace period
      (this.prisma as any).apiKey.update({
        where: { id: apiKeyId },
        data: {
          name: `${existingKey.name}_rotated_${Date.now()}`,
          expiresAt: new Date(Date.now() + gracePeriodMs),
        },
      }),
    ]);

    this.logger.log(`Rotated API key ${apiKeyId} → ${newApiKey.id} with ${gracePeriodHours}h grace period`);

    // S17-FIX-BA-3 — audit trail for the rotation. IDs + grace period
    // only; never the key/secret plaintext or hashes.
    await this.auditService.log({
      tenantId,
      actorType: 'system',
      action: AuditActionType.API_KEY_ROTATED,
      resourceType: AuditResourceType.API_KEY,
      resourceId: apiKeyId,
      metadata: {
        previousKeyId: apiKeyId,
        newKeyId: newApiKey.id,
        gracePeriodHours,
      },
    });

    return { id: newApiKey.id, key: newKey, secret: newSecret, name: existingKey.name, createdAt: newApiKey.createdAt };
  }

  async revokeApiKey(tenantId: string, apiKeyId: string): Promise<void> {
    const key = await (this.prisma as any).apiKey.findFirst({
      where: { id: apiKeyId, tenantId, revokedAt: null },
    });

    if (!key) {
      throw new NotFoundException(`API key ${apiKeyId} not found or already revoked`);
    }

    const revokedAt = new Date();
    await (this.prisma as any).apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt },
    });

    this.logger.log(`Revoked API key ${apiKeyId}`);

    // S17-FIX-BA-3 — audit trail for the revocation.
    await this.auditService.log({
      tenantId,
      actorType: 'system',
      action: AuditActionType.API_KEY_REVOKED,
      resourceType: AuditResourceType.API_KEY,
      resourceId: apiKeyId,
      metadata: {
        revokedAt: revokedAt.toISOString(),
      },
    });
  }

  async listActiveKeys(tenantId: string) {
    return (this.prisma as any).apiKey.findMany({
      where: { tenantId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      // SEC-3: schema column is `rateLimitPerMinute`.
      select: { id: true, name: true, rateLimitPerMinute: true, expiresAt: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
