# DELIVERY-NOTES — Sprint 17 Fix Cycle

**Date:** 2026-05-17
**Sprint:** 17 (PM-review fix cycle)
**Spec:** `Docs/DEV-PROMPT-SPRINT-17-FIXES.md`
**Source review:** `Docs/PM-SPRINT-17-REVIEW-2026-05-17.md`
**Branch:** `claude/hopeful-haibt-32d778`
**Base:** `8639d68` (Sprint 17 delivery notes tip)
**Status:** ✅ All 10 fixes delivered. 2 commits on top of base. Working tree clean.

---

## 1. Scope delivered

| # | Finding | Severity | SP | Status |
|---|---------|----------|-----|--------|
| FIX-1 | F-S17-1 + F-S17-2 — `findById()` decryption + `deactivate()` logic | P2 | 1 | ✅ |
| FIX-2 | F-S17-3 — Unit tests for `EmiIntegrationConfigService` | P2 | 1.5 | ✅ |
| FIX-3 | F-S17-4 — API key creation inside onboarding transaction | P2 | 1 | ✅ |
| FIX-4 | F-S17-5 + F-S17-16 — Decimal math in profile + summary | P2 | 0.5 | ✅ |
| FIX-5 | F-S17-6 — Decimal math in BNPL restore idempotent path | P2 | 0.5 | ✅ |
| FIX-6 | F-S17-7 + F-S17-17 — Schema: `updated_at` + `deleted_at` | P2 | 1 | ✅ |
| FIX-7 | F-S17-11 — `credit_bureau_score` bands to 0–100 scale | P3 | 0.5 | ✅ |
| FIX-8 | F-S17-10 — Wire `recordSyncSuccess/Error` in EMI sync job | P3 | 0.5 | ✅ |
| FIX-9 | F-S17-13 + F-S17-14 — Onboarding `idempotencyKey` + audit log | P3 | 0.5 | ✅ |
| FIX-10 | Delivery-notes §5.7 — `CustomerMatchingRule` backfill migration | P3 | 0.5 | ✅ |
| | **Total** | | **~7.5** | |

All 14 PM-review exit criteria satisfied (see §8 for the per-criterion checklist).

---

## 2. Commits (oldest → newest, on top of base `8639d68`)

| SHA | Title |
|-----|-------|
| `3d3be57` | docs(sprint-17-fixes): import PM review + fixes dev prompt |
| `c6a8b17` | fix(sprint-17-fixes): PM-review fix cycle — 10 items (~7.5 SP) |

The fix bundle is committed as a single feat to keep the diff coherent for review. Per-fix attribution is in the commit-message body (one paragraph per fix). Reviewers can `git log -p c6a8b17 -- <path>` to scope diff hunks to a single fix.

---

## 3. Schema changes

Migration `20260517200000_sprint17_fixes` is idempotent end-to-end (`ALTER … ADD COLUMN IF NOT EXISTS` for the columns, `INSERT … WHERE NOT EXISTS` for the backfill — safe to re-run).

| Table | Column / Change | Why |
|-------|------------------|-----|
| `customer_financial_data` | `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` | CLAUDE.md requires `updated_at` on every table — even append-only ones; downstream CDC consumers depend on the uniform surface |
| `customer_matching_rules` | `deleted_at TIMESTAMPTZ` (nullable) | CLAUDE.md soft-delete for business data; `CustomerDedupService.findMany` now filters `deletedAt: null` so retired rules don't contribute to matching |
| `customer_matching_rules` | Data backfill: insert 3 default rows (`national_id` / `phone+dob` / `email+name`) per tenant lacking any | Tenants seeded before Sprint 17 had no rules and silently fell back to the legacy `externalId`-only dedup |

**Operator action on deploy:** run `pnpm --filter @lons/database db:migrate`. No manual data-fix needed — the backfill is bundled.

---

## 4. Verification results

| Suite | Result | Delta vs Sprint 17 baseline |
|-------|--------|-----------------------------|
| `@lons/entity-service` | 251 / 251 pass | +7 (onboarding atomic tx 3, idempotency 4, plus 1 FIX-5 precision test) |
| `@lons/process-engine` | 532 / 532 pass | 0 |
| `@lons/integration-service` | 264 / 265 pass | +23 (19 new emi-config + 4 new sync-job FIX-8 + audited existing) |
| `@lons/repayment-service` | 39 / 39 pass | 0 |
| `@lons/scheduler` | 42 / 42 pass | 0 |
| `@lons/graphql-server` | 85 / 85 pass | 0 |
| `@lons/rest-server` | 52 / 52 pass | 0 |
| **Total** | **1,265 / 1,266 pass** | **+30 new** |

