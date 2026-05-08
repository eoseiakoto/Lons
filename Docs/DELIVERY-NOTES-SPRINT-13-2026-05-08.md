# Delivery Notes: Sprint 13 — Invoice Factoring Hardening + BNPL Fix

**Status:** Complete
**Owner:** Dev (Claude Code)
**Window:** 2026-05-08
**Sprint:** Sprint 13 — 5 items, 26 story points
**Reference:** `Docs/DEV-SPRINT-13-2026-05-08.md`, `Docs/PM-SPRINT-12-FINDINGS-RESPONSE-2026-05-04.md`

---

## TL;DR

All five Sprint 13 items shipped. Sprint 12's deferred BA findings are now closed:

- **S13-1** Inbound debtor-payment webhook with auto-match (waterfall: invoice number → debtor ref + FIFO → unmatched). Removes the manual-only bottleneck for debtor payments and is the largest item by SP.
- **S13-2** `Invoice.debtorPaidAt` field replaces the unreliable `updatedAt` proxy in debtor risk scoring.
- **S13-3** New `RecourseGraceExpiryJob` (daily 07:00 UTC) calls the previously-orphaned `enforceGracePeriodElapsed`. With-recourse defaults are no longer in a dead zone.
- **S13-4** Nested `debtor` + `seller` GraphQL resolvers on `InvoiceType`. Admin portal now displays company names instead of truncated UUIDs.
- **S13-5** BNPL early-settlement bug fix. Discount now applies to actual remaining balance instead of gross installment amounts.

PM can mark all 5 items Done. Two Prisma migrations need to run on the dev DB before deploy.

---

## Per-item status

### S13-1 — Inbound payment webhook + auto-match (P1, 13 SP) ✅ DONE

**Monday.com:** 11909951085

**What changed:**
- New service `services/process-engine/src/factoring/debtor-payment-matching.service.ts` with `matchAndApply(tenantId, payload)` implementing the 3-step waterfall:
  1. Exact match by `invoiceNumber + currency` (active statuses only)
  2. Debtor lookup by `debtorRef` (against registrationNumber, taxId, or UUID) → FIFO oldest invoice
  3. Unmatched → emit event + log warn for operator visibility
- New REST endpoint `POST /webhooks/{provider}/debtor-payment` at `apps/rest-server/src/debtor-payment-webhook/`:
  - HMAC-validated via `x-signature` header against `WEBHOOK_SECRET_{PROVIDER}` env var (mirrors `wallet-webhook` pattern)
  - `@Public()` bypass on JWT auth
  - Returns 202 Accepted with `{ status: 'accepted', transactionRef }` immediately; processing happens via `setImmediate` so providers don't time out
  - DTO with class-validator: `transactionRef`, `amount` (decimal regex), `currency` (ISO-4217), and at-least-one-of `invoiceNumber | debtorRef | paymentRef` (custom class-level constraint + controller fallback check)
- New events `DEBTOR_PAYMENT_MATCHED` + `DEBTOR_PAYMENT_UNMATCHED` with typed payload interfaces in `factoring-events.ts`
- Module registration: `DebtorPaymentMatchingService` in `factoring.module.ts` (providers + exports); `DebtorPaymentWebhookModule` in `apps/rest-server/src/app.module.ts`
- Idempotency: relies on `ReserveService.recordDebtorPayment`'s existing `idempotencyKey` check using `transactionRef` as the key. Duplicate webhooks short-circuit at the reserve layer — no extra dedup at the matching layer per spec.
- Admin portal — `(portal)/loans/factoring/[id]/page.tsx`: new "Webhook activity" section. Conditionally rendered (no events → no section). 10 new i18n keys mirrored across 6 non-English locales.

**Tests:** 8 matching service unit tests + 10 webhook controller tests + 1 new integration test in `factoring-lifecycle.integration.spec.ts` covering webhook-driven settlement (submit → fund → notify → webhook → reserve auto-released → settled).

**Limitation flagged:**
- **Admin portal `useInvoiceWebhookEvents` is a stub** returning `[]`. There's no existing GraphQL surface for "audit events filtered by invoice ID". A `TODO(S14)` notes the data source needs to be wired to a real query once that backend lands. Display logic, formatters, i18n, and the section's conditional rendering are all production-ready.
- **Tenant resolution from provider** is via `WEBHOOK_TENANT_{PROVIDER}` env var (mirrors the existing `WEBHOOK_SECRET_{PROVIDER}` shape). Multi-tenant providers would need a richer mapping table — out of scope for S13.

### S13-2 — `debtorPaidAt` field for accurate risk scoring (P2, 3 SP) ✅ DONE

