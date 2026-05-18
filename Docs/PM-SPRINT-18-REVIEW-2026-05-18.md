# PM SPRINT 18 REVIEW — 2026-05-18

**Reviewer:** PM Agent
**Sprint:** 18 — Admin Portal + Process Engine + Post-Processing + Fix Items
**Spec:** `Docs/DEV-PROMPT-SPRINT-18.md`
**Delivery notes:** `Docs/DELIVERY-NOTES-SPRINT-18-2026-05-18.md`
**Branch:** `claude/hopeful-haibt-32d778`
**Verdict:** CONDITIONAL SIGN-OFF — 1 P1, 15 P2, 15 P3

---

## Executive Summary

Sprint 18 delivered all 16 items (79.5 SP) with 1,839/1,839 tests passing (+433 vs Sprint 17). Schema migrations, RLS, event contracts, audit constants, and module registrations are structurally sound. Dev's own code-review fix cycle (commit `8532f4a`) resolved two blockers (disbursement retry resume and atomic limit restoration) before hand-off.

**One P1** (manual payment idempotency key) must be fixed before merge — it risks silent payment deduplication in production. **Fifteen P2 findings** span financial-logic edge cases, navigation/i18n gaps, missing integration specs, and wiring issues. **Fifteen P3 findings** are acceptable for backlog.

**Disposition:** Fix cycle required — P1 + all P2s (~9 SP). P3s carry to Sprint 19. Fix prompt to follow this review.

---

## P1 — Must Fix Before Merge

### F-S18-2-A: Manual Payment Idempotency Key Not UUID Per Form Mount

**File:** `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx` (line ~587)
**Spec ref:** S18-2 §2 and delivery notes §5.6
**Issue:** The admin portal's `recordManualPayment` modal derives the idempotency key as `mp:${contractId}:${input.paymentRef}` rather than generating a fresh UUID on each form mount. This means:

1. If an operator makes a payment with ref "PAY-001", gets a timeout, then retries with the same ref (correcting an entry error), the second attempt is silently deduplicated — the operator believes the correction was recorded but the original stale entry persists.
2. Two different operators processing payments with the same `paymentRef` for the same contract produce the same idempotency key, causing cross-operator deduplication.

The delivery notes §5.6 explicitly state the service layer now **requires** a UUID per attempt and that callers relying on the `manual:${paymentRef}` fallback will throw. The portal-side implementation contradicts this.

**Disposition: FIX NOW.** Generate `crypto.randomUUID()` on modal mount and pass as `idempotencyKey`. The `paymentRef` remains a separate display field.

**Risk if unfixed:** Silent payment deduplication in production. Financial data loss.

---

## P2 — Fix in Sprint 18 Fix Cycle

### Financial Correctness

#### F-S18-6-1: Approval Limit Daily Count Filters Wrong Status

**File:** `services/process-engine/src/approval/approval-limit.service.ts` (line ~238)
**Spec ref:** S18-6 §1
**Issue:** The DB fallback query (used when Redis is unavailable) filters `LoanRequest` by status `'accepted'` to count daily approvals. The correct terminal status after operator approval is `'offer_accepted'` (see `loan-request-state-machine.ts`). Daily count returns zero on Redis outage, allowing operators to exceed approval limits.

**Disposition: FIX NOW.** Change status filter to `'offer_accepted'`. Add a unit test for the DB fallback path.

#### F-S18-8-1: Plan-Tier Quota Counter Not Decremented on Permanent Failure Rollback

**File:** `services/process-engine/src/disbursement/disbursement.service.ts`
**Spec ref:** S18-8, delivery notes §6.7
**Issue:** When a disbursement permanently fails and rolls back to CANCELLED, the subscription limit is atomically restored (§5.4), but the plan-tier `monthlyDisbursementVolume` Redis counter is NOT decremented. Enough failures inflate the tenant's usage meter to quota even though no money moved.

Dev deferred to Sprint 19 as "M2." However, this counter drives the S18-11 billing dashboard and could gate future disbursements for metered tiers.

**Disposition: FIX NOW.** Decrement Redis counter in the permanent-failure rollback path. Cannot leave billing dashboard showing phantom usage.

#### F-D-6: usageHistory Gated at @RequiresPlan('growth')

