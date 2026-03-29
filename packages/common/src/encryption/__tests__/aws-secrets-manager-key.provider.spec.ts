import { AwsSecretsManagerKeyProvider } from '../aws-secrets-manager-key.provider';

// A valid 32-byte key encoded as base64
const VALID_KEY_B64 = Buffer.alloc(32, 0xab).toString('base64');
// A 16-byte (invalid) key encoded as base64
const SHORT_KEY_B64 = Buffer.alloc(16, 0xcd).toString('base64');

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetSecretValueCommand: jest.fn().mockImplementation((input) => ({
      _type: 'GetSecretValue',
      ...input,
    })),
    RotateSecretCommand: jest.fn().mockImplementation((input) => ({
      _type: 'RotateSecret',
      ...input,
    })),
  };
});

function makeSmResponse(key: string, keyId?: string, versionId?: string) {
  return {
    SecretString: JSON.stringify({
      key,
      ...(keyId ? { key_id: keyId } : {}),
    }),
    VersionId: versionId ?? 'ver-001',
  };
}

describe('AwsSecretsManagerKeyProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AWS_SM_SECRET_ID;
    delete process.env.AWS_SM_REGION;
    delete process.env.AWS_SM_CACHE_TTL_MS;
    delete process.env.AWS_REGION;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.KEY_PROVIDER;
    mockSend.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('getKey() returns cached key when cache is valid', async () => {
    mockSend.mockResolvedValueOnce(makeSmResponse(VALID_KEY_B64, 'key-1'));

    const provider = new AwsSecretsManagerKeyProvider();
    await provider.onModuleInit();

    const key = await provider.getKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
    expect(provider.getCurrentKeyId()).toBe('key-1');

    // Second call should use cache, no additional send
    const key2 = await provider.getKey();
    expect(key2).toEqual(key);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('getKey() refreshes from Secrets Manager when cache is expired', async () => {
    process.env.AWS_SM_CACHE_TTL_MS = '100'; // 100ms TTL

    const key1 = Buffer.alloc(32, 0x01).toString('base64');
    const key2 = Buffer.alloc(32, 0x02).toString('base64');

    mockSend
      .mockResolvedValueOnce(makeSmResponse(key1, 'v1'))
      .mockResolvedValueOnce(makeSmResponse(key2, 'v2'));

    const provider = new AwsSecretsManagerKeyProvider();
    await provider.onModuleInit();
    expect(provider.getCurrentKeyId()).toBe('v1');
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Wait for cache to expire
    await new Promise((r) => setTimeout(r, 150));

    const key = await provider.getKey();
    expect(key).toEqual(Buffer.alloc(32, 0x02));
    expect(provider.getCurrentKeyId()).toBe('v2');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('getKey() falls back to ENCRYPTION_KEY when Secrets Manager is unavailable', async () => {
    process.env.ENCRYPTION_KEY = VALID_KEY_B64;
    mockSend.mockRejectedValueOnce(new Error('Network error'));

    const provider = new AwsSecretsManagerKeyProvider();
    await provider.onModuleInit();

    const key = await provider.getKey();
    expect(key.length).toBe(32);
    expect(provider.getCurrentKeyId()).toBe('aws-env-fallback');
  });

  it('getKey() throws when both Secrets Manager and env var are unavailable', async () => {
    mockSend.mockRejectedValueOnce(new Error('Network error'));

    const provider = new AwsSecretsManagerKeyProvider();
    await expect(provider.onModuleInit()).rejects.toThrow(
      'ENCRYPTION_KEY environment variable is not set',
    );
  });

  it('getKey(keyId) forces refresh when requested keyId does not match cache', async () => {
    const key1 = Buffer.alloc(32, 0x01).toString('base64');
    const key2 = Buffer.alloc(32, 0x02).toString('base64');

    mockSend
      .mockResolvedValueOnce(makeSmResponse(key1, 'v1'))
      .mockResolvedValueOnce(makeSmResponse(key2, 'v2'));

    const provider = new AwsSecretsManagerKeyProvider();
    await provider.onModuleInit();
    expect(provider.getCurrentKeyId()).toBe('v1');

    const key = await provider.getKey('v2');
    expect(provider.getCurrentKeyId()).toBe('v2');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('getCurrentKeyId() returns correct key ID', async () => {
    mockSend.mockResolvedValueOnce(makeSmResponse(VALID_KEY_B64, 'my-key-42'));

    const provider = new AwsSecretsManagerKeyProvider();
    await provider.onModuleInit();

    expect(provider.getCurrentKeyId()).toBe('my-key-42');
  });

  it('getCurrentKeyId() falls back to VersionId when key_id is absent', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ key: VALID_KEY_B64 }),
      VersionId: 'ver-abc',
    });

    const provider = new AwsSecretsManagerKeyProvider();
    await provider.onModuleInit();

    expect(provider.getCurrentKeyId()).toBe('aws-ver-abc');
  });

  it('rotateKey() sends RotateSecretCommand and refreshes cache', async () => {
    const key1 = Buffer.alloc(32, 0x01).toString('base64');
    const key2 = Buffer.alloc(32, 0x02).toString('base64');

    mockSend
      .mockResolvedValueOnce(makeSmResponse(key1, 'v1'))    // onModuleInit
      .mockResolvedValueOnce({})                               // RotateSecretCommand
      .mockResolvedValueOnce(makeSmResponse(key2, 'v2'));    // refresh after rotate

    const provider = new AwsSecretsManagerKeyProvider();
    await provider.onModuleInit();
    expect(provider.getCurrentKeyId()).toBe('v1');

    const result = await provider.rotateKey();
    expect(result.newKeyId).toBe('v2');
    expect(provider.getCurrentKeyId()).toBe('v2');
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('rejects keys that are not exactly 32 bytes', async () => {
    process.env.ENCRYPTION_KEY = VALID_KEY_B64; // fallback available
    mockSend.mockResolvedValueOnce(makeSmResponse(SHORT_KEY_B64, 'bad-key'));

    const provider = new AwsSecretsManagerKeyProvider();
    // Should fall back to env var
    await provider.onModuleInit();
    expect(provider.getCurrentKeyId()).toBe('aws-env-fallback');
  });

  it('rejects secrets with missing key field', async () => {
    process.env.ENCRYPTION_KEY = VALID_KEY_B64; // fallback available
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ not_key: 'something' }),
      VersionId: 'ver-1',
    });

    const provider = new AwsSecretsManagerKeyProvider();
    await provider.onModuleInit();
    expect(provider.getCurrentKeyId()).toBe('aws-env-fallback');
  });
});
