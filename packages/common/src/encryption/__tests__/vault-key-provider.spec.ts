import { VaultKeyProvider } from '../vault-key.provider';

// A valid 32-byte key encoded as base64
const VALID_KEY_B64 = Buffer.alloc(32, 0xab).toString('base64');
// A 16-byte (invalid) key encoded as base64
const SHORT_KEY_B64 = Buffer.alloc(16, 0xcd).toString('base64');

function makeVaultResponse(
  key: string,
  keyId?: string,
  version?: number,
) {
  return {
    data: {
      data: {
        key,
        ...(keyId ? { key_id: keyId } : {}),
      },
      metadata: { version: version ?? 1 },
    },
  };
}

describe('VaultKeyProvider', () => {
  const originalEnv = { ...process.env };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset env
    process.env = { ...originalEnv };
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
    delete process.env.VAULT_SECRET_PATH;
    delete process.env.VAULT_KEY_CACHE_TTL_MS;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.KEY_PROVIDER;

    // Mock global fetch
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 500 }),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  });

  describe('when Vault is configured and reachable', () => {
    beforeEach(() => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'test-token';
    });

    it('fetches key from Vault and caches it', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVaultResponse(VALID_KEY_B64, 'key-1')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const provider = new VaultKeyProvider();
      await provider.onModuleInit();

      const key = await provider.getKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
      expect(provider.getCurrentKeyId()).toBe('key-1');

      // fetch should have been called exactly once (onModuleInit)
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://vault:8200/v1/secret/data/lons/encryption',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Vault-Token': 'test-token',
          }),
        }),
      );
    });

    it('uses custom VAULT_SECRET_PATH', async () => {
      process.env.VAULT_SECRET_PATH = 'secret/data/custom/path';

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(makeVaultResponse(VALID_KEY_B64, 'c-1')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const provider = new VaultKeyProvider();
      await provider.onModuleInit();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://vault:8200/v1/secret/data/custom/path',
        expect.anything(),
      );
    });

    it('falls back to metadata.version when key_id absent', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeVaultResponse(VALID_KEY_B64, undefined, 3)),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const provider = new VaultKeyProvider();
      await provider.onModuleInit();

      expect(provider.getCurrentKeyId()).toBe('vault-v3');
    });

    it('rejects keys that are not 32 bytes', async () => {
      process.env.ENCRYPTION_KEY = VALID_KEY_B64; // fallback available

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeVaultResponse(SHORT_KEY_B64, 'bad-key')),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const provider = new VaultKeyProvider();
      // Should fall back to env var instead of throwing
      await provider.onModuleInit();
      expect(provider.getCurrentKeyId()).toBe('vault-env-fallback');
    });

    it('throws when invalid key length and no env fallback', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify(makeVaultResponse(SHORT_KEY_B64, 'bad-key')),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const provider = new VaultKeyProvider();
      await expect(provider.onModuleInit()).rejects.toThrow(
        'ENCRYPTION_KEY environment variable is not set',
      );
    });
  });

  describe('when Vault is unreachable', () => {
    beforeEach(() => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'test-token';
    });

    it('falls back to ENCRYPTION_KEY env var', async () => {
      process.env.ENCRYPTION_KEY = VALID_KEY_B64;
      fetchSpy.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      const provider = new VaultKeyProvider();
      await provider.onModuleInit();

      const key = await provider.getKey();
      expect(key.length).toBe(32);
      expect(provider.getCurrentKeyId()).toBe('vault-env-fallback');
    });

    it('falls back on HTTP error status', async () => {
      process.env.ENCRYPTION_KEY = VALID_KEY_B64;
      fetchSpy.mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );

      const provider = new VaultKeyProvider();
      await provider.onModuleInit();

      expect(provider.getCurrentKeyId()).toBe('vault-env-fallback');
    });

    it('throws when Vault unreachable and no ENCRYPTION_KEY', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      const provider = new VaultKeyProvider();
      await expect(provider.onModuleInit()).rejects.toThrow(
        'ENCRYPTION_KEY environment variable is not set',
      );
    });
  });

  describe('when Vault is not configured', () => {
    it('falls back to ENCRYPTION_KEY env var with warning', async () => {
      process.env.ENCRYPTION_KEY = VALID_KEY_B64;

      const provider = new VaultKeyProvider();
      await provider.onModuleInit();

      const key = await provider.getKey();
      expect(key.length).toBe(32);
      expect(provider.getCurrentKeyId()).toBe('vault-env-fallback');

      // Should never call fetch
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('cache expiry', () => {
    it('re-fetches from Vault when cache expires', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'test-token';
      process.env.VAULT_KEY_CACHE_TTL_MS = '100'; // 100ms TTL

      const key1 = Buffer.alloc(32, 0x01).toString('base64');
      const key2 = Buffer.alloc(32, 0x02).toString('base64');

      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify(makeVaultResponse(key1, 'v1')), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(makeVaultResponse(key2, 'v2')), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const provider = new VaultKeyProvider();
      await provider.onModuleInit();

      expect(provider.getCurrentKeyId()).toBe('v1');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 150));

      const key = await provider.getKey();
      expect(key).toEqual(Buffer.alloc(32, 0x02));
      expect(provider.getCurrentKeyId()).toBe('v2');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('rotateKey', () => {
    it('invalidates cache and re-fetches', async () => {
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'test-token';

      const key1 = Buffer.alloc(32, 0x01).toString('base64');
      const key2 = Buffer.alloc(32, 0x02).toString('base64');

      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify(makeVaultResponse(key1, 'v1')), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(makeVaultResponse(key2, 'v2')), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const provider = new VaultKeyProvider();
      await provider.onModuleInit();
      expect(provider.getCurrentKeyId()).toBe('v1');

      const result = await provider.rotateKey();
      expect(result.newKeyId).toBe('v2');
      expect(provider.getCurrentKeyId()).toBe('v2');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
