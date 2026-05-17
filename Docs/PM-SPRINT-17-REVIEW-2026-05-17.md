# PM Sprint 17 Review

**Author:** Project Manager (Claude)
**Date:** 2026-05-17
**Sprint:** 17 — Scoring/EMI Integration + Entity Management + BA Fix Items
**Delivery Notes:** `DELIVERY-NOTES-SPRINT-17-2026-05-17.md`
**Total SP:** ~58 (15 items across 3 tracks)
**Tests:** 1,235 / 1,236 pass (1 pre-existing failure inherited from Sprint 16)

---

## 1. Executive Summary

Sprint 17 delivered all 15 items across three tracks. The architecture is sound — EMI data pipeline with circuit breaker/retry, configurable scorecards with product→tenant→default fallback chain, customer de-duplication with hash-column lookups for encrypted fields, and comprehensive financial profile/credit summary services. The Track C BA fix items from Sprints 15/16 are properly implemented.

However, the review uncovered **0 P1**, **7 P2**, and **12 P3** findings. The P2 findings include float arithmetic on monetary values (2 instances), a missing integration test file, two functional bugs in EMI config service, a partial-failure window in tenant onboarding, and a missing `updated_at` column violating CLAUDE.md conventions.

**PM verdict: CONDITIONAL SIGN-OFF.** All P2 items must be addressed in a fix cycle before Sprint 18.

---

## 2. Delivery Matrix

| Track | Theme | Items | SP | PM Verdict |
|---|---|---|---|---|
| A | Scoring & EMI Integration | 6 | 31 | CONDITIONAL |
| B | Entity Management | 4 | 23 | CONDITIONAL |
| C | BA Fix Items | 5 | 4 | PASS (S17-FIX-3 scope-downed, acceptable) |

---

## 3. Consolidated Findings

### P2 — Must Fix (7 total, ~5 SP estimated)

| ID | Track | Item | Description | Est SP |
|---|---|---|---|---|
| F-S17-1 | A | S17-2 | `EmiIntegrationConfigService.findById()` never decrypts credentials. The `toDecrypted()` helper calls a sync method that always returns null. The async `getDecryptedCredentials()` works correctly but isn't used by `findById()`. This will break real EMI adapter wiring. | 0.5 |
| F-S17-2 | A | S17-2 | `deactivateEmiIntegrationConfig` GraphQL resolver always throws after deactivation. `deactivate()` sets both `isActive: false` AND `deletedAt: new Date()`, then `findById()` filters `deletedAt: null`, returning null and causing a post-deactivation error. | 0.5 |
| F-S17-3 | A | S17-2 | No unit tests for `EmiIntegrationConfigService`. The dev prompt explicitly requires `emi-integration-config.service.spec.ts` and CLAUDE.md requires 80%+ coverage. This service handles credential encryption/decryption — the most security-sensitive operation in Track A. The bugs in F-S17-1 and F-S17-2 would have been caught by tests. | 1.5 |
| F-S17-4 | B | S17-7 | API key creation runs outside the onboarding transaction. If `ApiKeyService.createApiKey()` fails after the tenant transaction commits, the tenant exists without API credentials and there's no compensating mechanism, status flag, or retry flow. The code acknowledges this with an inline TODO. | 1 |
| F-S17-5 | B | S17-9 | `repaymentScore` uses float division: `Math.round((onTimeEntries / totalScheduleEntries) * 100)`. While both operands are integers from `.count()` and practical precision risk is near-zero, this violates the stated Decimal math requirement. Use `divide()` + `bankersRound()` from `@lons/common`. | 0.5 |
| F-S17-6 | C | S17-FIX-2 | Float arithmetic in the idempotent restore path of `bnpl-credit-line.service.ts`: `const candidate = (Number(prev) + Number(amount)).toFixed(4)`. This is JS float addition on monetary values. The unkeyed path correctly uses raw SQL Decimal arithmetic, but the keyed (idempotent) path uses `Number()`. Use `add()` from `@lons/common`. | 0.5 |
| F-S17-7 | Migration | Schema | `customer_financial_data` table missing `updated_at TIMESTAMPTZ` column. CLAUDE.md requires all tables to have both `created_at` and `updated_at`. The Prisma model also lacks `updatedAt`. | 0.5 |

