-- Sprint 15 — bundled schema additions:
--   * S15-1: bnpl_credit_lines + bnpl_credit_line_adjustments (+ RLS)
--   * S15-5: repayment_schedule retry tracking columns
--   * S15-6: users.mfa_backup_codes + platform_users.mfa_backup_codes
--   * S15-7: RLS policies for the 3 Sprint-14 billing tables that landed
--           without one (tenant_billing_configs, billing_invoices,
--           disbursement_fees)
--   * S15-BILL-2: TenantBillingConfig backfill for active tenants
--
-- All RLS policies follow the canonical pattern from the baseline
-- 20260430120000_enable_rls_tenant_isolation migration:
--   USING (
--     current_setting('app.is_platform_admin', true) = 'true'
--     OR tenant_id = current_setting('app.current_tenant', true)::uuid
--   )
-- with the same expression in WITH CHECK. Platform-admin sessions bypass
-- the tenant filter for cross-tenant queries (e.g. the schedulers).

-- ─────────────────────────────────────────────────────────────────────────
-- S15-1 — Enum + tables
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE "bnpl_credit_line_status" AS ENUM ('active', 'suspended', 'closed');

CREATE TABLE "bnpl_credit_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "approved_limit" DECIMAL(19, 4) NOT NULL,
    "available_limit" DECIMAL(19, 4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "bnpl_credit_line_status" NOT NULL DEFAULT 'active',
    "last_reviewed_at" TIMESTAMPTZ(6),
    "next_review_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "suspended_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "closed_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "bnpl_credit_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bnpl_credit_lines"
    ADD CONSTRAINT "bnpl_credit_lines_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "bnpl_credit_lines"
    ADD CONSTRAINT "bnpl_credit_lines_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "bnpl_credit_lines"
    ADD CONSTRAINT "bnpl_credit_lines_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX "bnpl_credit_lines_subscription_id_key"
    ON "bnpl_credit_lines"("subscription_id");
CREATE UNIQUE INDEX "bnpl_credit_lines_tenant_id_customer_id_subscription_id_key"
    ON "bnpl_credit_lines"("tenant_id", "customer_id", "subscription_id");
CREATE INDEX "bnpl_credit_lines_tenant_id_idx" ON "bnpl_credit_lines"("tenant_id");
CREATE INDEX "bnpl_credit_lines_customer_id_idx" ON "bnpl_credit_lines"("customer_id");
CREATE INDEX "bnpl_credit_lines_status_idx" ON "bnpl_credit_lines"("status");
CREATE INDEX "bnpl_credit_lines_next_review_at_idx" ON "bnpl_credit_lines"("next_review_at");

CREATE TABLE "bnpl_credit_line_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "credit_line_id" UUID NOT NULL,
    "previous_limit" DECIMAL(19, 4) NOT NULL,
    "new_limit" DECIMAL(19, 4) NOT NULL,
    "adjustment_type" VARCHAR(50) NOT NULL,
    "reason_code" VARCHAR(50) NOT NULL,
    "reason_detail" TEXT,
    "triggered_by" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bnpl_credit_line_adjustments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bnpl_credit_line_adjustments"
    ADD CONSTRAINT "bnpl_credit_line_adjustments_credit_line_id_fkey"
    FOREIGN KEY ("credit_line_id") REFERENCES "bnpl_credit_lines"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "bnpl_credit_line_adjustments_tenant_id_idx"
    ON "bnpl_credit_line_adjustments"("tenant_id");
CREATE INDEX "bnpl_credit_line_adjustments_credit_line_id_idx"
    ON "bnpl_credit_line_adjustments"("credit_line_id");

-- ─────────────────────────────────────────────────────────────────────────
-- S15-1 RLS — same pattern as baseline migration
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "bnpl_credit_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bnpl_credit_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bnpl_credit_lines";
CREATE POLICY tenant_isolation ON "bnpl_credit_lines"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

ALTER TABLE "bnpl_credit_line_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bnpl_credit_line_adjustments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bnpl_credit_line_adjustments";
CREATE POLICY tenant_isolation ON "bnpl_credit_line_adjustments"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────
-- S15-5 — RepaymentScheduleEntry retry tracking
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "repayment_schedule"
    ADD COLUMN "last_deduction_attempt_at" TIMESTAMPTZ(6),
    ADD COLUMN "deduction_attempt_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "next_deduction_retry_at" TIMESTAMPTZ(6);

CREATE INDEX "repayment_schedule_next_deduction_retry_at_idx"
    ON "repayment_schedule"("next_deduction_retry_at");

-- ─────────────────────────────────────────────────────────────────────────
-- S15-6 — MFA backup codes (encrypted at rest by the field-encryption
-- middleware; this DDL is column-only)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "users" ADD COLUMN "mfa_backup_codes" TEXT;
ALTER TABLE "platform_users" ADD COLUMN "mfa_backup_codes" TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- S15-7 — RLS sweep for Sprint-14 tables that landed without policies
--
-- Sprint 14 added three tenant-scoped billing tables. The migrations that
-- created them did not include RLS policies; without them, a buggy service
-- could leak billing data across tenants. Adding the canonical policy now.
-- `billing_line_items` has no tenant_id column (cascades via FK to
-- billing_invoices, which now has RLS) so it stays exempt. `plan_tier_configs`
-- is platform-scoped (no tenant_id) — also exempt.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "tenant_billing_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_billing_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenant_billing_configs";
CREATE POLICY tenant_isolation ON "tenant_billing_configs"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

ALTER TABLE "billing_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_invoices" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "billing_invoices";
CREATE POLICY tenant_isolation ON "billing_invoices"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

ALTER TABLE "disbursement_fees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "disbursement_fees" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "disbursement_fees";
CREATE POLICY tenant_isolation ON "disbursement_fees"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────
-- S15-BILL-2 — TenantBillingConfig backfill
--
-- The subscription-invoice cron skips tenants that lack a billing config
-- (logs `skippedNoConfig`). This backfill creates a sensible default for
-- every active tenant that doesn't yet have one, derived from the tenant's
-- plan tier. Idempotent — re-running is a no-op via the NOT EXISTS guard.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO "tenant_billing_configs" (
  "id", "tenant_id", "plan_tier", "subscription_amount_usd",
  "billing_currency", "payment_terms_days", "contract_start_date",
  "per_disbursement_bps",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  t.id,
  t.plan_tier,
  CASE t.plan_tier::text
    WHEN 'starter'    THEN 99.0000
    WHEN 'growth'     THEN 499.0000
    WHEN 'enterprise' THEN 1999.0000
    ELSE 99.0000
  END,
  'USD',
  30,
  COALESCE(t.created_at::date, CURRENT_DATE),
  25.00,
  NOW(), NOW()
FROM "tenants" t
WHERE t.status = 'active'
  AND t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "tenant_billing_configs" tbc WHERE tbc.tenant_id = t.id
  );
