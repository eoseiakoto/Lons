-- Sprint 11 · A10: indexed wallet → customer routing table.
--
-- The wallet-webhook controller previously routed inbound provider events
-- by scanning every customer's `metadata.walletId` JSON path under a
-- platform-admin RLS bypass — O(n) across all tenants on every webhook.
-- This migration creates a dedicated `wallet_account_mappings` table
-- with a unique `(provider, wallet_id)` index so the lookup is O(log n)
-- and bounded to a single tenant.
--
-- Backwards compatibility: existing `customer.metadata.walletId` data is
-- backfilled by the data migration in
-- `scripts/backfill-wallet-account-mappings.ts` after this migration runs.
-- The webhook controller falls back to the legacy scan only if no
-- mapping row is found, so it stays safe during the transition.

CREATE TABLE "wallet_account_mappings" (
  "id"          UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   UUID            NOT NULL,
  "customer_id" UUID            NOT NULL,
  "wallet_id"   VARCHAR(255)    NOT NULL,
  "provider"    VARCHAR(50)     NOT NULL,
  "is_primary"  BOOLEAN         NOT NULL DEFAULT true,
  "created_at"  TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(6)  NOT NULL,

  CONSTRAINT "wallet_account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_account_mappings_provider_wallet_id_key"
  ON "wallet_account_mappings" ("provider", "wallet_id");
CREATE INDEX "wallet_account_mappings_tenant_id_idx"
  ON "wallet_account_mappings" ("tenant_id");
CREATE INDEX "wallet_account_mappings_customer_id_idx"
  ON "wallet_account_mappings" ("customer_id");

ALTER TABLE "wallet_account_mappings"
  ADD CONSTRAINT "wallet_account_mappings_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- RLS — consistent with Sprint 10A baseline
-- ============================================================================

ALTER TABLE "wallet_account_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_account_mappings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "wallet_account_mappings";
CREATE POLICY tenant_isolation ON "wallet_account_mappings"
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );
