-- Sprint 16 fixes — bundled schema additions:
--   * FIX-1: micro_loan_credit_limit_changes.source_id + indexed.
--     Drives the dedupe guard in MicroLoanCreditLimitService.reviewOnRepayment
--     so a re-delivered REPAYMENT_RECEIVED event doesn't compound the
--     percentage increase.
--   * FIX-3: repayments.idempotency_key + partial unique index. Drives
--     the dedupe guard in PaymentService.processPayment so a duplicate
--     processRepayment mutation (network retry, double-click) returns
--     the existing row instead of creating a phantom payment.
--
-- Both columns nullable so the migration is backward-compatible.

-- ─────────────────────────────────────────────────────────────────────────
-- FIX-1 — sourceId on credit-limit audit rows
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "micro_loan_credit_limit_changes"
  ADD COLUMN "source_id" VARCHAR(255);

CREATE INDEX "micro_loan_credit_limit_changes_tenant_id_source_id_idx"
  ON "micro_loan_credit_limit_changes"("tenant_id", "source_id");

-- ─────────────────────────────────────────────────────────────────────────
-- FIX-3 — idempotency_key on repayments
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "repayments"
  ADD COLUMN "idempotency_key" VARCHAR(255);

-- Partial unique index — only enforces uniqueness for non-null keys, so
-- the multitude of existing rows with NULL don't collide. Matches the
-- Sprint 15 FIX-15 pattern on bnpl_credit_line_adjustments.
CREATE UNIQUE INDEX "repayments_tenant_id_idempotency_key_key"
  ON "repayments"("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