**File:** `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts` (line ~170)
**Spec ref:** S18-ENH
**Issue:** The `usageHistory` resolver is gated with `@RequiresPlan('growth')`, blocking Starter-tier tenants from viewing their billing history. The spec does not specify a plan gate — all tenants should see their own billing data.

**Disposition: FIX NOW.** Remove the plan gate. All tenants see their own billing history. Only upgrade-request _submission_ has tier logic.

### Navigation & i18n

#### F-S18-5-A: API Key Management Page Not in Sidebar Navigation

**File:** `apps/admin-portal/src/app/(portal)/settings/api-keys/page.tsx`
**Spec ref:** S18-5 §5
**Issue:** Page exists at `/settings/api-keys` but is unreachable from sidebar navigation.

**Disposition: FIX NOW.** Add "API Keys" entry under Settings in sidebar.

#### F-S18-11-A: Billing & Plan Page Not in Sidebar Navigation

**File:** `apps/admin-portal/src/app/(portal)/settings/billing/page.tsx`
**Spec ref:** S18-11 §6
**Issue:** Same as above — page exists but not linked.

**Disposition: FIX NOW.** Add "Billing & Plan" entry under Settings in sidebar.

#### F-S18-X-1: i18n Keys Render as Raw Key Strings (~80–100 Missing Keys)

**Files:** Admin portal pages across S18-1, S18-2, S18-4, S18-5, S18-11
**Spec ref:** All Track A items
**Issue:** Delivery notes §6.5 acknowledge this. All `t('...')` calls render as dotted key names. Estimated 80–100 missing keys across 5 new pages.

**Disposition: FIX NOW.** Grep for `t('` across new pages, populate all missing entries in locale JSON.

### Test Coverage

#### F-S18-7-1: Missing Pipeline Audit Trail Integration Spec

**File:** (expected) `services/process-engine/src/pipeline/__tests__/pipeline-audit.integration.spec.ts`
**Spec ref:** S18-7 §7
**Issue:** Spec explicitly requires an integration test that runs a full pipeline and verifies `pipeline_step_logs` rows. Unit tests exist; the end-to-end integration path is untested.

**Disposition: FIX NOW.** Add the integration spec as specified.

#### F-S18-12-1: Pipeline Log Duplication (2× Rows Per Failure)

**File:** `services/process-engine/src/pipeline/pipeline-retry.service.ts`, `pipeline-retry.worker.ts`
**Spec ref:** S18-12 §3, delivery notes §6.8
**Issue:** Both the worker's `handleStepFailure` and the step's `executeAndLog` write to `pipeline_step_logs`, producing 2× rows per attempt. Dev deferred as "I5."

The audit trail is append-only — duplicate rows cannot be cleaned retroactively. Leaving this means every retry permanently inflates the log table and makes analysis ambiguous.

**Disposition: FIX NOW.** Choose single logging owner. Add `isRetry` flag to step execution context so one side defers.

### Wiring & Integration

#### F-C-1: Portfolio Metrics Resolver Missing Filter Arguments

**File:** `apps/graphql-server/src/graphql/resolvers/collections.resolver.ts` (lines ~259–264)
**Spec ref:** S18-10 §1
**Issue:** `portfolioMetrics` resolver accepts no filter args. The underlying service supports them, but the resolver doesn't wire them through. Dashboard shows unfiltered aggregates only.

**Disposition: FIX NOW.** Add `PortfolioMetricsFilterInput` arg and pass through to service.

#### F-D-4: WALLET_ADAPTER Production Override Not in app.module.ts

**File:** `services/process-engine/src/disbursement/disbursement.module.ts` (line ~39), `apps/graphql-server/src/app.module.ts`
**Spec ref:** S18-FIX-2
**Issue:** `DisbursementModule` provides `WALLET_ADAPTER` with mock default. The composition-root override for production is missing — production would silently use the mock.

**Disposition: FIX NOW.** Add `WALLET_ADAPTER` provider override in `app.module.ts` resolving real adapter in non-test envs.

---

## P3 — Accepted for Backlog (Sprint 19)

