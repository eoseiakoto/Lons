# Sprint 18 BA Fix Cycle Delivery — 2026-05-18

**Branch:** `claude/hopeful-haibt-32d778`
**Spec:** `Docs/DEV-PROMPT-SPRINT-18-BA-FIXES.md`
**Scope:** 4 fixes (~1.5 SP). All complete.

## TL;DR

All 4 BA findings closed. Test suites pass:

| Package | Suites | Tests |
|---|---|---|
| `@lons/scheduler` | 9 ✓ | 49 ✓ |
| `@lons/graphql-server` | 10 ✓ | 89 ✓ |
| `@lons/analytics-service` | 2 ✓ | 29 ✓ |
| `@lons/process-engine` | 57 ✓ | 632 ✓ |

Admin-portal `tsc --noEmit` clean. Scheduler build green.

---

## FIX-BA-1 — UUID idempotency keys per panel mount (6 handlers)

**Finding:** F-BA-S18-1 + F-BA-S18-6
**Files:**
- `apps/admin-portal/src/app/(portal)/loans/applications/[id]/page.tsx`
- `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx`

The four handlers on the loan review page (`handleApprove`, `handleReject`, `handleEscalate`, `handleModify`) were minting their idempotency keys with `Date.now()` at click time. Same problem on the contracts page (`restructureContract`, `waivePenalties`). Two fast clicks landing in the same millisecond produced identical keys — the server's idempotency cache would collapse them onto the same row.

Now: a single `crypto.randomUUID()` per mount, regenerated after each successful mutation. Matches the FIX-1 pattern from the manual-payment modal. Six handlers, two pages, six call sites updated.

## FIX-BA-2 — Read-side billing queries open to all tiers

**Finding:** F-BA-S18-2
**Files:**
- `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts`
- `apps/graphql-server/src/graphql/resolvers/billing.resolver.spec.ts` (new)

Removed `@RequiresPlan('growth')` from `billingInvoices` and `billingInvoice`. Round-1 FIX-4 had only removed it from `usageHistory`, leaving Starter tenants able to see usage totals but not the underlying invoices — broken split experience. The mutation `markInvoicePaid` keeps its `growth` gate.

The new spec verifies tier metadata directly off the resolver prototype (4 cases — read queries clean, mutation gated). Stable + cheap to maintain.

## FIX-BA-3 — CSV int column formatting preserves precision

**Finding:** F-BA-S18-3
**Files:**
- `services/analytics-service/src/reports/report-export.service.ts`
- `services/analytics-service/src/reports/report-export.service.spec.ts` (new test added)

The 'int' case formatter previously read `String(Math.trunc(Number(value)))`. For `Prisma.Decimal`, `bigint`, or any string past `Number.MAX_SAFE_INTEGER`, the `Number(...)` step round-trips through an IEEE-754 double and silently drops the low bits.

**Deviation from spec, intentional:** the prompt suggested `parseInt(String(value), 10)` would solve this. `parseInt` returns a JS `number` (double), so it has the *exact* same precision ceiling — `parseInt('9007199254740993', 10) === 9007199254740992`. I confirmed this with a test that initially failed, then switched the implementation to `BigInt(...)` with a small pre-pass that strips any fractional portion (so `Decimal('123.45')` formats as `123` rather than throwing). BigInt is exact; test now asserts `9007199254740993` survives the round-trip.

## FIX-BA-4 — EMI sync cron actually fires

**Finding:** F-BA-S18-4
**Files:**
- `apps/scheduler/package.json` — added `@lons/integration-service` workspace dep.
- `apps/scheduler/src/scheduler.module.ts` — imports `EmiDataModule`; registers `EmiSyncJob`.
- `apps/scheduler/src/jobs/emi-sync.job.ts` (new) — `@Cron('*/30 * * * *')` wrapper.
- `apps/scheduler/src/jobs/emi-sync.job.spec.ts` (new) — 3 cases.

The BA spec claimed "the `@Cron()` decorator never fires" — but checking the source revealed there *was no `@Cron` decorator on `EmiDataSyncJob` at all*. The worker `EmiDataSyncJob` (in `@lons/integration-service`) is just a business-logic service: one tenant + one config per call. The scheduler app had no wrapper, so the EMI sync was dead code.

Added `EmiSyncJob` in the scheduler app following the same shape as `InterestAccrualJob` / `PaymentReminderJob`:
- `@Cron('*/30 * * * *')` cadence.
- Iterates active tenants under the platform-admin context, then per-tenant calls `EmiIntegrationConfigService.findAll` and dispatches `EmiDataSyncJob.runForTenant(tenantId, configId)` for each active config.
- Skips inactive configs and tenants with no configs; per-config failures are logged but don't stop the sweep.
- Tests cover dispatch fan-out, single-failure isolation, and tenants with no active configs.

The 30-minute cadence keeps the scheduler wake-up tight enough that a config set to "sync every N minutes" (the per-config `syncFrequencyMin` is enforced inside the worker) still triggers within the operator's expected window.

---

## Verification

```bash
pnpm --filter graphql-server test            # 89/89
pnpm --filter @lons/analytics-service test   # 29/29
pnpm --filter scheduler test                 # 49/49
pnpm --filter @lons/process-engine test      # 632/632
pnpm --filter scheduler build                # OK
pnpm --filter graphql-server build           # OK
(cd apps/admin-portal && pnpm exec tsc --noEmit)  # clean
```

Admin-portal `next lint` shows only pre-existing import/order warnings + 1 unrelated unused-`t` error in `loans/factoring/queue/page.tsx` (not touched by this fix bundle).
