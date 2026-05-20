-- Sprint 10A · P0-002: Row-Level Security for tenant isolation
--
-- Enables ENABLE/FORCE ROW LEVEL SECURITY on every tenant-scoped table and
-- attaches a `tenant_isolation` policy that gates SELECT/INSERT/UPDATE/DELETE on:
--   - app.is_platform_admin = 'true'  → bypass (cross-tenant platform admin)
--   - tenant_id = app.current_tenant   → match the request's tenant
--
-- The session vars are set by `PrismaService.setTenantContext(tenantId)` /
-- `setPlatformAdminContext()`, scoped LOCAL to the active transaction. A
-- request without either set returns ZERO rows on these tables (current_setting
-- returns NULL with the second arg `true`, NULL never equals tenant_id).
--
-- The `tenants` table itself uses `id = app.current_tenant` (it has no
-- tenant_id column — it IS the tenant).
--
-- This is policy-only — no schema changes. Existing data is untouched.

-- =============================================================================
-- Phase 1: enable + force RLS, then attach policies on every tenant-scoped table
-- =============================================================================

DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'users',
    'roles',
    'lenders',
    'customers',
    'customer_consents',
    'screening_results',
    'products',
    'product_versions',
    'subscriptions',
    'loan_requests',
    'scoring_results',
    'contracts',
    'repayment_schedule',
    'disbursements',
    'repayments',
    'ledger_entries',
    'audit_logs',
    'notifications',
    'settlement_runs',
    'settlement_lines',
    'reconciliation_runs',
    'reconciliation_exceptions',
    'collections_actions',
    'webhook_endpoints',
    'wallet_provider_configs',
    'notification_provider_configs',
    'notification_mock_log',
    'feedbacks',
    'survey_responses',
    'platform_messages',
    'message_recipients',
    'api_keys'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    -- Skip tables that don't exist yet (idempotency for partial environments).
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
      -- Drop existing policy if re-running (idempotent).
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
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- Phase 2: tenants table — special-case (no tenant_id column; id IS the tenant)
-- =============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR id = current_setting('app.current_tenant', true)::uuid
  );

-- =============================================================================
-- Phase 3: webhook_delivery_logs — has tenant_id but is conventionally written
-- by the platform across all tenants. We still enforce RLS so that ordinary
-- tenant queries see only their own deliveries; platform admin context bypasses.
-- =============================================================================

ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_delivery_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON webhook_delivery_logs;
CREATE POLICY tenant_isolation ON webhook_delivery_logs
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- =============================================================================
-- Phase 4: platform_users table — only platform admins should see this. We
-- gate it strictly on `app.is_platform_admin`, NOT on tenant_id (this table
-- has no tenant_id; platform users are global by definition).
-- =============================================================================

ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_admin_only ON platform_users;
CREATE POLICY platform_admin_only ON platform_users
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');
