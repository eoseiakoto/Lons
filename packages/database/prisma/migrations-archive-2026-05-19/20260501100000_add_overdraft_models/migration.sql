-- Sprint 10B · Task 1: Overdraft entity models
--
-- Adds CreditLine, Drawdown, and CreditLimitChange tables, the supporting
-- enums (credit_line_status, drawdown_status), an `overdraft_config` JSONB
-- column on the products table (per SPEC §4), and RLS policies consistent
-- with the Sprint 10A baseline (`tenant_isolation` keyed on
-- `app.current_tenant` with platform-admin bypass).

-- =============================================================================
-- Product overdraft configuration
-- =============================================================================

ALTER TABLE "products" ADD COLUMN "overdraft_config" JSONB;

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE "credit_line_status" AS ENUM (
  'pending_activation',
  'active',
  'frozen',
  'suspended',
  'closed',
  'expired'
);

CREATE TYPE "drawdown_status" AS ENUM (
  'initiated',
  'completed',
  'failed',
  'reversed'
);

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE "credit_lines" (
  "id"                  UUID                NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID                NOT NULL,
  "customer_id"         UUID                NOT NULL,
  "product_id"          UUID                NOT NULL,
  "lender_id"           UUID                NOT NULL,
  "currency"            VARCHAR(3)          NOT NULL,
  "approved_limit"      DECIMAL(19, 4)      NOT NULL,
  "available_balance"   DECIMAL(19, 4)      NOT NULL,
  "outstanding_amount"  DECIMAL(19, 4)      NOT NULL DEFAULT 0,
  "interest_rate"       DECIMAL(7, 4)       NOT NULL,
  "interest_accrued"    DECIMAL(19, 4)      NOT NULL DEFAULT 0,
  "fees_outstanding"    DECIMAL(19, 4)      NOT NULL DEFAULT 0,
  "penalties_accrued"   DECIMAL(19, 4)      NOT NULL DEFAULT 0,
  "status"              "credit_line_status" NOT NULL DEFAULT 'pending_activation',
  "billing_cycle_day"   INTEGER             NOT NULL DEFAULT 1,
  "current_cycle_start" DATE,
  "current_cycle_end"   DATE,
  "last_drawdown_at"    TIMESTAMPTZ(6),
  "last_repayment_at"   TIMESTAMPTZ(6),
  "last_limit_review_at" TIMESTAMPTZ(6),
  "activated_at"        TIMESTAMPTZ(6),
  "expires_at"          TIMESTAMPTZ(6),
  "frozen_at"           TIMESTAMPTZ(6),
  "frozen_reason"       TEXT,
  "closed_at"           TIMESTAMPTZ(6),
  "closed_reason"       TEXT,
  "metadata"            JSONB,
  "created_at"          TIMESTAMPTZ(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ(6)      NOT NULL,

  CONSTRAINT "credit_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_lines_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id"),
  CONSTRAINT "credit_lines_product_fkey"  FOREIGN KEY ("product_id")  REFERENCES "products"("id"),
  CONSTRAINT "credit_lines_lender_fkey"   FOREIGN KEY ("lender_id")   REFERENCES "lenders"("id")
);

CREATE UNIQUE INDEX "credit_lines_tenant_customer_product_key"
  ON "credit_lines"("tenant_id", "customer_id", "product_id");
CREATE INDEX "credit_lines_tenant_idx"     ON "credit_lines"("tenant_id");
CREATE INDEX "credit_lines_customer_idx"   ON "credit_lines"("customer_id");
CREATE INDEX "credit_lines_status_idx"     ON "credit_lines"("status");
CREATE INDEX "credit_lines_expires_at_idx" ON "credit_lines"("expires_at");

CREATE TABLE "drawdowns" (
  "id"              UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       UUID            NOT NULL,
  "credit_line_id"  UUID            NOT NULL,
  "amount"          DECIMAL(19, 4)  NOT NULL,
  "currency"        VARCHAR(3)      NOT NULL,
  "wallet_balance"  DECIMAL(19, 4)  NOT NULL,
  "transaction_ref" VARCHAR(255)    NOT NULL,
  "wallet_ref"      VARCHAR(255),
  "fee_amount"      DECIMAL(19, 4)  NOT NULL DEFAULT 0,
  "status"          "drawdown_status" NOT NULL DEFAULT 'initiated',
  "failure_reason"  TEXT,
  "completed_at"    TIMESTAMPTZ(6),
  "created_at"      TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "drawdowns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drawdowns_credit_line_fkey" FOREIGN KEY ("credit_line_id") REFERENCES "credit_lines"("id")
);

CREATE INDEX "drawdowns_tenant_idx"          ON "drawdowns"("tenant_id");
CREATE INDEX "drawdowns_credit_line_idx"     ON "drawdowns"("credit_line_id");
CREATE INDEX "drawdowns_transaction_ref_idx" ON "drawdowns"("transaction_ref");
CREATE INDEX "drawdowns_status_idx"          ON "drawdowns"("status");

CREATE TABLE "credit_limit_changes" (
  "id"             UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      UUID            NOT NULL,
  "credit_line_id" UUID            NOT NULL,
  "previous_limit" DECIMAL(19, 4)  NOT NULL,
  "new_limit"      DECIMAL(19, 4)  NOT NULL,
  "reason_code"    VARCHAR(50)     NOT NULL,
  "reason_detail"  TEXT,
  "triggered_by"   VARCHAR(50)     NOT NULL,
  "created_at"     TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_limit_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_limit_changes_credit_line_fkey" FOREIGN KEY ("credit_line_id") REFERENCES "credit_lines"("id")
);

CREATE INDEX "credit_limit_changes_tenant_idx"      ON "credit_limit_changes"("tenant_id");
CREATE INDEX "credit_limit_changes_credit_line_idx" ON "credit_limit_changes"("credit_line_id");

-- =============================================================================
-- RLS — consistent with Sprint 10A baseline
-- =============================================================================

DO $$
DECLARE
  tbl TEXT;
  overdraft_tables TEXT[] := ARRAY['credit_lines', 'drawdowns', 'credit_limit_changes'];
BEGIN
  FOREACH tbl IN ARRAY overdraft_tables LOOP
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