### P3 — Advisory (12 total)

| ID | Track | Item | Description | Disposition |
|---|---|---|---|---|
| F-S17-8 | A | S17-4 | Scorecard engine treats null factor values as 0, mapping to the lowest band. With weight=0 this is invisible, but tenants enabling `average_balance` with non-zero weight will penalize data-absent customers. | Document in scorecard config guide |
| F-S17-9 | A | S17-1 | `averageBalance` converted via `Number()` in scoring input, losing Decimal precision. Low impact — scoring band thresholds are coarse (50/200/500). | Backlog — Sprint 20 |
| F-S17-10 | A | S17-1 | EMI sync job doesn't call `recordSyncSuccess/Error` on the config service. `lastSyncAt` and `lastSyncError` columns will always be null. | Sprint 18 |
| F-S17-11 | A | S17-5 | `credit_bureau_score` default bands use 0-1000 scale (700+, 500-699, etc.) but the normalizer converts to 0-100. Tenants enabling this factor would see all customers in the lowest band. | Must fix before bureaus enabled (Sprint 19) |
| F-S17-12 | A | S17-1 | `EmiDataService` uses in-memory `Map` cache instead of Redis. Acceptable for single-instance dev; must migrate before scaling. | Backlog — Sprint 20 |
| F-S17-13 | B | S17-7 | No `idempotencyKey` on the `onboard()` mutation. Network retry could create duplicate tenants (slug uniqueness provides partial guard). | Sprint 18 |
| F-S17-14 | B | S17-7 | No audit log entry for tenant onboarding event. `rotateWebhookSigningKey` has audit, but initial onboarding does not. | Sprint 18 |
| F-S17-15 | B | S17-9 | `FINANCIAL_PROFILE_INVALIDATION_EVENTS` const includes `repayment.completed` but no `@OnEvent` decorator is wired for it. Const is out of sync with actual listeners. | Sprint 18 |
| F-S17-16 | B | S17-9 | `defaultRate` uses same float pattern as repaymentScore. Integer division of counts — no practical risk. | Same fix as F-S17-5 |
| F-S17-17 | C | Migration | `customer_matching_rules` missing `deleted_at` column. CLAUDE.md requires soft delete for business data. | Sprint 18 |
| F-S17-18 | B | Cross | `WebhookService` still uses in-memory config store (pre-existing, not S17-caused). Config lost on service restart. | Backlog — Sprint 19 |
| F-S17-19 | A | S17-3 | `PRODUCT_CONFIG_CHANGED` only emits on `maxAmount` decrease, not `minAmount`. Confirmed correct — `minAmount` reduction never violates existing approvals. | Accepted as-is |

---

## 4. Dev-Flagged Follow-Ups Assessment

| § | Item | PM Assessment |
|---|---|---|
| 5.1 | Pre-existing screening test failure | Not S17-caused. Pick up in Sprint 18 as 0.5 SP tech-debt item. |
| 5.2 | EMI sync job needs cron binding | Acceptable deferral. Wire in Sprint 18 when EMI config is read by data service. |
| 5.3 | Wallet adapter call-site migration (FIX-3 scope-down) | **Accepted.** DI plumbing is in place. Full migration belongs in Sprint 18 coordinated wallet-adapter pass. No functional regression since mock adapters work. |
| 5.4 | Tenant onboarding atomicity | **Tracked as F-S17-4 (P2).** Must fix in the fix cycle. |
| 5.5 | EmiIntegrationConfig not read by EmiDataService | Acceptable. Mock adapter is correct for Sprint 17. Per-tenant adapter resolver is Sprint 18+. |
| 5.6 | Sprint-12 recourse walletAdapter.collect TODO | Resolves with §5.3 landing. |
| 5.7 | CustomerMatchingRule backfill for existing tenants | Must ship with Sprint 17 deploy bundle. Add to fix cycle. |
| 5.8 | Customer merge uses `inactive` status + metadata | Acceptable for now. Promoting `merged` to a first-class enum value is Sprint 19 schema work. |
| 5.9 | PRODUCT_CONFIG_CHANGED on minAmount | Confirmed correct — no emit needed. |

