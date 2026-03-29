/**
 * E2E integration tests — PII encryption
 *
 * Validates: AES-256-GCM encrypt/decrypt round-trip, ciphertext shape,
 * EnvKeyProvider key derivation, ENCRYPTED_FIELDS config, and masking helpers.
 */
import * as crypto from 'crypto';
import {
  encrypt,
  decrypt,
  generateEncryptionKey,
  EnvKeyProvider,
  ENCRYPTED_FIELDS,
  maskPhone,
  maskEmail,
  maskNationalId,
} from '@lons/common';

describe('PII Encryption — AES-256-GCM', () => {
  let key: Buffer;

  beforeEach(() => {
    key = generateEncryptionKey();
  });

  it('ciphertext is not equal to the plaintext', () => {
    const plaintext = 'GHA-123456789';
    const encrypted = encrypt(plaintext, key);

    expect(encrypted.ciphertext).not.toBe(plaintext);
  });

  it('encrypted value has correct shape: ciphertext, iv, tag', () => {
    const encrypted = encrypt('test-value', key);

    expect(encrypted).toHaveProperty('ciphertext');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('tag');
    expect(typeof encrypted.ciphertext).toBe('string');
    expect(typeof encrypted.iv).toBe('string');
    expect(typeof encrypted.tag).toBe('string');
  });

  it('decrypts back to the original plaintext', () => {
    const plaintext = '+233244123456';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it('two encryptions of the same value produce different ciphertexts (random IV)', () => {
    const plaintext = 'john.doe@example.com';
    const enc1 = encrypt(plaintext, key);
    const enc2 = encrypt(plaintext, key);

    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
    // Both still decrypt correctly
    expect(decrypt(enc1, key)).toBe(plaintext);
    expect(decrypt(enc2, key)).toBe(plaintext);
  });

  it('decryption with wrong key throws', () => {
    const encrypted = encrypt('sensitive data', key);
    const wrongKey = generateEncryptionKey();

    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });
});

describe('PII Encryption — EnvKeyProvider', () => {
  it('getKey returns a 32-byte Buffer when ENCRYPTION_KEY env var is set', async () => {
    const rawKey = crypto.randomBytes(32).toString('base64');
    process.env.ENCRYPTION_KEY = rawKey;

    const provider = new EnvKeyProvider();
    const key = await provider.getKey();

    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);

    delete process.env.ENCRYPTION_KEY;
  });

  it('getKey throws when ENCRYPTION_KEY is not set', async () => {
    delete process.env.ENCRYPTION_KEY;
    const provider = new EnvKeyProvider();

    await expect(provider.getKey()).rejects.toThrow('ENCRYPTION_KEY');
  });
});

describe('PII Encryption — ENCRYPTED_FIELDS config', () => {
  it('Customer model has the expected encrypted fields', () => {
    expect(ENCRYPTED_FIELDS).toHaveProperty('Customer');
    const fields = ENCRYPTED_FIELDS['Customer'];
    expect(fields).toContain('nationalId');
    expect(fields).toContain('phonePrimary');
    expect(fields).toContain('email');
    expect(fields).toContain('dateOfBirth');
  });
});

describe('PII Masking helpers', () => {
  it('maskPhone masks middle digits, preserves prefix and suffix', () => {
    const masked = maskPhone('+233244987654');
    expect(masked).toMatch(/^\+233\*\*\*7654$/);
  });

  it('maskEmail masks local part, preserves domain', () => {
    const masked = maskEmail('john.doe@example.com');
    expect(masked).toContain('@example.com');
    expect(masked).not.toContain('john');
  });

  it('maskNationalId masks middle segment', () => {
    const masked = maskNationalId('GHA-123456-789');
    expect(masked).toContain('GHA');
    expect(masked).toContain('***');
    expect(masked).not.toContain('123456');
  });

  it('maskPhone handles short inputs gracefully', () => {
    const masked = maskPhone('123');
    expect(masked).toBe('***');
  });

  it('maskEmail handles input without @ gracefully', () => {
    const masked = maskEmail('notanemail');
    expect(masked).toBe('***@***');
  });
});
