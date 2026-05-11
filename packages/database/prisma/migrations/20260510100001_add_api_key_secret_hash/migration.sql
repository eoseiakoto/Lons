-- Security Hardening 2026-05-10 (SEC-3) — API key secret hash column.
--
-- Background: the REST `ApiKeyGuard` extracted both `X-API-Key` and
-- `X-API-Secret` headers and asserted both were present, but the
-- `ApiKeyService.validateApiKey()` method only checked the key. The
-- secret was never compared — making the supposedly two-factor API
-- credential a single-factor system.
--
-- This migration adds a `secret_hash` column to `api_keys`. The
-- application:
--   - Generates a separate random secret on `createApiKey()` and stores
--     its SHA-256 alongside the existing `key_hash`.
--   - Validates BOTH on every request via `crypto.timingSafeEqual`.
--   - Returns the plaintext secret only once (at creation time), exactly
--     like the existing key.
--
-- Backwards-compatibility for existing API keys
-- ─────────────────────────────────────────────
-- The column is `NOT NULL DEFAULT ''`. Pre-existing rows keep working
-- as a Prisma row (the schema is satisfied) but `validateApiKey()`
-- fails closed when it sees an empty `secret_hash` — the message
-- "API key is missing a secret — rotate the key via the admin portal"
-- nudges integrators to call the rotate endpoint.
--
-- The empty-string default is intentional rather than nullable so the
-- application code can rely on `secret_hash.length === 0` as the
-- "needs rotation" signal without confusing it with an actual hash.

ALTER TABLE "api_keys"
  ADD COLUMN "secret_hash" VARCHAR(64) NOT NULL DEFAULT '';
