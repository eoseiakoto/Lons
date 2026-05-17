/**
 * S17-7 / FR-SP-001.2 — onboarding now auto-provisions API credentials
 * and an HMAC webhook signing secret. Both plaintexts are returned
 * exactly once and unrecoverable thereafter (hash-only / encrypt-at-rest).
 *
 * These tests stub Prisma's `$transaction` so the test harness doesn't
 * need a real DB, and verify that:
 *   1. The API key is generated and the plaintext + secret are returned.
 *   2. The webhook signing secret is generated, encrypted, and stored in
 *      `tenant.settings.webhookSigningKeyEncrypted` — not the plaintext.
 *   3. The plaintext webhook secret is returned exactly once.
 *   4. Pre-existing settings (e.g. defaultCurrency) survive the merge.
 */
import { TenantOnboardingService } from './tenant-onboarding.service';

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

  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(null), // slug not taken
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        tenant: { create: txTenantCreate },
        role: { create: txRoleCreate },
        user: { create: txUserCreate },
      };
      return cb(tx);
    }),
  } as any;

  const tenantService = {} as any;
  const platformConfigService = {
    getDefaults: jest.fn().mockResolvedValue({ defaultCurrency: 'GHS' }),
  } as any;
  const apiKeyService = {
    createApiKey: jest.fn(async (_tenantId: string, _input: any) => ({
      id: 'apikey-uuid-1',
      name: 'Default API Key',
      keyHash: 'abcd...wxyz',
      plaintext: 'lons_test_plaintext_key',
      plaintextSecret: 'lons_secret_test_plaintext_secret',
      rateLimitPerMin: 60,
      expiresAt: null,
      createdAt: new Date().toISOString(),
    })),
  } as any;

  const service = new TenantOnboardingService(
    prisma,
    tenantService,
    platformConfigService,
    apiKeyService,
  );

  return {
    service,
    prisma,
    apiKeyService,
    platformConfigService,
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
    const { service, apiKeyService } = makeService();

    const result = await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-bank',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
    });

    // API credentials surfaced from ApiKeyService.createApiKey.
    expect(apiKeyService.createApiKey).toHaveBeenCalledWith('tenant-uuid-1', {
      name: 'Default API Key',
      rateLimitPerMin: 60,
    });
    expect(result.apiCredentials.clientId).toBe('apikey-uuid-1');
    expect(result.apiCredentials.clientSecret).toBe(
      'lons_secret_test_plaintext_secret',
    );
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

  it('issues the API key AFTER the transaction commits', async () => {
    const { service, prisma, apiKeyService } = makeService();
    // Spy on the order of calls — the transaction should resolve before
    // createApiKey is invoked.
    const txCallOrder: string[] = [];
    prisma.$transaction.mockImplementation(async (cb: any) => {
      txCallOrder.push('tx-start');
      const result = await cb({
        tenant: {
          create: async ({ data }: any) => {
            txCallOrder.push('tenant-create');
            return { id: 'tenant-uuid-1', ...data };
          },
        },
        role: { create: async ({ data }: any) => ({ id: 'r', ...data }) },
        user: { create: async ({ data }: any) => ({ id: 'u', ...data }) },
      });
      txCallOrder.push('tx-end');
      return result;
    });
    apiKeyService.createApiKey.mockImplementation(async () => {
      txCallOrder.push('api-key-create');
      return {
        id: 'apikey-uuid-1',
        name: 'Default API Key',
        keyHash: 'x',
        plaintext: 'lons_x',
        plaintextSecret: 'lons_secret_x',
        rateLimitPerMin: 60,
        expiresAt: null,
        createdAt: new Date().toISOString(),
      };
    });

    await service.onboard({
      name: 'Acme Bank',
      slug: 'acme-bank-5',
      country: 'GHA',
      adminName: 'Alice',
      adminEmail: 'alice@acme.test',
      adminPasswordHash: 'hashed',
    });

    expect(txCallOrder.indexOf('tx-end')).toBeLessThan(
      txCallOrder.indexOf('api-key-create'),
    );
  });

  it('rejects duplicate slugs before any side effects', async () => {
    const { service, prisma, apiKeyService } = makeService();
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
    expect(apiKeyService.createApiKey).not.toHaveBeenCalled();
  });
});
