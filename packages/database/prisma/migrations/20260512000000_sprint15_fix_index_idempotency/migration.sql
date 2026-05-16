-- Sprint 15 fix migration (FIX-15 from PM review):
--   * Add missing index on bnpl_credit_lines.product_id. CLAUDE.md requires
--     every FK to have an index — adjustment-service trigger evaluation
--     joins on `product` were seq-scanning without it.
--   * Add idempotency_key column + partial unique index on
--     bnpl_credit_line_adjustments. Required by FIX-3 so the manual
--     adjustment mutation can dedupe replays without depending on a
--     surrounding business invariant.

-- ─────────────────────────────────────────────────────────────────────────
-- FIX-15a — productId index on bnpl_credit_lines
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "bnpl_credit_lines_product_id_idx"
  ON "bnpl_credit_lines" ("product_id");

-- ─────────────────────────────────────────────────────────────────────────
-- FIX-15b + FIX-3 — idempotency_key on bnpl_credit_line_adjustments
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "bnpl_credit_line_adjustments"
  ADD COLUMN "idempotency_key" VARCHAR(255);

-- Partial unique index: scoped per-tenant, and only enforced where the
-- key is non-null. System-triggered adjustments (cooldown-protected) can
-- leave it NULL without colliding.
CREATE UNIQUE INDEX "bnpl_credit_line_adjustments_tenant_id_idempotency_key_key"
  ON "bnpl_credit_line_adjustments" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
