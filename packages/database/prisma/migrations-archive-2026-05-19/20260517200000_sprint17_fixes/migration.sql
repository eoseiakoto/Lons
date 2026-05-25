-- Sprint 17 PM-review fixes:
--   * FIX-6a: customer_financial_data gains updated_at (CLAUDE.md
--     requires every table to expose updated_at).
--   * FIX-6b: customer_matching_rules gains deleted_at (CLAUDE.md
--     requires soft-delete for business data).
--   * FIX-10:  backfill default matching rules for tenants seeded
--     before Sprint 17 — without this, CustomerDedupService falls
--     back to the legacy externalId-only check on those tenants.
--
-- Idempotent end-to-end: ALTER … ADD COLUMN uses IF NOT EXISTS,
-- INSERT uses WHERE NOT EXISTS. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- FIX-6a — customer_financial_data.updated_at
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "customer_financial_data"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─────────────────────────────────────────────────────────────────────────
-- FIX-6b — customer_matching_rules.deleted_at (nullable, no default)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "customer_matching_rules"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);

-- ─────────────────────────────────────────────────────────────────────────
-- FIX-10 — backfill default matching rules for tenants without any
--
-- The WHERE NOT EXISTS clause keeps this idempotent. CROSS JOIN to a
-- VALUES literal so the seed list is co-located with the migration
-- rather than hidden behind an application script.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO "customer_matching_rules" (
  "id", "tenant_id", "name", "match_fields", "priority",
  "is_active", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  t."id",
  rule.name,
  rule.match_fields::jsonb,
  rule.priority,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (VALUES
  ('National ID',  '["nationalId"]',                     1),
  ('Phone + DOB',  '["phonePrimary", "dateOfBirth"]',    2),
  ('Email + Name', '["email", "fullName"]',              3)
) AS rule(name, match_fields, priority)
WHERE NOT EXISTS (
  SELECT 1
  FROM "customer_matching_rules" cmr
  WHERE cmr."tenant_id" = t."id"
);
