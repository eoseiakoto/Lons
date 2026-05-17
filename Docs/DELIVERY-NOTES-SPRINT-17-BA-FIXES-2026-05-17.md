# DELIVERY-NOTES — Sprint 17 BA Fix Cycle

**Date:** 2026-05-17
**Sprint:** 17 (BA-review fix cycle — third and final Sprint 17 pass)
**Spec:** `Docs/DEV-PROMPT-SPRINT-17-BA-FIXES.md`
**Source review:** `Docs/BA-SPRINT-17-FINDINGS-FOR-PM-2026-05-17.md`
**PM disposition:** `Docs/PM-RESPONSE-BA-SPRINT-17-2026-05-17.md` §6
**Branch:** `claude/hopeful-haibt-32d778`
**Base:** `3409c1d` (Sprint 17 PM-fix-cycle delivery notes)
**Status:** ✅ All 6 fixes delivered. 2 commits on top of base. Working tree clean.

---

## 1. Scope delivered

| # | ID | Severity | Finding | SP | Status |
|---|----|---------|---------|-----|--------|
| 1 | FIX-BA-1 | P2 | F-BA-S17-1 + F-BA-S17-2 — `Number()` on scoring input + persistence | 1 | ✅ |
| 2 | FIX-BA-2 | P2 | F-BA-S17-3 — null factors with weight > 0 silently penalised | 1 | ✅ |
| 3 | FIX-BA-3 | P2 | F-BA-S17-4 — no audit log for API key rotation / revocation | 0.5 | ✅ |
| 4 | FIX-BA-4 | P2 | F-BA-S17-5 — overdue reminders hardcoded SMS channel | 1 | ✅ |
| 5 | FIX-BA-5 | P2 | F-BA-S16-3 (Sprint 16 carry-forward) — early-settlement negative quotes | 0.5 | ✅ |
| 6 | FIX-BA-6 | P2 | F-BA-S16-4 (Sprint 16 carry-forward) — template-lookup integration test | 1 | ✅ |
| | **Total** | | | **~5** | |

The two carry-forward items had slipped two sprints. Both are now resolved with tests pinning the behaviour.

All 12 PM-spec exit criteria satisfied (see §7).

---

## 2. Commits (oldest → newest, on top of base `3409c1d`)

| SHA | Title |
|-----|-------|
| `9e3f49a` | docs(sprint-17-ba-fixes): import BA review + findings + PM response + dev prompt |
| `fc6b736` | fix(sprint-17-ba-fixes): BA-review fix cycle — 6 items (~5 SP) |

The fixes ship as a single coherent commit; per-fix attribution lives in the commit message body. Reviewers can `git log -p fc6b736 -- <path>` to scope to a single fix.

---

## 3. Verification results

| Suite | Result | Delta vs prior PM-fix tip |
|-------|--------|---------------------------|
| `@lons/entity-service` | 257 / 257 pass | +6 (FIX-BA-3 api-key rotation audit tests) |
| `@lons/process-engine` | 539 / 539 pass | +7 (FIX-BA-1 ×2 + FIX-BA-2 ×5) |
| `@lons/integration-service` | 264 / 265 pass | 0 (same pre-existing screening failure) |
| `@lons/repayment-service` | 41 / 41 pass | +2 (FIX-BA-5 floor tests) |
| `@lons/scheduler` | 46 / 46 pass | +4 (FIX-BA-4 channel-resolution tests) |
| `@lons/notification-service` | 122 / 122 pass | +5 (FIX-BA-6 template-lookup integration tests) |
| `@lons/graphql-server` | 85 / 85 pass | 0 |
| `@lons/rest-server` | 52 / 52 pass | 0 |
| **Total** | **1,406 / 1,407 pass** | **+24 new** |

The single failing test (`services/integration-service/src/screening/__tests__/screening.service.spec.ts`) is the same pre-existing inherited failure that's been carried since Sprint 16 — out of scope for the BA fix cycle and documented in prior delivery notes.

| Check | Result |
|-------|--------|
| Typecheck (`tsc --noEmit`) on all 4 apps | ✅ green |
| Lint (eslint) — 0 errors introduced by this fix bundle | ✅ |
| Build (`tsc` / `nest build`) all packages | ✅ clean |

The 3 remaining lint errors (`installment-generator.ts`, `factoring-origination.service.ts`, `screening.service.ts`) live in untouched files and pre-date Sprint 17.

---

## 4. Behavioural changes worth highlighting

### 4.1 `scoringResult.score` is now a string everywhere
Pre-fix, the score was persisted as `Number()` (a JS number) — but the column is `DECIMAL(7,2)` and Prisma reads it back as a string anyway. The mismatch meant a single test (`loan-lifecycle.e2e.spec.ts:525`) had been comparing a number it had created itself against `>= 600`. After FIX-BA-1 the read shape is consistently string — that one test was updated to coerce at the boundary. **Any external consumer (analytics ETL, GraphQL clients, etc.) that expected a JS number from this field now gets a string.** Format remains the canonical "1234.56" Decimal-as-string CLAUDE.md mandates.

### 4.2 Customers without EMI/bureau data are no longer penalised
Pre-FIX-BA-2: when a tenant flipped the `average_balance` or `credit_bureau_score` weight off zero, every customer without a sync silently got the lowest-band points on those factors. The new behaviour excludes such factors from both the numerator AND the totalWeight denominator, so the normalisation is over the factors that actually had data. **Tenants currently running custom non-zero weights on these factors will see scores shift upward** for customers without EMI/bureau data — this is the intended correction.

The `_metadata.skippedFactors` array on the persisted `scoringResult.inputFeatures` JSON now lists which factors were excluded — analytics can use it to triage low-confidence scores.

### 4.3 Overdue reminders may now be sent via channels other than SMS
Tenants who configured `notificationConfig.defaultChannel: 'email'` (or push) on a product were silently still getting SMS overdue reminders, costing per-SMS fees on a channel they didn't choose. After FIX-BA-4 the overdue pass honours the same channel-resolution chain as the pre-due pass:

1. per-day override on `paymentReminders.overdueSchedule` (object form: `[{ days: 1, channel: 'push' }, …]`)
2. product `notificationConfig.defaultChannel`
3. `'sms'` absolute fallback

The number-only schedule form (`[1, 3, 7]`) continues to work for tenants that haven't migrated to the object form.

### 4.4 Early-settlement quotes are now floored at zero
A 100% rebate on a contract where unearned interest exceeded the outstanding balance previously produced a negative settlement quote — an obligation to PAY the customer. After FIX-BA-5 the total clamps at `'0.0000'`. **The breakdown still shows the rebate line** so operators can see why the quote landed at zero. Documented for the operations team.

### 4.5 API key rotation + revocation now write audit entries
Previously the rotation service emitted nothing. Now every rotation writes `API_KEY_ROTATED` with `{ previousKeyId, newKeyId, gracePeriodHours }`, and every revocation writes `API_KEY_REVOKED` with `{ revokedAt }`. **No key material, no hashes** — only IDs and lifecycle metadata, per FR-SEC-002.3. Operators auditing key lifecycle should be able to see these starting now.

---

## 5. Files touched

**Created (2):**
- `services/entity-service/src/api-key/api-key-rotation.service.spec.ts` (6 tests, ~160 lines)
- `services/notification-service/src/__tests__/notification.service.integration.spec.ts` (5 tests, ~165 lines)

**Modified (11):**
- `apps/scheduler/src/jobs/payment-reminder.job.ts` (+85 lines: channel resolver + dead-interface removal)
- `apps/scheduler/src/jobs/payment-reminder-fix4.job.spec.ts` (+108 lines: 4 new FIX-BA-4 tests)
- `services/entity-service/src/api-key/api-key-rotation.service.ts` (+42 lines: audit DI + 2 emit sites)
- `services/entity-service/src/api-key/api-key.module.ts` (+3 lines: AuditModule import)
- `services/process-engine/src/scoring/scoring.service.ts` (+30 lines: drop 4 Number() casts, surface skippedFactors)
- `services/process-engine/src/scoring/scoring.service.spec.ts` (+63 lines: 2 new precision tests)
- `services/process-engine/src/scoring/scorecard/scorecard-engine.ts` (+24 lines: null-skip guard + skippedFactors)
- `services/process-engine/src/scoring/scorecard/scorecard-engine.spec.ts` (+106 lines: 5 new null-handling tests)
- `services/process-engine/src/__tests__/loan-lifecycle.e2e.spec.ts` (+2 lines: coerce string score at test boundary)
- `services/repayment-service/src/early-settlement/early-settlement.service.ts` (+12 lines: floor guard)
- `services/repayment-service/src/early-settlement/__tests__/early-settlement.service.spec.ts` (+75 lines: 2 floor tests)

**Net:** +867 / -22 lines across 13 files.

---

## 6. Open follow-ups

Carried over unchanged from `DELIVERY-NOTES-SPRINT-17-FIXES-2026-05-17.md` §5 and `DELIVERY-NOTES-SPRINT-17-2026-05-17.md` §5. No new follow-ups introduced by this fix cycle. Sprint 17 is now ready for hand-off to Sprint 18 once the BA confirms.

Note for Sprint 19 scoring hardening (mentioned in FIX-BA-1 inline comment): the scorecard engine still uses `Number()` for band-matching against the coarse integer thresholds (50/200/500). This is acceptable today because all current bands are integer points well within JS double precision, but a full string-Decimal pass through the engine is on the Sprint 19 scoring backlog.

---

## 7. PM Exit-Criteria checklist

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `scoring.service.ts` — no `Number()` on `averageBalance`, `score`, `recommendedLimit`, `confidence`. All four pass as strings to Prisma. | ✅ FIX-BA-1 |
| 2 | Precision roundtrip test passes for `recommendedLimit` near JS Number boundary. | ✅ FIX-BA-1 (scoring.service.spec) |
| 3 | `scorecard-engine.ts` — null factor with weight > 0 is skipped (not scored as 0). `_metadata.skippedFactors` populated. | ✅ FIX-BA-2 |
| 4 | Null factor with weight = 0 still contributes 0 (backward compatible). | ✅ FIX-BA-2 + dedicated test |
| 5 | `api-key-rotation.service.ts` — AuditService injected. `API_KEY_ROTATED` written on rotation. `API_KEY_REVOKED` written on revocation. No key values in audit details. | ✅ FIX-BA-3 + 6 tests |
| 6 | `payment-reminder.job.ts` — overdue pass resolves channel from product notificationConfig. Fallback chain enforced. | ✅ FIX-BA-4 |
| 7 | Product with `defaultChannel: 'email'` sends overdue reminders via email, not SMS. | ✅ FIX-BA-4 (dedicated test) |
| 8 | `early-settlement.service.ts` — `totalSettlementAmount` floored at `'0.0000'` when rebate exceeds subtotal. | ✅ FIX-BA-5 |
| 9 | Settlement breakdown still shows the rebate line even when total is floored. | ✅ FIX-BA-5 (assertion in floor test) |
| 10 | `notification.service.integration.spec.ts` exists with ≥3 tests covering colon-discriminated eventType lookup. | ✅ FIX-BA-6 (5 tests, exceeds the ≥3 threshold) |
| 11 | All existing tests pass (1,265 baseline; 1 pre-existing screening failure acceptable). | ✅ 1,406/1,407 — 1 pre-existing failure unchanged, 24 new tests pass |
| 12 | `tsc --noEmit` clean across all packages. | ✅ |

---

## 8. Recommended BA review focus

This is the third fix cycle for Sprint 17. The previous two were comprehensive and the changes here are surgical. If you have limited time:

1. **§4.2 customer-without-EMI scoring shift** — review whether the corrected behaviour aligns with product intent. Customers who previously scored low because of missing data will now score based on the factors they DO have. This is a meaningful underwriting-policy change worth a quick PM/Risk eyeball before Sprint 18 ships any tenants onto non-zero weights.
2. **§4.3 overdue channel resolution** — verify that the per-day override + defaultChannel + sms fallback chain is what tenants want. Worth a glance at a tenant config example to confirm the precedence reads correctly.
3. **§4.5 audit log shape** — confirm the audit metadata shape (`{ previousKeyId, newKeyId, gracePeriodHours }` for rotation; `{ revokedAt }` for revoke) matches what the SOC team / compliance reports expect to consume. Easy to extend later if more fields are needed.
4. **§4.1 score as string** — confirm no downstream consumer breaks. Already grepped the codebase; only one call site existed and was fixed. External integrators (if any) need a CHANGELOG note.

---

*Generated 2026-05-17 alongside Sprint 17 BA-fix-cycle hand-off. Third and final fix cycle for Sprint 17 — branch is ready for Sprint 18 kickoff once the BA confirms.*
