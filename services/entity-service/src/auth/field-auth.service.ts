import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@lons/common';

/**
 * S19-12 / FR-AUTH-002.2 — production field-level authorisation
 * service.
 *
 * Drives the FieldAuthInterceptor: for each (resourceType,
 * fieldName) pair, returns the required permissions + redaction
 * behaviour. Tenant overrides take precedence over platform
 * defaults (tenant_id IS NULL rows).
 *
 * Caching: rules per (tenantId, resourceType) are cached in Redis
 * for 10 minutes. Cache key shape: `field_auth:<tenantId>:<resource>`.
 * A tenant updating its overrides should bust the cache; for now we
 * rely on TTL — a 10-minute lag on a config change is acceptable
 * for a permission tightening (the worst case is a brief window
 * where a user can see a field they shouldn't, never the inverse).
 *
 * Without Redis (e.g. tests), falls through to the DB on every call.
 */
export interface FieldAuthRule {
  /** User must have AT LEAST ONE of these permissions to see the field. */
  requiredPermissions: string[];
  /** 'redact' returns null in place of the value; 'error' throws ForbiddenException. */
  behavior: 'redact' | 'error';
}

@Injectable()
export class FieldAuthService {
  private readonly logger = new Logger(FieldAuthService.name);
  private static readonly CACHE_TTL_SECONDS = 600;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /**
   * Load the merged rule set for a resource type. Platform defaults
   * (tenant_id IS NULL) are loaded first; tenant overrides replace
   * them on a per-fieldName basis.
   */
  async getFieldAuthRules(
    tenantId: string,
    resourceType: string,
  ): Promise<Map<string, FieldAuthRule>> {
    const cacheKey = `field_auth:${tenantId}:${resourceType}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Record<string, FieldAuthRule>;
          return new Map(Object.entries(parsed));
        }
      } catch (err) {
        // Cache read errors are non-fatal — fall through to DB.
        this.logger.warn(`field-auth cache read failed: ${(err as Error).message}`);
      }
    }

    const [platformDefaults, tenantOverrides] = await Promise.all([
      this.prisma.fieldAuthConfig.findMany({
        where: { tenantId: null, resourceType, isActive: true },
      }),
      this.prisma.fieldAuthConfig.findMany({
        where: { tenantId, resourceType, isActive: true },
      }),
    ]);

    const merged = new Map<string, FieldAuthRule>();
    for (const rule of platformDefaults) {
      merged.set(rule.fieldName, {
        requiredPermissions: rule.requiredPermissions,
        behavior: (rule.behavior as 'redact' | 'error') ?? 'redact',
      });
    }
    // Tenant overrides win on the same fieldName.
    for (const rule of tenantOverrides) {
      merged.set(rule.fieldName, {
        requiredPermissions: rule.requiredPermissions,
        behavior: (rule.behavior as 'redact' | 'error') ?? 'redact',
      });
    }

    if (this.redis) {
      try {
        await this.redis.setex(
          cacheKey,
          FieldAuthService.CACHE_TTL_SECONDS,
          JSON.stringify(Object.fromEntries(merged)),
        );
      } catch (err) {
        this.logger.warn(`field-auth cache write failed: ${(err as Error).message}`);
      }
    }

    return merged;
  }

  /**
   * Pure permission check — no IO. Platform admins (or wildcard `*`)
   * see everything. Otherwise the user needs at least one of the
   * required permissions.
   */
  checkFieldAccess(
    userPermissions: string[],
    isPlatformAdmin: boolean,
    fieldRule: FieldAuthRule,
  ): boolean {
    if (isPlatformAdmin) return true;
    if (userPermissions.includes('*')) return true;
    return fieldRule.requiredPermissions.some((p) => userPermissions.includes(p));
  }

  /**
   * Cache-bust hook. Call after writing FieldAuthConfig — currently
   * unused by the resolver since we don't yet expose CRUD over the
   * GraphQL surface (defaults are seed-only). Kept for the future
   * admin UI.
   */
  async invalidateCache(tenantId: string, resourceType?: string): Promise<void> {
    if (!this.redis) return;
    const pattern = resourceType
      ? `field_auth:${tenantId}:${resourceType}`
      : `field_auth:${tenantId}:*`;
    try {
      if (resourceType) {
        await this.redis.del(pattern);
      } else {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) await this.redis.del(...keys);
      }
    } catch (err) {
      this.logger.warn(`field-auth cache invalidate failed: ${(err as Error).message}`);
    }
  }
}
