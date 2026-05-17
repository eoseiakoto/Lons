/**
 * S17-FIX-2 — unit tests for EmiIntegrationConfigService.
 *
 * The dev prompt for Sprint 17 required tests for this service but the
 * Track A delivery shipped without them; the PM review (F-S17-3)
 * dispositioned the gap into the fix cycle. Coverage here:
 *
 *   • CRUD: create / findAll / findById / update / deactivate
 *   • Encryption: credentials never persisted in plaintext;
 *     findAll() strips creds; findById() decrypts (FIX-1A regression test);
 *     getDecryptedCredentials() returns plaintext.
 *   • Deactivation: sets isActive=false ONLY — does NOT stamp deletedAt
 *     (FIX-1B regression test).
 *   • Sync status: recordSyncSuccess / recordSyncError mutate the
 *     last_sync_* columns as documented.
 *   • Tenant isolation: cross-tenant findById returns null.
 *
 * Prisma + IKeyProvider are mocked. Encryption is exercised end-to-end
 * using a deterministic in-test key buffer (32 random bytes) so we can
 * verify ciphertext ≠ plaintext.
 */

import { randomBytes } from 'crypto';

import {
  EmiIntegrationConfigService,
  CreateEmiIntegrationConfigInput,
} from '../emi-integration-config.service';
import { EmiDataService } from '../emi-data.service';
import {
  IKeyProvider,
  NotFoundError,
  decryptFromString,
} from '@lons/common';

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '22222222-2222-2222-2222-222222222222';
const CONFIG_ID = 'cfg-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// 32 random bytes — same as EnvKeyProvider would return in prod.
const TEST_KEY = randomBytes(32);

function mockKeyProvider(): IKeyProvider {
  return {
    getKey: jest.fn(async () => TEST_KEY),
    rotateKey: jest.fn(async () => ({ newKeyId: 'k2' })),
    getCurrentKeyId: jest.fn(() => 'k1'),
  };
}

