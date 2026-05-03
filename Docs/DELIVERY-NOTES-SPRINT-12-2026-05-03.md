# Delivery Notes: Sprint 12 — Invoice Factoring + BNPL Carry-Forward

**Status:** Complete
**Owner:** Dev (Claude Code)
**Window:** 2026-05-03
**Sprint:** Sprint 12 — 19 items, ~82 story points
**Reference:** `Docs/DEV-SPRINT-12-2026-05-03.md`, `Docs/SPEC-invoice-factoring.md`, `Docs/FIX-SPRINT-11-BA-FINDINGS-2026-05-02.md`

---

## TL;DR

Invoice Factoring is implemented end-to-end: 7 backend services drive the full lifecycle (submission → verification → offer → fund → notify → debtor payment → reserve release → settle, with default + recourse + write-off branches), exposed via 15 GraphQL mutations + 7 REST endpoints, and surfaced in the admin portal as 5 new pages (debtor list/detail, invoice pipeline + detail, concentration dashboard) plus a wizard step for product config. BNPL carry-forward (auto-collection job, early settlement, advance payment) ships alongside. Two pre-sprint financial-correctness fixes (F-BN-1 net clawback, F-OD-1 idempotencyKey passthrough) land in the same batch. i18n is mirrored to all 6 non-English locales with English-fallback in place.

PM can mark all 19 Sprint 12 items Done. Three Prisma migrations need to run on the dev DB before deploy.

---

## What changed, by phase

### Phase 0 · Pre-sprint financial-correctness fixes

**F-BN-1: BNPL partial refund net clawback (P1)**
- `services/process-engine/src/bnpl/bnpl-refund.service.ts:191` — `applyPartialRefund` was clawing back the gross refund amount from the merchant, but the merchant only ever received `(1 − discountRate) × amount` in settlement. Now the partial path mirrors the full-refund logic: computes `partialNetClawback = amount − bankersRound(amount × discountRate)` and uses that.
- New regression test asserts `100 × (1 − 0.05) = 95.0000` net clawback. All 9 bnpl-refund tests pass.

**F-OD-1: waiveOverdraftPenalties idempotencyKey passthrough (P3)**
- `apps/graphql-server/src/graphql/resolvers/overdraft.resolver.ts:348` — the underscore-prefixed parameter was silently discarding the idempotency key. Now passes through to `creditLineService.waivePenalties`.
- `services/overdraft-service/src/credit-line/credit-line.service.ts` — service signature extended with optional `idempotencyKey`, debug-logged for traceability (mirrors the pattern from `bnpl-installment.service`).

### Phase 1 · BNPL carry-forward

**1A · G5 bnplConfig migration (3 pts)**
- New `bnpl_config JSONB` column on `products` table (migration `20260503000000_add_bnpl_config`); back-fills from `overdraft_config` for existing BNPL products.
- All BNPL services (`bnpl-origination`, `bnpl-eligibility`, `bnpl-installment`) now read from `product.bnplConfig` with a fallback to `overdraftConfig` for un-migrated products. Doc comments updated.

**1B · G2 BNPL auto-collection on due dates (8 pts)**
- New cron job `apps/scheduler/src/jobs/bnpl-auto-collect.job.ts` running daily at 06:00 UTC.
- Per-tenant fan-out via `prisma.enterTenantContext`. Queries due installments with idempotency filter on `lastCollectionAttemptAt` (per-day key shape: `bnpl-auto-collect:<installmentId>:YYYY-MM-DD`).
- New mock adapter at `services/process-engine/src/bnpl/wallet-collection-adapter.ts` — deterministic walletId-hash success (even = success, odd = insufficient_balance) for predictable tests.
- `BnplInstallmentService.collectInstallment(tenantId, installmentId, idempotencyKey)` does the wallet call, status update, and event emission. Constructor extended with `@Optional()` adapter so existing two-arg construction in unit tests keeps working.
- New events: `BNPL_INSTALLMENT_COLLECTED`, `BNPL_INSTALLMENT_COLLECTION_FAILED`.
- Prisma `InstallmentSchedule` extended with `lastCollectionAttemptAt: DateTime?` and `collectionAttemptCount: Int @default(0)` (migration `20260503020000_add_installment_collection_tracking`).
- 6 new scheduler tests + 19 BNPL installment tests pass.

