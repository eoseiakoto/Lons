import { decryptFromString, encryptToString } from './aes-gcm.util';
import { ENCRYPTED_FIELDS } from './encrypted-fields.config';
import { IKeyProvider } from './key-provider.interface';
import { computeSearchableHash } from './searchable-hash.util';

/**
 * Sprint 13B (S13B-2): map of <model> → <plaintext-field, hash-field>.
 * When the middleware encrypts the plaintext field on write, it also
 * computes the SHA-256 hash and writes it to the companion column so
 * lookups (login by email, debtor matching by tax id / registration
 * number) keep working after encryption.
 *
 * Kept here rather than in `encrypted-fields.config.ts` because the
 * middleware is the only consumer; consolidating the data flow into one
 * file makes the contract obvious.
 */
const HASH_FIELD_MAP: Record<string, Record<string, string>> = {
  PlatformUser: { email: 'emailHash' },
  User: { email: 'emailHash' },
  Debtor: {
    taxId: 'taxIdHash',
    registrationNumber: 'registrationNumberHash',
  },
  // Security Hardening (SEC-1): Customer search by phone / email / national
  // ID is broken on encrypted columns; we maintain hash companions for
  // indexed equality lookups. fullName is intentionally omitted — there is
  // no exact-match search use case, and full-name hashing on its own is
  // collidable enough to leak demographic information.
  Customer: {
    email: 'emailHash',
    phonePrimary: 'phonePrimaryHash',
    nationalId: 'nationalIdHash',
  },
};

/**
 * Minimal type aliases that mirror the Prisma middleware contract.
 * Using local types keeps this package free of a hard @prisma/client dependency
 * while remaining compatible with the real Prisma.Middleware signature.
 */
export interface PrismaMiddlewareParams {
  model?: string;
  action: string;
  args: Record<string, unknown>;
  dataPath: string[];
  runInTransaction: boolean;
}

export type PrismaMiddlewareNext = (params: PrismaMiddlewareParams) => Promise<unknown>;
export type PrismaMiddleware = (
  params: PrismaMiddlewareParams,
  next: PrismaMiddlewareNext,
) => Promise<unknown>;

/** Prisma actions that write data and require field encryption. */
const WRITE_ACTIONS = new Set<string>(['create', 'update', 'upsert', 'createMany', 'updateMany']);

/** Prisma actions that read data and require field decryption. */
const READ_ACTIONS = new Set<string>([
  'findFirst',
  'findMany',
  'findUnique',
  'findFirstOrThrow',
  'findUniqueOrThrow',
]);

/**
 * Encrypts a plain-text field value using the key from the provider.
 * Returns the original value unchanged if it is null/undefined or already
 * looks like an encrypted JSON blob.
 */
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

/**
 * Recursively encrypt designated fields in a data object. When a field is
 * configured with a companion hash column (Sprint 13B / S13B-2 — see
 * HASH_FIELD_MAP), the SHA-256 of the *plaintext* is also written to the
 * hash column in the same `data` object — atomic with the ciphertext write.
 *
 * If the value is already an encrypted blob (idempotency case), the hash
 * field is left untouched: there's nothing recoverable to hash from
 * ciphertext, and the row should already have a hash from the original write.
 */
function encryptFields(
  data: Record<string, unknown>,
  fields: string[],
  key: Buffer,
  hashFields?: Record<string, string>,
): void {
  for (const field of fields) {
    const value = data[field];
    if (value == null || isEncryptedBlob(value)) {
      // Still keep the hash column null when the plaintext is null so the
      // two columns don't drift (e.g. clearing an email).
      if (value === null && hashFields && hashFields[field]) {
        data[hashFields[field]] = null;
      }
      continue;
    }

    if (hashFields && hashFields[field]) {
      data[hashFields[field]] = computeSearchableHash(String(value));
    }
    data[field] = encryptToString(String(value), key);
  }
}

/**
 * Recursively decrypt designated fields in a result object or array.
 */
function decryptResult(result: unknown, fields: string[], key: Buffer): void {
  if (Array.isArray(result)) {
    for (const item of result) {
      decryptResult(item, fields, key);
    }
    return;
  }

  if (result !== null && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    for (const field of fields) {
      const value = record[field];
      if (value == null || typeof value !== 'string') continue;
      if (!isEncryptedBlob(value)) continue;
      try {
        record[field] = decryptFromString(value, key);
      } catch {
        // Leave the value as-is if decryption fails (e.g. wrong key during rotation)
      }
    }
  }
}

/**
 * Creates a Prisma `$use` middleware that transparently encrypts PII fields
 * before writes and decrypts them after reads.
 *
 * @param keyProvider - The key provider used to retrieve the AES-256-GCM key.
 */
export function createFieldEncryptionMiddleware(keyProvider: IKeyProvider): PrismaMiddleware {
  return async (
    params: PrismaMiddlewareParams,
    next: PrismaMiddlewareNext,
  ): Promise<unknown> => {
    const model = params.model as string | undefined;
    if (!model) return next(params);

    const fields = ENCRYPTED_FIELDS[model];
    if (!fields || fields.length === 0) return next(params);

    const action = params.action as string;

    // ── Encrypt on write ──────────────────────────────────────────────────────
    if (WRITE_ACTIONS.has(action)) {
      const key = await keyProvider.getKey();
      const hashFields = HASH_FIELD_MAP[model];

      if (params.args?.data) {
        if (action === 'createMany' || action === 'updateMany') {
          // createMany receives { data: [...] }
          const dataArray = Array.isArray(params.args.data)
            ? params.args.data
            : [params.args.data];
          for (const item of dataArray) {
            encryptFields(
              item as Record<string, unknown>,
              fields,
              key,
              hashFields,
            );
          }
        } else {
          encryptFields(
            params.args.data as Record<string, unknown>,
            fields,
            key,
            hashFields,
          );
        }
      }

      return next(params);
    }

    // ── Decrypt on read ───────────────────────────────────────────────────────
    if (READ_ACTIONS.has(action)) {
      const result = await next(params);
      if (result == null) return result;

      const key = await keyProvider.getKey();
      decryptResult(result, fields, key);

      return result;
    }

    return next(params);
  };
}
