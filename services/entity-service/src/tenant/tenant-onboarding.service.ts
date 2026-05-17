import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import {
  AuditActionType,
  AuditResourceType,
  ValidationError,
  encryptToString,
  createKeyProvider,
  maskEmail,
  IKeyProvider,
} from '@lons/common';
import * as crypto from 'crypto';

import { TenantService } from './tenant.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { ApiKeyService } from '../api-key/api-key.service';
import { AuditService } from '../audit/audit.service';

const DEFAULT_SYSTEM_ROLES = [
  {
    name: 'SP Admin',
    description: 'System role: SP Admin — full permissions',
    permissions: [
      'tenant:create', 'tenant:read', 'tenant:update', 'tenant:suspend',
      'user:create', 'user:read', 'user:update', 'user:deactivate',
      'role:create', 'role:read', 'role:update', 'role:delete',
      'product:create', 'product:read', 'product:update', 'product:activate',
      'customer:create', 'customer:read', 'customer:update', 'customer:read_pii', 'customer:blacklist',
      'lender:create', 'lender:read', 'lender:update',
      'subscription:create', 'subscription:read', 'subscription:update',
      'loan_request:create', 'loan_request:read', 'loan_request:process',
      'contract:read', 'contract:update',
      'repayment:create', 'repayment:read',
      'audit:read', 'analytics:read',
    ],
  },
  {
    name: 'SP Operator',
    description: 'System role: SP Operator — operations and customer-facing',
    permissions: [
      'product:read', 'customer:read', 'customer:create', 'customer:update',
      'loan_request:read', 'loan_request:create', 'loan_request:process',
      'contract:read', 'repayment:read', 'repayment:create',
      'subscription:read', 'subscription:create', 'subscription:update',
    ],
  },
  {
    name: 'SP Analyst',
    description: 'System role: SP Analyst — read-only analytics',
    permissions: [
      'product:read', 'customer:read', 'loan_request:read',
      'contract:read', 'repayment:read', 'analytics:read',
    ],
  },
  {
    name: 'SP Auditor',
    description: 'System role: SP Auditor — read with PII access',
    permissions: [
      'product:read', 'customer:read', 'customer:read_pii',
      'loan_request:read', 'contract:read', 'repayment:read',
      'audit:read', 'analytics:read',
    ],
  },
  {
    name: 'SP Collections',
    description: 'System role: SP Collections — collections and recovery',
    permissions: [
      'customer:read', 'customer:read_pii',
      'contract:read', 'contract:update',
      'repayment:read', 'repayment:create',
      'loan_request:read',
    ],
  },
];

export interface OnboardTenantInput {
  name: string;
  slug: string;
  legalName?: string;
  registrationNumber?: string;
  country: string;
  planTier?: 'starter' | 'growth' | 'enterprise';
  platformFeePercent?: Prisma.Decimal | string;
  settings?: Prisma.InputJsonValue;
  adminName: string;
  adminEmail: string;
  adminPasswordHash: string;
  /**
   * S17-FIX-9 — caller-supplied replay key. A second call with the same
   * `(slug, idempotencyKey)` returns the already-onboarded result
   * instead of throwing "slug in use". Without the key, slug collisions
   * remain a hard error (the prior call may have come from a different
   * client and we don't want to confuse those).
   */
  idempotencyKey?: string;
}

/**
 * S17-7 / FR-SP-001.2 — onboarding return shape now includes API credentials
 * and webhook signing secret. Both plaintexts are returned exactly once and
 * are unrecoverable afterwards (hash / encrypt-at-rest only).
 */
export interface OnboardTenantApiCredentials {
  clientId: string;
  clientSecret: string;
  rateLimitPerMin: number;
}

export interface OnboardTenantResult {
  tenant: unknown;
  roles: unknown[];
  adminUser: unknown;
  apiCredentials: OnboardTenantApiCredentials;
  /** Plaintext HMAC signing secret — shown exactly once. */
  webhookSigningSecret: string;
  /**
   * S17-FIX-9 — true when this result was returned from an
   * idempotency-replay path rather than a fresh onboarding. In that
   * case `apiCredentials.clientSecret` and `webhookSigningSecret`
   * carry the sentinel `'<not-retrievable-on-replay>'` because both
   * are unrecoverable after the original call. Callers (typically the
   * onboarding GraphQL resolver) should surface this clearly.
   */
  idempotentReplay?: boolean;
}

/** S17-FIX-9 sentinel for replay paths where the original plaintext is gone. */
export const REPLAY_SECRET_SENTINEL = '<not-retrievable-on-replay>';

