import { IKeyProvider } from './key-provider.interface';

/**
 * Key provider that reads the encryption key from the ENCRYPTION_KEY environment variable.
 * The env var must be a base64-encoded 32-byte (256-bit) key.
 */
export class EnvKeyProvider implements IKeyProvider {
  private static readonly KEY_ID = 'env-default';

  async getKey(_keyId?: string): Promise<Buffer> {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'ENCRYPTION_KEY environment variable is not set. ' +
          'Provide a base64-encoded 32-byte key.',
      );
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}.`,
      );
    }
    return key;
  }

  async rotateKey(): Promise<{ newKeyId: string }> {
    throw new Error(
      'Key rotation is not supported by EnvKeyProvider. ' +
        'Use VaultKeyProvider for managed key rotation.',
    );
  }

  getCurrentKeyId(): string {
    return EnvKeyProvider.KEY_ID;
  }
}