interface StoredRow {
  id: string;
  tenantId: string;
  name: string;
  provider: string;
  credentials: string | null;
  baseUrl: string | null;
  fieldMappings: unknown;
  syncFrequencyMin: number;
  retryPolicy: unknown;
  isActive: boolean;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function makeRow(overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    id: CONFIG_ID,
    tenantId: TENANT,
    name: 'MTN MoMo Ghana',
    provider: 'mtn_momo',
    credentials: null,
    baseUrl: null,
    fieldMappings: null,
    syncFrequencyMin: 360,
    retryPolicy: null,
    isActive: true,
    lastSyncAt: null,
    lastSyncError: null,
    createdAt: new Date('2026-05-17T00:00:00Z'),
    updatedAt: new Date('2026-05-17T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

interface MockPrisma {
  store: StoredRow[];
  emiIntegrationConfig: {
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
}

function mockPrisma(initial: StoredRow[] = []): MockPrisma {
  const store: StoredRow[] = [...initial];
  return {
    store,
    emiIntegrationConfig: {
      create: jest.fn(async ({ data }: { data: Partial<StoredRow> }) => {
        const row: StoredRow = makeRow({
          ...data,
          id: data.id ?? `cfg-${store.length + 1}`,
        });
        store.push(row);
        return row;
      }),
      update: jest.fn(async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<StoredRow>;
      }) => {
        const idx = store.findIndex((r) => r.id === where.id);
        if (idx === -1) throw new Error(`mock prisma: row ${where.id} not found`);
        store[idx] = { ...store[idx], ...data, updatedAt: new Date() };
        return store[idx];
      }),
      updateMany: jest.fn(async ({
        where,
        data,
      }: {
        where: Partial<StoredRow>;
        data: Partial<StoredRow>;
      }) => {
        let count = 0;
        for (let i = 0; i < store.length; i++) {
          const matches = Object.entries(where).every(([k, v]) =>
            (store[i] as unknown as Record<string, unknown>)[k] === v,
          );
          if (matches) {
            store[i] = { ...store[i], ...data, updatedAt: new Date() };
            count++;
          }
        }
        return { count };
      }),
      findFirst: jest.fn(async ({ where }: { where: Partial<StoredRow> }) =>
        store.find((r) =>
          Object.entries(where).every(([k, v]) =>
            (r as unknown as Record<string, unknown>)[k] === v,
          ),
        ) ?? null,
      ),
      findMany: jest.fn(async ({ where }: { where: Partial<StoredRow> }) =>
        store.filter((r) =>
          Object.entries(where).every(([k, v]) =>
            (r as unknown as Record<string, unknown>)[k] === v,
          ),
        ),
      ),
    },
  };
}

function mkSvc(prisma: MockPrisma, keyProvider: IKeyProvider = mockKeyProvider()) {
  // EmiDataService is only used by testConnection() which we don't cover
  // here — pass a stub.
  const emiDataService = {
    isAvailable: jest.fn(async () => true),
  } as unknown as EmiDataService;
  return new EmiIntegrationConfigService(prisma as never, emiDataService, keyProvider);
}

const CRED_INPUT = { apiKey: 'sk-live-secret', apiSecret: 'shh' };

// ─────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────

describe('EmiIntegrationConfigService — CRUD', () => {
  it('create() persists a row and returns it with plaintext credentials', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);

    const input: CreateEmiIntegrationConfigInput = {
      name: 'MTN MoMo Ghana',
      provider: 'mtn_momo',
      credentials: CRED_INPUT,
      baseUrl: 'https://api.example.com',
    };
    const out = await svc.create(TENANT, input);

    expect(out.name).toBe('MTN MoMo Ghana');
    expect(out.provider).toBe('mtn_momo');
    expect(out.credentials).toEqual(CRED_INPUT);
    expect(prisma.emiIntegrationConfig.create).toHaveBeenCalledTimes(1);
  });

  it('create() persists credentials as ciphertext, never plaintext', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);

    await svc.create(TENANT, {
      name: 'X',
      provider: 'mock',
      credentials: CRED_INPUT,
    });

    const row = prisma.store[0];
    expect(row.credentials).toBeTruthy();
    expect(row.credentials).not.toContain('sk-live-secret');
    expect(row.credentials).not.toContain('shh');
    // Round-trip through the same key proves we're round-trippable
    // ciphertext, not just a coincidental encoding.
    const decoded = JSON.parse(decryptFromString(row.credentials as string, TEST_KEY));
    expect(decoded).toEqual(CRED_INPUT);
  });

  it('create() with no credentials stores null', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const out = await svc.create(TENANT, { name: 'No Creds', provider: 'mock' });
    expect(out.credentials).toBeNull();
    expect(prisma.store[0].credentials).toBeNull();
  });

  it('update() re-encrypts credentials when provided', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, {
      name: 'X',
      provider: 'mock',
      credentials: CRED_INPUT,
    });
    const initialCipher = prisma.store[0].credentials;

    await svc.update(TENANT, created.id, {
      credentials: { apiKey: 'rotated', apiSecret: 'new' },
    });

    const updatedCipher = prisma.store[0].credentials;
    expect(updatedCipher).toBeTruthy();
    expect(updatedCipher).not.toBe(initialCipher);
    expect(updatedCipher).not.toContain('rotated');
  });

  it('update() throws NotFoundError for unknown id', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    await expect(svc.update(TENANT, 'no-such-id', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('update() does not re-encrypt when credentials are not in the input', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, {
      name: 'X',
      provider: 'mock',
      credentials: CRED_INPUT,
    });
    const initialCipher = prisma.store[0].credentials;

    await svc.update(TENANT, created.id, { name: 'Renamed' });

    expect(prisma.store[0].credentials).toBe(initialCipher);
    expect(prisma.store[0].name).toBe('Renamed');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// findAll / findById — credential routing
// ─────────────────────────────────────────────────────────────────────────

describe('EmiIntegrationConfigService — read paths and credential handling', () => {
  it('findAll() strips credentials (returns null)', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    await svc.create(TENANT, { name: 'A', provider: 'mock', credentials: CRED_INPUT });
    await svc.create(TENANT, { name: 'B', provider: 'mock', credentials: CRED_INPUT });

    const all = await svc.findAll(TENANT);

    expect(all).toHaveLength(2);
    for (const row of all) {
      expect(row.credentials).toBeNull();
    }
  });

  it('findById() returns decrypted credentials (FIX-1A regression)', async () => {
    // Before FIX-1A this returned null because toDecrypted called a sync
    // stub that always returned null.
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, {
      name: 'A',
      provider: 'mock',
      credentials: CRED_INPUT,
    });

    const fetched = await svc.findById(TENANT, created.id);

    expect(fetched).not.toBeNull();
    expect(fetched?.credentials).toEqual(CRED_INPUT);
  });

  it('findById() returns null for unknown id', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    expect(await svc.findById(TENANT, 'no-such-id')).toBeNull();
  });

  it('findById() enforces tenant isolation', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, {
      name: 'A',
      provider: 'mock',
      credentials: CRED_INPUT,
    });

    // Same id, different tenant → must not surface.
    const cross = await svc.findById(OTHER_TENANT, created.id);
    expect(cross).toBeNull();
  });

  it('getDecryptedCredentials() returns the same plaintext as create() echoed', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, {
      name: 'A',
      provider: 'mock',
      credentials: CRED_INPUT,
    });

    const plain = await svc.getDecryptedCredentials(TENANT, created.id);
    expect(plain).toEqual(CRED_INPUT);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// deactivate — FIX-1B regression coverage
