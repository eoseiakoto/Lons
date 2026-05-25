-- Sprint 11 · A4 / A6: due-date tracking and billing cycle history.
--
-- Adds two pieces of state needed for overdue classification (A5) and
-- statement opening-balance tracking (A6):
--
--   1. `credit_lines.due_date` — the date at which the current cycle's
--      crystallized balance becomes payable. Computed at cycle close as
--      `current_cycle_end + product.gracePeriodDays`. Drives DPD / aging.
--
--   2. `billing_cycle_histories` — append-only frozen snapshot of each
--      cycle. One row per (credit_line_id, cycle_number). Records the
--      opening / closing balance plus interest, fees, and penalties that
--      crystallized during the cycle. Statements read from this table
--      instead of recomputing from the live ledger.
--
-- Backward compatibility: `due_date` is nullable and existing rows get
-- NULL — the cycle-close job will populate it on the next run. The new
-- table is empty until cycle closes start running post-migration. RLS
-- mirrors the Sprint 10A baseline so cross-tenant reads are blocked.

-- ============================================================================
-- 1) credit_lines.due_date
-- ============================================================================

ALTER TABLE "credit_lines"
  ADD COLUMN "due_date" DATE;

CREATE INDEX "credit_lines_due_date_idx" ON "credit_lines" ("due_date");

-- ============================================================================
-- 2) billing_cycle_histories
-- ============================================================================

CREATE TABLE "billing_cycle_histories" (
  "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         UUID            NOT NULL,
  "credit_line_id"    UUID            NOT NULL,
  "cycle_number"      INTEGER         NOT NULL,
  "cycle_start"       DATE            NOT NULL,
  "cycle_end"         DATE            NOT NULL,
  "due_date"          DATE            NOT NULL,
  "opening_balance"   DECIMAL(19, 4)  NOT NULL,
  "closing_balance"   DECIMAL(19, 4)  NOT NULL,
  "interest_charged"  DECIMAL(19, 4)  NOT NULL,
  "fees_charged"      DECIMAL(19, 4)  NOT NULL,
  "penalties_charged" DECIMAL(19, 4)  NOT NULL,
  "total_repayments"  DECIMAL(19, 4)  NOT NULL DEFAULT 0,
  "paid_in_full"      BOOLEAN         NOT NULL DEFAULT false,
  "created_at"        TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_cycle_histories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_cycle_histories_credit_line_id_cycle_number_key"
  ON "billing_cycle_histories" ("credit_line_id", "cycle_number");
CREATE INDEX "billing_cycle_histories_tenant_id_idx"
  ON "billing_cycle_histories" ("tenant_id");
CREATE INDEX "billing_cycle_histories_credit_line_id_idx"
  ON "billing_cycle_histories" ("credit_line_id");
CREATE INDEX "billing_cycle_histories_due_date_idx"
  ON "billing_cycle_histories" ("due_date");

ALTER TABLE "billing_cycle_histories"
  ADD CONSTRAINT "billing_cycle_histories_credit_line_id_fkey"
  FOREIGN KEY ("credit_line_id") REFERENCES "credit_lines"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 3) RLS — consistent with Sprint 10A baseline
-- ============================================================================

ALTER TABLE "billing_cycle_histories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_cycle_histories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "billing_cycle_histories";
CREATE POLICY tenant_isolation ON "billing_cycle_histories"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );
