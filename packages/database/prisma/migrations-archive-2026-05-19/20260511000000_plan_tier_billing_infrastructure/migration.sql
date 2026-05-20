-- Sprint 14 (S14-9) — Plan tier infrastructure + commercial billing schema.
--
-- This migration:
--   1. Renames the `professional` enum value on `plan_tier` to `growth`
--      (Postgres ALTER TYPE — preserves existing tenant rows).
--   2. Creates the `plan_tier_configs` table (DB-driven feature matrix).
--   3. Creates the `tenant_billing_configs` table (per-tenant rates).
--   4. Seeds the three PlanTierConfig rows with the canonical capability
--      sets from SPEC-plan-tiers.md §3.
--
-- The billing-invoice + disbursement-fee tables land in separate
-- migrations (20260511010000 and 20260511020000) — keep the plan-tier
-- structural change isolated so a rollback of the billing engine doesn't
-- have to revert the plan tier rename.

-- ─── 1. Enum rename: professional → growth ────────────────────────────
-- Postgres allows ALTER TYPE ... RENAME VALUE on an existing enum.
-- Existing tenant rows with `plan_tier = 'professional'` will be
-- visible as `growth` after this — no row-level UPDATE needed.
ALTER TYPE "plan_tier" RENAME VALUE 'professional' TO 'growth';

-- ─── 2. New enums for the billing engine ──────────────────────────────
CREATE TYPE "billing_model" AS ENUM ('per_disbursement', 'revenue_share');
CREATE TYPE "billing_invoice_type" AS ENUM ('subscription', 'usage', 'revenue_share');
CREATE TYPE "billing_invoice_status" AS ENUM ('draft', 'issued', 'paid', 'overdue');
CREATE TYPE "billing_line_item_type" AS ENUM ('subscription', 'disbursement_fee', 'revenue_share');

-- ─── 3. plan_tier_configs ─────────────────────────────────────────────
CREATE TABLE "plan_tier_configs" (
  "id"                                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tier"                                "plan_tier" NOT NULL,
  "display_name"                        VARCHAR(50) NOT NULL,
  "allowed_product_types"               JSONB NOT NULL,
  "max_active_products"                 INTEGER,
  "max_customers"                       INTEGER,
  "max_monthly_disbursement_volume_usd" DECIMAL(19, 4),
  "max_monthly_transactions"            INTEGER,
  "max_lender_configs"                  INTEGER,
  "max_bnpl_merchants"                  INTEGER,
  "max_portal_users"                    INTEGER,
  "data_retention_months"               INTEGER NOT NULL DEFAULT 12,
  "feature_flags"                       JSONB NOT NULL,
  "api_rate_limit_per_minute"           INTEGER NOT NULL DEFAULT 60,
  "rest_api_enabled"                    BOOLEAN NOT NULL DEFAULT false,
  "websocket_enabled"                   BOOLEAN NOT NULL DEFAULT false,
  "bulk_operations_enabled"             BOOLEAN NOT NULL DEFAULT false,
  "max_api_keys"                        INTEGER,
  "branding_options"                    JSONB NOT NULL,
  "created_at"                          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                          TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "plan_tier_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plan_tier_configs_tier_key" ON "plan_tier_configs"("tier");

-- ─── 4. tenant_billing_configs ────────────────────────────────────────
CREATE TABLE "tenant_billing_configs" (
  "id"                          UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"                   UUID NOT NULL,
  "plan_tier"                   "plan_tier" NOT NULL,
  "subscription_amount_usd"     DECIMAL(19, 4) NOT NULL,
  "billing_model"               "billing_model" NOT NULL DEFAULT 'per_disbursement',
  "per_disbursement_bps"        DECIMAL(7, 2),
  "revenue_share_pct"           DECIMAL(5, 4),
  "micro_loan_rate_modifier"    DECIMAL(7, 2) NOT NULL DEFAULT 0,
  "overdraft_rate_modifier"     DECIMAL(7, 2) NOT NULL DEFAULT 0,
  "bnpl_rate_modifier"          DECIMAL(7, 2) NOT NULL DEFAULT -10,
  "factoring_rate_modifier"     DECIMAL(7, 2) NOT NULL DEFAULT -20,
  "volume_discount_tiers"       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "billing_currency"            VARCHAR(3) NOT NULL DEFAULT 'USD',
  "payment_terms_days"          INTEGER NOT NULL DEFAULT 15,
  "contract_start_date"         DATE NOT NULL,
  "contract_end_date"           DATE,
  "created_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tenant_billing_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_billing_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "tenant_billing_configs_tenant_id_key" ON "tenant_billing_configs"("tenant_id");
CREATE INDEX "tenant_billing_configs_tenant_id_idx" ON "tenant_billing_configs"("tenant_id");
CREATE INDEX "tenant_billing_configs_plan_tier_idx" ON "tenant_billing_configs"("plan_tier");

-- ─── 5. Seed PlanTierConfig rows ──────────────────────────────────────
-- Capabilities mirror SPEC-plan-tiers.md §3. Platform admins edit these
-- rows post-deploy via `updatePlanTierConfig` — no code redeploy needed.

INSERT INTO "plan_tier_configs" (
  "tier", "display_name", "allowed_product_types",
  "max_active_products", "max_customers", "max_monthly_disbursement_volume_usd",
  "max_monthly_transactions", "max_lender_configs", "max_bnpl_merchants",
  "max_portal_users", "data_retention_months", "feature_flags",
  "api_rate_limit_per_minute", "rest_api_enabled", "websocket_enabled",
  "bulk_operations_enabled", "max_api_keys", "branding_options", "updated_at"
) VALUES (
  'starter',
  'Starter',
  '["micro_loan"]'::jsonb,
  3, 10000, 500000.0000, 5000, 1, NULL, 5, 12,
  '{
    "mlScoring": false,
    "aiRecovery": false,
    "collectionsLevel": "basic",
    "customReports": false,
    "scheduledReports": false,
    "settlementLevel": "basic",
    "reconciliationLevel": "daily_batch",
    "notificationChannels": ["sms", "email"],
    "maxWebhookEndpoints": 3,
    "auditLogRetentionDays": 90
  }'::jsonb,
  60, false, false, false, 2,
  '{
    "fullBrandPalette": false,
    "customEmailTemplates": false,
    "customSmsSenderId": false,
    "whiteLabel": false,
    "customDomain": false
  }'::jsonb,
  CURRENT_TIMESTAMP
);

