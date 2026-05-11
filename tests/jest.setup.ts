/**
 * Security Hardening (SEC-5): tests in tests/e2e/ and tests/regression/
 * exercise computeSearchableHash through real services (auth login,
 * debtor matching, etc.). Set HASH_PEPPER deterministically before any
 * module imports the helper.
 */
if (!process.env.HASH_PEPPER) {
  process.env.HASH_PEPPER =
    'test-hash-pepper-do-not-use-in-production-do-not-use-in-production';
}