| # | Finding | Risk | Notes |
|---|---------|------|-------|
| F-S18-1-B | Escalation lacks assignee dropdown | Low | Manual queue assignment is viable |
| F-S18-1-C | Review page missing filter badge chips | UX only | Filters work, state not visually shown |
| F-S18-3-A | PDF export missing non-Latin font embedding | Low | Address for francophone expansion |
| F-S18-4-A | Settlement dashboard hard-codes USD | Acceptable | Schema change needed — delivery notes §6.6 |
| F-S18-4-B | Settlement dashboard missing date range picker | UX only | No functional impact |
| F-S18-7-2 | Audit trail viewer not in admin portal UI | Low | Data queryable via GraphQL |
| F-S18-9-A | Tiered distribution missing boundary validation | Low | Admin-only, low frequency |
| F-S18-9-B | Waterfall model missing priority collision guard | Low | Rare config, add unique constraint |
| F-S18-10-A | Portfolio metrics missing caching layer | Perf only | Add in ops-hardening pass |
| F-S18-11-B | Plan comparison modal missing feature tooltips | UX polish | No functional impact |
| F-S18-11-C | PlanTierConfig seed data not added | Dev/staging | Prod gets config during onboarding |
| F-S18-14-A | Invoice queue missing bulk operations | UX efficiency | Acceptable for v1.0 volumes |
| F-S18-ENH-A | Billing history table missing pagination | UX/perf | Not blocking for launch |
| F-S18-ENH-B | estimatedFees missing currency in response | Acceptable | Same as multi-currency deferral |
| F-S18-DOC-1 | Missing SPEC-plan-tiers.md canonical seed values | Documentation | Operational, not functional |

---

## Verified PASS Items

The following items were reviewed and confirmed correctly implemented:

- **S18-FIX-1A** — Dead `FINANCIAL_PROFILE_INVALIDATION_EVENTS` entry removed. `@OnEvent` handlers match.
- **S18-FIX-1B** — `console.error` → `this.logger.error` in tenant onboarding.
- **S18-FIX-1C** — Screening service spec fixed. Integration service 265/265 green.
- **S14-11** — `assignedVerifierId` correctly used for claim; `verifiedBy` reserved for decision stamp.
- **S18-8 atomic restoration** — `updateMany` with `{ increment: amount }` confirmed DB-side atomic.
- **S18-9 revenue distribution** — All 4 models with Decimal math throughout.
- **RLS** — All 4 new tables have USING + WITH CHECK, platform-admin bypass, FORCE ROW LEVEL SECURITY.
- **Event contracts** — 5 new event types registered. All state transitions emit correctly.
- **Audit constants** — 9 new `AuditActionType` + 1 new `AuditResourceType`. Decorators on all mutations.
- **Money safety** — No `Number()` or `parseFloat()` on monetary values in new code.
- **Module registrations** — All services registered. `app.module.ts` has 6 new resolvers + AnalyticsServiceModule.
- **BullMQ pipeline retry** — Queue registered. Worker delegates to `retryDisbursementForContract` (resume, not recreate).
- **TOCTOU protection** — Partial unique index on `upgrade_requests` prevents duplicate pending requests.

---

## Fix Cycle Scope

**P1 (1 item, ~1 SP):**
- F-S18-2-A: UUID idempotency key on modal mount

**P2 (10 items, ~8 SP):**

| Finding | Category | Est. |
|---------|----------|------|
| F-S18-6-1 | Financial correctness | 0.5 SP |
| F-S18-8-1 | Financial correctness | 1 SP |
| F-D-6 | Plan gate removal | 0.5 SP |
| F-S18-5-A | Sidebar navigation | 0.25 SP |
| F-S18-11-A | Sidebar navigation | 0.25 SP |
| F-S18-X-1 | i18n key population | 2 SP |
| F-S18-7-1 | Integration test | 1 SP |
| F-S18-12-1 | Log deduplication | 1 SP |
| F-C-1 | Resolver wiring | 0.5 SP |
| F-D-4 | Wallet adapter override | 1 SP |

**Total fix cycle: ~9 SP**

---

## Next Steps

1. Write Sprint 18 fix prompt for Dev (incorporating all P1 + P2 dispositions above)
2. After fix cycle delivery, verify all 11 fixes
3. Update Monday.com Sprint 18 items to Done
4. Create Sprint 19 items for the 15 P3 backlog items
5. Proceed to Sprint 19 dev prompt

---

*Review conducted 2026-05-18 against delivery notes and source code in branch `claude/hopeful-haibt-32d778`. Three parallel review agents covered Tracks A/D, Tracks B/C, and cross-cutting concerns.*
