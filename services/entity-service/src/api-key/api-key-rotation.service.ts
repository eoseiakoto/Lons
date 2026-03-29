import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyRotationService {
  private readonly logger = new Logger(ApiKeyRotationService.name);

  constructor(private prisma: PrismaService) {}

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

    // Generate new key and secret
    const newKey = `lons_${crypto.randomBytes(24).toString('hex')}`;
    const newSecret = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(`${newKey}:${newSecret}`).digest('hex');

    const gracePeriodMs = gracePeriodHours * 60 * 60 * 1000;

    // Transaction: create new key + set grace period on old key
    const [newApiKey] = await this.prisma.$transaction([
      (this.prisma as any).apiKey.create({
        data: {
          tenantId,
          name: existingKey.name,
          keyHash,
          rateLimitPerMin: existingKey.rateLimitPerMin,
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

    return { id: newApiKey.id, key: newKey, secret: newSecret, name: existingKey.name, createdAt: newApiKey.createdAt };
  }

  async revokeApiKey(tenantId: string, apiKeyId: string): Promise<void> {
    const key = await (this.prisma as any).apiKey.findFirst({
      where: { id: apiKeyId, tenantId, revokedAt: null },
    });

    if (!key) {
      throw new NotFoundException(`API key ${apiKeyId} not found or already revoked`);
    }

    await (this.prisma as any).apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`Revoked API key ${apiKeyId}`);
  }

  async listActiveKeys(tenantId: string) {
    return (this.prisma as any).apiKey.findMany({
      where: { tenantId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { id: true, name: true, rateLimitPerMin: true, expiresAt: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