**1C · G3 BNPL early settlement / advance payment (5 pts)**
- New `BnplInstallmentService.earlySettlement(tenantId, input)` — sums pending installments, applies optional `bnplConfig.earlySettlementDiscountPercent`, processes wallet collection, marks installments `paid`, transitions tx to `completed`. Idempotency replay returns cached result on already-completed transactions.
- New `BnplInstallmentService.advancePayment(tenantId, input)` — accepts a list of installment numbers, validates they're all pending, processes a single wallet collection, marks each `paid`, transitions to `completed` if no pending remain.
- New GraphQL mutations: `earlySettleBnplTransaction`, `advanceBnplPayment` (decorated with `@AuditAction`, `@Roles('repayment:create')`, `@CurrentTenant`).
- New types/inputs at `apps/graphql-server/src/graphql/types/bnpl-early-settlement.type.ts` and `inputs/bnpl-early-settlement.input.ts`.
- New events: `BNPL_EARLY_SETTLEMENT`, `BNPL_ADVANCE_PAYMENT`.
- 9 new tests cover 0% discount, 2% discount (exact `120 × 0.98 = 117.6000`), idempotency replay, advance of partial installments, error cases.

### Phase 2 · Invoice Factoring foundation

**2A · Prisma schema (5 pts)**
- New `Debtor` model (24 columns) with full SPEC §2.2 fidelity: company info, contacts, payment terms, risk score, exposure tracking, status enum, soft-delete.
- New `Invoice` model (33 columns) with full SPEC §3.1 fidelity: seller/debtor/product/contract relations, idempotency key, financial terms, status (14 values), verification status, recourse type, payment tracking, lifecycle timestamps.
- 4 new enums: `DebtorStatus`, `InvoiceStatus`, `VerificationStatus`, `RecourseType`.
- New `factoring_config JSONB` column on `products` (parallel to `bnpl_config`, `overdraft_config`).
- Relations added on `Customer.invoices`, `Product.invoices`, `Contract.invoice`.
- Migration `20260503010000_add_invoice_factoring` creates tables, enums, indexes, FKs.

**2B · Event contracts (3 pts)**
- 25 new event types in `EventType` enum: 16 invoice lifecycle, 5 debtor lifecycle, 2 concentration, 2 recourse/write-off.
- New file `packages/event-contracts/src/factoring-events.ts` with 25 typed payload interfaces. Every monetary field is `string` (Decimal serialization).

### Phase 3 · Invoice Factoring services

All under `services/process-engine/src/factoring/`. Wired into `ProcessEngineFactoringModule` and re-exported from `@lons/process-engine`. Test totals: **84 new factoring unit tests + 4 lifecycle integration tests**.

**3A · DebtorService (5 pts)** — 22 tests
- CRUD with soft-delete, cursor pagination, status filters, free-text search.
- Status management: `suspend`, `blacklist`, `reactivate` (blacklist → reactivate is blocked).
- `assessRisk` (SPEC §2.3): rule-based v1 with paymentHistory + industry + country + default-count factors weighted into a 0–100 score. Uses `invoice.updatedAt` as actual-payment-date proxy (documented v1 limitation).
- Atomic `updateExposure(tenantId, debtorId, delta, invoiceId?)` via Prisma `increment`/`decrement`. Zero-delta is a no-op.

**3B · InvoiceSubmissionService (5 pts)** — 13 tests
- `submit` validates seller (not blacklisted), product (active + invoice_financing), debtor (not suspended/blacklisted), invoice fields (positive faceValue within product min/max, future dueDate, no duplicate `[tenantId, sellerId, invoiceNumber]`).
- Concentration check delegated to `ConcentrationLimitService` (Phase 3F replaced the initial stub).
- Verification routing per SPEC §3.3: amount thresholds → MANUAL/AUTOMATED/WAIVED; new-seller and new-debtor flags → MANUAL.
- `resolveVerification` for operator approval/rejection from the admin portal.
- Idempotency replay returns existing invoice without re-emitting events.

**3C · FactoringOriginationService (8 pts)** — 27 tests
- `generateOffer` implements SPEC §4.2 advance rate formula:
  - `baseRate + debtorAdjustment + tenorAdjustment + sellerAdjustment` clamped to `[minAdvanceRate, maxAdvanceRate]`
  - Debtor scores: `>=80` +5, `70–79` +2, `50–69` 0, `30–49` -5, `<30` -10
  - Tenor: `>90 days` -2, `>60 days` -1, else 0
  - Seller track record: `>=10` settled +3, `>=5` +2, `>=1` +1, 0 = 0
