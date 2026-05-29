-- S19-STAB-1: Row-Level Security tenant isolation
--
-- Re-adds the RLS policy DDL dropped by the post-Sprint-18 baseline
-- squash. PM directive (Emmanuel decision, 2026-05-21) + BA Finding 3:
-- RLS must be active in local dev so tests verify tenant isolation
-- at the database level, not just the application layer.
--
-- Design:
--
--   - Every tenant-scoped table gets RLS enabled and a single policy
--     named `tenant_isolation`. The policy permits a row iff either:
--       (a) the session has `app.is_platform_admin = 'true'` set
--           (platform-portal operations bypass tenant filtering), OR
--       (b) the row's tenant_id matches the session's
--           `app.current_tenant` UUID set by the RLS interceptor.
--
--   - `current_setting('var', true)` (second arg = missing_ok = true)
--     returns NULL when the var isn't set, which the comparison then
--     evaluates as not-equal — fail-closed. Anonymous queries with no
--     context set see zero rows.
--
--   - Two tables (platform_messages, message_recipients) have
--     nullable tenant_id for platform-wide broadcasts. They get a
--     stricter policy: NULL-tenant rows are visible only to platform
--     admins. If the product team later wants broadcasts visible to
--     all tenants, broaden the policy then — narrower is safer now.
--
--   - The platform-scope tables (tenants, platform_users,
--     plan_tier_configs) don't have tenant_id and are not in this
--     migration. Access to those is gated at the application layer
--     via @Roles('platform:admin') and the AuthGuard's role check.
--
--   - audit_logs (parent partitioned table) gets RLS at the parent.
--     Postgres propagates RLS to all child partitions automatically.
--     Individual audit_logs_YYYY_MM partitions are not listed here.
--
-- Postgres quirks handled:
--
--   - `FORCE ROW LEVEL SECURITY` is NOT set. RLS by default applies
--     only to non-owner roles. The migration role (postgres / lons
--     superuser equivalent) bypasses by design — that's how seeds
--     and admin migrations work. The application connection uses a
--     separate role (or relies on session-var checks at the
--     application code level) that does NOT bypass RLS.
--
--   - **Local dev caveat — followup needed**: In local dev the
--     application currently connects as the same `lons` role that
--     owns the tables, so these policies are SILENT in dev (owner
--     bypass) unless either:
--       (a) FORCE ROW LEVEL SECURITY is added (and the seed +
--           migrations explicitly bypass via set_config), or
--       (b) a separate non-owner `lons_app` role is provisioned
--           for runtime connections and the application's
--           DATABASE_URL is updated to use it.
--     Option (b) is the production-grade pattern; (a) is a dev-only
--     shortcut. The decision is deferred to PM (Sprint 19 follow-up).
--
--   - Demonstrating enforcement in dev: connect as a fresh non-
--     owner role, e.g.
--       CREATE ROLE rls_test;
--       GRANT SELECT ON contracts TO rls_test;
--       SET ROLE rls_test;
--       SELECT count(*) FROM contracts;                          -- 0 (no context)
--       SELECT set_config('app.current_tenant', '<uuid>', true); -- set tenant
--       SELECT count(*) FROM contracts;                          -- only that tenant
--     The policies WILL bite once a non-owner role connects.
--
--   - When tenant_id is set via `set_config('app.current_tenant',
--     uuid::text, true)` (the third arg = is_local = true, scoped
--     to the current transaction), the comparison uses ::text on
--     both sides to avoid an implicit cast that postgres would log
--     as an unprepared-statement performance warning.
--
-- Test plan:
--   - The application's RLS interceptor (services/entity-service/src/
--     auth/interceptors/rls-tenant-context.interceptor.ts) sets the
--     two session vars on every authenticated request inside an
--     interactive transaction.
--   - A query as tenant A's SP Admin must NOT return any of tenant B's
--     rows. Verify by logging in as spadmin@quickcash.gh and querying
--     contracts → only QuickCash contracts return.
--   - A platform-admin token (admin@lons.io) must see all rows across
--     tenants via the is_platform_admin bypass.

ALTER TABLE aging_bucket_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON aging_bucket_configs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON api_keys FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE billing_cycle_histories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_cycle_histories FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_invoices FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE bnpl_credit_line_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bnpl_credit_line_adjustments FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE bnpl_credit_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bnpl_credit_lines FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE bnpl_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bnpl_transactions FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE collections_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON collections_actions FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contracts FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE credit_limit_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credit_limit_changes FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE credit_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credit_lines FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE customer_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customer_consents FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE customer_financial_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customer_financial_data FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE customer_matching_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customer_matching_rules FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customers FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON debtors FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE disbursement_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON disbursement_fees FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE disbursements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON disbursements FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE drawdowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON drawdowns FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE emi_integration_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON emi_integration_configs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feedbacks FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE installment_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON installment_schedules FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ledger_entries FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE lenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lenders FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE loan_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loan_requests FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE merchant_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON merchant_settlements FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON merchants FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE micro_loan_credit_limit_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON micro_loan_credit_limit_changes FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE notification_mock_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_mock_log FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE notification_provider_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_provider_configs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE operator_approval_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON operator_approval_limits FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE pipeline_step_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pipeline_step_logs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE product_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON product_versions FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reconciliation_exceptions FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reconciliation_runs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE repayment_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON repayment_schedule FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON repayments FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE revenue_distribution_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON revenue_distribution_configs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON roles FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE scorecard_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scorecard_configs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE scoring_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scoring_results FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE screening_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON screening_results FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE settlement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON settlement_lines FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE settlement_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON settlement_runs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON survey_responses FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE tenant_billing_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_billing_configs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE upgrade_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON upgrade_requests FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE wallet_account_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON wallet_account_mappings FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE wallet_provider_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON wallet_provider_configs FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_endpoints FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant', true)
  );

ALTER TABLE message_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON message_recipients FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR (
      tenant_id IS NOT NULL
      AND tenant_id::text = current_setting('app.current_tenant', true)
    )
  );

ALTER TABLE platform_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform_messages FOR ALL
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR (
      tenant_id IS NOT NULL
      AND tenant_id::text = current_setting('app.current_tenant', true)
    )
  );

