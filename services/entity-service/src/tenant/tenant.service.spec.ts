/**
 * S17-7 / FR-SP-001.2 — TenantService webhook signing key helpers.
 *
 * `getWebhookSigningKey` decrypts the AES-256-GCM blob stored under
 * `tenant.settings.webhookSigningKeyEncrypted`; `rotateWebhookSigningKey`
 * generates a fresh 32-byte hex secret, encrypts and stores it, and
 * returns the plaintext exactly once.
 *
 * These tests stub the Prisma layer and rely on a real AES key (the env
 * provider) so the round-trip encrypt/decrypt is exercised end-to-end.
 */
import * as crypto from 'crypto';

import { TenantService } from './tenant.service';
import { encryptToString } from '@lons/common';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

// AES-256-GCM key (32 bytes, base64). Identical to test-env defaults.
const TEST_KEY_B64 = Buffer.alloc(32, 7).toString('base64');

function makeService() {
  // `findFirst` is what `findById` ultimately calls.
  const findFirst = jest.fn();
  const update = jest.fn();
  const prisma = {
    tenant: {
      findFirst,
      update,
    },
  } as any;
  // AuditService stub — `.log()` is fire-and-forget; we just verify the
  // call shape on rotate.
  const auditService = {
    log: jest.fn(async () => undefined),
  } as any;
  const service = new TenantService(prisma, auditService);
  return { service, prisma, findFirst, update, auditService };
}

describe('TenantService — webhook signing key (S17-7)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_B64;
    // `searchable-hash.util` requires a pepper to be set even though we
    // don't use it here. Set a 32-char string so the module never throws.
    if (!process.env.HASH_PEPPER) {
      process.env.HASH_PEPPER = 'a'.repeat(64);
    }
  });

  describe('getWebhookSigningKey', () => {
    it('decrypts and returns the stored signing key', async () => {
      const { service, findFirst } = makeService();
      const key = Buffer.from(TEST_KEY_B64, 'base64');
      const secret = crypto.randomBytes(32).toString('hex');
      const encrypted = encryptToString(secret, key);

      findFirst.mockResolvedValue({
        id: TENANT_ID,
        status: 'active',
        settings: { webhookSigningKeyEncrypted: encrypted },
      });

      const result = await service.getWebhookSigningKey(TENANT_ID);
      expect(result).toBe(secret);
    });

    it('throws NotFoundError when the tenant has no key configured', async () => {
      const { service, findFirst } = makeService();
      findFirst.mockResolvedValue({
        id: TENANT_ID,
        status: 'active',
        settings: {},
      });

      await expect(service.getWebhookSigningKey(TENANT_ID)).rejects.toThrow(
        /Webhook signing key not configured/,
      );
    });

    it('throws NotFoundError when settings is null', async () => {
      const { service, findFirst } = makeService();
      findFirst.mockResolvedValue({
        id: TENANT_ID,
        status: 'active',
        settings: null,
      });

      await expect(service.getWebhookSigningKey(TENANT_ID)).rejects.toThrow(
        /Webhook signing key not configured/,
      );
    });

    it('throws NotFoundError when the tenant does not exist', async () => {
      const { service, findFirst } = makeService();
      findFirst.mockResolvedValue(null);
      await expect(service.getWebhookSigningKey(TENANT_ID)).rejects.toThrow(
        /Tenant/,
      );
    });
  });

  describe('rotateWebhookSigningKey', () => {
    it('generates a fresh secret, encrypts it, persists, and returns plaintext', async () => {
      const { service, findFirst, update, auditService } = makeService();
      findFirst.mockResolvedValue({
        id: TENANT_ID,
        status: 'active',
        settings: { defaultCurrency: 'GHS' },
      });
      update.mockResolvedValue({});

      const result = await service.rotateWebhookSigningKey(
        TENANT_ID,
        'actor-1',
      );

      // 64 hex chars = 32 random bytes.
      expect(result.newSecret).toMatch(/^[a-f0-9]{64}$/);

      // Persisted as encrypted JSON blob, preserving prior settings.
      expect(update).toHaveBeenCalledTimes(1);
      const updateArgs = update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: TENANT_ID });
      const persistedSettings = updateArgs.data.settings;
      expect(persistedSettings.defaultCurrency).toBe('GHS');
      expect(typeof persistedSettings.webhookSigningKeyEncrypted).toBe(
        'string',
      );
      // The plaintext secret MUST NOT appear in the persisted blob —
      // sanity check that we're not storing it accidentally.
      expect(persistedSettings.webhookSigningKeyEncrypted).not.toContain(
        result.newSecret,
      );

      // Audit log fired with config_change action.
      expect(auditService.log).toHaveBeenCalledTimes(1);
      const auditArgs = auditService.log.mock.calls[0][0];
      expect(auditArgs.tenantId).toBe(TENANT_ID);
      expect(auditArgs.actorId).toBe('actor-1');
      expect(auditArgs.actorType).toBe('user');
      expect(auditArgs.action).toBe('config_change');
      expect(auditArgs.resourceType).toBe('tenant');
      // The secret never enters the audit log.
      expect(JSON.stringify(auditArgs)).not.toContain(result.newSecret);
    });

    it('invalidates the previous key — old secret no longer decrypts', async () => {
      const { service, findFirst, update } = makeService();
      const key = Buffer.from(TEST_KEY_B64, 'base64');
      const oldSecret = crypto.randomBytes(32).toString('hex');
      const oldEncrypted = encryptToString(oldSecret, key);

      // Initial findFirst (for rotate) returns the old key.
      findFirst.mockResolvedValueOnce({
        id: TENANT_ID,
        status: 'active',
        settings: { webhookSigningKeyEncrypted: oldEncrypted },
      });
      update.mockResolvedValue({});

      const { newSecret } = await service.rotateWebhookSigningKey(TENANT_ID);
      expect(newSecret).not.toBe(oldSecret);

      // After rotation, the persisted blob decrypts to `newSecret`, not
      // `oldSecret`. Simulate a follow-up `getWebhookSigningKey` call.
      const persistedSettings = update.mock.calls[0][0].data.settings;
      findFirst.mockResolvedValueOnce({
        id: TENANT_ID,
        status: 'active',
        settings: persistedSettings,
      });

      const fetched = await service.getWebhookSigningKey(TENANT_ID);
      expect(fetched).toBe(newSecret);
      expect(fetched).not.toBe(oldSecret);
    });

    it('marks actorType as system when no actorId is provided', async () => {
      const { service, findFirst, update, auditService } = makeService();
      findFirst.mockResolvedValue({
        id: TENANT_ID,
        status: 'active',
        settings: {},
      });
      update.mockResolvedValue({});
      await service.rotateWebhookSigningKey(TENANT_ID);
      expect(auditService.log.mock.calls[0][0].actorType).toBe('system');
    });
  });
});