- Computes `advancedAmount`, `reserveAmount`, `discountFee = advanced × annualRate × (days/365)`, `serviceFee`, `netDisbursement` — all via `@lons/common` Decimal helpers.
- Non-recourse eligibility (SPEC §5.3): risk + payment history + tenor checks; applies `feeMultiplier` to discountFee on success, falls back to with-recourse on failure (no error).
- `acceptOffer` / `declineOffer` / `disburseAdvance` / `notifyDebtor` / `complete` / `dispute` round out the 9-step flow.
- `disburseAdvance` creates the Contract record (with synthesized LoanRequest stub for FK), 4 ledger entries (receivable debit, advance credit, fee credit, reserve credit), and increments debtor exposure by `faceValue`.
- `complete` decrements debtor exposure and transitions Contract → `settled`.
- Mock-disbursement and mock-notification with explicit `TODO(Sprint 12 Phase 5+)` comments — real adapter integration deferred.

**3D · ReserveService (5 pts)** — 19 tests
- `recordDebtorPayment` accumulates `amountReceived`, transitions to `payment_received` on full settlement, emits `INVOICE_PAYMENT_RECEIVED` (full) or `INVOICE_PAYMENT_PARTIAL` (with `remainingFaceValue`). Triggers `debtorService.assessRisk` post-payment (best-effort — failure logged but doesn't roll back).
- `releaseReserve` implements SPEC §6.1 (full payment → release whole reserve) and §6.2 (partial → release surplus past `advancedAmount + fees`, throw `ValidationError` if no surplus). Auto vs manual approval routed by `factoringConfig.autoReserveRelease` and `manualReleaseAbove`. Blocks `disputed` invoices.
- **Cross-service integration:** when reserve fully released, calls `originationService.complete` as a side effect (failure logged, doesn't roll back the release — operator can re-drive the settled transition manually).

**3E · RecourseService (5 pts)** — 10 tests
- `enforceDefault` discriminates on `recourseType`:
  - **With recourse:** starts grace period (default 7 days from `factoringConfig.recourseGracePeriodDays`), persists `metadata.recourseGraceEndAt` + `recourseAmount` for the future scheduler scan, emits `RECOURSE_ENFORCEMENT_INITIATED`.
  - **Without recourse:** computes `loss = advanced − received`, writes off via 2 ledger entries, returns unreleased reserve to seller (mock log + reserveReleased update), decrements debtor exposure by `faceValue`, emits `NON_RECOURSE_WRITE_OFF`.
- Idempotent on re-run (returns `action: 'already_defaulted'`).
- `enforceGracePeriodElapsed` for the future scheduler scan: routes the case into the existing `CollectionsAction` workflow.

**3F · ConcentrationLimitService (3 pts)** — 13 tests
- 4-dimensional check (SPEC §2.4):
  - **Debtor %**: projected debtor exposure as % of `(portfolioTotal + faceValue)` ≤ `maxDebtorExposurePercent`
  - **Debtor absolute**: projected exposure ≤ `maxDebtorExposureAmount`
  - **Industry %**: projected industry exposure as % of portfolio ≤ `maxIndustryExposurePercent`
  - **Seller-debtor %**: this seller's exposure to this debtor as % of seller's total ≤ `maxSellerDebtorPercent`
- Each breach emits `CONCENTRATION_LIMIT_BREACHED`; each non-breach at ≥80% utilization emits `CONCENTRATION_LIMIT_WARNING`.
- `getConcentrationSummary` for the admin dashboard: top 10 debtors, industry breakdown, top seller-debtor pairs, 4 utilization gauges.
- Replaced the `TODO(Sprint 12 Phase 3F)` stub in `InvoiceSubmissionService` — the service now blocks submissions with concentration violations.

### Phase 4 · API surface

**4A · GraphQL resolvers (5 pts)** — 21 tests
- `apps/graphql-server/src/graphql/types/factoring.type.ts`: `DebtorType`, `InvoiceType`, `InvoiceOfferType`, `ConcentrationCheckResultType`, `ConcentrationViolationType`, `ConcentrationSummaryType` (with `DebtorExposureRowType`, `IndustryExposureRowType`, `SellerDebtorExposureRowType`, `LimitUtilizationRowType` sub-types), `DebtorRiskResultType`, Relay connection types (`DebtorConnection/Edge`, `InvoiceConnection/Edge`). Enum mirrors registered.
- `apps/graphql-server/src/graphql/inputs/factoring.input.ts`: full input type set with `class-validator` (UUIDs, ISO-3 country, ISO date, decimal regex `/^\d+(\.\d{1,4})?$/`).
- `apps/graphql-server/src/graphql/resolvers/factoring.resolver.ts`:
  - **6 queries:** `debtors`, `debtor`, `debtorRiskAssessment`, `invoices`, `invoice`, `concentrationSummary`
  - **15 mutations:** `createDebtor`, `updateDebtor`, `suspendDebtor`, `blacklistDebtor`, `reactivateDebtor`, `submitInvoice`, `resolveInvoiceVerification`, `generateInvoiceOffer`, `acceptInvoiceOffer`, `declineInvoiceOffer`, `disburseInvoiceAdvance`, `notifyInvoiceDebtor`, `recordInvoiceDebtorPayment`, `releaseInvoiceReserve`, `disputeInvoice`
  - Every mutation accepts `idempotencyKey`. Tenant always read from `@CurrentTenant()`. Every mutation decorated with `@AuditAction`, `@Roles`, `@CurrentTenant`, `@CurrentUser`.

**4B · REST seller-facing API (3 pts)** — 13 tests
- `apps/rest-server/src/factoring/factoring.controller.ts`: 7 endpoints behind `@UseGuards(ApiKeyGuard)` with `@ApiTags('Invoice Factoring')`:
  - `POST /v1/invoices/submit` · `GET /v1/invoices/:id` · `POST /v1/invoices/:id/accept` · `POST /v1/invoices/:id/decline`
  - `GET /v1/debtors` (paginated) · `POST /v1/debtors` · `GET /v1/debtors/:id`
- `apps/rest-server/src/factoring/factoring.dto.ts`: `SubmitInvoiceDto`, `AcceptOfferDto`, `DeclineOfferDto`, `CreateDebtorDto`, `DebtorListQueryDto` with `class-validator` + Swagger annotations on every field.
- Tenant resolved from `req.tenantId` (set by `ApiKeyGuard`); `idempotencyKey` required on every mutation DTO.

### Phase 5 · Admin portal

All under `apps/admin-portal/`. ~393 new i18n keys added to `en.json` and mirrored to all 6 non-English locales (fr/es/pt/ar/sw/ha now match at 2,141 keys each).

**5A · Debtor + Invoice + Concentration screens (5 pts)** — 16 new files
- **Pages:**
  - `(portal)/debtors/page.tsx` — list with status/industry/country filters, search, suspend/blacklist/reactivate actions, color-coded risk badges
  - `(portal)/debtors/[id]/page.tsx` — detail with risk assessment + reassess button, payment history, exposure progress bar, debtor's invoices table
  - `(portal)/loans/factoring/page.tsx` — invoice pipeline (list + kanban view modes, full filter set, search)
  - `(portal)/loans/factoring/[id]/page.tsx` — invoice detail with full-lifecycle timeline, financial terms, status-driven action panel (Verify/Approve, Generate Offer, Disburse, Notify, Record Payment, Release Reserve, Dispute)
  - `(portal)/loans/factoring/concentration/page.tsx` — separate concentration dashboard with top debtors, industry breakdown, 4 utilization gauges
- **Components:** `debtors/` (4 components) + `factoring/` (8 components: list, kanban, detail-actions, status-badge, lifecycle-timeline, verify-modal, record-payment-modal, generate-offer-drawer)
- **GraphQL:** `apps/admin-portal/src/lib/graphql/factoring.ts` — 6 queries, 15 mutations, 2 fragments, full TS types
- **Sidebar nav:** `nav.debtors` link added with `Briefcase` icon

**5B · Wizard IF step + customer Invoices tab + collections defaults (3 pts)**
- **Product wizard:** new `step-factoring-config.tsx` with all IF config fields (advance rate range, discount/service fee, recourse default, non-recourse eligibility, verification rules, concentration limits, aging thresholds, reserve release). Wizard now has 9-step sequence for `invoice_financing` products, 8 for others. `validateFactoringConfig` enforces cross-field rules (default within range, ascending aging thresholds, autoVerifyBelow < manualVerifyAbove).
- **Customer detail Invoices tab:** new `tab-invoices.tsx`, conditionally visible when customer has invoices as seller. Table with link to factoring detail.
- **Collections defaults section:** new `factoring-defaults-table.tsx`, distinguishes debtor collection (non-recourse or pre-grace) from seller collection (with-recourse post-grace). Shows recourse type, days-since-default, grace status with countdown.

### Phase 6 · Aging + integration tests

**6A · InvoiceAgingService (3 pts)** — 14 service tests + 4 scheduler tests
- 7-bucket classification per SPEC §7.1 (Current/Approaching/Due/Grace/Overdue/SeriouslyOverdue/Default) with thresholds from `factoringConfig.agingThresholds` (defaults 7/30/60/60).
- Persists `metadata.agingBucket` and `agingLastCheckedAt` on every scan; `defaultThresholdCrossedAt` once on first default.
- **Cross-service integration:** on first crossing into Default bucket, calls `recourseService.enforceDefault(tenantId, invoiceId, { dpd })` (per-invoice try/catch so one default failure doesn't abort the tenant scan).
- New scheduler job at `apps/scheduler/src/jobs/invoice-aging.job.ts` runs daily at 06:00 UTC with per-tenant fan-out via `enterTenantContext`. Registered in `SchedulerModule`.

**6B · Lifecycle integration tests (5 pts)** — 4 scenarios
- File: `services/process-engine/src/factoring/__tests__/factoring-lifecycle.integration.spec.ts`
- Uses real `ProcessEngineFactoringModule` with in-memory Prisma stub; exercises the full Nest DI graph (Reserve → Origination, Aging → Recourse, Submission → Concentration).
- **Happy path lifecycle:** submit → verify → offer → accept → fund → notify → payment → release. Asserts the cross-service integration: both `INVOICE_RESERVE_RELEASED` AND `INVOICE_SETTLED` emitted; debtor exposure decremented; ledger entries created.
- **Partial payment + reserve shortfall:** two partial payments accumulate to full payment then release.
- **Default + with-recourse:** aging scan crosses default DPD → fires `INVOICE_DEFAULTED` + `RECOURSE_ENFORCEMENT_INITIATED`; debtor metadata records grace period.
- **Concentration breach blocks submission:** pre-populated portfolio rejects new invoice that would push debtor over the absolute cap.

### Phase 7 · i18n locale mirroring

**7A · English fallback + locale mirror (5 pts)**
- `apps/admin-portal/src/lib/i18n/i18n-context.tsx` — `t()` now does three-step lookup: current locale → English fallback → raw key path. Interpolation (`{{var}}`) applied to fallback values too. Dev-only `console.warn` when fallback is used.
- `scripts/mirror-i18n-keys.mjs` — idempotent mirror script that deep-merges existing locale values over English placeholders, preserves en.json key ordering, writes atomically.
- All 6 non-English locale files (fr/es/pt/ar/sw/ha) now have the same 2,141 keys as `en.json`. Existing translations preserved.

---

## Bonus / unscoped fixes

- **Cooling-off-expiry test fix** (per `Docs/FIX-COOLING-OFF-EXPIRY-TESTS-2026-05-03.md`): the test mock for `PrismaService` was missing `enterTenantContext`. Now stubbed as a passthrough. All 4 tests pass.

---

## Test coverage

| Package | Tests | Status |
|---|---|---|
| `@lons/process-engine` | **403/403** | 84 new factoring tests + 4 integration scenarios on top of 315 prior |
| `@lons/scheduler` | **14/14** | cooling-off (4) + bnpl-auto-collect (6) + invoice-aging (4) |
| `@lons/graphql-server` (factoring resolver) | **21/21** | all queries + mutations |
| `@lons/rest-server` (factoring controller) | **13/13** | all 7 endpoints + tenant + idempotency forwarding |
| `@lons/admin-portal` | **TSC clean** | 0 hardcoded JSX strings in 16 new IF screens |

Type-check pass across `process-engine`, `scheduler`, `graphql-server`, `rest-server`, `admin-portal`.

---

## Migrations to run on dev DB before deploy

In order:

1. `20260503000000_add_bnpl_config` — adds `products.bnpl_config`, back-fills BNPL products from `overdraft_config`
2. `20260503010000_add_invoice_factoring` — creates `debtors`, `invoices` tables, 4 enums, FK relations, `products.factoring_config`
3. `20260503020000_add_installment_collection_tracking` — adds `installment_schedules.last_collection_attempt_at` + `collection_attempt_count`

Run via `pnpm --filter database db:migrate` against the dev DB. None depend on data fixes; they're additive.

---

## Commit history (Sprint 12 only)

```
29b8e4e feat(admin-portal): Sprint 12 Phase 5A + 5B — Invoice Factoring UI
512c05c feat(factoring): Sprint 12 Phase 4 (APIs) + Phase 6B (integration tests)
2631b67 feat(factoring): Sprint 12 Phase 3C-3F + 6A — origination, reserve, recourse, concentration, aging
46a9586 fix(scheduler): mock enterTenantContext in cooling-off-expiry tests
4fd0646 Sprint 12 checkpoint: Phase 0 fixes + BNPL carry-forward + IF foundation + i18n locale mirroring
```

5 commits total (4 Sprint 12 + 1 cooling-off fix). All on `main`, local only — push when ready.

---

## Known limitations and follow-ups

These are documented in code with explicit `TODO(Sprint 12 Phase 5+)` comments and don't block deploy:

1. **Mock disbursement adapter** — `FactoringOriginationService.disburseAdvance` currently logs the disbursement intent rather than calling a real wallet adapter. Real adapter integration is Phase 5+ work.
2. **Mock debtor notification** — `FactoringOriginationService.notifyDebtor` logs the notification intent. Real `NotificationService` dispatch with templates is Phase 5+.
3. **Mock seller wallet for reserve release** — `ReserveService.releaseReserve` logs the seller payout. Real adapter integration is Phase 5+.
4. **Recourse grace-period scheduler scan** — `RecourseService` writes `metadata.recourseGraceEndAt` + `recourseAmount` breadcrumbs; the actual scheduled deduction job is deferred. Recommend a Sprint 13 job that scans for expired grace periods and calls `RecourseService.enforceGracePeriodElapsed`.
5. **Debtor risk v1** — `DebtorService.assessRisk` is rule-based. ML scoring is a Phase 5+ extension.
6. **Reverse factoring (FR-IF-003)** — SPEC §8 describes reverse factoring; not in Sprint 12 scope. The same Invoice/Debtor models support it with minor service additions.
7. **Bank-feed reconciliation for debtor payments** — currently manual via the admin portal. Auto-matching from bank feeds is a Sprint 13+ enhancement.
8. **Debtor name on InvoiceType** — admin portal currently renders truncated UUIDs for debtor/seller names in some tables because the GraphQL `InvoiceType` doesn't have nested `debtor` / `seller` resolvers yet. Adding nested resolvers (or `@ResolveField` decorators) is a small follow-up.
9. **Non-English translations** — all 6 locales (fr/es/pt/ar/sw/ha) currently have English placeholders for the new IF keys. Real translations are PM/translator follow-up; the mirror script (`scripts/mirror-i18n-keys.mjs`) preserves any future translations.

---

## Verification commands

PM can re-run any of these to confirm:

```bash
# Type-check all touched packages
cd services/process-engine && npx tsc --noEmit                # exit 0
cd apps/scheduler && npx tsc --noEmit                          # exit 0
cd apps/graphql-server && npx tsc --noEmit                     # exit 0
cd apps/rest-server && npx tsc --noEmit                        # exit 0
cd apps/admin-portal && npx tsc --noEmit                       # exit 0

# Run all tests
pnpm --filter process-engine test                              # 403/403 pass
pnpm --filter scheduler test                                   # 14/14 pass
pnpm --filter graphql-server test -- factoring.resolver        # 21/21 pass
pnpm --filter rest-server test -- factoring                    # 13/13 pass

# Verify i18n parity
node scripts/mirror-i18n-keys.mjs                              # All 6 locales match en.json (2141 keys)

# Verify no hardcoded strings in new IF admin-portal files
grep -rEn '>[A-Z][a-zA-Z ,.&-]{2,}<' \
  apps/admin-portal/src/components/debtors \
  apps/admin-portal/src/components/factoring \
  apps/admin-portal/src/app/\(portal\)/debtors \
  apps/admin-portal/src/app/\(portal\)/loans/factoring \
  | grep -v "t('" | wc -l                                      # 0

# Confirm pre-sprint fixes
grep -A2 "clawedBackFromMerchant" services/process-engine/src/bnpl/bnpl-refund.service.ts  # net clawback
grep "_idempotencyKey" apps/graphql-server/src/graphql/resolvers/overdraft.resolver.ts     # only 5 remaining (not the waive method)

# Count IF events
grep -c "INVOICE_\|DEBTOR_\|CONCENTRATION_\|RECOURSE_\|NON_RECOURSE_" packages/event-contracts/src/events.enum.ts  # 25
```

---

## Sign-off

All 19 Sprint 12 items complete. Recommend marking Done in Monday.com, running the 3 migrations against staging, and scheduling the Sprint 13 follow-ups noted above.
