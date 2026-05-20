-- FIX-S13B-1 (F-S13B-1) — swap unique constraints from encrypted columns to
-- their SHA-256 hash companion columns.
--
-- Background: Sprint 13B encrypted PII columns (PlatformUser.email,
-- User.email, Debtor.registrationNumber) but left the original unique
-- constraints in place. AES-256-GCM uses a random IV per write, so the
-- same plaintext produces different ciphertext on every insert — the
-- unique constraint never fires, and concurrent inserts can win a TOCTOU
-- race against the application-level dedupe in *.service.ts.
--
-- This migration moves the uniqueness invariant onto the deterministic
-- hash columns added in 20260509000000_add_searchable_pii_hash_columns.
--
-- IMPORTANT: must run *after* scripts/backfill-pii-hashes-and-encrypt.ts
-- has populated the hash columns. Pre-backfill rows have NULL hashes,
-- which Postgres treats as distinct in unique constraints (intended) —
-- but those rows aren't protected against duplicate hashes until the
-- backfill lands. See FIX-SPRINT-13B-2026-05-10.md §"Migration ordering".

-- ─── PlatformUser: @unique(email) → @@unique(emailHash) ────────────────────
ALTER TABLE "platform_users" DROP CONSTRAINT "platform_users_email_key";
DROP INDEX IF EXISTS "platform_users_email_hash_idx";
CREATE UNIQUE INDEX "platform_users_email_hash_key" ON "platform_users"("email_hash");

-- ─── User: @@unique([tenantId, email]) → @@unique([tenantId, emailHash]) ───
ALTER TABLE "users" DROP CONSTRAINT "users_tenant_id_email_key";
DROP INDEX IF EXISTS "users_tenant_id_email_hash_idx";
CREATE UNIQUE INDEX "users_tenant_id_email_hash_key" ON "users"("tenant_id", "email_hash");

-- ─── Debtor: @@unique([tenantId, companyName, registrationNumber])
--           → @@unique([tenantId, companyName, registrationNumberHash]) ────
ALTER TABLE "debtors" DROP CONSTRAINT "debtors_tenant_id_company_name_registration_number_key";
DROP INDEX IF EXISTS "debtors_tenant_id_registration_number_hash_idx";
CREATE UNIQUE INDEX "debtors_tenant_id_company_name_registration_number_hash_key"
  ON "debtors"("tenant_id", "company_name", "registration_number_hash");
