-- CreateEnum
CREATE TYPE "collections_status" AS ENUM ('new', 'contacted', 'promise_to_pay', 'broken_ptp', 'escalated', 'legal', 'write_off_pending', 'written_off', 'recovered', 'closed');

-- CreateEnum
CREATE TYPE "write_off_approval_level" AS ENUM ('l1_officer', 'l2_manager', 'l3_director');

-- CreateEnum
CREATE TYPE "write_off_approval_decision" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "penalty_mode" AS ENUM ('simple', 'compound');

-- CreateTable
CREATE TABLE "collections_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "collections_status" NOT NULL DEFAULT 'new',
    "previous_status" "collections_status",
    "assigned_to_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "outstanding_amount" DECIMAL(19,4) NOT NULL,
    "current_outstanding" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "dpd_at_entry" INTEGER NOT NULL,
    "current_dpd" INTEGER NOT NULL,
    "ptp_date" TIMESTAMPTZ(6),
    "ptp_amount" DECIMAL(19,4),
    "ptp_grace_days" INTEGER,
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "status_reason" TEXT,
    "write_off_approval_status" VARCHAR(50),
    "write_off_amount" DECIMAL(19,4),
    "metadata" JSONB,
    "last_contact_at" TIMESTAMPTZ(6),
    "next_action_date" TIMESTAMPTZ(6),
    "contact_attempts" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMPTZ(6),
    "closed_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "collections_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections_case_transitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "from_status" "collections_status" NOT NULL,
    "to_status" "collections_status" NOT NULL,
    "reason" TEXT,
    "actor_id" UUID NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_case_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections_workflow_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "transitions" JSONB NOT NULL,
    "auto_escalation" JSONB,
    "ptp_grace_days" INTEGER NOT NULL DEFAULT 3,
    "auto_case_creation_dpd" INTEGER NOT NULL DEFAULT 30,
    "max_contact_attempts" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "collections_workflow_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "write_off_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "level" "write_off_approval_level" NOT NULL,
    "decision" "write_off_approval_decision" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "reason" TEXT,
    "actor_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "write_off_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "write_off_thresholds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "level" "write_off_approval_level" NOT NULL,
    "max_amount_threshold" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "write_off_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalty_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "mode" "penalty_mode" NOT NULL DEFAULT 'simple',
    "rate_tiers" JSONB NOT NULL,
    "max_penalty_pct" DECIMAL(7,4),
    "compounding_frequency" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "penalty_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_auth_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "resource_type" VARCHAR(100) NOT NULL,
    "field_name" VARCHAR(100) NOT NULL,
    "required_permissions" TEXT[],
    "behavior" VARCHAR(20) NOT NULL DEFAULT 'redact',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "field_auth_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collections_cases_tenant_id_idx" ON "collections_cases"("tenant_id");

-- CreateIndex
CREATE INDEX "collections_cases_contract_id_idx" ON "collections_cases"("contract_id");

-- CreateIndex
CREATE INDEX "collections_cases_customer_id_idx" ON "collections_cases"("customer_id");

-- CreateIndex
CREATE INDEX "collections_cases_status_idx" ON "collections_cases"("status");

-- CreateIndex
CREATE INDEX "collections_cases_assigned_to_id_idx" ON "collections_cases"("assigned_to_id");

-- CreateIndex
CREATE INDEX "collections_cases_ptp_date_idx" ON "collections_cases"("ptp_date");

-- CreateIndex
CREATE INDEX "collections_cases_next_action_date_idx" ON "collections_cases"("next_action_date");

-- CreateIndex
CREATE INDEX "collections_case_transitions_tenant_id_idx" ON "collections_case_transitions"("tenant_id");

-- CreateIndex
CREATE INDEX "collections_case_transitions_case_id_idx" ON "collections_case_transitions"("case_id");

-- CreateIndex
CREATE INDEX "collections_case_transitions_created_at_idx" ON "collections_case_transitions"("created_at");

-- CreateIndex
CREATE INDEX "collections_workflow_configs_tenant_id_idx" ON "collections_workflow_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_workflow_configs_tenant_id_key" ON "collections_workflow_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "write_off_approvals_tenant_id_idx" ON "write_off_approvals"("tenant_id");

-- CreateIndex
CREATE INDEX "write_off_approvals_case_id_idx" ON "write_off_approvals"("case_id");

-- CreateIndex
CREATE INDEX "write_off_approvals_decision_idx" ON "write_off_approvals"("decision");

-- CreateIndex
CREATE UNIQUE INDEX "write_off_approvals_case_id_level_key" ON "write_off_approvals"("case_id", "level");

-- CreateIndex
CREATE INDEX "write_off_thresholds_tenant_id_idx" ON "write_off_thresholds"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "write_off_thresholds_tenant_id_level_currency_key" ON "write_off_thresholds"("tenant_id", "level", "currency");

-- CreateIndex
CREATE INDEX "penalty_configs_tenant_id_idx" ON "penalty_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "penalty_configs_tenant_id_product_id_key" ON "penalty_configs"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "field_auth_configs_tenant_id_idx" ON "field_auth_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "field_auth_configs_resource_type_idx" ON "field_auth_configs"("resource_type");

-- CreateIndex
CREATE UNIQUE INDEX "field_auth_configs_tenant_id_resource_type_field_name_key" ON "field_auth_configs"("tenant_id", "resource_type", "field_name");

-- AddForeignKey
ALTER TABLE "collections_cases" ADD CONSTRAINT "collections_cases_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections_case_transitions" ADD CONSTRAINT "collections_case_transitions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "collections_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "write_off_approvals" ADD CONSTRAINT "write_off_approvals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "collections_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_configs" ADD CONSTRAINT "penalty_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── RLS policies (S19-5..12 schema additions) ────────────────────────
--
-- Every new tenant-scoped table gets a `tenant_isolation` policy and
-- runtime grants for the `lons_app` role. Follows the pattern from
-- 20260526100000_rls_tenant_isolation. field_auth_configs is the lone
-- exception: rows with tenant_id = NULL are platform defaults visible
-- to every tenant, so the policy admits NULL too.

ALTER TABLE collections_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON collections_cases;
CREATE POLICY tenant_isolation ON collections_cases
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR coalesce(current_setting('app.is_platform_admin', true), 'false') = 'true'
  );

ALTER TABLE collections_case_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON collections_case_transitions;
CREATE POLICY tenant_isolation ON collections_case_transitions
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR coalesce(current_setting('app.is_platform_admin', true), 'false') = 'true'
  );
-- Append-only: revoke UPDATE/DELETE/TRUNCATE on the transition log to
-- enforce the audit-trail invariant at the role level (mirrors
-- audit_logs / audit_writer).
REVOKE UPDATE, DELETE, TRUNCATE ON collections_case_transitions FROM PUBLIC;

ALTER TABLE collections_workflow_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON collections_workflow_configs;
CREATE POLICY tenant_isolation ON collections_workflow_configs
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR coalesce(current_setting('app.is_platform_admin', true), 'false') = 'true'
  );

ALTER TABLE write_off_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON write_off_approvals;
CREATE POLICY tenant_isolation ON write_off_approvals
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR coalesce(current_setting('app.is_platform_admin', true), 'false') = 'true'
  );

ALTER TABLE write_off_thresholds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON write_off_thresholds;
CREATE POLICY tenant_isolation ON write_off_thresholds
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR coalesce(current_setting('app.is_platform_admin', true), 'false') = 'true'
  );

ALTER TABLE penalty_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON penalty_configs;
CREATE POLICY tenant_isolation ON penalty_configs
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR coalesce(current_setting('app.is_platform_admin', true), 'false') = 'true'
  );

-- S19-12: field_auth_configs admits BOTH the tenant's own rows AND
-- platform defaults (tenant_id IS NULL). Mutations against rows with
-- tenant_id IS NULL are restricted to platform admins by the
-- application layer.
ALTER TABLE field_auth_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON field_auth_configs;
CREATE POLICY tenant_isolation ON field_auth_configs
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
    OR coalesce(current_setting('app.is_platform_admin', true), 'false') = 'true'
  );

-- ─── Grants for the lons_app runtime role ─────────────────────────────
-- Mirrors 20260526200000_lons_app_runtime_role. Idempotent via DO-block.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lons_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      collections_cases,
      collections_case_transitions,
      collections_workflow_configs,
      write_off_approvals,
      write_off_thresholds,
      penalty_configs,
      field_auth_configs
    TO lons_app;
    -- Re-revoke UPDATE/DELETE/TRUNCATE on the append-only transition log.
    REVOKE UPDATE, DELETE, TRUNCATE ON collections_case_transitions FROM lons_app;
  END IF;
END
$$;