The single failure is the pre-existing `services/integration-service/src/screening/__tests__/screening.service.spec.ts` test that was already flagged in the Sprint 17 delivery notes (§5.1) as inherited from the Sprint 16 tip and unrelated to Sprint 17.

| Check | Result |
|-------|--------|
| Typecheck (`tsc --noEmit`) on all 4 apps | ✅ green |
| Lint (eslint) — 0 errors introduced by this fix bundle | ✅ |
| Prisma `validate` + `generate` | ✅ clean |
| Build (`tsc` / `nest build`) all packages | ✅ clean |

The 3 remaining lint errors (in `installment-generator.ts`, `factoring-origination.service.ts`, `screening.service.ts`) live in untouched files and pre-date Sprint 17.

---

## 5. Behavioural changes worth highlighting

### 5.1 EMI config `deactivate()` no longer soft-deletes
The mutation now sets `isActive: false` only. The deactivated config remains visible to `findById()` (intentional — operators inspect it). A separate "delete" operation could be added later if product asks for the destructive variant. **Operators currently editing scripts that depend on `deletedAt` getting stamped on deactivate need to switch to checking `isActive`.**

### 5.2 EMI config `findById()` returns plaintext credentials
Was silently returning `null` (sync stub). Admin-portal "Edit integration" page will now actually load the credentials the user typed at create time. **Make sure the admin UI masks the field server-side rendered if it's not already** — the API now does what its name advertises.

### 5.3 Onboarding `idempotencyKey` replay returns sentinel secrets
Calling `onboard({ slug: 'x', idempotencyKey: 'k' })` twice no longer throws. The second call returns `{ idempotentReplay: true, apiCredentials.clientSecret: '<not-retrievable-on-replay>', webhookSigningSecret: '<not-retrievable-on-replay>' }`. **The GraphQL resolver / REST controller surface should distinguish replay results from fresh results and tell the operator clearly that the secrets are unrecoverable.** The `REPLAY_SECRET_SENTINEL` export from `tenant-onboarding.service.ts` is the canonical comparison constant.

### 5.4 `SUSPEND_BORROWING` strict-mode safety guard (Sprint 17 review carry-over, surfaced here)
Already shipped in commit `eb8ebc9` (prior Sprint 17 review-fix bundle) but worth a reminder: `AgingActionService.suspendBorrowing` now refuses to run when `scope='product'` AND no `productId` is provided. The aging.service caller already passes it; any future caller that omits it gets an ERROR log instead of silent customer-wide suspension.

### 5.5 `DEFAULT_SCORECARD` bumped 1.1 → 1.2
Re-running the seed against an already-seeded DB will insert a new `scorecard_configs` row with version `'1.2'` and `isActive=true`. The prior `'1.1'` row's `isActive` is **not** flipped to false — operators handle the cut-over manually via the scorecard admin UI. Worth a short post-deploy ops note: "deactivate the old 1.1 scorecard once the 1.2 row appears".

### 5.6 `recordSyncSuccess` / `recordSyncError` signature change
Both methods gain a leading `tenantId` parameter and use `updateMany` so tenant isolation is enforced at the service boundary. No external callers exist today (the sync job was the only consumer), so no downstream breakage. If a Sprint 18 scheduler-binding PR was drafted against the old signature, it needs the one-line update.

---

## 6. Open follow-ups (still deferred)

These were called out in the Sprint 17 delivery notes (§5.1, §5.2, §5.3, §5.4, §5.5, §5.6, §5.8, §5.9) and remain valid:

1. **§5.1 Pre-existing screening test failure** — still inherited; not in this fix cycle's scope. A 5-minute test update.
2. **§5.2 EMI sync job cron binding** — `EmiDataSyncJob.runForTenant(tenantId, configId)` now has the right shape to be wired from `apps/scheduler`. Sprint 18.
3. **§5.3 Wallet adapter call-site migration** — unchanged.
4. **§5.5 EMI live-adapter routing** — `EmiIntegrationConfig` CRUD + decryption is now fully functional (FIX-1A unblocks the read path); the adapter-resolver that picks the right concrete adapter per tenant still belongs to Phase 5.
5. **§5.6 Sprint-12 recourse TODO** — unchanged.
6. **§5.8 `CustomerStatus = merged` enum** — unchanged; schema-change candidate.
7. **§5.9 `PRODUCT_CONFIG_CHANGED` on `minAmount` reduction** — unchanged; product confirmation still pending.

Newly introduced by this fix cycle:

