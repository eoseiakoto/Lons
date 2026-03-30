import { generateEncryptionKey } from '../aes-gcm.util';
import { ENCRYPTED_FIELDS } from '../encrypted-fields.config';
import {
  createFieldEncryptionMiddleware,
  PrismaMiddlewareParams,
} from '../field-encryption.middleware';
import { IKeyProvider } from '../key-provider.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKeyProvider(key: Buffer): IKeyProvider {
  return {
    getKey: async () => key,
    rotateKey: async () => ({ newKeyId: 'new-key' }),
    getCurrentKeyId: () => 'test-key',
  };
}

type NextFn = (params: PrismaMiddlewareParams) => Promise<unknown>;

function makeParams(
  model: string,
  action: string,
  args: Record<string, unknown> = {},
): PrismaMiddlewareParams {
  return { model, action, args, dataPath: [], runInTransaction: false };
}

/** Checks whether a string looks like an AES-GCM encrypted blob. */
function isEncryptedBlob(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'ciphertext' in parsed &&
      'iv' in parsed &&
      'tag' in parsed
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFieldEncryptionMiddleware', () => {
  const key = generateEncryptionKey(); // 32 random bytes
  const middleware = createFieldEncryptionMiddleware(makeKeyProvider(key));

  // ── Encryption on write ──────────────────────────────────────────────────

  describe('create action', () => {
    it('encrypts all designated Customer fields', async () => {
      const data: Record<string, unknown> = {
        nationalId: 'GHA-12345-6',
        phonePrimary: '+233201234567',
        phoneSecondary: '+233209876543',
        email: 'john.doe@example.com',
        dateOfBirth: '1990-01-15',
        firstName: 'John', // not a designated field — should remain plain
      };

      const capturedParams: unknown[] = [];
      const next: NextFn = async (params) => {
        capturedParams.push(params);
        return null;
      };

      await middleware(makeParams('Customer', 'create', { data }), next);

      const sent = (capturedParams[0] as unknown as { args: { data: Record<string, unknown> } }).args.data;

      for (const field of ENCRYPTED_FIELDS['Customer']) {
        expect(isEncryptedBlob(sent[field])).toBe(true);
      }

      // Non-PII fields are not touched
      expect(sent['firstName']).toBe('John');
    });

    it('skips null / undefined fields', async () => {
      const data: Record<string, unknown> = {
        nationalId: null,
        phonePrimary: undefined,
        email: 'test@example.com',
      };

      const capturedParams: unknown[] = [];
      await middleware(makeParams('Customer', 'create', { data }), async (p) => {
        capturedParams.push(p);
        return null;
      });

      const sent = (capturedParams[0] as unknown as { args: { data: Record<string, unknown> } }).args.data;
      expect(sent['nationalId']).toBeNull();
      expect(sent['phonePrimary']).toBeUndefined();
      expect(isEncryptedBlob(sent['email'])).toBe(true);
    });

    it('does not double-encrypt already-encrypted values', async () => {
      // Simulate a value that was already encrypted (e.g. coming from an upsert retry)
      const data: Record<string, unknown> = {
        nationalId: 'GHA-12345-6',
      };

      const capturedParams1: unknown[] = [];
      await middleware(makeParams('Customer', 'create', { data }), async (p) => {
        capturedParams1.push(p);
        return null;
      });

      const firstEncrypted = (
        capturedParams1[0] as { args: { data: Record<string, unknown> } }
      ).args.data['nationalId'] as string;

      // Feed the already-encrypted value back through a second create
      const data2: Record<string, unknown> = { nationalId: firstEncrypted };
      const capturedParams2: unknown[] = [];
      await middleware(makeParams('Customer', 'create', { data: data2 }), async (p) => {
        capturedParams2.push(p);
        return null;
      });

      const secondValue = (
        capturedParams2[0] as { args: { data: Record<string, unknown> } }
      ).args.data['nationalId'] as string;

      // The blob should still be parseable as an encrypted blob (not double-wrapped)
      expect(isEncryptedBlob(secondValue)).toBe(true);
      // It should be identical — no re-encryption occurred
      expect(secondValue).toBe(firstEncrypted);
    });
  });

  describe('update action', () => {
    it('encrypts fields in update data', async () => {
      const data = { email: 'updated@example.com' };
      const capturedParams: unknown[] = [];
      await middleware(makeParams('Customer', 'update', { data, where: { id: '1' } }), async (p) => {
        capturedParams.push(p);
        return null;
      });

      const sent = (capturedParams[0] as unknown as { args: { data: Record<string, unknown> } }).args.data;
      expect(isEncryptedBlob(sent['email'])).toBe(true);
    });
  });

  // ── Decryption on read ───────────────────────────────────────────────────

  describe('findMany action', () => {
    it('decrypts encrypted fields in returned records', async () => {
      const originalEmail = 'decrypt@example.com';
      const originalPhone = '+233201234567';

      // First, encrypt the values using the middleware write path
      let encryptedEmail: string | undefined;
      let encryptedPhone: string | undefined;

      await middleware(
        makeParams('Customer', 'create', {
          data: { email: originalEmail, phonePrimary: originalPhone },
        }),
        async (p) => {
          const d = (p as unknown as { args: { data: Record<string, unknown> } }).args.data;
          encryptedEmail = d['email'] as string;
          encryptedPhone = d['phonePrimary'] as string;
          return null;
        },
      );

      // Now simulate a findMany returning those encrypted values
      const fakeDbRecords = [
        { id: '1', email: encryptedEmail, phonePrimary: encryptedPhone, firstName: 'Jane' },
      ];

      const result = await middleware(
        makeParams('Customer', 'findMany', {}),
        async () => fakeDbRecords,
      );

      const rows = result as Array<Record<string, unknown>>;
      expect(rows[0]['email']).toBe(originalEmail);
      expect(rows[0]['phonePrimary']).toBe(originalPhone);
      // Non-PII fields are untouched
      expect(rows[0]['firstName']).toBe('Jane');
    });

    it('returns null result unchanged', async () => {
      const result = await middleware(makeParams('Customer', 'findMany', {}), async () => null);
      expect(result).toBeNull();
    });
  });

  describe('findUnique action', () => {
    it('decrypts a single record', async () => {
      const originalNationalId = 'GHA-00001-1';
      let encryptedNationalId: string | undefined;

      await middleware(
        makeParams('Customer', 'create', { data: { nationalId: originalNationalId } }),
        async (p) => {
          encryptedNationalId = (p as unknown as { args: { data: Record<string, unknown> } }).args.data[
            'nationalId'
          ] as string;
          return null;
        },
      );

      const result = await middleware(
        makeParams('Customer', 'findUnique', { where: { id: '1' } }),
        async () => ({ id: '1', nationalId: encryptedNationalId }),
      );

      expect((result as Record<string, unknown>)['nationalId']).toBe(originalNationalId);
    });
  });

  // ── Models without encrypted fields ──────────────────────────────────────

  describe('unknown model', () => {
    it('passes through without modification', async () => {
      const data = { amount: '1000.00', currency: 'GHS' };
      const capturedParams: unknown[] = [];
      await middleware(makeParams('LedgerEntry', 'create', { data }), async (p) => {
        capturedParams.push(p);
        return null;
      });

      const sent = (capturedParams[0] as unknown as { args: { data: Record<string, unknown> } }).args.data;
      expect(sent['amount']).toBe('1000.00');
      expect(sent['currency']).toBe('GHS');
    });
  });
});