INSERT INTO "plan_tier_configs" (
  "tier", "display_name", "allowed_product_types",
  "max_active_products", "max_customers", "max_monthly_disbursement_volume_usd",
  "max_monthly_transactions", "max_lender_configs", "max_bnpl_merchants",
  "max_portal_users", "data_retention_months", "feature_flags",
  "api_rate_limit_per_minute", "rest_api_enabled", "websocket_enabled",
  "bulk_operations_enabled", "max_api_keys", "branding_options", "updated_at"
) VALUES (
  'growth',
  'Growth',
  '["micro_loan", "overdraft", "bnpl"]'::jsonb,
  10, 100000, 5000000.0000, 50000, 5, 50, 25, 36,
  '{
    "mlScoring": true,
    "aiRecovery": true,
    "collectionsLevel": "full",
    "customReports": true,
    "scheduledReports": true,
    "settlementLevel": "multi_party",
    "reconciliationLevel": "daily_plus_ondemand",
    "notificationChannels": ["sms", "email", "push"],
    "maxWebhookEndpoints": 10,
    "auditLogRetentionDays": 365
  }'::jsonb,
  300, true, true, true, 10,
  '{
    "fullBrandPalette": true,
    "customEmailTemplates": true,
    "customSmsSenderId": false,
    "whiteLabel": false,
    "customDomain": false
  }'::jsonb,
  CURRENT_TIMESTAMP
);

INSERT INTO "plan_tier_configs" (
  "tier", "display_name", "allowed_product_types",
  "max_active_products", "max_customers", "max_monthly_disbursement_volume_usd",
  "max_monthly_transactions", "max_lender_configs", "max_bnpl_merchants",
  "max_portal_users", "data_retention_months", "feature_flags",
  "api_rate_limit_per_minute", "rest_api_enabled", "websocket_enabled",
  "bulk_operations_enabled", "max_api_keys", "branding_options", "updated_at"
) VALUES (
  'enterprise',
  'Enterprise',
  '["micro_loan", "overdraft", "bnpl", "invoice_financing"]'::jsonb,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, 84,
  '{
    "mlScoring": true,
    "aiRecovery": true,
    "collectionsLevel": "full_with_agency",
    "customReports": true,
    "scheduledReports": true,
    "settlementLevel": "multi_party_custom",
    "reconciliationLevel": "realtime_plus_daily",
    "notificationChannels": ["sms", "email", "push", "in_app"],
    "maxWebhookEndpoints": null,
    "auditLogRetentionDays": 2555
  }'::jsonb,
  1000, true, true, true, NULL,
  '{
    "fullBrandPalette": true,
    "customEmailTemplates": true,
    "customSmsSenderId": true,
    "whiteLabel": true,
    "customDomain": true
  }'::jsonb,
  CURRENT_TIMESTAMP
);
