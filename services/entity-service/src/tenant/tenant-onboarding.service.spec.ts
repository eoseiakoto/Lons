/**
 * S17-7 / FR-SP-001.2 — onboarding auto-provisions API credentials and
 * an HMAC webhook signing secret. Both plaintexts are returned exactly
 * once and unrecoverable thereafter (hash-only / encrypt-at-rest).
 *
 * S17-FIX-3 (rewritten Sprint 17 fix cycle) — the API key is now
 * created INSIDE the onboarding transaction, so a partial failure
 * rolls back the entire onboard atomically. ApiKeyService.createApiKey
 * is no longer in the hot path.
 *
 * S17-FIX-9 — `onboard()` accepts an idempotencyKey. A second call
 * with the same `(slug, idempotencyKey)` returns the cached result
 * (with sentinel secrets) instead of throwing.
 *
 * The test harness stubs Prisma's `$transaction` so no real DB is
 * needed.
 */
import {
  TenantOnboardingService,
  REPLAY_SECRET_SENTINEL,
} from './tenant-onboarding.service';

const TEST_KEY_B64 = Buffer.alloc(32, 7).toString('base64');

function makeService() {
  // Capture what gets persisted in the transactional `tenant.create`.
  let createdTenant: any = null;

  const txTenantCreate = jest.fn(async ({ data }: any) => {
    createdTenant = {
      id: 'tenant-uuid-1',
      slug: data.slug,
      schemaName: data.schemaName,
      settings: data.settings,
      ...data,
    };
    return createdTenant;
  });
  const txRoleCreate = jest.fn(async ({ data }: any) => ({
    id: `role-${data.name}`,
    ...data,
  }));
  const txUserCreate = jest.fn(async ({ data }: any) => ({
    id: 'user-uuid-1',
    ...data,
  }));
  const txApiKeyCreate = jest.fn(async ({ data }: any) => ({
    id: 'apikey-uuid-1',
    name: data.name,
    keyHash: data.keyHash,
    secretHash: data.secretHash,
    rateLimitPerMinute: data.rateLimitPerMinute,
    createdAt: new Date(),
  }));

  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(null), // slug not taken
    },
    auditLog: {
      findFirst: jest.fn().mockResolvedValue(null), // no prior replay by default
    },
    role: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        tenant: { create: txTenantCreate },
        role: { create: txRoleCreate },
        user: { create: txUserCreate },
        apiKey: { create: txApiKeyCreate },
      };
      return cb(tx);
    }),
  } as any;

  const tenantService = {} as any;
  const platformConfigService = {
    getDefaults: jest.fn().mockResolvedValue({ defaultCurrency: 'GHS' }),
  } as any;
  const apiKeyService = {
    // Still injected — used by sibling paths (rotation, etc.) but no
    // longer called in the onboard hot path post-FIX-3.
    createApiKey: jest.fn(),
  } as any;
  const auditService = {
    log: jest.fn(async () => undefined),
  } as any;

  const service = new TenantOnboardingService(
    prisma,
    tenantService,
    platformConfigService,
    apiKeyService,
    auditService,
  );

  return {
    service,
    prisma,
    apiKeyService,
    auditService,
    platformConfigService,
    txApiKeyCreate,
    txTenantCreate,
    getCreatedTenant: () => createdTenant,
  };
}

describe('TenantOnboardingService — credential auto-provisioning (S17-7)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_B64;
    if (!process.env.HASH_PEPPER) {
      process.env.HASH_PEPPER = 'a'.repeat(64);
    }
  });

  it('returns API credentials and webhook signing secret exactly once', async () => {
    const { service, txApiKeyCreate } = makeService();

    const result = await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-bank',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
    });

    // API key created inside the transaction (FIX-3) — verify the
    // transactional client received the hashes, not plaintexts.
    expect(txApiKeyCreate).toHaveBeenCalledTimes(1);
    const apiKeyArgs = txApiKeyCreate.mock.calls[0][0].data;
    expect(apiKeyArgs.name).toBe('Default API Key');
    expect(apiKeyArgs.rateLimitPerMinute).toBe(60);
    expect(apiKeyArgs.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(apiKeyArgs.secretHash).toMatch(/^[a-f0-9]{64}$/);

    // Plaintexts returned to caller.
    expect(result.apiCredentials.clientId).toBe('apikey-uuid-1');
    expect(result.apiCredentials.clientSecret).toMatch(/^lons_secret_[a-f0-9]{64}$/);
    expect(result.apiCredentials.rateLimitPerMin).toBe(60);

    // Webhook signing secret: 32 random bytes hex = 64 lowercase hex chars.
    expect(result.webhookSigningSecret).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stores the webhook signing key encrypted in tenant.settings', async () => {
    const { service, getCreatedTenant } = makeService();
    const result = await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-bank-2',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
    });

    const persisted = getCreatedTenant();
    expect(persisted.settings.webhookSigningKeyEncrypted).toBeDefined();
    expect(typeof persisted.settings.webhookSigningKeyEncrypted).toBe(
      'string',
    );
    // The stored blob is the AES-GCM JSON envelope, not the plaintext.
    expect(persisted.settings.webhookSigningKeyEncrypted).not.toBe(
      result.webhookSigningSecret,
    );
    expect(persisted.settings.webhookSigningKeyEncrypted).not.toContain(
      result.webhookSigningSecret,
    );
    // Envelope shape sanity: parseable JSON with ciphertext/iv/tag.
    const envelope = JSON.parse(
      persisted.settings.webhookSigningKeyEncrypted,
    );
    expect(envelope).toHaveProperty('ciphertext');
    expect(envelope).toHaveProperty('iv');
    expect(envelope).toHaveProperty('tag');
  });

  it('preserves existing tenant settings when merging the webhook key', async () => {
    const { service, getCreatedTenant } = makeService();
    await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-bank-3',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
      settings: {
        defaultCurrency: 'NGN',
        timezone: 'Africa/Lagos',
      } as any,
    });

    const persisted = getCreatedTenant();
    expect(persisted.settings.defaultCurrency).toBe('NGN');
    expect(persisted.settings.timezone).toBe('Africa/Lagos');
    expect(persisted.settings.webhookSigningKeyEncrypted).toBeDefined();
  });

  it('falls back to platform defaults when no settings are provided', async () => {
    const { service, platformConfigService, getCreatedTenant } = makeService();
    await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-bank-4',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
    });

    expect(platformConfigService.getDefaults).toHaveBeenCalled();
    const persisted = getCreatedTenant();
    // From the stubbed defaults.
    expect(persisted.settings.defaultCurrency).toBe('GHS');
    expect(persisted.settings.webhookSigningKeyEncrypted).toBeDefined();
  });

  it('rejects duplicate slugs before any side effects (no idempotencyKey)', async () => {
    const { service, prisma, txApiKeyCreate } = makeService();
    prisma.tenant.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.onboard({
        name: 'Acme Bank',
        slug: 'taken-slug',
        country: 'GHA',
        adminName: 'Alice',
        adminEmail: 'alice@acme.test',
        adminPasswordHash: 'hashed',
      }),
    ).rejects.toThrow(/Slug already in use/);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(txApiKeyCreate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// S17-FIX-3 — atomic transaction including the API key
// ─────────────────────────────────────────────────────────────────────────

describe('TenantOnboardingService — atomic transaction (S17-FIX-3)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_B64;
    if (!process.env.HASH_PEPPER) {
      process.env.HASH_PEPPER = 'a'.repeat(64);
    }
  });

  it('creates tenant + roles + admin + API key in a single transaction', async () => {
    const { service, prisma } = makeService();
    await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-tx',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('a failure inside the transaction rolls back the entire onboard', async () => {
    const { service, prisma, txApiKeyCreate } = makeService();
    // Simulate API key creation failure (e.g. unique-constraint violation
    // on `name`). The transaction must abort and no result returned.
    txApiKeyCreate.mockRejectedValue(new Error('apiKey insert failed'));

    await expect(
      service.onboard({
        name: 'Acme Bank',
        slug: 'acme-rollback',
        country: 'GHA',
        adminName: 'Alice',
        adminEmail: 'alice@acme.test',
        adminPasswordHash: 'hashed',
      }),
    ).rejects.toThrow(/apiKey insert failed/);

    // The transaction wrapper saw exactly one call — the failure
    // propagates out without retries.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does NOT call ApiKeyService.createApiKey on the hot path (FIX-3)', async () => {
    // Confirms the post-tx call site is gone — used to live AFTER the
    // transaction and left orphaned tenants on failure.
    const { service, apiKeyService } = makeService();
    await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-no-svc',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
    });
    expect(apiKeyService.createApiKey).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// S17-FIX-9 — audit log + idempotency
// ─────────────────────────────────────────────────────────────────────────

describe('TenantOnboardingService — audit log + idempotency (S17-FIX-9)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_B64;
    if (!process.env.HASH_PEPPER) {
      process.env.HASH_PEPPER = 'a'.repeat(64);
    }
  });

  it('emits a tenant_onboarded audit log after the transaction commits', async () => {
    const { service, auditService } = makeService();
    await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-audit',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
      idempotencyKey: 'idem-k1',
    });

    expect(auditService.log).toHaveBeenCalledTimes(1);
    const entry = auditService.log.mock.calls[0][0];
    expect(entry.tenantId).toBe('tenant-uuid-1');
    expect(entry.action).toBe('create');
    expect(entry.resourceType).toBe('tenant');
    expect(entry.metadata.event).toBe('tenant_onboarded');
    expect(entry.metadata.slug).toBe('acme-audit');
    expect(entry.metadata.idempotencyKey).toBe('idem-k1');
    // Admin email is masked, not raw.
    expect(entry.metadata.adminEmail).not.toBe('alice@acme.test');
    expect(entry.metadata.webhookKeyGenerated).toBe(true);
  });

  it('audit-log failures do NOT roll back the onboard', async () => {
    const { service, auditService } = makeService();
    auditService.log.mockRejectedValue(new Error('audit DB down'));

    const result = await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-audit-down',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
    });

    expect(result.apiCredentials.clientId).toBe('apikey-uuid-1');
  });

  it('replays return sentinel secrets when slug+idempotencyKey match', async () => {
    const { service, prisma } = makeService();

    // Pretend the slug is already taken AND we have a matching audit entry.
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'existing-tenant-id',
      slug: 'replayed-slug',
    });
    prisma.auditLog.findFirst.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'existing-tenant-id',
      metadata: {
        event: 'tenant_onboarded',
        idempotencyKey: 'replay-key',
        apiKeyId: 'apikey-existing',
      },
      createdAt: new Date(),
    });
    prisma.role.findMany.mockResolvedValue([{ id: 'role-existing' }]);
    prisma.user.findFirst.mockResolvedValue({ id: 'user-existing' });

    const result = await service.onboard({
      name: 'Acme Bank',
      slug: 'replayed-slug',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
      idempotencyKey: 'replay-key',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(result.apiCredentials.clientId).toBe('apikey-existing');
    expect(result.apiCredentials.clientSecret).toBe(REPLAY_SECRET_SENTINEL);
    expect(result.webhookSigningSecret).toBe(REPLAY_SECRET_SENTINEL);
    // No transaction on replay — we just read.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('slug collision WITHOUT matching idempotencyKey still throws', async () => {
    const { service, prisma } = makeService();
    prisma.tenant.findUnique.mockResolvedValue({ id: 'existing' });
    prisma.auditLog.findFirst.mockResolvedValue(null); // no match

    await expect(
      service.onboard({
        name: 'Acme Bank',
        slug: 'taken-slug',
        country: 'GHA',
        adminName: 'Alice',
        adminEmail: 'alice@acme.test',
        adminPasswordHash: 'hashed',
        idempotencyKey: 'wrong-key',
      }),
    ).rejects.toThrow(/Slug already in use/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// S18-FIX-1B — audit-log failures route through this.logger.error, not console.error
// ─────────────────────────────────────────────────────────────────────────

describe('TenantOnboardingService — structured logging on audit failure (S18-FIX-1B)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_B64;
    if (!process.env.HASH_PEPPER) {
      process.env.HASH_PEPPER = 'a'.repeat(64);
    }
  });

  it('routes audit-log failure through this.logger.error, not console.error', async () => {
    const { service, auditService } = makeService();
    auditService.log.mockRejectedValue(new Error('audit DB down'));

    // Spy on console.error to assert it is NOT called.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Spy on the NestJS Logger prototype's error to assert it IS called.
    const { Logger } = await import('@nestjs/common');
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-logger-fix',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalledTimes(1);
    const [message, context] = loggerSpy.mock.calls[0];
    expect(message).toMatch(/Failed to write onboarding audit log/);
    expect(context).toMatchObject({
      error: 'audit DB down',
      tenantId: 'tenant-uuid-1',
    });

    consoleSpy.mockRestore();
    loggerSpy.mockRestore();
  });
});
