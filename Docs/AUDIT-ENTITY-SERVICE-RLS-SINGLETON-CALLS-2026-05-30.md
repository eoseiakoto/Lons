# Audit — entity-service: bare `this.prisma.*` calls on RLS-scoped tables

**Author:** Dev (Claude), via empirical probe + grep
**Date:** 2026-05-30
**Source incident:** DEV-PROMPT-MFA-STATUS-DISPLAY-FIX.md — Cause C
**Status:** Audit only. **Not fixed in this PR** (claude/user-service-rls-fix scoped to UserService + the mfa-card timing). Surfacing for PM scoping.

---

## Why this audit exists

The MFA status display fix uncovered that the `PrismaService` middleware's `if (ctx.tx) return next(params)` short-circuit was written on a flawed assumption: that the in-context `tx` would catch operations dispatched from `this.prisma.*` (the singleton). It doesn't — Prisma routes by which client instance was called, not by what's in `AsyncLocalStorage`. A `this.prisma.user.findFirst()` call dispatches on a pool connection regardless of an ambient ALS tx.

Empirically verified with a Node probe against the real DB as `lons_app`:

```
TEST 1 (no context):                                              NULL
TEST 2 (in enterTenantContext, BARE singleton, ctx.tx set):       NULL — RLS FILTERED
TEST 3 (in enterTenantContext, via tx — what scoped() returns):   OK mfa=true lastLogin=true
```

So every `this.prisma.<rls_model>.*` call in a service that's invoked from a request-handling path is **silently broken under RLS in production** (lons_app role). The symptom is either "User/record not found" thrown by a `findById` guard, or a query returning an empty list with no error.

This document catalogues the remaining offenders across entity-service so the PM can scope a follow-up sweep.

---

## RLS-scoped tables (the at-risk surface)

From `pg_policies` where `policyname = 'tenant_isolation'`:

```
aging_bucket_configs, api_keys, audit_logs, billing_cycle_histories,
billing_invoices, bnpl_credit_line_adjustments, bnpl_credit_lines,
bnpl_transactions, collections_actions, collections_case_transitions,
collections_cases, collections_workflow_configs, contracts,
credit_limit_changes, credit_lines, customer_consents,
customer_financial_data, customer_matching_rules, customers, debtors,
disbursement_fees, disbursements, drawdowns, emi_integration_configs,
feedbacks, field_auth_configs, installment_schedules, invoices,
ledger_entries, lenders, loan_requests, merchant_settlements,
merchants, message_recipients, micro_loan_credit_limit_changes,
notification_mock_log, notification_provider_configs, notifications,
operator_approval_limits, penalty_configs, pipeline_step_logs,
platform_messages, product_versions, products, reconciliation_exceptions,
reconciliation_runs, repayment_schedule, repayments,
revenue_distribution_configs, roles, scorecard_configs,
scoring_results, screening_results, settlement_lines, settlement_runs,
subscriptions, survey_responses, tenant_billing_configs,
upgrade_requests, users, wallet_account_mappings,
wallet_provider_configs, webhook_endpoints, write_off_approvals,
write_off_thresholds
```

Tables NOT in this list (safe to call via singleton): `tenants`, `platform_users`, `plan_tier_configs`, `system_configs`, the `_prisma_migrations` table, and partition children of `audit_logs`. Anything else listed in `\dt` that doesn't appear above is also unscoped — verify per-case.

---

## Per-file bare-singleton call counts

Grep: `this.prisma.X.Y` excluding the safe-list above + lines containing `scoped(`. Counts are upper bounds — manual triage will downgrade some when the call is on a non-RLS model the grep can't disambiguate (e.g. `this.prisma.tenantBillingConfig` IS in the RLS list, `this.prisma.tenant` is NOT).

