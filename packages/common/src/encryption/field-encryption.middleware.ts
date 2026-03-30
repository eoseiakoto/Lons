import { decryptFromString, encryptToString } from './aes-gcm.util';
import { ENCRYPTED_FIELDS } from './encrypted-fields.config';
import { IKeyProvider } from './key-provider.interface';

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
 * Recursively encrypt designated fields in a data object.
 */
function encryptFields(data: Record<string, unknown>, fields: string[], key: Buffer): void {
  for (const field of fields) {
    const value = data[field];
    if (value == null || isEncryptedBlob(value)) continue;
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

      if (params.args?.data) {
        if (action === 'createMany' || action === 'updateMany') {
          // createMany receives { data: [...] }
          const dataArray = Array.isArray(params.args.data)
            ? params.args.data
            : [params.args.data];
          for (const item of dataArray) {
            encryptFields(item as Record<string, unknown>, fields, key);
          }
        } else {
          encryptFields(params.args.data as Record<string, unknown>, fields, key);
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
