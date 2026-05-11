/**
 * Security Hardening (SEC-5): tests that exercise `computeSearchableHash`
 * (directly or transitively, e.g. through a service that does PII
 * lookups) need a deterministic `HASH_PEPPER` set before the module
 * caches its first read.
 *
 * Setting it in a Jest `setupFiles` hook ensures it's in `process.env`
 * before any test file or its imports run. The value is a fixed test
 * pepper — never use this in any non-test environment.
 */
if (!process.env.HASH_PEPPER) {
  process.env.HASH_PEPPER =
    'test-hash-pepper-do-not-use-in-production-do-not-use-in-production';
}
