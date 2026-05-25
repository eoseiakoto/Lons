-- Sprint 18 — schema pre-stage:
--   * S18-1: loan_request_status gains `escalated` value
--   * S18-6: operator_approval_limits   — per-operator approval gating
--   * S18-7: pipeline_step_logs         — append-only pipeline audit
--   * S18-9: revenue_distribution_configs + revenue_distribution_model
--           enum                        — tiered / fixed-fee / waterfall
--   * S18-11: upgrade_requests          — tenant plan-tier upgrade audit
--   * S14-11: invoices.assigned_verifier_id (single nullable column add)
--
-- RLS pattern matches the canonical baseline (see
-- migrations/20260516000000_sprint16_bundle): USING + WITH CHECK both
-- bypass the filter for `app.is_platform_admin = 'true'` and otherwise
-- require `tenant_id = current_setting('app.current_tenant')::uuid`.
--
-- pipeline_step_logs is APPEND-ONLY per CLAUDE.md ledger/audit
-- invariant. The DB grant strips UPDATE / DELETE from the application
-- role; only the tenant_isolation policy gates INSERT and SELECT.

-- ─────────────────────────────────────────────────────────────────────────
-- S18-1 — loan_request_status += 'escalated'
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE "loan_request_status" ADD VALUE IF NOT EXISTS 'escalated';

-- ─────────────────────────────────────────────────────────────────────────
-- S18-9 — revenue_distribution_model enum
-- ─────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "revenue_distribution_model" AS ENUM (
    'percentage_split', 'tiered', 'fixed_fee', 'waterfall'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- S14-11 — invoices.assigned_verifier_id (nullable, no default)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "assigned_verifier_id" UUID;

-- ─────────────────────────────────────────────────────────────────────────
-- S18-6 — operator_approval_limits
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "operator_approval_limits" (
    "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"              UUID NOT NULL,
    "user_id"                UUID NOT NULL,
    "max_approval_amount"    DECIMAL(19, 4) NOT NULL,
    "max_approvals_per_day"  INT,
    "allowed_product_types"  JSONB,
    "can_approve_escalated"  BOOLEAN NOT NULL DEFAULT false,
    "is_active"              BOOLEAN NOT NULL DEFAULT true,
    "created_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "operator_approval_limits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operator_approval_limits"
  ADD CONSTRAINT "operator_approval_limits_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE UNIQUE INDEX "operator_approval_limits_user_id_key"
  ON "operator_approval_limits"("user_id");
CREATE UNIQUE INDEX "operator_approval_limits_tenant_user_key"
  ON "operator_approval_limits"("tenant_id", "user_id");
CREATE INDEX "operator_approval_limits_tenant_id_idx"
  ON "operator_approval_limits"("tenant_id");

ALTER TABLE "operator_approval_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operator_approval_limits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "operator_approval_limits";
CREATE POLICY tenant_isolation ON "operator_approval_limits"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────
-- S18-7 — pipeline_step_logs (APPEND-ONLY)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "pipeline_step_logs" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID NOT NULL,
    "loan_request_id"  UUID NOT NULL,
    "step_name"        VARCHAR(100) NOT NULL,
    "step_order"       INT NOT NULL,
    "outcome"          VARCHAR(50) NOT NULL,
    "inputs"           JSONB,
    "outputs"          JSONB,
    "error_message"    TEXT,
    "error_code"       VARCHAR(100),
    "duration_ms"      INT NOT NULL,
    "triggered_by"     UUID,
    "started_at"       TIMESTAMPTZ(6) NOT NULL,
    "completed_at"     TIMESTAMPTZ(6) NOT NULL,
    "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pipeline_step_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pipeline_step_logs"
  ADD CONSTRAINT "pipeline_step_logs_loan_request_id_fkey"
  FOREIGN KEY ("loan_request_id") REFERENCES "loan_requests"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "pipeline_step_logs_tenant_id_idx"
  ON "pipeline_step_logs"("tenant_id");
CREATE INDEX "pipeline_step_logs_loan_request_id_idx"
  ON "pipeline_step_logs"("loan_request_id");
CREATE INDEX "pipeline_step_logs_loan_request_order_idx"
  ON "pipeline_step_logs"("loan_request_id", "step_order");

ALTER TABLE "pipeline_step_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipeline_step_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pipeline_step_logs";
CREATE POLICY tenant_isolation ON "pipeline_step_logs"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- Append-only enforcement: revoke UPDATE / DELETE from the application
-- role. Matches the pattern from audit_logs in
-- migrations/20260328100000_enforce_append_only_audit_logs.
-- The lons_app role is created by the baseline RLS migration; if a
-- non-default role is configured for the application, adjust here.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lons_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON "pipeline_step_logs" FROM lons_app';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- S18-9 — revenue_distribution_configs
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "revenue_distribution_configs" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID NOT NULL,
    "product_id"  UUID,
    "model"       "revenue_distribution_model" NOT NULL,
    "config"      JSONB NOT NULL,
    "priority"    INT NOT NULL DEFAULT 0,
    "is_active"   BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(6) NOT NULL,
    "deleted_at"  TIMESTAMPTZ(6),
    CONSTRAINT "revenue_distribution_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "revenue_distribution_configs"
  ADD CONSTRAINT "revenue_distribution_configs_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "revenue_distribution_configs_tenant_id_idx"
  ON "revenue_distribution_configs"("tenant_id");
CREATE INDEX "revenue_distribution_configs_tenant_product_idx"
  ON "revenue_distribution_configs"("tenant_id", "product_id");

ALTER TABLE "revenue_distribution_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "revenue_distribution_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "revenue_distribution_configs";
CREATE POLICY tenant_isolation ON "revenue_distribution_configs"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────
-- S18-11 — upgrade_requests
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "upgrade_requests" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID NOT NULL,
    "current_tier"   "plan_tier" NOT NULL,
    "requested_tier" "plan_tier" NOT NULL,
    "reason"         TEXT,
    "status"         VARCHAR(20) NOT NULL DEFAULT 'pending',
    "requested_by"   UUID,
    "reviewed_by"    UUID,
    "reviewed_at"    TIMESTAMPTZ(6),
    "review_notes"   TEXT,
    "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "upgrade_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "upgrade_requests"
  ADD CONSTRAINT "upgrade_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "upgrade_requests_tenant_id_idx"
  ON "upgrade_requests"("tenant_id");
CREATE INDEX "upgrade_requests_status_idx"
  ON "upgrade_requests"("status");

ALTER TABLE "upgrade_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "upgrade_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "upgrade_requests";
CREATE POLICY tenant_isolation ON "upgrade_requests"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );
