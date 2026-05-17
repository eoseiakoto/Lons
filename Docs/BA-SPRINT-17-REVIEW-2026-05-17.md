# BA Sprint 17 Review

**Date:** 2026-05-17
**Sprint:** 17 (~58 SP + ~7.5 SP fix cycle)
**Reviewer:** BA Agent
**Verdict:** CONDITIONAL SIGN-OFF (0 P1, 5 P2, 8 P3)

---

## 1. Executive summary

Sprint 17 delivered 15 items across three tracks: scoring and EMI integration (31 SP), entity management (23 SP), and five BA fix items from Sprints 15/16 (4 SP). A 10-item fix cycle (~7.5 SP) addressed PM-review findings, bringing the test total to 1,265 (1,266 minus the inherited screening-test failure).

The architecture is sound. The EMI data pipeline with circuit breaker, retry, and credential encryption (AES-256-GCM) is well-built. The configurable scorecards with product-to-tenant-to-default fallback chain work correctly. Customer de-duplication correctly uses hash-column lookups for encrypted fields, and the merge operation reparents all 15 FK tables atomically. Credit summary and financial profile services use Decimal math from `@lons/common` throughout.

All five Sprint 15/16 BA deferred findings are substantively resolved in Track C. However, two Sprint 16 BA P2 findings (F-BA-S16-3 early settlement floor at zero, F-BA-S16-4 template lookup integration test) were designated for immediate fix before Sprint 17 kickoff and remain unimplemented. These carry forward as open items.

Five new P2 findings were identified, primarily around Decimal compliance violations in scoring inputs and a missing audit trail on API key rotation. Eight P3 findings are documented for PM disposition.

---

## 2. Delivery matrix

| Track | Theme | Items | SP | BA Verdict |
|---|---|---|---|---|
| A | Scoring & EMI Integration | 6 | 31 | CONDITIONAL |
| B | Entity Management | 4 | 23 | CONDITIONAL |
| C | BA Fix Items (S15/S16) | 5 | 4 | PASS |
| — | PM Fix Cycle | 10 | 7.5 | PASS |

---

## 3. Sprint 15/16 BA deferred findings — closure status

### Track C items (all five CLOSED)

| BA Finding | S17 Item | Status | Notes |
|---|---|---|---|
| F-BA-S15-3 (trigger enum) | S17-FIX-1 | **CLOSED** | `PRODUCT_CONFIG_CHANGE` added to trigger enum. `ProductService.update` emits `PRODUCT_CONFIG_CHANGED` on `maxAmount` decrease using `compare()`. Listener calls evaluator which caps affected credit lines. Confirmed `minAmount` does not emit (correct — reductions never violate existing approvals). |
| F-BA-S15-4 (advancePayment credit restore) | S17-FIX-2 | **CLOSED** | `BnplRepaymentRestoreListener` subscribes to `REPAYMENT_RECEIVED`, filters BNPL product type, calls `restoreAvailableLimit`. Atomic SQL path uses `LEAST(available_limit + amount, approved_limit)`. Idempotent path uses `add()` from `@lons/common`. PM P2 F-S17-6 (float in idempotent path) confirmed fixed. |
| F-BA-S15-11 (shared wallet adapter) | S17-FIX-3 | **CLOSED** (scope-downed) | DI plumbing in place: `WALLET_DISBURSEMENT_ADAPTER` and `WALLET_COLLECTION_ADAPTER` injected via `@Optional()`, fields explicitly marked unused. No call-site migration — deferred to Sprint 18 coordinated pass. Acceptable: existing mock adapters work, no functional regression. |
| F-BA-S16-2 (post-overdue reminders) | S17-FIX-4 | **CLOSED** | `PaymentReminderJob` fires at configurable overdue offsets (default 1d/3d/7d). Idempotent via `payment_overdue_reminder.{daysPastDue}:{entryId}`. Templates registered for SMS, email, push, and in-app. Product-configurable via `notificationConfig.paymentReminders.overdueSchedule`. One finding — see F-BA-S17-5. |
| F-BA-S16-5 (product-scoped suspension) | S17-FIX-5 | **CLOSED** | `suspendBorrowing` accepts `productId` parameter. Defaults to `scope: 'product'`. Safety guard: refuses to run when `scope='product'` and no `productId` provided (ERROR log + return). Aging service passes `contract.productId`. Correct. |

### Sprint 16 BA P2 immediate fixes (NOT in Sprint 17 scope — carry-forward)

| BA Finding | Expected Fix | Status | Notes |
|---|---|---|---|
| F-BA-S16-3 (early settlement total not floored at zero) | Pre-Sprint 17 immediate fix | **STILL OPEN** | No commit in the branch history addresses this. `early-settlement.service.ts` still computes `subtract(subtotal, interestRebate)` without a floor guard. A 100% rebate where `interestRebate > subtotal` produces a negative quote. |
| F-BA-S16-4 (template lookup integration test) | Pre-Sprint 17 immediate fix | **STILL OPEN** | No `notification.service.integration.spec.ts` exists. The `split(':')[0]` mechanism at `notification.service.ts:28` is in place and functional, but has no test coverage. A template-registry refactor could silently break all reminders. |

**Action required:** Both carry-forward items must be tracked and resolved. Combined estimate: 1.5 SP.

---

## 4. Track-by-track analysis

### 4.1 Track A: Scoring & EMI Integration

Core architecture is solid. Key verifications passed:

- **EMI adapter interface**: All methods present. All monetary amounts as decimal strings. Mock adapter generates deterministic data via SHA-256 hash of walletId.
- **Circuit breaker**: 5-failure threshold, 30s reset, 3 retries with exponential backoff. Properly wired.
- **Credential encryption**: AES-256-GCM via `encryptToString`/`decryptFromString`. GraphQL resolver returns `credentialsSet: boolean` only — never exposes decrypted credentials.
- **PII masking**: walletId masked to `***XXXX`, nationalId via `maskNationalId` from `@lons/common`.
- **Scorecard fallback chain**: product → tenant default → hardcoded `DEFAULT_SCORECARD`. Works correctly.
- **Pre-qual rules**: Both `min_transaction_count` and `min_average_balance` gracefully skip when no EMI data (`passed: true, skipped: true, skipReason`).
- **Bureau consent check**: Verifies `credit_reporting` consent with `granted: true` and `revokedAt: null` before calling bureau.
- **Bureau timeout**: `Promise.race` with 10s hard timeout. Returns null on failure — scoring proceeds without bureau data.
- **Confidence metadata**: `_metadata` with `dataCompleteness`, `bureauAvailable`, `emiDataAge`, `scoredAt` all present.
- **GraphQL guards**: EMI config → `tenant:update`, Scorecard → `product:update`. Correct.
- **RLS**: All 4 new tables have ENABLE + FORCE + USING/WITH CHECK + platform-admin bypass.
- **Min-average-balance rule**: Uses `compare()` from `@lons/common` for decimal string comparison. Correct.
- **Default scorecard bureau bands**: Fix cycle corrected to 0-100 scale matching normalizer output.
- **EMI sync job**: Fix cycle wired `recordSyncSuccess`/`recordSyncError` with proper try/catch.

#### Findings

