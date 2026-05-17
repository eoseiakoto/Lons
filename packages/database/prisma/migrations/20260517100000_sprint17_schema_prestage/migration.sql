-- Sprint 17 — schema pre-stage:
--   * S17-1: customer_financial_data — persisted EMI / credit bureau snapshots
--   * S17-2: emi_integration_configs — tenant-scoped EMI integration settings
--   * S17-4: scorecard_configs       — tenant/product scorecard versions
--   * S17-8: customer_matching_rules — configurable de-duplication rules
--
-- RLS pattern is identical to migrations/20260516000000_sprint16_bundle:
-- both USING and WITH CHECK bypass the filter for platform admins
-- (`app.is_platform_admin = 'true'`) and otherwise require
-- `tenant_id = current_setting('app.current_tenant')::uuid`.

-- ─────────────────────────────────────────────────────────────────────────
-- S17-1 — customer_financial_data
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "customer_financial_data" (
    "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"                UUID NOT NULL,
    "customer_id"              UUID NOT NULL,
    "source"                   VARCHAR(50) NOT NULL,
    "source_provider"          VARCHAR(100),
    "wallet_id"                VARCHAR(255),
    "current_balance"          DECIMAL(19, 4),
    "average_balance_30d"      DECIMAL(19, 4),
    "average_balance_90d"      DECIMAL(19, 4),
    "transaction_count_30d"    INT,
    "transaction_count_90d"    INT,
    "income_consistency"       INT,
    "income_expense_ratio"     DECIMAL(7, 4),
    "currency"                 VARCHAR(3) NOT NULL,
    "raw_data"                 JSONB,
    "fetched_at"               TIMESTAMPTZ(6) NOT NULL,
    "created_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_financial_data_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "customer_financial_data"
  ADD CONSTRAINT "customer_financial_data_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "customer_financial_data_tenant_id_idx"
  ON "customer_financial_data"("tenant_id");
CREATE INDEX "customer_financial_data_customer_id_idx"
  ON "customer_financial_data"("customer_id");
CREATE INDEX "customer_financial_data_customer_source_fetched_idx"
  ON "customer_financial_data"("customer_id", "source", "fetched_at");

ALTER TABLE "customer_financial_data" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_financial_data" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "customer_financial_data";
CREATE POLICY tenant_isolation ON "customer_financial_data"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────
-- S17-2 — emi_integration_configs
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "emi_integration_configs" (
    "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"            UUID NOT NULL,
    "name"                 VARCHAR(255) NOT NULL,
    "provider"             VARCHAR(100) NOT NULL,
    "credentials"          TEXT,
    "base_url"             VARCHAR(500),
    "field_mappings"       JSONB,
    "sync_frequency_min"   INT NOT NULL DEFAULT 360,
    "retry_policy"         JSONB,
    "is_active"            BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at"         TIMESTAMPTZ(6),
    "last_sync_error"      TEXT,
    "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ(6) NOT NULL,
    "deleted_at"           TIMESTAMPTZ(6),
    CONSTRAINT "emi_integration_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emi_integration_configs_tenant_name_key"
  ON "emi_integration_configs"("tenant_id", "name");
CREATE INDEX "emi_integration_configs_tenant_id_idx"
  ON "emi_integration_configs"("tenant_id");
CREATE INDEX "emi_integration_configs_is_active_idx"
  ON "emi_integration_configs"("is_active");

ALTER TABLE "emi_integration_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emi_integration_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "emi_integration_configs";
CREATE POLICY tenant_isolation ON "emi_integration_configs"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────
-- S17-4 — scorecard_configs
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "scorecard_configs" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID NOT NULL,
    "product_id"       UUID,
    "name"             VARCHAR(255) NOT NULL,
    "version"          VARCHAR(50) NOT NULL,
    "config"           JSONB NOT NULL,
    "score_range_min"  DECIMAL(7, 2) NOT NULL DEFAULT 0,
    "score_range_max"  DECIMAL(7, 2) NOT NULL DEFAULT 1000,
    "is_active"        BOOLEAN NOT NULL DEFAULT false,
    "created_by"       UUID,
    "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ(6) NOT NULL,
    "deleted_at"       TIMESTAMPTZ(6),
    CONSTRAINT "scorecard_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "scorecard_configs"
  ADD CONSTRAINT "scorecard_configs_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE UNIQUE INDEX "scorecard_configs_tenant_product_version_key"
  ON "scorecard_configs"("tenant_id", "product_id", "version");
CREATE INDEX "scorecard_configs_tenant_id_idx"
  ON "scorecard_configs"("tenant_id");
CREATE INDEX "scorecard_configs_product_id_idx"
  ON "scorecard_configs"("product_id");
CREATE INDEX "scorecard_configs_is_active_idx"
  ON "scorecard_configs"("is_active");

ALTER TABLE "scorecard_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scorecard_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "scorecard_configs";
CREATE POLICY tenant_isolation ON "scorecard_configs"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────
-- S17-8 — customer_matching_rules
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "customer_matching_rules" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID NOT NULL,
    "name"          VARCHAR(255) NOT NULL,
    "match_fields"  JSONB NOT NULL,
    "priority"      INT NOT NULL DEFAULT 0,
    "is_active"     BOOLEAN NOT NULL DEFAULT true,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "customer_matching_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_matching_rules_tenant_id_idx"
  ON "customer_matching_rules"("tenant_id");
CREATE INDEX "customer_matching_rules_tenant_active_priority_idx"
  ON "customer_matching_rules"("tenant_id", "is_active", "priority");

ALTER TABLE "customer_matching_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_matching_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "customer_matching_rules";
CREATE POLICY tenant_isolation ON "customer_matching_rules"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );
