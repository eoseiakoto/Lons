-- Security Hardening 2026-05-10 (SEC-1, SEC-4) — Customer searchable
-- hash columns + cleanup of obsolete indexes on encrypted columns.
--
-- Background: Customer PII has been encrypted at rest since Sprint 7,
-- but the model never gained the searchable HMAC hash columns that we
-- added for User / PlatformUser / Debtor in Sprint 13B. As a result, the
-- admin-portal customer search and the equality filter
-- `where.phonePrimary = filters.phonePrimary` always returned empty —
-- they compared plaintext input against AES-GCM ciphertext (random IV).
--
-- This migration:
--   1. Adds three nullable VARCHAR(64) hash columns to `customers`.
--   2. Indexes the new hash columns scoped by tenant_id.
--   3. Drops the legacy `(phone_primary)` and `(national_id)` btree
--      indexes — they indexed random ciphertext and produced no useful
--      lookup behaviour while consuming write IO and storage.
--
-- IMPORTANT: must run *after* the Sprint 13B backfill script
-- (`scripts/backfill-pii-hashes-and-encrypt.ts`) is updated to include
-- the `customer` model and re-run. Pre-backfill rows have NULL hashes,
-- which Postgres treats as distinct in unique constraints (we don't
-- declare any uniques here, but for consistency with FIX-S13B-1 the
-- ordering matters: deploy code → run backfill → run this migration is
-- a safe sequence).

-- 1. Add hash companion columns ───────────────────────────────────────
ALTER TABLE "customers" ADD COLUMN "phone_primary_hash" VARCHAR(64);
ALTER TABLE "customers" ADD COLUMN "email_hash" VARCHAR(64);
ALTER TABLE "customers" ADD COLUMN "national_id_hash" VARCHAR(64);

-- 2. Index the hash columns (tenant-scoped — every customer query
--    starts with tenantId so a composite index is the right shape).
CREATE INDEX "customers_tenant_id_phone_primary_hash_idx"
  ON "customers"("tenant_id", "phone_primary_hash");
CREATE INDEX "customers_tenant_id_email_hash_idx"
  ON "customers"("tenant_id", "email_hash");
CREATE INDEX "customers_tenant_id_national_id_hash_idx"
  ON "customers"("tenant_id", "national_id_hash");

-- 3. Drop the obsolete indexes that targeted ciphertext columns.
--    The Prisma schema previously declared `@@index([phonePrimary])` and
--    `@@index([nationalId])` — these are now removed.
DROP INDEX IF EXISTS "customers_phone_primary_idx";
DROP INDEX IF EXISTS "customers_national_id_idx";
