-- Sprint 11 Track B · BNPL product type — schema (B1).
--
-- Four tables + four enums:
--   merchants               — SP-onboarded merchant entity
--   bnpl_transactions       — one BNPL purchase (replaces overdraft's CreditLine)
--   installment_schedules   — fixed-amount due dates per transaction
--   merchant_settlements    — payouts to the merchant (IMMEDIATE or T_PLUS_1)
--
-- All tenant-scoped tables enable + force RLS with the Sprint 10A
-- baseline `tenant_isolation` policy.

-- ============================================================================
-- 1) Enums
-- ============================================================================

CREATE TYPE "merchant_status" AS ENUM ('pending', 'active', 'suspended', 'deactivated');
CREATE TYPE "settlement_type" AS ENUM ('IMMEDIATE', 'T_PLUS_1');
CREATE TYPE "bnpl_transaction_status" AS ENUM (
  'initiated', 'approved', 'active', 'completed', 'cancelled',
  'accelerated', 'defaulted', 'refunded'
);
CREATE TYPE "installment_status" AS ENUM ('pending', 'due', 'paid', 'overdue', 'waived');
CREATE TYPE "merchant_settlement_status" AS ENUM ('pending', 'processing', 'settled', 'failed');

-- ============================================================================
-- 2) merchants
-- ============================================================================

CREATE TABLE "merchants" (
  "id"               UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        UUID            NOT NULL,
  "name"             VARCHAR(255)    NOT NULL,
  "code"             VARCHAR(50)     NOT NULL,
  "status"           "merchant_status" NOT NULL DEFAULT 'pending',
  "contact_email"    VARCHAR(255),
  "contact_phone"    VARCHAR(50),
  "settlement_type"  "settlement_type" NOT NULL DEFAULT 'T_PLUS_1',
  "discount_rate"    DECIMAL(7, 4)   NOT NULL,
  "wallet_id"        VARCHAR(255),
  "wallet_provider"  VARCHAR(50),
  "metadata"         JSONB,
  "onboarded_at"     TIMESTAMPTZ(6),
  "deleted_at"       TIMESTAMPTZ(6),
  "created_at"       TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6)  NOT NULL,

  CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchants_tenant_id_code_key" ON "merchants" ("tenant_id", "code");
CREATE INDEX "merchants_tenant_id_idx" ON "merchants" ("tenant_id");
CREATE INDEX "merchants_status_idx" ON "merchants" ("status");

-- ============================================================================
-- 3) bnpl_transactions
-- ============================================================================

