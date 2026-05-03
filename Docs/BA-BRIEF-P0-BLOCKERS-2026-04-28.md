# BA Briefing Note for PM: Platform Audit — Go-Live Blockers & P1 Remediation Plan

**From:** BA (Claude)
**To:** PM (Claude)
**Date:** 2026-04-28
**Priority:** CRITICAL — Project Owner confirmed all three P0s as go-live blockers
**Reference:** Full audit (49 active findings + 1 withdrawn) at `Docs/BA-PLATFORM-AUDIT-2026-04-28.md`
**Revised:** 2026-04-30 — Incorporated PM delivery review findings; updated finding counts and added portal context. P2-022 (skip link) withdrawn after BA code verification confirmed it is already implemented.

---

## Context

BA completed a full codebase audit on 2026-04-28 covering backend services, portals, database schema, security, financial integrity, test suite, event contracts, end-to-end loan lifecycle, CI/CD pipeline, and shared packages. The audit was revised on 2026-04-30 to incorporate findings from the PM's portal rebuild delivery review (`Docs/PM-NOTES-FOR-BA-DELIVERY-REVIEW-2026-04-27.md`). The audit now contains 49 active findings: 3 P0, 15 P1, 21 P2, and 10 P3 (plus 1 withdrawn P2 — skip link was already implemented).

Emmanuel reviewed the three P0s and confirmed them as go-live blockers. This briefing covers all 3 P0 blockers (with fix specifications) and all 15 P1 items (with sprint allocation recommendations). PM needs to produce dev prompts and schedule remediation.

**Portal rebuild context:** Dev delivered a 60+ page portal visual rebuild on 2026-04-26 (presentation-only, no business logic changes). Emmanuel approved the mission-control aesthetic and emerald brand color. The portal rebuild does NOT address any P0 or P1 findings in this briefing — those are all backend/security/data issues. The visual polish is ahead of the platform's security and data integrity posture. PM should be aware that 9 Sprint 8 functional items also remain open (business logic not implemented). See full details in the PM delivery review notes.

---

## Blocker 1: Float-for-Money at Service Boundaries

**The rule:** "NEVER use float or number for monetary amounts." (CLAUDE.md)

**The problem:** The Decimal library and Prisma schema are correct, but precision is destroyed at every boundary: GraphQL inputs use `Float` type, REST controllers call `parseFloat()`, and services cast `Number()` on Decimal strings before database writes. This is pervasive — it affects process-engine, repayment-service, settlement-service, and the report resolver.

**Affected files (minimum — Dev should grep for completeness):**

| File | Lines | Issue |
|---|---|---|
| `apps/graphql-server/src/graphql/inputs/create-loan-request.input.ts` | 16-19 | `requestedAmount` as `Float`/`number` |
| `apps/graphql-server/src/graphql/inputs/create-product.input.ts` | 37-47, 66-69 | `minAmount`, `maxAmount`, `interestRate` as `Float` |
| `apps/graphql-server/src/graphql/inputs/update-product.input.ts` | 17, 23, 41 | Same fields |
| `apps/graphql-server/src/graphql/resolvers/repayment.resolver.ts` | 19 | `amount` arg as `Float` |
| `apps/graphql-server/src/graphql/resolvers/report.resolver.ts` | 207-241, 273-315 | Float accumulation for totals |
| `apps/rest-server/src/repayment/repayment.controller.ts` | 52 | `parseFloat(body.amount)` |
| `services/repayment-service/src/payment/payment.service.ts` | 17, 51-54, 75-80 | `amount: number` input; `Number()` before writes |
| `services/settlement-service/src/settlement.service.ts` | 60, 83-87, 98-102, 155-171 | `Number()` on all settlement amounts |
| `services/process-engine/src/contract/contract.service.ts` | 30, 35 | `Number(lr.approvedAmount)` |
| `services/process-engine/src/interest-accrual/interest-accrual.service.ts` | 91, 93 | `Number(amount)` for ledger |
| `services/process-engine/src/penalty/penalty.service.ts` | 57, 59, 95, 130, 132 | `Number()` on penalty amounts |
| `services/process-engine/src/exposure/exposure.service.ts` | 157, 168 | `parseFloat` for threshold calc |

**What Dev needs to do:**

1. Change all GraphQL `@Field(() => Float)` money fields to `@Field(() => String)`. Update corresponding TypeScript types to `string`.
2. Change all service method signatures from `amount: number` to `amount: string`.
3. Remove all `Number()` casts before Prisma writes. Prisma accepts `string` values for `Decimal` columns directly.
4. Replace float accumulation in `report.resolver.ts` with `Decimal.js` aggregation using the existing `packages/common/src/financial/decimal.util.ts`.
5. Add a shared type `type MoneyString = string` in `packages/shared-types/` to make intent explicit.
6. Grep the entire codebase for `Number(` and `parseFloat(` on any variable named `amount`, `balance`, `principal`, `interest`, `fee`, `penalty`, `revenue`, `share` — fix all.

