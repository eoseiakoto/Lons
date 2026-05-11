-- Sprint 14 (S14-13) — per-disbursement metered fee record.
--
-- Created by `DisbursementFeeListener` when `DISBURSEMENT_COMPLETED`
-- fires. The full input set (base bps, modifier, multiplier, rate, FX
-- rate) is persisted so the fee is reproducible and auditable even if
-- the TenantBillingConfig rates change later.

CREATE TABLE "disbursement_fees" (
  "id"                          UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"                   UUID NOT NULL,
  "disbursement_id"             UUID NOT NULL,
  "contract_id"                 UUID NOT NULL,
  "product_type"                VARCHAR(30) NOT NULL,
  "gross_amount"                DECIMAL(19, 4) NOT NULL,
  "currency"                    VARCHAR(3) NOT NULL,
  "base_bps"                    DECIMAL(7, 2) NOT NULL,
  "product_modifier_bps"        DECIMAL(7, 2) NOT NULL,
  "effective_bps"               DECIMAL(7, 2) NOT NULL,
  "volume_discount_multiplier"  DECIMAL(7, 4) NOT NULL,
  "fee_rate"                    DECIMAL(7, 2) NOT NULL,
  "fee_amount"                  DECIMAL(19, 4) NOT NULL,
  "fee_amount_usd"              DECIMAL(19, 4) NOT NULL,
  "exchange_rate"               DECIMAL(12, 6),
  "volume_tier"                 VARCHAR(50),
  "billing_invoice_id"          UUID,
  "created_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "disbursement_fees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "disbursement_fees_disbursement_id_fkey"
    FOREIGN KEY ("disbursement_id") REFERENCES "disbursements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "disbursement_fees_billing_invoice_id_fkey"
    FOREIGN KEY ("billing_invoice_id") REFERENCES "billing_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "disbursement_fees_disbursement_id_key"
  ON "disbursement_fees"("disbursement_id");
CREATE UNIQUE INDEX "disbursement_fees_tenant_id_disbursement_id_key"
  ON "disbursement_fees"("tenant_id", "disbursement_id");
CREATE INDEX "disbursement_fees_tenant_id_idx" ON "disbursement_fees"("tenant_id");
CREATE INDEX "disbursement_fees_tenant_id_created_at_idx"
  ON "disbursement_fees"("tenant_id", "created_at");
CREATE INDEX "disbursement_fees_billing_invoice_id_idx"
  ON "disbursement_fees"("billing_invoice_id");
CREATE INDEX "disbursement_fees_tenant_id_product_type_idx"
  ON "disbursement_fees"("tenant_id", "product_type");
