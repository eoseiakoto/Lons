-- Sprint 16 — bundled schema additions:
--   * S16-FIX-4 (CRITICAL): RLS policies for `debtors` + `invoices` tables
--     (Sprint 11 invoice-factoring migration shipped without them; this is
--     an exploitable cross-tenant leak).
--   * S16-FIX-1: BnplCreditLine.activated_at + expires_at + EXPIRED enum
--     variant. activated_at drives "credit granted on" regulatory reports;
--     expires_at + the partial index let the adjustment service do a
--     cheap O(N expired) sweep.
--   * S16-6: MicroLoanCreditLimitChange — append-only audit table for
--     micro-loan subscription credit limit changes.
--   * S16-11: AgingBucketConfig — moves the hardcoded DEFAULT_BUCKETS
--     constant into a tenant/product-scoped table. Seed inserts the
--     existing defaults for every active tenant so behaviour stays
--     identical post-migration. S16-12 lives in the JSONB `actions`
--     column.
--
-- RLS pattern matches the canonical baseline migration
-- 20260430120000_enable_rls_tenant_isolation: USING + WITH CHECK both
-- bypass the filter for `app.is_platform_admin = 'true'` and otherwise
-- require `tenant_id = current_setting('app.current_tenant')::uuid`.

-- ─────────────────────────────────────────────────────────────────────────
-- S16-FIX-4 — RLS on `debtors` and `invoices`  (CRITICAL)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "debtors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "debtors" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "debtors";
CREATE POLICY tenant_isolation ON "debtors"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "invoices";
CREATE POLICY tenant_isolation ON "invoices"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────
-- S16-FIX-1 — BnplCreditLine timestamps + EXPIRED enum
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE "bnpl_credit_line_status" ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE "bnpl_credit_lines"
  ADD COLUMN "activated_at" TIMESTAMPTZ(6),
  ADD COLUMN "expires_at" TIMESTAMPTZ(6);

-- Cheap full-column index so Prisma can plan ORDER BY / range scans on
-- expiresAt. The PARTIAL index below is what makes the daily expiry
-- sweep effectively free.
CREATE INDEX "bnpl_credit_lines_expires_at_idx"
  ON "bnpl_credit_lines"("expires_at");

-- Partial index — only rows where expires_at is set AND the line is
-- still active. The expiry sweep job scans only this, not the whole
-- table.
CREATE INDEX "bnpl_credit_lines_expires_active_idx"
  ON "bnpl_credit_lines"("expires_at")
  WHERE "expires_at" IS NOT NULL AND "status" = 'active';

-- ─────────────────────────────────────────────────────────────────────────
-- S16-6 — micro_loan_credit_limit_changes (append-only)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "micro_loan_credit_limit_changes" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID NOT NULL,
    "customer_id"      UUID NOT NULL,
    "subscription_id"  UUID NOT NULL,
    "previous_limit"   DECIMAL(19, 4) NOT NULL,
    "new_limit"        DECIMAL(19, 4) NOT NULL,
    "change_type"      VARCHAR(20) NOT NULL,
    "reason"           TEXT NOT NULL,
    "triggered_by"     VARCHAR(80) NOT NULL,
    "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "micro_loan_credit_limit_changes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "micro_loan_credit_limit_changes"
  ADD CONSTRAINT "micro_loan_credit_limit_changes_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "micro_loan_credit_limit_changes"
  ADD CONSTRAINT "micro_loan_credit_limit_changes_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "micro_loan_credit_limit_changes_tenant_id_idx"
  ON "micro_loan_credit_limit_changes"("tenant_id");
CREATE INDEX "micro_loan_credit_limit_changes_customer_id_idx"
  ON "micro_loan_credit_limit_changes"("customer_id");
CREATE INDEX "micro_loan_credit_limit_changes_subscription_id_idx"
  ON "micro_loan_credit_limit_changes"("subscription_id");
CREATE INDEX "micro_loan_credit_limit_changes_change_type_idx"
  ON "micro_loan_credit_limit_changes"("change_type");
CREATE INDEX "micro_loan_credit_limit_changes_created_at_idx"
  ON "micro_loan_credit_limit_changes"("created_at");