@Injectable()
export class TenantOnboardingService {
  // S18-FIX-1B: structured logger for audit-log failures (replaces console.error).
  private readonly logger = new Logger(TenantOnboardingService.name);
  // EnvKeyProvider has no internal state once `getKey()` resolves; a single
  // module-level instance avoids re-reading the env var on every onboard.
  private readonly keyProvider: IKeyProvider = createKeyProvider();

  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
    private platformConfigService: PlatformConfigService,
    // S17-7: ApiKeyService is retained so the test-connection /
    // rotation paths remain available — but in the onboarding hot
    // path the API key is created inline inside the transaction
    // (FIX-3) so a partial failure rolls everything back together.
    private apiKeyService: ApiKeyService,
    // S17-FIX-9: post-commit TENANT_ONBOARDED audit entry.
    private auditService: AuditService,
  ) {
    // Reference apiKeyService to satisfy noUnusedParameters when the
    // FIX-3 inline path is the only consumer in this file today.
    void this.apiKeyService;
  }

  async onboard(input: OnboardTenantInput): Promise<OnboardTenantResult> {
    const schemaName = `tenant_${input.slug.replace(/-/g, '_')}`;

    // Slug uniqueness check upfront. S17-FIX-9 — when an idempotencyKey
    // is supplied AND a prior onboarding wrote a matching audit entry,
    // return the cached result (with secret sentinels) instead of
    // throwing. Without the key, slug collisions stay a hard error.
    const existingSlug = await this.prisma.tenant.findUnique({
      where: { slug: input.slug },
    });
    if (existingSlug) {
      if (input.idempotencyKey) {
        const replay = await this.findReplay(existingSlug.id, input.idempotencyKey);
        if (replay) return replay;
      }
      throw new ValidationError('Slug already in use', { slug: input.slug });
    }

    // Seed tenant settings from platform defaults if none provided
    let tenantSettings = input.settings;
    if (!tenantSettings) {
      const platformDefaults = await this.platformConfigService.getDefaults();
      tenantSettings = platformDefaults as unknown as Prisma.InputJsonValue;
    }

    // S17-7: generate the webhook signing secret OUTSIDE the transaction.
    // `crypto.randomBytes` is synchronous and never fails, but encryption
    // touches the key provider (env / vault / KMS) — keeping the await out
    // of the tx narrows the lock window.
    const webhookSigningSecret = crypto.randomBytes(32).toString('hex');
    const key = await this.keyProvider.getKey();
    const encryptedWebhookSecret = encryptToString(webhookSigningSecret, key);

    // S17-FIX-3: generate API key plaintext + hash OUTSIDE the
    // transaction (CPU work only, no I/O) so we can hand the row into
    // the same atomic block as tenant + roles + admin. The original
    // code created the key AFTER the tx committed, which left orphaned
    // tenants when ApiKeyService.createApiKey failed.
    //
    // Format mirrors ApiKeyService.createApiKey exactly (two separate
    // credentials — keyHash + secretHash — so disclosing one doesn't
    // reveal the other). Quota / dedup checks are skipped: a brand-new
    // tenant has zero keys, and 'Default API Key' is fresh by definition.
    const apiKeyPlaintext = `lons_${crypto.randomBytes(32).toString('hex')}`;
    const apiKeySecretPlaintext = `lons_secret_${crypto.randomBytes(32).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(apiKeyPlaintext).digest('hex');
    const apiKeySecretHash = crypto.createHash('sha256').update(apiKeySecretPlaintext).digest('hex');

    const txResult = await this.prisma.$transaction(async (tx) => {
      // 1. Create tenant. The webhook signing key is encrypted-at-rest into
      // the settings JSONB alongside whatever else came in.
      const settingsWithWebhookKey = mergeSettingsWithWebhookKey(
        tenantSettings,
        encryptedWebhookSecret,
      );

      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          slug: input.slug,
          legalName: input.legalName,
          registrationNumber: input.registrationNumber,
          country: input.country,
          schemaName,
          planTier: input.planTier || 'starter',
          status: 'active',
          platformFeePercent: input.platformFeePercent ?? null,
          settings: settingsWithWebhookKey,
        },
      });

      // 2. Create default system roles
      const roles = [];
      for (const roleDef of DEFAULT_SYSTEM_ROLES) {
        const role = await tx.role.create({
          data: {
            tenantId: tenant.id,
            name: roleDef.name,
            description: roleDef.description,
            permissions: roleDef.permissions,
            isSystem: true,
          },
        });
        roles.push(role);
      }

      // 3. Create admin user with SP Admin role
      const adminRole = roles.find((r) => r.name === 'SP Admin')!;
      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.adminEmail,
          passwordHash: input.adminPasswordHash,
          name: input.adminName,
          status: 'active',
          role: { connect: { id: adminRole.id } },
        },
        include: { role: true },
      });

      // 4. (S17-FIX-3) API key — inside the same transaction so a failure
      // here rolls back the tenant + roles + admin atomically.
      const apiKey = await tx.apiKey.create({
        data: {
          tenantId: tenant.id,
          name: 'Default API Key',
          keyHash: apiKeyHash,
          secretHash: apiKeySecretHash,
          rateLimitPerMinute: 60,
        },
      });

      return { tenant, roles, adminUser, apiKey };
    });

    // 5. (S17-FIX-9) Post-commit audit entry. Uses AuditActionType.CREATE
    // with metadata.event = 'tenant_onboarded' (mirrors the
    // CustomerMergeService pattern — keeps the enum slim while still
    // letting downstream consumers filter on the specific event).
    // The idempotencyKey lives in metadata so replay detection can
    // query it via the standard JSON-path operator.
    try {
      await this.auditService.log({
        tenantId: txResult.tenant.id,
        actorType: 'system',
        actorId: (txResult.adminUser as { id?: string }).id,
        action: AuditActionType.CREATE,
        resourceType: AuditResourceType.TENANT,
        resourceId: txResult.tenant.id,
        metadata: {
          event: 'tenant_onboarded',
          slug: input.slug,
          adminEmail: maskEmail(input.adminEmail),
          apiKeyId: txResult.apiKey.id,
          webhookKeyGenerated: true,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
    } catch (err) {
      // Audit-log failure must never block onboarding (the tenant +
      // user + key are already committed). Log and move on.
      // S18-FIX-1B: route through structured logger so the error surfaces
      // in centralized log aggregation. console.error bypassed this pipeline.
      this.logger.error('Failed to write onboarding audit log', {
        error: (err as Error).message,
        tenantId: txResult.tenant.id,
      });
    }

    return {
      tenant: txResult.tenant,
      roles: txResult.roles,
      adminUser: txResult.adminUser,
      apiCredentials: {
        clientId: txResult.apiKey.id,
        clientSecret: apiKeySecretPlaintext, // shown only once
        rateLimitPerMin: txResult.apiKey.rateLimitPerMinute,
      },
      webhookSigningSecret, // shown only once
    };
  }

  /**
   * S17-FIX-9 — look up a prior onboarding for `(tenantId, idempotencyKey)`.
   * Uses the AuditLog table as the idempotency record (consistent with
   * CustomerMergeService.findReplay). Returns a result populated with
   * tenant / roles / adminUser but with the unrecoverable secrets
   * replaced by sentinels.
   */
  private async findReplay(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<OnboardTenantResult | null> {
    const prior = await this.prisma.auditLog.findFirst({
      where: {
        tenantId,
        action: AuditActionType.CREATE,
        resourceType: AuditResourceType.TENANT,
        metadata: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        } as never,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!prior) return null;
    const meta = (prior.metadata as Record<string, unknown>) || {};
    if (meta.event !== 'tenant_onboarded') return null;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return null;

    const roles = await this.prisma.role.findMany({
      where: { tenantId, isSystem: true },
    });
    const adminUser = await this.prisma.user.findFirst({
      where: { tenantId, status: 'active' },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      tenant,
      roles,
      adminUser,
      apiCredentials: {
        clientId: String(meta.apiKeyId ?? ''),
        clientSecret: REPLAY_SECRET_SENTINEL,
        rateLimitPerMin: 60,
      },
      webhookSigningSecret: REPLAY_SECRET_SENTINEL,
      idempotentReplay: true,
    };
  }
}

/**
 * Merge `webhookSigningKeyEncrypted` into existing settings JSON without
 * losing any caller-provided fields. Handles both the platform-default
 * object shape and the rare null/JsonNull case.
 */
function mergeSettingsWithWebhookKey(
  existing: Prisma.InputJsonValue | undefined,
  encryptedWebhookSecret: string,
): Prisma.InputJsonValue {
  const base =
    existing &&
    typeof existing === 'object' &&
    !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return {
    ...base,
    webhookSigningKeyEncrypted: encryptedWebhookSecret,
  } as Prisma.InputJsonValue;
}
