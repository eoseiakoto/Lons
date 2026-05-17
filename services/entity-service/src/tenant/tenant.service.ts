import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import {
  NotFoundError,
  ValidationError,
  createKeyProvider,
  decryptFromString,
  encryptToString,
  IKeyProvider,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';
import * as crypto from 'crypto';

import { AuditService } from '../audit/audit.service';

@Injectable()
export class TenantService {
  // S17-7: cached key provider instance — see comment on
  // TenantOnboardingService for rationale.
  private readonly keyProvider: IKeyProvider = createKeyProvider();

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(data: {
    name: string;
    slug: string;
    legalName?: string;
    registrationNumber?: string;
    country: string;
    schemaName: string;
    planTier?: 'starter' | 'growth' | 'enterprise';
    settings?: Prisma.InputJsonValue;
  }) {
    const existing = await this.prisma.tenant.findUnique({
      where: { schemaName: data.schemaName },
    });
    if (existing) {
      throw new ValidationError('Schema name already exists', { schemaName: data.schemaName });
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        legalName: data.legalName,
        registrationNumber: data.registrationNumber,
        country: data.country,
        schemaName: data.schemaName,
        planTier: data.planTier || 'starter',
        status: 'active',
        settings: data.settings ?? Prisma.JsonNull,
      },
    });

    return tenant;
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!tenant) throw new NotFoundError('Tenant', id);
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!tenant) throw new NotFoundError('Tenant', slug);
    return tenant;
  }

  async findAll(take: number = 20, cursor?: string) {
    // NOTE: Cannot use Prisma `startsWith('__')` because `_` is a SQL LIKE
    // wildcard and Prisma does not escape it, causing all rows to be filtered.
    // Instead, fetch all non-deleted tenants and filter in application code.
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const filtered = tenants.filter(t => !t.slug.startsWith('__'));

    return {
      items: filtered.slice(0, take),
      hasMore: filtered.length > take,
    };
  }

  async update(id: string, data: Prisma.TenantUpdateInput) {
    await this.findById(id);
    return this.prisma.tenant.update({ where: { id }, data });
  }

  async suspend(id: string) {
    const tenant = await this.findById(id);
    if (tenant.status === 'suspended') {
      throw new ValidationError('Tenant is already suspended');
    }
    return this.prisma.tenant.update({
      where: { id },
      data: { status: 'suspended' },
    });
  }

  /**
   * S17-7 / FR-SP-001.2 — fetch the tenant's HMAC webhook signing key.
   * The key is stored encrypted at rest (AES-256-GCM JSON blob) under
   * `tenant.settings.webhookSigningKeyEncrypted`. Used by the webhook
   * delivery service to sign outgoing payloads (`X-Lons-Signature`
   * header) and by the receiving integrator to verify them.
   *
   * Throws `NotFoundError` when the tenant exists but no signing key has
   * been configured (e.g. tenants created before S17-7 onboarding). The
   * caller should redirect to the rotate flow in that case.
   */
  async getWebhookSigningKey(tenantId: string): Promise<string> {
    const tenant = await this.findById(tenantId);
    const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
    const encrypted = settings.webhookSigningKeyEncrypted;
    if (typeof encrypted !== 'string' || encrypted.length === 0) {
      throw new NotFoundError(
        'Webhook signing key not configured for tenant',
        tenantId,
      );
    }
    const key = await this.keyProvider.getKey();
    return decryptFromString(encrypted, key);
  }

  /**
   * S17-7 / FR-SP-001.2 — replace the tenant's webhook signing key with
   * a fresh 32-byte secret. Returns the new plaintext exactly once; the
   * previous key is irrecoverable after this call. Callers must
   * distribute the new key to the integrator before the next signed
   * webhook fires, otherwise verification will fail.
   *
   * Audited under `tenant:config_change` with no before/after value
   * (the secret itself never enters the audit log).
   */
  async rotateWebhookSigningKey(
    tenantId: string,
    actorId?: string,
  ): Promise<{ newSecret: string }> {
    const tenant = await this.findById(tenantId);
    const newSecret = crypto.randomBytes(32).toString('hex');
    const key = await this.keyProvider.getKey();
    const encrypted = encryptToString(newSecret, key);

    const existingSettings =
      (tenant.settings as Record<string, unknown> | null) ?? {};
    const mergedSettings = {
      ...existingSettings,
      webhookSigningKeyEncrypted: encrypted,
    };

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: mergedSettings as Prisma.InputJsonValue },
    });

    // Fire-and-forget audit — the AuditService swallows its own errors so
    // we can't lose the rotation by a transient audit-DB failure.
    await this.auditService.log({
      tenantId,
      actorId,
      actorType: actorId ? 'user' : 'system',
      action: AuditActionType.CONFIG_CHANGE,
      resourceType: AuditResourceType.TENANT,
      resourceId: tenantId,
      metadata: { event: 'webhook_signing_key_rotated' },
    });

    return { newSecret };
  }
}
