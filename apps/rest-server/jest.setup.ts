/**
 * Security Hardening (SEC-5): tests that exercise computeSearchableHash
 * — directly or transitively through services that look up encrypted PII —
 * need a deterministic HASH_PEPPER set before any module reads it.
 */
if (!process.env.HASH_PEPPER) {
  process.env.HASH_PEPPER =
    'test-hash-pepper-do-not-use-in-production-do-not-use-in-production';
}