| ID | Sev | Description |
|---|---|---|
| F-BA-S17-1 | P2 | **`averageBalance` converted via `Number()` in scoring input** (`scoring.service.ts:204-205`). `averageBalance30d` comes from a `DECIMAL(19,4)` column but is cast with `Number()`. This is a monetary amount and violates CLAUDE.md's Decimal requirement. The PM flagged this as F-S17-9 (P3) noting "scoring band thresholds are coarse." BA escalates to P2: this sets a precedent for float arithmetic on monetary data, and the same pattern will break if thresholds become granular. Should remain as a string and use `compare()` for band lookup. |
| F-BA-S17-2 | P2 | **`score` and `recommendedLimit` stored via `Number()` in Prisma create** (`scoring.service.ts:116,121`). Both values are decimal strings from `bankersRound()` but are converted to `Number()` before being stored. `recommendedLimit` is a monetary amount and should be passed as a string for Prisma Decimal coercion. |
| F-BA-S17-3 | P2 | **Null factor values treated as 0 → lowest band penalty** (`scorecard-engine.ts:36`). When a factor value is `null`/`undefined`, `Number(value)` produces `0`, mapping to the lowest band (typically 10 points). With `weight=0` this is invisible, but tenants enabling `average_balance` or `credit_bureau_score` with non-zero weight will penalize data-absent customers. The engine should skip null factors (exclude from totalWeight) or use a configurable "no data" default. PM flagged as F-S17-8 (P3); BA escalates to P2 because this directly affects scoring accuracy for production tenants. |

### 4.2 Track B: Entity Management

Core financial logic is sound. Key verifications passed:

- **Onboarding atomicity**: Fix cycle moved API key creation inside `$transaction` block. Confirmed at `tenant-onboarding.service.ts:255`.
- **Onboarding idempotency**: `idempotencyKey` accepted. Replay returns sentinel values for unrecoverable secrets per FR-SEC-002.3.
- **Webhook signing key**: AES-256-GCM encrypted via `encryptToString()`. Plaintext returned only in initial onboarding response.
- **Customer dedup hash columns**: `FIELDS_REQUIRING_HASH` maps encrypted fields through `computeSearchableHash()`. No cleartext comparison.
- **Customer merge**: All 15 FK tables reparented in single `$transaction`. Idempotent via audit log lookup.
- **`CUSTOMER_MERGED` event**: Properly emitted for downstream cache invalidation.
- **Financial profile Decimal math**: After fix cycle, `repaymentScore` and `defaultRate` use `divide()`/`bankersRound()`. Monetary aggregates use Prisma `.toString()`.
- **Credit summary Decimal math**: All rollups use `add()`/`subtract()` from `@lons/common`.
- **Credit exposure**: Both subscriptions AND credit lines (overdraft) included.
- **Onboarding audit**: Fix cycle added audit log entry with masked email.
- **Schema fixes**: `updated_at` added to `customer_financial_data`, `deleted_at` added to `customer_matching_rules`, backfill migration for existing tenants. All confirmed.

#### Findings

| ID | Sev | Description |
|---|---|---|
| F-BA-S17-4 | P2 | **API key rotation has no audit log** (`api-key-rotation.service.ts:11-62`). `rotateApiKey()` calls `logger.log()` but does not write to `AuditService`. Key rotation is security-sensitive (FR-SEC-002.3 requires audit trail for credential changes). Compare with `rotateWebhookSigningKey` which has audit logging, and onboarding which was given audit in the fix cycle. |

### 4.3 Track C: BA Fix Items

All five items verified as closed (see §3 above).

#### Findings

| ID | Sev | Description |
|---|---|---|
| F-BA-S17-5 | P2 | **Post-overdue reminders hardcoded to SMS channel** (`payment-reminder.job.ts:311`). The overdue reminder pass always sends via `channel: 'sms'`. Pre-due reminders respect the product config's per-entry `channel` field. If a product configures `overdueSchedule` but expects email delivery, reminders still go via SMS. Should read channel from product notification config or default to same channel logic as the pre-due pass. |

---

## 5. PM fix cycle verification

All 10 fix items confirmed correct:

| Fix | Description | Status |
|---|---|---|
| FIX-1 | `findById()` decryption + `deactivate()` logic | ✅ findById returns decrypted credentials; deactivate sets `isActive: false` only (no deletedAt) |
| FIX-2 | EMI config unit tests (20 tests) | ✅ Covers CRUD, encryption, deactivation, sync status |
| FIX-3 | API key inside onboarding transaction | ✅ Atomic with tenant/roles/admin |
| FIX-4 | `repaymentScore` + `defaultRate` Decimal math | ✅ Uses `divide()` + `bankersRound()` |
| FIX-5 | BNPL restore idempotent path Decimal | ✅ Uses `add()` from `@lons/common` |
| FIX-6 | `updated_at` on customer_financial_data + `deleted_at` on customer_matching_rules | ✅ Migration confirmed, dedup service filters `deletedAt: null` |
| FIX-7 | Bureau score bands to 0-100 scale | ✅ Thresholds now 70/50/30/0 matching normalizer output |
| FIX-8 | EMI sync job calls `recordSyncSuccess/Error` | ✅ With proper try/catch and tenantId parameter |
| FIX-9 | Onboarding `idempotencyKey` + audit log | ✅ Replay returns sentinel secrets; audit log with masked email |
| FIX-10 | CustomerMatchingRule backfill migration | ✅ Idempotent `INSERT...WHERE NOT EXISTS` per tenant |

---

## 6. Consolidated findings

### P2 — Must fix (5 total, ~3.5 SP estimated)

| ID | Track | Item | Description | Est SP |
|---|---|---|---|---|
| F-BA-S17-1 | A | S17-1 | `averageBalance` converted via `Number()` losing Decimal precision in scoring input. Monetary amount violates CLAUDE.md. Use string + `compare()` for band lookup. | 0.5 |
| F-BA-S17-2 | A | S17-1 | `score` and `recommendedLimit` stored via `Number()` in Prisma create. `recommendedLimit` is monetary — should pass string for Prisma Decimal coercion. | 0.5 |
| F-BA-S17-3 | A | S17-5 | Null factor values treated as 0 → lowest band penalty. When tenants enable `average_balance` or `credit_bureau_score` with non-zero weight, data-absent customers are penalized. Engine should skip null factors or use configurable default. | 1 |
| F-BA-S17-4 | B | S17-7 | API key rotation missing audit log. `rotateApiKey()` does not call `AuditService`. FR-SEC-002.3 requires audit trail for credential changes. | 0.5 |
| F-BA-S17-5 | C | S17-FIX-4 | Post-overdue reminders hardcoded to SMS channel. Pre-due reminders respect product config's channel field; overdue pass ignores it. | 1 |

### P3 — PM to disposition (8 total)

| ID | Track | Description | Suggested disposition |
|---|---|---|---|
| F-BA-S17-6 | A | In-memory Map cache in `EmiDataService` has no LRU cap or upper bound. Long-running sync of thousands of wallets grows without limit. | Sprint 20 (pre-scaling) |
| F-BA-S17-7 | A | `scoreNum = Number(score)` for limit band lookup in scorecard engine. Should use `compare()` consistently. Low practical risk (integer-like thresholds). | Sprint 19 (scoring hardening) |
| F-BA-S17-8 | B | `FINANCIAL_PROFILE_INVALIDATION_EVENTS` includes `repayment.completed` but no `@OnEvent` is wired and no producer emits this event. Constant out of sync with actual listeners. | Sprint 18 |
| F-BA-S17-9 | B | Onboarding audit failure caught with `console.error` instead of structured `this.logger.error()`. Bypasses log formatting, PII masking, and observability pipelines. | Sprint 18 |
| F-BA-S17-10 | B | Customer merge audit log written after transaction commits. Gap window where merge succeeds but idempotency record is lost. Low risk since `updateMany` is idempotent for reparent pattern. | Accepted (document risk) |
| F-BA-S17-11 | C | BNPL `restoreAvailableLimit` idempotent path writes adjustment record with computed `newLimit`, but actual SQL uses `LEAST(...)` independently. Audit trail could disagree with DB under concurrent restores. | Accepted (document risk) |
| F-BA-S17-12 | C | `suspendBorrowing` scope default via JavaScript undefined-triggers-default semantics works correctly but could be explicit with `action.scope ?? 'product'` for clarity. | Accepted as-is |
| F-BA-S17-13 | — | Sprint 16 BA P2 immediate fixes (F-BA-S16-3 + F-BA-S16-4) still unimplemented. Not Sprint 17's fault — these were supposed to ship pre-S17. | Must track as carry-forward (1.5 SP) |