| Count | File | Notes |
|---:|---|---|
| **12** | `merchant/merchant.service.ts` | High call-count CRUD over `merchants` (RLS-scoped). **P1** for SP merchant ops. |
| **11** | `product/product.service.ts` | `products` + `product_versions` (both RLS). **P1** — every product CRUD likely returns empty. |
| **9** | `customer/customer.service.ts` | `customers` is RLS. KYC dashboard impact. **P1**. |
| **9** | `bnpl-credit-line/bnpl-credit-line-adjustment.service.ts` | `bnpl_credit_line_adjustments` is RLS. **P2** (BNPL only). |
| **8** | `customer/customer-financial-profile.service.ts` | `customer_financial_data` is RLS. **P2**. |
| **7** | `lender/lender.service.ts` | `lenders` is RLS. **P1** — funding-source CRUD. |
| **7** | `customer/customer-credit-summary.service.ts` | Reads `credit_lines`, `repayments`, `contracts` — all RLS. **P2** (read-only). |
| **7** | `bnpl-credit-line/bnpl-credit-line.service.ts` | `bnpl_credit_lines` is RLS. **P2**. |
| **6** | `subscription/subscription.service.ts` | `subscriptions` is RLS. **P1** — billing impact. |
| **6** | `role/role.service.ts` | `roles` is RLS. **P0** — role lookup runs on every auth check. If broken, no permission would resolve. (Likely already-working via some other mechanism — verify first.) |
| **6** | `customer/customer-consent.service.ts` | `customer_consents` is RLS. **P2** (compliance trail). |
| **6** | `anonymization/anonymization.service.ts` | Touches multiple RLS tables for GDPR erasure. **P2** — low frequency, high stakes. |
| **5** | `tenant/upgrade-request.service.ts` | `upgrade_requests` is RLS. **P2** (plan-upgrade flow). |
| **5** | `plan-tier/usage-metrics.service.ts` | Reads across RLS tables for quota enforcement. **P1** — quota would always look like 0 used. |
| **5** | `plan-tier/quota-enforcement.service.ts` | Same. **P1** — quota gate silently passes everything. |
| **4** | `audit/audit.service.ts` | `audit_logs` is RLS. **P1** — append-only audit silently dropping writes is the worst case (compliance). |
| **3** | `tenant/tenant-onboarding.service.ts` | Touches `roles`, `users`, etc. **P1** for first-tenant bootstrap. |
| **3** | `customer/customer-merge.service.ts` | Cross-customer rewrite. **P2**. |
| **3** | `customer/customer-dedup.service.ts` | Same. **P2**. |
| **2** | `auth/field-auth.service.ts` | `field_auth_configs` is RLS. **P2** (PII field-level checks). |
| **2** | `auth/auth.service.ts` | Two remaining (after the prior sweep). Verify if these are still real. |
| **2** | `auth/auth-failure-logger.service.ts` | `audit_logs` is RLS. **P2** (auth audit hygiene). |
| **1** | `user/user.service.ts` | **Just fixed in claude/user-service-rls-fix.** False positive from `this.prisma.scoped()` filtering. |

Reproduce locally:

```bash
cd services/entity-service/src && for f in $(grep -rln "this\.prisma\." --include='*.ts' | grep -v '\.spec\.ts'); do
  c=$(grep "this\.prisma\." "$f" | grep -v scoped | grep -vE "this\.prisma\.(\\\$|tenant\.|platformUser\.|planTierConfig\.|systemConfig\.|enterTenantContext|setTenantContext|setPlatformAdminContext|withTenantContext|onModuleInit|onModuleDestroy)" | wc -l | tr -d ' ')
  if [ "$c" -gt 0 ]; then echo "$c	$f"; fi
done | sort -rn
```

---

## Suggested triage order

1. **P0 — verify-now:** `role.service.ts`. If role lookup is broken at the singleton level, no SP user could log in at all. The fact that login works suggests this path is somehow OK — possibly because the auth flow hits roles INSIDE the in-tx scope of `loginTenantUser`. Worth a 10-minute probe to confirm before scoping.
2. **P1 — silent data loss / compliance:** `audit.service.ts`, `auth-failure-logger.service.ts` (audit writes dropping = compliance issue), `usage-metrics.service.ts` + `quota-enforcement.service.ts` (silently passing every quota check), `customer.service.ts`, `merchant.service.ts`, `product.service.ts`, `lender.service.ts`, `subscription.service.ts`, `tenant-onboarding.service.ts`.
3. **P2 — feature breakage, lower blast radius:** the rest.

---

## Fix pattern (same as the User/Mfa/Auth-service sweeps)

For every public method that touches an RLS-scoped table:

```typescript
async doThing(tenantId: string, ...args): Promise<T> {
  return this.prisma.enterTenantContext({ tenantId }, async () => {
    const tx = this.prisma.scoped();
    // ... use tx.<model>.<action>(...) for every read/write ...
  });
}
```

Nested calls (one wrapped method calling another) become Postgres savepoints — harmless, one extra round-trip. Match the user.service.ts pattern from this PR.

For each fix:
- Distinguishing-mock regression tests (separate `singleton.X` and `scoped.X` jest.fns) — proves the wiring contract.
- Type-check + build all consumer apps.

---

## What's NOT in this audit

- **Services outside `services/entity-service`.** `process-engine`, `repayment-service`, `recovery-service`, `settlement-service`, `reconciliation-service`, `notification-service`, `integration-service`, `analytics-service` — each likely has its own bare-singleton calls on RLS tables. The PrismaService middleware is shared so the bug class applies everywhere. Recommend a parallel grep sweep across the monorepo as a separate audit.
- **REST resolvers and webhooks.** Anything in `apps/rest-server` or `apps/scheduler` that touches Prisma directly bypasses the GraphQL interceptor and is even more likely to be misconfigured.
- **Scheduler jobs (BullMQ workers).** These run outside the request context — they need explicit `enterTenantContext` per job. Worth a separate audit.

---

## Provenance

- Empirical probe: `packages/database/_rls_probe.cjs` (transient — not committed). Reproduces with the snippet in DEV-PROMPT-MFA-STATUS-DISPLAY-FIX response on 2026-05-30.
- PrismaService middleware: `packages/database/src/prisma.service.ts` lines 84–122 — the `if (ctx.tx) return next(params)` short-circuit is the proximate cause.
- This audit was generated as a follow-up to PR claude/user-service-rls-fix (root-cause fix for the MFA status display symptom).