**Estimated scope:** 12-15 files across 6 services/apps. No schema migration needed. Tests will need updating for string inputs.

**Suggested sprint:** Sprint 10 (immediate).

---

## Blocker 2: Row-Level Security Not Implemented on Core Tables

**The rule:** "Every database table in tenant schemas uses Row-Level Security (RLS). Tenant context is resolved from JWT and set as a PostgreSQL session variable." (CLAUDE.md, Docs/10)

**The problem:** Only 4 ancillary tables have RLS (notification_provider_configs, notification_mock_log, feedbacks, survey_responses). All core tables — customers, contracts, loan_requests, repayments, ledger_entries, etc. — have no RLS. The `SET app.current_tenant` session variable is never called.

Multi-tenancy relies entirely on application-level `WHERE tenantId = ?`. A single missed filter leaks cross-tenant data.

**What Dev needs to do (recommended two-phase approach):**

**Phase A — Enable RLS on all tenant-scoped tables:**

1. Write a migration that for each tenant-scoped table:
   - `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
   - `ALTER TABLE <table> FORCE ROW LEVEL SECURITY;` (applies to table owner too)
   - `CREATE POLICY tenant_isolation ON <table> USING (tenant_id = current_setting('app.current_tenant')::uuid);`

2. Wire `SET LOCAL app.current_tenant = $1` into the request lifecycle. This should execute at the start of every database transaction, using the `tenantId` from the JWT. Use Prisma's `$transaction` with a raw query at the top, or use a Prisma middleware that runs before every query.

3. Important: `SET LOCAL` scopes the variable to the current transaction. This means all queries within a single request must share a transaction, OR the session variable must be set per-query.

4. Platform admin queries that need cross-tenant access should use a separate Prisma client instance that does NOT set the tenant context (or sets a bypass role).

**Phase B — Fix unsafe raw SQL:**

5. Replace `$executeRawUnsafe` in `prisma.service.ts:23` with parameterized `$executeRaw`:
   ```typescript
   await prisma.$executeRaw`SET LOCAL app.current_tenant = ${tenantId}`;
   ```

6. Same for `audit-partition-manager.ts:31,57`.

**Tables requiring RLS policies (all tenant-scoped):**
tenants, users, roles, customers, customer_consents, subscriptions, products, product_versions, lenders, loan_requests, scoring_results, contracts, repayment_schedule_entries, repayments, disbursements, ledger_entries, settlement_runs, settlement_lines, reconciliation_runs, reconciliation_exceptions, collections_actions, notifications, webhook_endpoints, webhook_delivery_logs, notification_provider_configs, notification_mock_log, feedbacks, survey_responses, screening_results, messages, message_recipients.

**Estimated scope:** 1 migration file (large but mechanical), 1 middleware change, audit of raw queries. Schema is not changing — this is policy-only.

**Suggested sprint:** Phase A in Sprint 10, Phase B in Sprint 11.

---

## Blocker 3: No Global AuthGuard on GraphQL Server + CORS Wildcard

**The rule:** "All user inputs validated and sanitized. CORS, CSRF, rate limiting configured on all public endpoints." (CLAUDE.md, Docs/10)

**The problem:** Three compounding gaps:

1. `apps/graphql-server/src/app.module.ts` registers `TenantThrottlerGuard` as `APP_GUARD` but NOT `AuthGuard` or `RolesGuard`. Resolvers are unauthenticated by default.

2. CORS is `origin: *` on both servers (`graphql-server/src/main.ts:39`, `rest-server/src/main.ts:35`). Any website can make cross-origin requests.

3. Platform portal defaults JWT role to `platform_admin` when token lacks a role claim (`auth-context.tsx:61`). Every authenticated user is effectively admin.

4. Admin portal has no per-route RBAC beyond the `/platform` section. The `hasPermission` function exists but is only used in one place.

**What Dev needs to do:**

1. Register `AuthGuard` as global `APP_GUARD` in `graphql-server/src/app.module.ts`. Create a `@Public()` decorator for explicitly public endpoints (health check, login mutation). All other resolvers become authenticated by default.

2. Register `RolesGuard` as global `APP_GUARD` after `AuthGuard`. Use `@Roles()` decorator on resolvers that need specific role restrictions.

3. Same for `rest-server/src/app.module.ts`.

4. Configure CORS with explicit allowed origins:
   ```typescript
   app.enableCors({
     origin: [
       process.env.ADMIN_PORTAL_URL,
       process.env.PLATFORM_PORTAL_URL,
     ],
     credentials: true,
   });
   ```

5. Remove the platform portal role default. If JWT lacks a role claim, reject the token (redirect to login).

6. Add middleware-level route guards in both portals. The admin portal's `hasPermission()` function should be used in layout.tsx files for each section, not just the platform section.

**Estimated scope:** 4-5 files for the server-side changes. Portal RBAC middleware is additional but lower risk.

**Suggested sprint:** Sprint 10 (server-side auth + CORS), Sprint 11 (portal RBAC middleware).

---

## All P1 Items for PM Scheduling

These are not go-live blockers but must be scheduled before launch. Items P1-007 through P1-015 were identified during the extended audit (test suite, event contracts, loan lifecycle trace, CI/CD pipeline).

### Security & Data Integrity (Sprint 10–11)

| ID | Issue | Suggested Sprint | Notes |
|---|---|---|---|
| P1-001 | SQL injection in tenant context setter (`$executeRawUnsafe`) | Sprint 10 | Bundle with RLS work (Blocker 2 Phase B) |
| P1-002 | No token revocation mechanism (compromised refresh tokens valid 7 days) | Sprint 11 | Requires token blacklist table + cleanup job |
| P1-003 | PII logged in notification sandbox adapters (phone, email, fullName) | Sprint 10 | Quick fix — mask fields in console/log adapters |
| P1-004 | Schema drift — RefreshToken and ApiKey tables in DB but missing from Prisma schema | Sprint 10 | Run `prisma db pull` then align schema |
| P1-005 | 14 foreign key columns lack indexes (performance at scale) | Sprint 11 | Mechanical migration — generate from FK list |
| P1-006 | JWT payload contains PII (email, name in base64-encoded token) | Sprint 11 | Remove PII from token; fetch from DB on demand |

### Loan Lifecycle Chain Breaks (Sprint 10–11)

| ID | Issue | Suggested Sprint | Notes |
|---|---|---|---|
| P1-012 | No GraphQL mutation for manual loan approval | Sprint 10 | `ApprovalService.approveManual()` exists but no resolver exposes it. Loans in `manual_review` are stuck. Blocks semi-auto and manual approval workflows (Docs/05). |
| P1-013 | No inbound payment webhook endpoint | Sprint 11 | No REST handler for wallet providers to push payment callbacks. Production repayment flow is broken for all wallet-backed products (MTN MoMo, M-Pesa). |

### Event Architecture (Sprint 11–12)

| ID | Issue | Suggested Sprint | Notes |
|---|---|---|---|
| P1-009 | 25 events defined but never emitted (dead schemas) | Sprint 11 | All 14 entity lifecycle events + 11 process events never fire. Webhook subscribers will not receive entity notifications. |
| P1-010 | correlationId never propagated between chained events | Sprint 12 | Every event gets a fresh UUID — breaks event chain traceability for audit and debugging. |
| P1-011 | contract.state_changed payload mismatch between services | Sprint 11 | `aging.service.ts` emits correct shape; `adaptive-actions.service.ts` emits non-conforming `{ suggestion, reason }`. |

### Test & CI/CD Quality (Sprint 11–12)

| ID | Issue | Suggested Sprint | Notes |
|---|---|---|---|
| P1-007 | Coverage thresholds not enforced across services | Sprint 11 | Only `packages/common` has a threshold (70%, below 80% target). All service jest configs lack `coverageThreshold`. |
| P1-008 | Reconciliation service has zero tests | Sprint 10 | Critical financial batch operation with no test coverage whatsoever. |
| P1-014 | No coverage enforcement in CI | Sprint 11 | `pnpm test` runs without `--coverage`. 80% CLAUDE.md requirement has no gate. |
| P1-015 | Production deploy has no E2E gate | Sprint 12 | `deploy-production` job has `needs: []` — relies solely on GitHub environment protection rules. |

---

## Recommended Sprint Allocation Summary

| Sprint | P0 Work | P1 Work |
|---|---|---|
| **Sprint 10** | All 3 blockers (Float-for-money, RLS Phase A, AuthGuard + CORS) | P1-001 (SQL injection, bundle with RLS), P1-003 (PII in logs), P1-004 (schema drift), P1-008 (reconciliation tests), P1-012 (manual approval resolver) |
| **Sprint 11** | RLS Phase B, Portal RBAC middleware | P1-002 (token revocation), P1-005 (FK indexes), P1-006 (JWT PII), P1-009 (dead events), P1-011 (payload mismatch), P1-013 (payment webhook), P1-007 (coverage thresholds), P1-014 (CI coverage) |
| **Sprint 12** | — | P1-010 (correlationId propagation), P1-015 (E2E production gate) |

---

*PM: Please produce dev prompts for the three P0 blockers and schedule them in Sprint 10. The full audit with 49 active findings (3 P0, 15 P1, 21 P2, 10 P3) is at `Docs/BA-PLATFORM-AUDIT-2026-04-28.md`. Note: P2-022 (skip-to-main-content link) has been withdrawn — BA verified the implementation is already correct in both portals (admin-portal line 55-59, platform-portal line 55-59). PM should update Monday.com item 11853861568 to Done. BA will separately produce the platform portal i18n sizing (P2-006, Sprint 13).*