ALTER TABLE "micro_loan_credit_limit_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "micro_loan_credit_limit_changes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "micro_loan_credit_limit_changes";
CREATE POLICY tenant_isolation ON "micro_loan_credit_limit_changes"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─────────────────────────────────────────────────────────────────────────
-- S16-11 + S16-12 — aging_bucket_configs (table + RLS + seed)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "aging_bucket_configs" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID NOT NULL,
    "product_id"       UUID,
    "bucket_name"      VARCHAR(50) NOT NULL,
    "days_min"         INTEGER NOT NULL,
    "days_max"         INTEGER NOT NULL,
    "contract_status"  VARCHAR(30) NOT NULL,
    "classification"   VARCHAR(30) NOT NULL,
    "sort_order"       INTEGER NOT NULL,
    "actions"          JSONB,
    "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "aging_bucket_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "aging_bucket_configs"
  ADD CONSTRAINT "aging_bucket_configs_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- `productId` IS NULL for tenant-wide defaults. Postgres treats NULLs as
-- distinct in unique indexes, so the partial-style behaviour we want
-- ("only one default per (tenant, bucketName)") needs the same composite
-- with a coalesced expression. Use the composite unique key Prisma
-- already generated and rely on application-side single-default policy.
CREATE UNIQUE INDEX "aging_bucket_configs_tenant_id_product_id_bucket_name_key"
  ON "aging_bucket_configs"("tenant_id", "product_id", "bucket_name");
CREATE INDEX "aging_bucket_configs_tenant_id_idx"
  ON "aging_bucket_configs"("tenant_id");
CREATE INDEX "aging_bucket_configs_product_id_idx"
  ON "aging_bucket_configs"("product_id");

ALTER TABLE "aging_bucket_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aging_bucket_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "aging_bucket_configs";
CREATE POLICY tenant_isolation ON "aging_bucket_configs"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- Seed: insert tenant-wide defaults for every active tenant. Mirrors the
-- existing hardcoded DEFAULT_BUCKETS from aging.service.ts so behaviour
-- stays identical post-migration. Idempotent via NOT EXISTS guard.
-- S16-12 default action payloads also seeded inline.
INSERT INTO "aging_bucket_configs"
  ("id", "tenant_id", "product_id", "bucket_name", "days_min", "days_max",
   "contract_status", "classification", "sort_order", "actions",
   "created_at", "updated_at")
SELECT
  gen_random_uuid(), t.id, NULL,
  bucket.bucket_name, bucket.days_min, bucket.days_max,
  bucket.contract_status, bucket.classification, bucket.sort_order,
  bucket.actions::jsonb, NOW(), NOW()
FROM "tenants" t
CROSS JOIN (
  VALUES
    ('current',        0,  0,
     'performing',    'performing',     0,
     '[]'),
    ('watch',          1,  7,
     'due',           'performing',     1,
     '[{"type":"SEND_NOTIFICATION","config":{"templateKey":"payment_overdue_watch","channel":"sms"}}]'),
    ('substandard',    8,  30,
     'overdue',       'special_mention', 2,
     '[{"type":"SEND_NOTIFICATION","config":{"templateKey":"payment_overdue_substandard","channel":"sms"}},{"type":"APPLY_PENALTY","config":{"penaltyType":"flat","amount":"50.00"}}]'),
    ('doubtful',       31, 60,
     'delinquent',    'substandard',    3,
     '[{"type":"SEND_NOTIFICATION","config":{"templateKey":"payment_overdue_doubtful","channel":"sms"}},{"type":"SUSPEND_BORROWING","config":{}}]'),
    ('default_61_90',  61, 90,
     'default_status','doubtful',       4,
     '[{"type":"ESCALATE_TO_COLLECTIONS","config":{"priority":"high"}},{"type":"SUSPEND_BORROWING","config":{}}]'),
    ('loss',           91, 2147483647,
     'default_status','loss',           5,
     '[{"type":"REPORT_TO_BUREAU","config":{"bureauCode":"default"}},{"type":"ESCALATE_TO_COLLECTIONS","config":{"priority":"critical"}}]')
) AS bucket(bucket_name, days_min, days_max, contract_status, classification, sort_order, actions)
WHERE t.status = 'active'
  AND t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "aging_bucket_configs" abc
    WHERE abc.tenant_id = t.id AND abc.product_id IS NULL AND abc.bucket_name = bucket.bucket_name
  );
