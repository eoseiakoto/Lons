-- Sprint 11 Track B follow-up · FIX 5 + FIX 8.
--
-- 1. Flip the BnplTransaction ↔ MerchantSettlement relation from 1:1
--    (transaction_id on settlement) to N:1 (settlement_id on transaction).
--    The 1:1 shape couldn't accommodate T+1 batches that group multiple
--    transactions under one settlement row.
--
-- 2. Add the previously-missing FK relation BnplTransaction.lender_id
--    → Lender.id with an index. The scalar column already existed; only
--    the FK constraint and index are being added here.
--
-- The old `merchant_settlements.transaction_id` column is dropped — its
-- data is migrated to `bnpl_transactions.settlement_id` first so existing
-- IMMEDIATE settlement rows keep their linkage.

-- ============================================================================
-- 1) BnplTransaction.settlementId — new column + FK + index
-- ============================================================================

ALTER TABLE "bnpl_transactions"
  ADD COLUMN "settlement_id" UUID;

ALTER TABLE "bnpl_transactions"
  ADD CONSTRAINT "bnpl_transactions_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "merchant_settlements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "bnpl_transactions_settlement_id_idx" ON "bnpl_transactions" ("settlement_id");

-- Backfill: existing IMMEDIATE settlements have `transaction_id` populated;
-- mirror that into the new `settlement_id` column on the transaction.
UPDATE "bnpl_transactions" t
SET "settlement_id" = ms."id"
FROM "merchant_settlements" ms
WHERE ms."transaction_id" = t."id";

-- ============================================================================
-- 2) MerchantSettlement.transactionId — drop FK, unique, column
-- ============================================================================

ALTER TABLE "merchant_settlements"
  DROP CONSTRAINT IF EXISTS "merchant_settlements_transaction_id_fkey";

DROP INDEX IF EXISTS "merchant_settlements_transaction_id_key";

ALTER TABLE "merchant_settlements"
  DROP COLUMN IF EXISTS "transaction_id";

-- ============================================================================
-- 3) FIX 8 — BnplTransaction.lender_id FK + index
-- ============================================================================

CREATE INDEX IF NOT EXISTS "bnpl_transactions_lender_id_idx"
  ON "bnpl_transactions" ("lender_id");

-- The FK is added without ON DELETE so that lender deletion is blocked
-- by referential integrity; existing seeded transactions will have valid
-- lender_id values from the Sprint 11 origination logic.
ALTER TABLE "bnpl_transactions"
  ADD CONSTRAINT "bnpl_transactions_lender_id_fkey"
  FOREIGN KEY ("lender_id") REFERENCES "lenders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