---

## 7. Breaking changes assessment

| Change | BA Assessment |
|---|---|
| `CustomerService.create()` returns `{ customer, isDuplicate, matchedRule }` | **Medium risk.** External integrators of `POST /customers` see new response shape. Must be documented in API CHANGELOG. REST controller response mapping should be verified. |
| Onboarding returns secrets in plaintext once | **Intentional per FR-SEC-002.3.** Admin portal must surface immediately. Replay returns sentinel values — correct. |
| Onboarding replay returns sentinel secrets | **Acceptable.** Alternative (storing recoverable plaintext) violates "shown exactly once." |
| Default scorecard version 1.2 | **Needs ops note.** Seed inserts `1.2` without deactivating `1.1`. Operators must manually cut over via scorecard admin UI. |

---

## 8. Business requirements compliance

| Requirement | Sprint 17 Coverage | Status |
|---|---|---|
| FR-DI-001.1 (EMI data pull) | S17-1 | MET |
| FR-DI-001.2 (EMI config) | S17-2 + FIX-1/FIX-2 | MET |
| FR-DI-002.4 (Credit bureau wiring) | S17-3 | MET |
| FR-CS-001.1 (Configurable scorecards) | S17-4 | MET |
| FR-CS-001.2 (New scoring factors) | S17-5 + FIX-7 | MET (weight=0 backward compat) |
| FR-PQ-001.2 (Pre-qual rules) | S17-6 | MET |
| FR-SP-001.2 (Auto-provision API credentials) | S17-7 + FIX-3/FIX-9 | MET |
| FR-CM-001.3 (Customer de-duplication) | S17-8 + FIX-10 | MET |
| FR-CM-002.1 (Financial profile) | S17-9 + FIX-4 | MET |
| FR-CM-003.1 (Credit summary) | S17-10 | MET |
| CLAUDE.md (Decimal math) | All tracks + FIX-4/FIX-5 | PARTIAL — F-BA-S17-1, -2 still use Number() |
| CLAUDE.md (updated_at on all tables) | FIX-6 | MET |
| CLAUDE.md (soft delete) | FIX-6 | MET |
| FR-SEC-002.3 (Credential audit trail) | FIX-9 (onboarding) | PARTIAL — F-BA-S17-4 (rotation) missing |
| BA S15 deferred findings | Track C | ALL CLOSED (5/5) |
| BA S16 immediate P2 fixes | Pre-S17 | STILL OPEN (0/2) |

---

## 9. Verdict

**CONDITIONAL SIGN-OFF.** Sprint 17 is a well-executed delivery that closes all five deferred BA findings from Sprints 15/16, implements the full scoring and EMI integration pipeline with proper financial-grade architecture, and builds a solid entity management layer with customer dedup, financial profiles, and credit summaries. The PM fix cycle was thorough — 30 new tests and three schema corrections.

Five P2 findings require resolution before Sprint 18 can build on the scoring and notification infrastructure. Two carry-forward items from Sprint 16 (F-BA-S16-3 and F-BA-S16-4, combined 1.5 SP) remain unaddressed and must be tracked.

Total estimated fix effort: ~3.5 SP for the 5 P2 items, plus the 1.5 SP carry-forward from Sprint 16.

---

*Document prepared by: BA Agent | 2026-05-17 | Sprint 17 Review v1.0*
