/**
 * Sprint 13B (S13B-2) + Security Hardening 2026-05-10 (SEC-1, SEC-5) —
 * one-time backfill that encrypts PII fields and populates searchable
 * HMAC-SHA-256 hash companion columns (`emailHash`, `taxIdHash`,
 * `registrationNumberHash`, `phonePrimaryHash`, `nationalIdHash`).
 *
 * Idempotency: encryption is skipped when the field is already an
 * `isEncryptedBlob` (so re-runs are safe). Hashing is **never** skipped —
 * if a row is already encrypted, we decrypt the ciphertext to recover the
 * plaintext and recompute the hash. This is the only way to recompute
 * hashes after a `HASH_PEPPER` rotation (SEC-5) or after adding a hash
 * column to a model that was already encrypted (SEC-1, Customer).
 *
 * Each batch is wrapped in `prisma.$transaction([...])`, so a mid-batch
 * failure rolls back the whole batch and the next run picks the rows up
 * via the idempotency check. Progress is logged per batch.
 *
 * Pre-requisite environment:
 *   - DATABASE_URL              — Postgres connection string
 *   - ENCRYPTION_KEY            — 32-byte base64 (used by the key provider)
 *   - HASH_PEPPER               — 32+ char HMAC pepper (SEC-5)
 *
 * Usage: pnpm tsx scripts/backfill-pii-hashes-and-encrypt.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  createKeyProvider,
  decryptFromString,
  encryptToString,
  computeSearchableHash,
} from '@lons/common';

const BATCH_SIZE = 1000;

interface ModelConfig {
  name: string;
  /** Plaintext PII fields the middleware encrypts. */
  encryptedFields: string[];
  /** Map of plaintext field → companion hash field. */
  hashFields: Record<string, string>;
}

const MODELS: ModelConfig[] = [
  {
    name: 'platformUser',
    encryptedFields: ['email'],
    hashFields: { email: 'emailHash' },
  },
  {
    name: 'user',
    encryptedFields: ['email', 'phone'],
    hashFields: { email: 'emailHash' },
  },
  {
    name: 'debtor',
    encryptedFields: [
      'contactEmail',
      'contactPhone',
      'contactName',
      'taxId',
      'registrationNumber',
    ],
    hashFields: {
      taxId: 'taxIdHash',
      registrationNumber: 'registrationNumberHash',
    },
  },
  {
    name: 'merchant',
    encryptedFields: ['contactEmail', 'contactPhone'],
    hashFields: {},
  },
  // Security Hardening (SEC-1): Customer was already encrypted as of
  // Sprint 7 but had no hash columns until now. The decrypt-to-hash logic
  // in `backfillModel` handles already-encrypted rows: it recovers the
  // plaintext from ciphertext, computes the HMAC, and writes only the
  // hash column (the encrypted column is left untouched via the
  // `isEncryptedBlob` idempotency check).
  {
    name: 'customer',
    encryptedFields: [
      'nationalId',
      'phonePrimary',
      'phoneSecondary',
      'email',
      'dateOfBirth',
      'fullName',
    ],
    hashFields: {
      email: 'emailHash',
      phonePrimary: 'phonePrimaryHash',
      nationalId: 'nationalIdHash',
    },
  },
];

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

