-- Sprint 13B (S13B-2) — searchable PII hash columns.
--
-- Adds VARCHAR(64) hash columns alongside encrypted PII fields so that
-- equality lookups (login by email, debtor payment matching by tax id /
-- registration number) survive encryption-at-rest. The application
-- populates these columns via the searchable-hash util in
-- packages/common/src/encryption/searchable-hash.util.ts (SHA-256 of
-- normalised lowercase value).
--
-- Backfill is handled separately by the runtime script in
-- packages/database/scripts/backfill-pii-hashes-and-encrypt.ts so that
-- it can run in batches with progress logging and idempotency.

-- platform_users.email_hash
ALTER TABLE "platform_users" ADD COLUMN "email_hash" VARCHAR(64);
CREATE INDEX "platform_users_email_hash_idx" ON "platform_users"("email_hash");

-- users.email_hash (tenant-scoped lookup)
ALTER TABLE "users" ADD COLUMN "email_hash" VARCHAR(64);
CREATE INDEX "users_tenant_id_email_hash_idx" ON "users"("tenant_id", "email_hash");

-- debtors hash columns
ALTER TABLE "debtors" ADD COLUMN "registration_number_hash" VARCHAR(64);
ALTER TABLE "debtors" ADD COLUMN "tax_id_hash" VARCHAR(64);

CREATE INDEX "debtors_tenant_id_tax_id_hash_idx"
  ON "debtors"("tenant_id", "tax_id_hash");
CREATE INDEX "debtors_tenant_id_registration_number_hash_idx"
  ON "debtors"("tenant_id", "registration_number_hash");