CREATE TABLE "bnpl_transactions" (
  "id"                     UUID                       NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"              UUID                       NOT NULL,
  "customer_id"            UUID                       NOT NULL,
  "merchant_id"            UUID                       NOT NULL,
  "product_id"             UUID                       NOT NULL,
  "lender_id"              UUID                       NOT NULL,
  "currency"               VARCHAR(3)                 NOT NULL,
  "purchase_amount"        DECIMAL(19, 4)             NOT NULL,
  "total_repayable"        DECIMAL(19, 4)             NOT NULL,
  "number_of_installments" INTEGER                    NOT NULL,
  "status"                 "bnpl_transaction_status"  NOT NULL DEFAULT 'initiated',
  "purchase_ref"           VARCHAR(255)               NOT NULL,
  "merchant_ref"           VARCHAR(255),
  "interest_rate"          DECIMAL(7, 4)              NOT NULL DEFAULT 0,
  "completed_at"           TIMESTAMPTZ(6),
  "cancelled_at"           TIMESTAMPTZ(6),
  "accelerated_at"         TIMESTAMPTZ(6),
  "idempotency_key"        VARCHAR(255),
  "metadata"               JSONB,
  "deleted_at"             TIMESTAMPTZ(6),
  "created_at"             TIMESTAMPTZ(6)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMPTZ(6)             NOT NULL,

  CONSTRAINT "bnpl_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bnpl_transactions_tenant_id_merchant_id_purchase_ref_key"
  ON "bnpl_transactions" ("tenant_id", "merchant_id", "purchase_ref");
CREATE UNIQUE INDEX "bnpl_transactions_tenant_id_idempotency_key_key"
  ON "bnpl_transactions" ("tenant_id", "idempotency_key");
CREATE INDEX "bnpl_transactions_tenant_id_idx" ON "bnpl_transactions" ("tenant_id");
CREATE INDEX "bnpl_transactions_customer_id_idx" ON "bnpl_transactions" ("customer_id");
CREATE INDEX "bnpl_transactions_merchant_id_idx" ON "bnpl_transactions" ("merchant_id");
CREATE INDEX "bnpl_transactions_status_idx" ON "bnpl_transactions" ("status");
CREATE INDEX "bnpl_transactions_purchase_ref_idx" ON "bnpl_transactions" ("purchase_ref");

ALTER TABLE "bnpl_transactions"
  ADD CONSTRAINT "bnpl_transactions_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bnpl_transactions_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bnpl_transactions_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 4) installment_schedules
-- ============================================================================

CREATE TABLE "installment_schedules" (
  "id"                 UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"          UUID                  NOT NULL,
  "transaction_id"     UUID                  NOT NULL,
  "installment_number" INTEGER               NOT NULL,
  "amount"             DECIMAL(19, 4)        NOT NULL,
  "principal_portion"  DECIMAL(19, 4)        NOT NULL,
  "interest_portion"   DECIMAL(19, 4)        NOT NULL DEFAULT 0,
  "fee_portion"        DECIMAL(19, 4)        NOT NULL DEFAULT 0,
  "due_date"           DATE                  NOT NULL,
  "status"             "installment_status"  NOT NULL DEFAULT 'pending',
  "paid_amount"        DECIMAL(19, 4)        NOT NULL DEFAULT 0,
  "paid_at"            TIMESTAMPTZ(6),
  "days_past_due"      INTEGER               NOT NULL DEFAULT 0,
  "created_at"         TIMESTAMPTZ(6)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMPTZ(6)        NOT NULL,

  CONSTRAINT "installment_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "installment_schedules_transaction_id_installment_number_key"
  ON "installment_schedules" ("transaction_id", "installment_number");
CREATE INDEX "installment_schedules_tenant_id_idx" ON "installment_schedules" ("tenant_id");
CREATE INDEX "installment_schedules_transaction_id_idx" ON "installment_schedules" ("transaction_id");
CREATE INDEX "installment_schedules_due_date_idx" ON "installment_schedules" ("due_date");
CREATE INDEX "installment_schedules_status_idx" ON "installment_schedules" ("status");

ALTER TABLE "installment_schedules"
  ADD CONSTRAINT "installment_schedules_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "bnpl_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 5) merchant_settlements
-- ============================================================================

CREATE TABLE "merchant_settlements" (
  "id"                UUID                 NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         UUID                 NOT NULL,
  "merchant_id"       UUID                 NOT NULL,
  "transaction_id"    UUID,
  "currency"          VARCHAR(3)           NOT NULL,
  "gross_amount"      DECIMAL(19, 4)       NOT NULL,
  "discount_fee"      DECIMAL(19, 4)       NOT NULL,
  "net_amount"        DECIMAL(19, 4)       NOT NULL,
  "transaction_count" INTEGER              NOT NULL,
  "period_start"      DATE                 NOT NULL,
  "period_end"        DATE                 NOT NULL,
  "status"            "merchant_settlement_status"  NOT NULL DEFAULT 'pending',
  "settled_at"        TIMESTAMPTZ(6),
  "wallet_ref"        VARCHAR(255),
  "failure_reason"    TEXT,
  "created_at"        TIMESTAMPTZ(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMPTZ(6)       NOT NULL,

  CONSTRAINT "merchant_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_settlements_transaction_id_key"
  ON "merchant_settlements" ("transaction_id");
CREATE INDEX "merchant_settlements_tenant_id_idx" ON "merchant_settlements" ("tenant_id");
CREATE INDEX "merchant_settlements_merchant_id_idx" ON "merchant_settlements" ("merchant_id");
CREATE INDEX "merchant_settlements_status_idx" ON "merchant_settlements" ("status");
CREATE INDEX "merchant_settlements_period_end_idx" ON "merchant_settlements" ("period_end");

ALTER TABLE "merchant_settlements"
  ADD CONSTRAINT "merchant_settlements_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "merchant_settlements_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "bnpl_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 6) RLS — consistent with Sprint 10A baseline
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  bnpl_tables TEXT[] := ARRAY[
    'merchants',
    'bnpl_transactions',
    'installment_schedules',
    'merchant_settlements'
  ];
BEGIN
  FOREACH tbl IN ARRAY bnpl_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format($q$
      CREATE POLICY tenant_isolation ON %I
        USING (
          current_setting('app.is_platform_admin', true) = 'true'
          OR tenant_id = current_setting('app.current_tenant', true)::uuid
        )
        WITH CHECK (
          current_setting('app.is_platform_admin', true) = 'true'
          OR tenant_id = current_setting('app.current_tenant', true)::uuid
        )
    $q$, tbl);
  END LOOP;
END $$;