async function backfillModel(
  prisma: PrismaClient,
  key: Buffer,
  config: ModelConfig,
): Promise<{ processed: number; updated: number; errors: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (prisma as any)[config.name];
  if (!model || typeof model.findMany !== 'function') {
    console.error(`Model "${config.name}" not found on PrismaClient — skipping`);
    return { processed: 0, updated: 0, errors: 0 };
  }

  const totalCount: number = await model.count();
  console.log(`\n[${config.name}] starting backfill — ${totalCount} rows`);

  let cursor: string | undefined;
  let processed = 0;
  let updated = 0;
  let errors = 0;

  while (true) {
    const rows: Array<Record<string, unknown> & { id: string }> =
      await model.findMany({
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

    if (rows.length === 0) break;

    // FIX-S13B-1 (F-S13B-2): collect prepared updates outside the
    // transaction, then dispatch the batch as a single $transaction. If any
    // row's DB write fails, the whole batch rolls back and the next run
    // (which is idempotent via isEncryptedBlob) picks the rows up again.
    // The per-row try/catch around *preparation* (hashing + encryption)
    // stays outside the transaction — those failures are computational and
    // wouldn't be helped by a rollback.
    const prepared: Array<{ id: string; data: Record<string, string | null> }> = [];

    for (const row of rows) {
      try {
        const data: Record<string, string | null> = {};

        for (const field of config.encryptedFields) {
          const raw = row[field];
          const hashField = config.hashFields[field];

          // ── Hash computation ────────────────────────────────────────
          // The hash MUST mirror the plaintext-or-null state of the
          // encrypted column. Three paths:
          //   1. raw is null/undefined  → hash = null
          //   2. raw is plaintext       → hash = HMAC(plaintext)
          //   3. raw is ciphertext blob → decrypt, hash = HMAC(plaintext)
          //
          // Path 3 is what makes this script idempotent across:
          //   (a) re-runs after a partial failure
          //   (b) HASH_PEPPER rotations (SEC-5) — old hashes invalid,
          //       must be recomputed without re-encrypting
          //   (c) adding a hash column to a model that was already
          //       encrypted (SEC-1, Customer)
          if (hashField) {
            if (raw == null) {
              data[hashField] = null;
            } else if (typeof raw === 'string') {
              if (isEncryptedBlob(raw)) {
                // Already-encrypted row — recover plaintext to hash it.
                // Decryption failure (e.g. wrong key) propagates to the
                // outer catch so the row is counted as an error and the
                // batch can rollback.
                const plaintext = decryptFromString(raw, key);
                data[hashField] = computeSearchableHash(plaintext);
              } else {
                data[hashField] = computeSearchableHash(raw);
              }
            }
          }

          // ── Encryption ──────────────────────────────────────────────
          // Skip both null values and already-encrypted blobs. The latter
          // makes re-runs safe — the row's ciphertext is preserved, only
          // the hash column changes.
          if (raw == null || (typeof raw === 'string' && isEncryptedBlob(raw))) {
            continue;
          }
          data[field] = encryptToString(String(raw), key);
        }

        // Drop hash-only updates that don't actually change anything (e.g.
        // when the row's hash already matches what we'd compute). This
        // avoids no-op writes that still consume a transaction slot.
        const meaningfulData = Object.fromEntries(
          Object.entries(data).filter(([k, v]) => {
            // We can only short-circuit if this is a hash field AND the
            // existing row already has the same hash. Otherwise keep it.
            const existing = row[k];
            return existing !== v;
          }),
        );

        if (Object.keys(meaningfulData).length > 0) {
          prepared.push({ id: row.id, data: meaningfulData });
        }
      } catch (err) {
        console.error(
          `[${config.name}] row ${row.id} failed to prepare:`,
          (err as Error).message,
        );
        errors++;
      }
      processed++;
    }

    if (prepared.length > 0) {
      try {
        await prisma.$transaction(
          prepared.map(({ id, data }) =>
            model.update({ where: { id }, data }),
          ),
        );
        updated += prepared.length;
      } catch (err) {
        console.error(
          `[${config.name}] batch of ${prepared.length} row(s) failed and rolled back:`,
          (err as Error).message,
        );
        errors += prepared.length;
      }
    }

    cursor = rows[rows.length - 1].id;
    console.log(
      `[${config.name}] ${processed}/${totalCount} processed, ${updated} updated, ${errors} errors`,
    );
  }

  return { processed, updated, errors };
}

async function main() {
  const prisma = new PrismaClient();
  const keyProvider = createKeyProvider();
  const key = await keyProvider.getKey();

  let totalErrors = 0;
  for (const model of MODELS) {
    const { errors } = await backfillModel(prisma, key, model);
    totalErrors += errors;
  }

  console.log(
    totalErrors === 0
      ? '\nBackfill complete — no errors.'
      : `\nBackfill complete with ${totalErrors} error(s). See log above.`,
  );

  await prisma.$disconnect();
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
