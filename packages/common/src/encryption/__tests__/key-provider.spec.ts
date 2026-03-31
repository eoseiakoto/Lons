import * as crypto from 'crypto';
import { createKeyProvider } from '../key-provider.factory';
import { EnvKeyProvider } from '../env-key.provider';
import { VaultKeyProvider } from '../vault-key.provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a valid base64-encoded 32-byte key. */
function makeValidKeyB64(): string {
  return crypto.randomBytes(32).toString('base64');
}

/** Generate a base64-encoded key of the wrong length. */
function makeShortKeyB64(): string {
  return crypto.randomBytes(16).toString('base64');
}

// ---------------------------------------------------------------------------
// EnvKeyProvider
// ---------------------------------------------------------------------------

describe('EnvKeyProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a 32-byte Buffer when ENCRYPTION_KEY is valid', async () => {
    process.env.ENCRYPTION_KEY = makeValidKeyB64();
    const provider = new EnvKeyProvider();
    const key = await provider.getKey();
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  it('throws when ENCRYPTION_KEY is not set', async () => {
    delete process.env.ENCRYPTION_KEY;
    const provider = new EnvKeyProvider();
    await expect(provider.getKey()).rejects.toThrow('ENCRYPTION_KEY environment variable is not set');
  });

  it('throws when ENCRYPTION_KEY decodes to wrong number of bytes', async () => {
    process.env.ENCRYPTION_KEY = makeShortKeyB64();
    const provider = new EnvKeyProvider();
    await expect(provider.getKey()).rejects.toThrow('must decode to exactly 32 bytes');
  });

  it('getCurrentKeyId returns "env-default"', () => {
    const provider = new EnvKeyProvider();
    expect(provider.getCurrentKeyId()).toBe('env-default');
  });

  it('rotateKey throws not-supported error', async () => {
    const provider = new EnvKeyProvider();
    await expect(provider.rotateKey()).rejects.toThrow('Key rotation is not supported by EnvKeyProvider');
  });
});

// ---------------------------------------------------------------------------
// VaultKeyProvider
// ---------------------------------------------------------------------------

describe('VaultKeyProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('creates a provider without error when Vault is not configured', async () => {
    process.env.ENCRYPTION_KEY = makeValidKeyB64();
    const provider = new VaultKeyProvider();
    // The warning is logged via NestJS Logger during onModuleInit
    // Just verify the provider can be created and used
    const key = await provider.getKey();
    expect(key).toBeDefined();
    expect(key.length).toBe(32);
  });

  it('returns a 32-byte Buffer when ENCRYPTION_KEY is valid', async () => {
    process.env.ENCRYPTION_KEY = makeValidKeyB64();
    const provider = new VaultKeyProvider();
    const key = await provider.getKey();
    expect(key.length).toBe(32);
  });

  it('throws when ENCRYPTION_KEY is missing', async () => {
    delete process.env.ENCRYPTION_KEY;
    const provider = new VaultKeyProvider();
    await expect(provider.getKey()).rejects.toThrow('ENCRYPTION_KEY environment variable is not set');
  });

  it('getCurrentKeyId returns "vault-unknown" when no key is cached', () => {
    const provider = new VaultKeyProvider();
    expect(provider.getCurrentKeyId()).toBe('vault-unknown');
  });

  it('getCurrentKeyId returns "vault-env-fallback" after loading from ENCRYPTION_KEY', async () => {
    process.env.ENCRYPTION_KEY = makeValidKeyB64();
    const provider = new VaultKeyProvider();
    await provider.getKey();
    expect(provider.getCurrentKeyId()).toBe('vault-env-fallback');
  });

  it('rotateKey throws error when key cannot be obtained', async () => {
    delete process.env.ENCRYPTION_KEY;
    const provider = new VaultKeyProvider();
    await expect(provider.rotateKey()).rejects.toThrow('ENCRYPTION_KEY environment variable is not set');
  });
});

// ---------------------------------------------------------------------------
// createKeyProvider factory
// ---------------------------------------------------------------------------

describe('createKeyProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('returns EnvKeyProvider when KEY_PROVIDER is "env"', () => {
    process.env.KEY_PROVIDER = 'env';
    const provider = createKeyProvider();
    expect(provider).toBeInstanceOf(EnvKeyProvider);
  });

  it('returns EnvKeyProvider when KEY_PROVIDER is not set (default)', () => {
    delete process.env.KEY_PROVIDER;
    const provider = createKeyProvider();
    expect(provider).toBeInstanceOf(EnvKeyProvider);
  });

  it('returns VaultKeyProvider when KEY_PROVIDER is "vault"', () => {
    process.env.KEY_PROVIDER = 'vault';
    const provider = createKeyProvider();
    expect(provider).toBeInstanceOf(VaultKeyProvider);
  });
});
