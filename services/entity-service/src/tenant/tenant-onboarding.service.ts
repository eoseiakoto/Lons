import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import {
  ValidationError,
  encryptToString,
  createKeyProvider,
  IKeyProvider,
} from '@lons/common';
import * as crypto from 'crypto';

import { TenantService } from './tenant.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { ApiKeyService } from '../api-key/api-key.service';

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
}

@Injectable()
export class TenantOnboardingService {
  // EnvKeyProvider has no internal state once `getKey()` resolves; a single
  // module-level instance avoids re-reading the env var on every onboard.
  private readonly keyProvider: IKeyProvider = createKeyProvider();

  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
    private platformConfigService: PlatformConfigService,
    // S17-7: ApiKeyService.createApiKey is the canonical entry point for
    // issuing credentials. Re-using it (rather than reaching into the
    // Prisma model directly) keeps the hashing / quota-enforcement logic
    // in one place.
    private apiKeyService: ApiKeyService,
  ) {}

  async onboard(input: OnboardTenantInput): Promise<OnboardTenantResult> {
    const schemaName = `tenant_${input.slug.replace(/-/g, '_')}`;

    // Validate slug uniqueness upfront
    const existingSlug = await this.prisma.tenant.findUnique({
      where: { slug: input.slug },
    });
    if (existingSlug) {
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

    // Run tenant + roles + admin user in a transaction. The API key is
    // issued AFTER the tx commits because `ApiKeyService.createApiKey`
    // calls the plan-tier quota enforcement service (which reads from
    // Redis) and we don't want that holding a DB transaction open.
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

      return { tenant, roles, adminUser };
    });

    // 4. Auto-generate API key pair (post-transaction — see comment above).
    // Failures here leave the tenant created without credentials; the
    // caller can still rotate via TenantService.rotateWebhookSigningKey
    // and the standard ApiKey mutations. Audit log captures both states.
    const apiKey = await this.apiKeyService.createApiKey(txResult.tenant.id, {
      name: 'Default API Key',
      rateLimitPerMin: 60,
    });

    return {
      tenant: txResult.tenant,
      roles: txResult.roles,
      adminUser: txResult.adminUser,
      apiCredentials: {
        clientId: apiKey.id,
        clientSecret: apiKey.plaintextSecret, // shown only once
        rateLimitPerMin: apiKey.rateLimitPerMin,
      },
      webhookSigningSecret, // shown only once
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