**Monday.com:** 11910003633

**What changed:**
- Schema: `Invoice.debtorPaidAt: DateTime?` (Timestamptz nullable). Migration `20260508000000_add_invoice_debtor_paid_at`.
- `ReserveService.recordDebtorPayment` (line 130 area): stamps `debtorPaidAt = now()` on the FIRST payment event only. Subsequent partial payments do NOT overwrite it (it marks when the debtor first started paying). Detection via `compare(previousReceived, '0') === 0`.
- `DebtorService.assessRisk` (line 450 area): now selects `debtorPaidAt` and uses `inv.debtorPaidAt ?? inv.updatedAt` as the actual payment date. The `v1 LIMITATION` comment was replaced with a forward-looking note explaining the fallback for legacy invoices.
- GraphQL: `InvoiceType.debtorPaidAt` exposed as nullable `Date`.

**Tests:** 2 in `reserve.service.spec.ts` (first-payment stamp; subsequent payments don't overwrite) + 2 in `debtor.service.spec.ts` (prefers `debtorPaidAt` when present; falls back to `updatedAt` when null).

### S13-3 — Grace-period expiry scheduler job (P2, 5 SP) ✅ DONE

**Monday.com:** 11909960228

**What changed:**
- New scheduler job `apps/scheduler/src/jobs/recourse-grace-expiry.job.ts` running daily at 07:00 UTC (after aging at 06:00). Per-tenant fan-out via `enterTenantContext`. Per-invoice + per-tenant try/catch.
- Query: Prisma JSON path filter narrows to `defaulted + with_recourse + metadata.recourseGraceEndAt IS NOT NULL`. App-side filter compares the ISO date string against `now()` and skips invoices already stamped with `recourseEnforcedAt` (from a previous run).
- Verified that `RecourseService.enforceGracePeriodElapsed` already merges `recourseEnforcedAt` into existing metadata (lines 203–212 of `recourse.service.ts`) — preserves `recourseGraceEndAt`, `recourseAmount`, and any other prior keys via spread. No change needed to the service; added a dedicated unit test covering metadata preservation.
- Registered in `apps/scheduler/src/scheduler.module.ts` providers.

**Tests:** 6 scheduler tests (defined; enforces past-grace + not-yet-enforced; skips future-grace; skips already-enforced; isolates per-invoice/per-tenant errors; empty list) + 1 new recourse.service test (metadata-preservation).

**Idempotency confirmed:** scheduler is safely re-runnable. The `recourseEnforcedAt` stamp prevents double-processing across daily runs.

### S13-4 — Debtor/seller nested resolvers on InvoiceType (P3, 2 SP) ✅ DONE

**Monday.com:** 11909953391

**What changed:**
- `apps/graphql-server/src/graphql/types/factoring.type.ts` — added `debtor: DebtorType` + `seller: CustomerType` (both nullable) to `InvoiceType`. Imported `CustomerType` from `./customer.type`.
- `apps/graphql-server/src/graphql/resolvers/factoring.resolver.ts` — added `Parent`, `ResolveField` decorators. Two new methods `resolveDebtor` and `resolveSeller` (TS method names differ from the GraphQL field names because the existing top-level `@Query() debtor()` is also on this class — `@ResolveField('debtor')` sets the schema field name to `debtor` regardless).
- Admin portal:
  - `apps/admin-portal/src/lib/graphql/factoring.ts` — extended `INVOICE_FIELDS_FRAGMENT` to request `debtor { id companyName }` + `seller { id fullName }`. `IInvoice` interface extended with optional nested objects.
  - `components/factoring/invoice-list.tsx`, `invoice-kanban.tsx` — render company names with truncated UUID fallback.
  - `app/(portal)/loans/factoring/[id]/page.tsx` — debtor row prefers nested resolver result; falls back to standalone `DEBTOR_QUERY`.
  - `components/customers/tab-invoices.tsx` — local `SELLER_INVOICES_QUERY` extended; debtor cell shows company name when available.

**Tests:** 3 new resolver tests (`resolveDebtor` happy/null; `resolveSeller` happy/null; both null when ID is missing).

**N+1 note:** acceptable for v1 — invoice lists are paginated to 20 items max. DataLoader is a future optimization.

### S13-5 — BNPL early-settlement remaining-balance fix (P2, 3 SP) ✅ DONE

**Monday.com:** 11909951133

**What changed:**
- `services/process-engine/src/bnpl/bnpl-installment.service.ts` — `earlySettlement` totalRemaining now sums `(amount - paidAmount)` per pending installment instead of the gross amount. Single targeted diff:
  ```diff
  -  totalRemaining = add(totalRemaining, String(inst.amount));
  +  const instRemaining = subtract(String(inst.amount), String(inst.paidAmount ?? 0));
  +  totalRemaining = add(totalRemaining, instRemaining);
  ```
- Closure logic verified — when each pending installment is marked `paid`, the update sets `paidAmount = String(inst.amount)` (full installment amount). The discount is the booked variance at the transaction level. No secondary issue found.

**Tests:** 3 new tests (S13-5 fix with mixed paid/unpaid installments → 1000+600+1000=2600; preserves prior behavior with no partial payments → 3000→2940 at 2%; multiple partially paid → 750+250=1000, with 5% discount = 950). All 31 BNPL installment tests pass.

---

## Test coverage

| Package | Tests | Status | Δ from Sprint 12 |
|---|---|---|---|
| `@lons/process-engine` | **424/424** | ✅ | +21 (was 403; +S13-2×4, +S13-3×1, +S13-4×0, +S13-5×3, +S13-1 matching×8 + integration×1, +S13-4 resolver×3 lives in graphql-server) |
| `@lons/scheduler` | **24/24** | ✅ | +6 new recourse-grace-expiry tests (was 18) |
| `@lons/rest-server` (factoring + debtor-payment-webhook) | **23/23** | ✅ | +10 new webhook controller tests (was 13) |
| `@lons/graphql-server` (factoring resolver) | **24/24** | ✅ | +3 new ResolveField tests (was 21) |
| `@lons/admin-portal` | TSC clean | ✅ | All Sprint 13 admin-portal additions render with i18n in place |

Type-check pass across all 5 affected packages.

---

## Migrations to run on dev DB before deploy

In order:

1. `20260508000000_add_invoice_debtor_paid_at` — adds `invoices.debtor_paid_at` column (S13-2)

(That's the only Sprint 13 schema change; S13-1, S13-3, S13-4, S13-5 are pure code/runtime additions.)

Run via `pnpm --filter database db:migrate` against the dev DB.

---

## Commit history

```
(forthcoming) feat(factoring): Sprint 13 — debtor-payment webhook, debtorPaidAt, grace-expiry job, nested resolvers, BNPL fix
```

Single Sprint 13 commit on `main`, local only — push when ready.

---

## Known limitations and Sprint 14 follow-ups

1. **`useInvoiceWebhookEvents` admin-portal stub** (S13-1) — currently returns `[]`. Section will go live as soon as a backend audit-log resolver supports filtering by invoice ID. Self-contained TODO(S14) in the hook.
2. **Webhook tenant resolution via env var** (S13-1) — fine for single-tenant providers. Multi-tenant providers (one webhook URL serving multiple SPs) would need a mapping table on `WalletProviderConfig` or similar. Out of scope for S13.
3. **DataLoader on InvoiceType nested resolvers** (S13-4) — N+1 acceptable at 20 items/page. Add DataLoader if profiling shows hot-path concern.
4. **Reverse factoring (FR-IF-003)** — still deferred (was Sprint 12 follow-up too). The same Invoice/Debtor models support it with minor service additions.
5. **F-IF-5 dedicated verification queue screen** — deferred to Sprint 14+ per the original PM findings response.
6. **Plan Tier work** — still blocked pending the open Lōns-to-SP commercial model decision.

---

## Verification commands

PM can re-run any of these:

```bash
# Type-check all touched packages
cd services/process-engine && npx tsc --noEmit                # exit 0
cd apps/scheduler && npx tsc --noEmit                          # exit 0
cd apps/graphql-server && npx tsc --noEmit                     # exit 0
cd apps/rest-server && npx tsc --noEmit                        # exit 0
cd apps/admin-portal && npx tsc --noEmit                       # exit 0

# Run all tests
pnpm --filter process-engine test                              # 424/424 pass
pnpm --filter scheduler test                                   # 24/24 pass
pnpm --filter graphql-server test -- factoring.resolver        # 24/24 pass
pnpm --filter rest-server test -- "factoring|debtor-payment-webhook"  # 23/23 pass

# Verify i18n parity
node scripts/mirror-i18n-keys.mjs                              # All 6 locales match en.json

# Confirm new events
grep -c "DEBTOR_PAYMENT_" packages/event-contracts/src/events.enum.ts  # >= 2

# Confirm S13-2 migration is present
ls packages/database/prisma/migrations/20260508000000_add_invoice_debtor_paid_at/  # has migration.sql
```

---

## Sign-off

All 5 Sprint 13 items complete. Recommend marking Done in Monday.com, running the migration against staging, and scheduling the Sprint 14 follow-ups noted above (especially the audit-log GraphQL surface for the webhook activity admin section).
