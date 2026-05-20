-- Sprint 12 Phase 2A — Invoice Factoring schema (spec: SPEC-invoice-factoring.md).
-- Adds Debtor + Invoice models, status enums, and a factoring_config slot
-- on products (parallel to overdraft_config, bnpl_config).

-- ─── Enums ───────────────────────────────────────────────────────────────
CREATE TYPE "debtor_status" AS ENUM ('active', 'under_review', 'suspended', 'blacklisted');

CREATE TYPE "invoice_status" AS ENUM (
  'submitted',
  'under_review',
  'verified',
  'offer_generated',
  'offer_accepted',
  'funded',
  'debtor_notified',
  'payment_received',
  'reserve_released',
  'settled',
  'disputed',
  'defaulted',
  'cancelled',
  'rejected'
);

CREATE TYPE "verification_status" AS ENUM ('pending', 'verified', 'failed', 'waived');

CREATE TYPE "recourse_type" AS ENUM ('with_recourse', 'without_recourse');

-- ─── Product factoring config ───────────────────────────────────────────
ALTER TABLE "products" ADD COLUMN "factoring_config" JSONB;

-- ─── Debtors ────────────────────────────────────────────────────────────
CREATE TABLE "debtors" (
  "id"                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"               UUID            NOT NULL,
  "company_name"            VARCHAR(255)    NOT NULL,
  "trading_name"            VARCHAR(255),
  "registration_number"     VARCHAR(100),
  "tax_id"                  VARCHAR(100),
  "country"                 VARCHAR(3)      NOT NULL,
  "industry_sector"         VARCHAR(100),
  "contact_email"           VARCHAR(255),
  "contact_phone"           VARCHAR(50),
  "contact_name"            VARCHAR(255),
  "address"                 JSONB,
  "payment_terms"           VARCHAR(50),
  "average_payment_days"    INTEGER,
  "external_credit_rating"  VARCHAR(50),
  "internal_risk_score"     DECIMAL(5, 2),
  "total_exposure"          DECIMAL(19, 4)  NOT NULL DEFAULT 0,
  "exposure_limit"          DECIMAL(19, 4),
  "status"                  "debtor_status" NOT NULL DEFAULT 'active',
  "verified_at"             TIMESTAMPTZ(6),
  "metadata"                JSONB,
  "created_at"              TIMESTAMPTZ(6)  NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ(6)  NOT NULL,
  "deleted_at"              TIMESTAMPTZ(6)
);

CREATE UNIQUE INDEX "debtors_tenant_id_company_name_registration_number_key"
  ON "debtors" ("tenant_id", "company_name", "registration_number");
CREATE INDEX "debtors_tenant_id_idx"        ON "debtors" ("tenant_id");
CREATE INDEX "debtors_status_idx"           ON "debtors" ("status");
CREATE INDEX "debtors_industry_sector_idx"  ON "debtors" ("industry_sector");

-- ─── Invoices ───────────────────────────────────────────────────────────
CREATE TABLE "invoices" (
  "id"                      UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"               UUID                   NOT NULL,
  "seller_id"               UUID                   NOT NULL,
  "debtor_id"               UUID                   NOT NULL,
  "product_id"              UUID                   NOT NULL,
  "contract_id"             UUID,
  "idempotency_key"         VARCHAR(255)           NOT NULL,
  "invoice_number"          VARCHAR(100)           NOT NULL,
  "issue_date"              DATE                   NOT NULL,
  "due_date"                DATE                   NOT NULL,
  "face_value"              DECIMAL(19, 4)         NOT NULL,
  "currency"                VARCHAR(3)             NOT NULL,
  "advance_rate_percent"    DECIMAL(5, 2)          NOT NULL,
  "advanced_amount"         DECIMAL(19, 4),
  "reserve_amount"          DECIMAL(19, 4),
  "discount_fee"            DECIMAL(19, 4),
  "service_fee"             DECIMAL(19, 4),
  "net_disbursement"        DECIMAL(19, 4),
  "status"                  "invoice_status"       NOT NULL DEFAULT 'submitted',
  "verification_status"     "verification_status"  NOT NULL DEFAULT 'pending',
  "verified_by"             UUID,
  "verified_at"             TIMESTAMPTZ(6),
  "verification_notes"      TEXT,
  "recourse_type"           "recourse_type"        NOT NULL DEFAULT 'with_recourse',
  "debtor_notified_at"      TIMESTAMPTZ(6),
  "debtor_payment_ref"      VARCHAR(255),
  "amount_received"         DECIMAL(19, 4)         DEFAULT 0,
  "reserve_released"        DECIMAL(19, 4)         DEFAULT 0,
  "dispute_reason"          TEXT,
  "documents"               JSONB,
  "metadata"                JSONB,
  "funded_at"               TIMESTAMPTZ(6),
  "settled_at"              TIMESTAMPTZ(6),
  "defaulted_at"            TIMESTAMPTZ(6),
  "created_at"              TIMESTAMPTZ(6)         NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ(6)         NOT NULL,

  CONSTRAINT "invoices_seller_id_fkey"
    FOREIGN KEY ("seller_id")  REFERENCES "customers" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "invoices_debtor_id_fkey"
    FOREIGN KEY ("debtor_id")  REFERENCES "debtors"   ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "invoices_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"  ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "invoices_contract_id_fkey"
    FOREIGN KEY ("contract_id") REFERENCES "contracts" ("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX "invoices_tenant_id_idempotency_key_key"
  ON "invoices" ("tenant_id", "idempotency_key");
CREATE UNIQUE INDEX "invoices_tenant_id_seller_id_invoice_number_key"
  ON "invoices" ("tenant_id", "seller_id", "invoice_number");
CREATE UNIQUE INDEX "invoices_contract_id_key"
  ON "invoices" ("contract_id");
CREATE INDEX "invoices_tenant_id_idx"  ON "invoices" ("tenant_id");
CREATE INDEX "invoices_seller_id_idx"  ON "invoices" ("seller_id");
CREATE INDEX "invoices_debtor_id_idx"  ON "invoices" ("debtor_id");
CREATE INDEX "invoices_status_idx"     ON "invoices" ("status");
CREATE INDEX "invoices_due_date_idx"   ON "invoices" ("due_date");
