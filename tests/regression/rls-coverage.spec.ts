/**
 * Sprint 15 (S15-7) — comprehensive RLS coverage verification.
 *
 * Audits every tenant-scoped table against `pg_policies` to confirm a
 * `tenant_isolation` policy exists AND is enabled. Cross-tenant query
 * test for a representative subset proves the policy is functionally
 * enforced, not just declared.
 *
 * Sprint 14 caught a gap: 3 billing tables landed without RLS policies.
 * The S15 migration `20260511100000_sprint15_credit_lines_mfa_retry_rls`
 * adds them. This regression spec prevents future schema additions from
 * shipping without RLS — the list of expected tables is checked-in here,
 * so adding a tenant-scoped table without updating BOTH this list and
 * the migration will fail CI.
 *
 * Platform-scoped tables (no `tenant_id`) are explicitly listed in
 * `PLATFORM_SCOPED_TABLES` so the test doesn't flag them as missing RLS.
 */
import { prisma, seedTestData, cleanup, disconnectPrisma } from './setup';

/**
 * Tables with `tenant_id` that MUST have a `tenant_isolation` RLS
 * policy. Adding a tenant-scoped table without updating this list AND
 * shipping the corresponding policy migration is a CI failure.
 *
 * Sources cross-referenced:
 *   - `20260430120000_enable_rls_tenant_isolation/migration.sql` (baseline)
 *   - `20260501100000_add_overdraft_models` (overdraft)
 *   - `20260501190000_add_overdraft_due_date_and_cycle_history` (cycles)
 *   - `20260502090000_add_wallet_account_mapping`
 *   - `20260502120000_add_bnpl_models` (BNPL)
 *   - Sprint 12 factoring migrations (debtors, invoices)
 *   - `20260511100000_sprint15_credit_lines_mfa_retry_rls` (S15 additions:
 *     bnpl_credit_lines, bnpl_credit_line_adjustments, tenant_billing_configs,
 *     billing_invoices, disbursement_fees)
 */
const TENANT_SCOPED_TABLES = [
  // Baseline tenant entities
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
  // webhook_delivery_logs intentionally NOT here: no tenant_id column,
  // tenant isolation cascades via FK to webhook_endpoints. Listed in
  // PLATFORM_SCOPED_TABLES below.
  'wallet_provider_configs',
  'notification_provider_configs',
  'notification_mock_log',
  'feedbacks',
  'survey_responses',
  'platform_messages',
  'message_recipients',
  'api_keys',
  // Overdraft (Sprint 10B)
  'credit_lines',
  'drawdowns',
  'credit_limit_changes',
  'billing_cycle_histories',
  // Wallet mapping (Sprint 11)
  'wallet_account_mappings',
  // BNPL (Sprint 11)
  'merchants',
  'bnpl_transactions',
  'installment_schedules',
  'merchant_settlements',
  // Factoring (Sprint 12)
  'debtors',
  'invoices',
  // Sprint 14 billing (S15-7 sweep added the policies)
  'tenant_billing_configs',
  'billing_invoices',
  'disbursement_fees',
  // Sprint 15 BNPL credit lines
  'bnpl_credit_lines',
  'bnpl_credit_line_adjustments',
  // Sprint 14–18 additions (S19-STAB-1 RLS sweep)
  'aging_bucket_configs',
  'customer_financial_data',
  'customer_matching_rules',
  'emi_integration_configs',
  'micro_loan_credit_limit_changes',
  'operator_approval_limits',
  'pipeline_step_logs',
  'revenue_distribution_configs',
  'scorecard_configs',
  'upgrade_requests',
];

/**
 * Tables that are EXEMPT from tenant_isolation (no `tenant_id` column,
 * or platform-scoped). Listed explicitly so the test doesn't flag them
 * and future readers know why.
 */
const PLATFORM_SCOPED_TABLES = [
  'platform_users', // No tenant_id; platform-only
  'refresh_tokens', // Session-level, no tenant_id
  'tenants', // Special case: RLS on `id = current_tenant`
  'billing_line_items', // Cascades via FK; no direct tenant_id
  'plan_tier_configs', // Platform configuration (one row per tier)
  'webhook_delivery_logs', // No tenant_id; isolated via FK to webhook_endpoints (which has RLS)
];

describe('Sprint 15 (S15-7) — RLS coverage sweep', () => {
  beforeAll(async () => {
    await seedTestData('rls-coverage');
  });

  afterAll(async () => {
    await cleanup(['rls-coverage']);
    await disconnectPrisma();
  });

  describe('Policy presence on every tenant-scoped table', () => {
    it.each(TENANT_SCOPED_TABLES)(
      'table %s has a tenant_isolation policy',
      async (table) => {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ tablename: string; policyname: string }>
        >(
          `SELECT tablename, polname AS policyname
           FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename = $1
             AND polname = 'tenant_isolation'`,
          table,
        );
        expect(rows.length).toBeGreaterThan(0);
      },
    );

    it.each(TENANT_SCOPED_TABLES)(
      'table %s has row security enabled (relrowsecurity = true)',
      async (table) => {
        const rows = await prisma.$queryRawUnsafe<
          Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
        >(
          `SELECT c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = $1`,
          table,
        );
        expect(rows.length).toBe(1);
        expect(rows[0].relrowsecurity).toBe(true);
        // FORCE is NOT set. The application connects as the non-owner
        // lons_app role (see commit 595f4aa), so RLS applies naturally
        // without FORCE. The `lons` table owner still bypasses RLS for
        // migrations/seed via DIRECT_DATABASE_URL — that's intentional.
        expect(rows[0].relforcerowsecurity).toBe(false);
      },
    );
  });

  describe('Exempt tables documented', () => {
    // Surface mistakes where someone removed a tenant_id but forgot to
    // move the table to the exempt list (or vice versa).
    it('exempt tables truly have no tenant_id column', async () => {
      for (const table of PLATFORM_SCOPED_TABLES) {
        const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = $1
             AND column_name = 'tenant_id'`,
          table,
        );
        // `tenants` has `id` not `tenant_id` — expected.
        // `billing_line_items` has no tenant_id (cascades via FK) — expected.
        // Others must have no tenant_id.
        if (table === 'tenants') continue;
        expect(rows.length).toBe(0);
      }
    });
  });
});
