-- Sprint 14 (S14-12) — billing invoices + line items.
--
-- Adds the `billing_invoices` and `billing_line_items` tables that the
-- monthly subscription + usage jobs write into. Decoupled from the
-- plan-tier migration so a billing-engine rollback doesn't touch the
-- tier rename.

CREATE TABLE "billing_invoices" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"             UUID NOT NULL,
  "invoice_number"        VARCHAR(30) NOT NULL,
  "type"                  "billing_invoice_type" NOT NULL,
  "billing_period_start"  DATE NOT NULL,
  "billing_period_end"    DATE NOT NULL,
  "currency"              VARCHAR(3) NOT NULL DEFAULT 'USD',
  "subtotal"              DECIMAL(19, 4) NOT NULL,
  "tax_amount"            DECIMAL(19, 4) NOT NULL DEFAULT 0,
  "total"                 DECIMAL(19, 4) NOT NULL,
  "status"                "billing_invoice_status" NOT NULL DEFAULT 'draft',
  "issued_at"             TIMESTAMPTZ(6),
  "due_date"              DATE,
  "paid_at"               TIMESTAMPTZ(6),
  "notes"                 TEXT,
  "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_invoices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "billing_invoices_tenant_id_invoice_number_key"
  ON "billing_invoices"("tenant_id", "invoice_number");
CREATE INDEX "billing_invoices_tenant_id_idx" ON "billing_invoices"("tenant_id");
CREATE INDEX "billing_invoices_status_idx" ON "billing_invoices"("status");
CREATE INDEX "billing_invoices_type_idx" ON "billing_invoices"("type");
CREATE INDEX "billing_invoices_billing_period_start_idx" ON "billing_invoices"("billing_period_start");
CREATE INDEX "billing_invoices_tenant_id_type_billing_period_start_idx"
  ON "billing_invoices"("tenant_id", "type", "billing_period_start");

CREATE TABLE "billing_line_items" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "billing_invoice_id"  UUID NOT NULL,
  "type"                "billing_line_item_type" NOT NULL,
  "description"         VARCHAR(500) NOT NULL,
  "quantity"            INTEGER NOT NULL DEFAULT 1,
  "unit_price"          DECIMAL(19, 4) NOT NULL,
  "amount"              DECIMAL(19, 4) NOT NULL,
  "currency"            VARCHAR(3) NOT NULL DEFAULT 'USD',
  "metadata"            JSONB,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_line_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_line_items_billing_invoice_id_fkey"
    FOREIGN KEY ("billing_invoice_id") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "billing_line_items_billing_invoice_id_idx"
  ON "billing_line_items"("billing_invoice_id");