// ─────────────────────────────────────────────────────────────────────────

describe('EmiIntegrationConfigService — deactivate (FIX-1B)', () => {
  it('sets isActive=false and does NOT stamp deletedAt', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, { name: 'A', provider: 'mock' });

    const out = await svc.deactivate(TENANT, created.id);

    expect(out.isActive).toBe(false);
    expect(prisma.store[0].isActive).toBe(false);
    expect(prisma.store[0].deletedAt).toBeNull();
  });

  it('returns the deactivated row (no separate re-fetch needed)', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, { name: 'A', provider: 'mock' });

    const out = await svc.deactivate(TENANT, created.id);

    expect(out.id).toBe(created.id);
    expect(out.name).toBe('A');
  });

  it('deactivated config is still visible to findById (not soft-deleted)', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, { name: 'A', provider: 'mock' });
    await svc.deactivate(TENANT, created.id);

    const after = await svc.findById(TENANT, created.id);
    expect(after).not.toBeNull();
    expect(after?.isActive).toBe(false);
  });

  it('throws NotFoundError for unknown id', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    await expect(svc.deactivate(TENANT, 'no-such-id')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('the deactivation response strips credentials', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, {
      name: 'A',
      provider: 'mock',
      credentials: CRED_INPUT,
    });

    const out = await svc.deactivate(TENANT, created.id);
    expect(out.credentials).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// recordSync*
// ─────────────────────────────────────────────────────────────────────────

describe('EmiIntegrationConfigService — sync status recording', () => {
  it('recordSyncSuccess() sets lastSyncAt and clears lastSyncError', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, { name: 'A', provider: 'mock' });
    prisma.store[0].lastSyncError = 'previous error';

    await svc.recordSyncSuccess(TENANT, created.id);

    expect(prisma.store[0].lastSyncAt).toBeInstanceOf(Date);
    expect(prisma.store[0].lastSyncError).toBeNull();
  });

  it('recordSyncError() stamps the error message and the timestamp', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, { name: 'A', provider: 'mock' });

    await svc.recordSyncError(TENANT, created.id, 'connection refused');

    expect(prisma.store[0].lastSyncError).toBe('connection refused');
    expect(prisma.store[0].lastSyncAt).toBeInstanceOf(Date);
  });

  it('recordSyncError() truncates excessively long messages to 1000 chars', async () => {
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, { name: 'A', provider: 'mock' });

    const long = 'x'.repeat(2500);
    await svc.recordSyncError(TENANT, created.id, long);

    expect((prisma.store[0].lastSyncError ?? '').length).toBe(1000);
  });

  it('S17-FIX-8: recordSyncSuccess() enforces tenant isolation', async () => {
    // Wrong tenant must not stamp another tenant's row. updateMany
    // returns count=0 when the where clause doesn't match anything.
    const prisma = mockPrisma();
    const svc = mkSvc(prisma);
    const created = await svc.create(TENANT, { name: 'A', provider: 'mock' });

    await svc.recordSyncSuccess(OTHER_TENANT, created.id);

    // The row still belongs to TENANT, untouched.
    expect(prisma.store[0].lastSyncAt).toBeNull();
  });
});
