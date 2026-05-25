-- Sprint 12 G5: split BNPL config off from overdraft_config.
-- Adds a dedicated bnpl_config column on products and back-fills existing
-- BNPL products from their current overdraft_config payload.
-- overdraft_config is preserved (still used by Overdraft products).

ALTER TABLE "products" ADD COLUMN "bnpl_config" JSONB;

UPDATE "products"
   SET "bnpl_config" = "overdraft_config"
 WHERE "type" = 'bnpl'
   AND "overdraft_config" IS NOT NULL;
