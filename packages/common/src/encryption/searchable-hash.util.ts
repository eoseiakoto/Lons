import * as crypto from 'crypto';

/**
 * Sprint 13B (S13B-2) — Searchable-hash util for encrypted PII columns.
 *
 * Encrypted fields can't be used in `WHERE` clauses (you can't search
 * ciphertext), so for fields that need point-lookups (login by email,
 * debtor-payment matching by tax id / registration number) we maintain a
 * companion `*Hash` column that holds a deterministic HMAC-SHA-256 of the
 * normalised plaintext, keyed with a server-side pepper.
 *
 * Security upgrade — Security Hardening 2026-05-10 (SEC-5): switched from
 * plain SHA-256 to HMAC-SHA-256 keyed by `HASH_PEPPER`. Plain hashes are
 * vulnerable to rainbow-table / brute-force attacks if the database is
 * exfiltrated — known-domain emails (~10⁹ guesses per domain) and 10-digit
 * phone numbers (10¹⁰ guesses) are within reach of an offline cracker. An
 * HMAC with a 32-byte secret pepper raises the brute-force cost to >2¹²⁸
 * provided the pepper itself is not exfiltrated alongside the database.
 *
 * Normalisation:
 *   - trimmed of leading/trailing whitespace
 *   - lowercased (so `John@Example.com` matches `john@example.com`)
 *
 * Returns a 64-char hex string that fits a `VARCHAR(64)` column — small
 * enough to index without bloating storage.
 *
 * `null` / `undefined` → `null`. Callers should write `null` to the hash
 * column whenever the encrypted field is null, keeping the two columns in
 * lock-step.
 *
 * **Operational notes**
 *
 * 1. The pepper is loaded from `process.env.HASH_PEPPER` exactly once and
 *    cached. The application throws on first hash computation if the
 *    variable is missing — failing closed is the right default for a
 *    security primitive.
 * 2. Rotating `HASH_PEPPER` invalidates ALL existing hashes — every
 *    encrypted-field lookup will silently miss until
 *    `scripts/backfill-pii-hashes-and-encrypt.ts` reruns. Treat the pepper
 *    as long-lived rotation material.
 * 3. The pepper must be stored in a secret store (AWS Secrets Manager,
 *    Vault) — never committed to the repo. `.env.example` documents the
 *    variable but ships empty.
 * 4. Tests must set `process.env.HASH_PEPPER` in their setup (we expose
 *    `__resetPepperCacheForTests` to clear the module-level cache between
 *    tests that want to verify the missing-pepper branch).
 */

let _pepperCache: string | undefined;

/**
 * @internal Reset the cached pepper. Intended for tests only — clears the
 * module-level cache so a subsequent `computeSearchableHash` re-reads
 * `process.env.HASH_PEPPER`.
 */
export function __resetPepperCacheForTests(): void {
  _pepperCache = undefined;
}

function getPepper(): string {
  if (_pepperCache !== undefined) return _pepperCache;
  const fromEnv = process.env.HASH_PEPPER;
  if (!fromEnv || fromEnv.trim().length === 0) {
    // Fail closed: no pepper means every hash collides on a constant
    // value, which would break uniqueness invariants and be silently
    // catastrophic. Surface a clear error at the first call site so it's
    // caught at boot in dev/staging.
    throw new Error(
      'HASH_PEPPER environment variable is required for searchable hash computation. ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (fromEnv.length < 32) {
    throw new Error(
      'HASH_PEPPER must be at least 32 characters of entropy (use a 32-byte hex string).',
    );
  }
  _pepperCache = fromEnv;
  return _pepperCache;
}

/**
 * Compute the searchable hash of a PII value. Returns null for null /
 * undefined / empty input, ensuring the companion column tracks the
 * encrypted column's null-state exactly.
 *
 * Throws if `HASH_PEPPER` is unconfigured — a non-recoverable misconfig
 * that should be surfaced loudly rather than silently producing collidable
 * hashes.
 */
export function computeSearchableHash(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const normalised = value.trim().toLowerCase();
  if (normalised === '') return null;
  return crypto
    .createHmac('sha256', getPepper())
    .update(normalised)
    .digest('hex');
}

/**
 * Convenience aliases for tax IDs, registration numbers, and emails — same
 * deterministic HMAC-SHA-256 over the trimmed, lowercased value. Kept as
 * named exports for call-site readability (`computeTaxIdHash(payload.taxId)`).
 */
export const computeEmailHash = computeSearchableHash;
export const computeTaxIdHash = computeSearchableHash;
export const computeRegistrationNumberHash = computeSearchableHash;