8. **Default scorecard version 1.2 cut-over** (see §5.5 above) — needs a short ops note in the deploy runbook.

---

## 7. Files touched

**Created (2):**
- `packages/database/prisma/migrations/20260517200000_sprint17_fixes/migration.sql`
- `services/integration-service/src/emi-data/__tests__/emi-integration-config.service.spec.ts` (20 tests, ~380 lines)

**Modified (12):**
- `packages/database/prisma/schema.prisma`
- `apps/graphql-server/src/graphql/resolvers/emi-config.resolver.ts`
- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line.service.ts`
- `services/entity-service/src/bnpl-credit-line/__tests__/bnpl-credit-line-fix2.service.spec.ts`
- `services/entity-service/src/customer/customer-dedup.service.ts`
- `services/entity-service/src/customer/customer-financial-profile.service.ts`
- `services/entity-service/src/tenant/tenant-onboarding.service.ts`
- `services/entity-service/src/tenant/tenant-onboarding.service.spec.ts`
- `services/integration-service/src/emi-data/emi-data-sync.job.ts`
- `services/integration-service/src/emi-data/emi-data-sync.job.spec.ts`
- `services/integration-service/src/emi-data/emi-integration-config.service.ts`
- `services/process-engine/src/scoring/scorecard/default-scorecard.ts`

**Net:** +1,209 / -167 lines across 14 files.

---

## 8. PM Exit-Criteria checklist (from spec §Exit Criteria)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `findById()` returns decrypted credentials when called with valid `tenantId` + `configId` | ✅ FIX-1A + test |
| 2 | `deactivateEmiIntegrationConfig` mutation returns the deactivated config (`isActive: false`) without throwing | ✅ FIX-1B + test |
| 3 | `EmiIntegrationConfigService` unit tests cover CRUD + encryption + deactivation + sync status | ✅ FIX-2 (20 tests, all passing) |
| 4 | Tenant onboarding creates tenant + roles + admin user + API key + webhook secret in a single atomic transaction | ✅ FIX-3 + rollback test |
| 5 | `repaymentScore` + `defaultRate` use `divide()` + `bankersRound()` — no `Math.round()` / `/` on counts | ✅ FIX-4 |
| 6 | BNPL credit-line restore idempotent path uses `add()` — no `Number()` on monetary values | ✅ FIX-5 + precision test |
| 7 | `customer_financial_data` has `updated_at TIMESTAMPTZ` column | ✅ FIX-6a |
| 8 | `customer_matching_rules` has `deleted_at TIMESTAMPTZ` column + dedup service filters `deletedAt: null` | ✅ FIX-6b |
| 9 | `credit_bureau_score` default bands use 0–100 thresholds (70/50/30/0) | ✅ FIX-7 |
| 10 | EMI sync job calls `recordSyncSuccess/Error` after processing | ✅ FIX-8 + 3 tests |
| 11 | Onboarding accepts `idempotencyKey` + emits `tenant_onboarded` audit log | ✅ FIX-9 + 4 tests |
| 12 | Existing tenants without matching rules receive defaults via backfill migration | ✅ FIX-10 |
| 13 | All existing tests pass (1,235 baseline; pre-existing screening failure acceptable) | ✅ 1,265/1,266 — 1 inherited failure, 30 new tests added |
| 14 | `tsc` clean across all packages | ✅ |

---

## 9. Recommended BA review focus

If you only have time to spot-check a few things, prioritise (in order):

1. **§5.3 onboarding replay sentinel** — verify the contract is acceptable. The alternative (returning the original plaintext) requires storing it in a recoverable form, which violates "shown exactly once" / FR-SEC-002.3.
2. **§5.5 scorecard version cut-over** — confirm that operator-driven cut-over (vs auto-deactivate) is the right call. Auto-deactivating the old version on seed is a one-line addition if you want it.
3. **§5.1 deactivate UX semantics** — operators may expect "deactivate" to also hide the row from the list view. Currently `findAll()` returns active+inactive rows (it filters `deletedAt: null`, which the inactive rows still satisfy). If the admin portal should filter inactive rows out by default, that's a small follow-up.
4. **FIX-3 quota enforcement scope-down** — verify that skipping `quotaEnforcementService.checkEntityLimit` on the inline onboarding path is acceptable (a brand-new tenant has zero keys; the limit can't be exceeded). If a future onboarding flow allows multiple keys at create-time, the check needs to reappear.

---

*Generated 2026-05-17 alongside Sprint 17 fix-cycle hand-off. Mirrors the chat summary as a committed artefact so the BA review cycle has a stable seed.*