---

## 5. Breaking Changes Assessment

| § | Change | Risk | Action |
|---|---|---|---|
| 6.1 | `CustomerService.create()` returns `{ customer, isDuplicate, matchedRule }` | Medium — external integrators of `POST /customers` will see new response shape | Add to API CHANGELOG; review REST controller response mapping |
| 6.2 | `AgingActionService.executeActions()` gains optional `productId` param | Low — existing callers pass it; new callers without it get safe refusal | Acceptable |
| 6.3 | New `@nestjs/event-emitter` dependency | Low — already used elsewhere | Run `pnpm install` in deploy |
| 6.4 | 3 new event types | No risk — additive | Acceptable |
| 6.5 | Onboarding returns secrets in plaintext once | Intentional per FR-SEC-002.3 | Admin portal must surface immediately |

---

## 6. Items Verified as Correct

### Track A Positives
- EMI adapter interface with 5 methods, all amounts as decimal strings
- Mock adapter generates deterministic data via SHA-256 hash of walletId
- Circuit breaker (5-failure threshold, 30s reset) + retry with exponential backoff
- Credential encryption via AES-256-GCM, never exposed in GraphQL responses
- PII masking: `maskWalletId` (last 4 digits), `maskNationalId` from `@lons/common`
- Scorecard fallback chain: product → tenant default → `DEFAULT_SCORECARD`
- New factors (`average_balance`, `credit_bureau_score`, `custom_factors`) all weight=0 — backward compatible
- Pre-qual rules gracefully skip when no EMI data (`passed: true, skipped: true`)
- `MinAverageBalanceRule` uses `compare()` from `@lons/common` for Decimal comparison
- Confidence flags: `_metadata` with `dataCompleteness` enum, `bureauAvailable`, `emiDataAge`
- Bureau consent check: verifies `credit_reporting` consent type with `granted: true` and `revokedAt: null`
- Bureau 10s hard timeout via `Promise.race`, returns null on failure
- RLS on all 4 new tables: ENABLE + FORCE + USING/WITH CHECK + platform-admin bypass
- GraphQL guards: EMI config → `tenant:update`, Scorecard → `product:update`

### Track B Positives
- Webhook signing key encrypted with AES-256-GCM, stored in tenant settings JSON
- Dedup correctly uses hash columns for encrypted fields (`nationalIdHash`, `phonePrimaryHash`, `emailHash`)
- Customer merge reparents all 15 tables with `customerId`, in a single transaction, with idempotency
- Credit summary uses `add()`/`subtract()` from `@lons/common` for ALL monetary aggregations
- Both subscriptions (BNPL/micro-loan) AND credit lines (overdraft) included in credit exposure
- Cache invalidation wired to correct domain events on both profile and summary services
- `CUSTOMER_MERGED` event properly emitted for downstream cache invalidation

### Track C Positives
- `PRODUCT_CONFIG_CHANGE` trigger: full chain (product service emit → listener → evaluator → cap reduction)
- `SUSPEND_BORROWING` defaults to product-scoped with safety guard when `productId` missing
- Post-overdue reminders: idempotent via `payment_overdue_reminder.{days}:{entryId}`, templates registered, configurable per product
- BNPL restore listener: product-type filter correct (only BNPL, not micro-loan/overdraft/factoring)

---

## 7. Sprint 17 Capacity Impact on Sprint 18

| Category | SP |
|---|---|
| Original Sprint 18 scope | ~50 |
| F-S17 P2 fix cycle (7 items) | ~5 |
| F-S17 P3 items pushed to S18 | ~2.5 |
| Pre-existing screening test fix | 0.5 |
| **Total** | **~58 SP** |

Within acceptable ceiling. No shedding required.

---

*References: DELIVERY-NOTES-SPRINT-17-2026-05-17.md, DEV-PROMPT-SPRINT-17.md*
