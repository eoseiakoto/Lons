# Sprint 15 Fix Delivery Notes

**Date:** 2026-05-12
**Fixes:** 15 items from PM-SPRINT-15-REVIEW-2026-05-11.md
**Scope:** ~14.5 SP across 7 mandatory (P1) + 8 recommended (P2) items.

## Summary

| Category | Status |
|---|---|
| P1 fixes applied | 7 / 7 |
| P2 fixes applied | 8 / 8 |
| New migration | Yes — `20260512000000_sprint15_fix_index_idempotency` |
| New test files | 4 spec files |
| Modified test files | 3 spec files |
| Test count after fixes | entity-service 175, scheduler 36, process-engine 444, graphql-server 85, rest-server 52 — all green |

---

## Fix details

### FIX-1 — String comparison → Decimal `compare()` (P1)

**File changed:** `apps/graphql-server/src/graphql/resolvers/bnpl-credit-line.resolver.ts`

The `adjustBnplCreditLimit` resolver computed `direction = input.newLimit > String(line.approvedLimit) ? 'increase' : 'decrease'` — JavaScript's `>` on strings is lexicographic, so `"9" > "1000"` was `true`. Replaced with `compare(input.newLimit, String(line.approvedLimit)) > 0` from `@lons/common` (proper Decimal arithmetic).

### FIX-2 — `@RequiresPlan('growth')` on all credit line queries + mutations (P1)

**File changed:** `apps/graphql-server/src/graphql/resolvers/bnpl-credit-line.resolver.ts`

Added the decorator to all 6 methods (3 queries + 3 mutations) for consistency with `bnpl.resolver.ts`. Tenants on `starter` tier now receive a `403` from the `TenantPlanGuard` instead of silently exercising a feature their tier doesn't include.

### FIX-3 — `idempotencyKey` on all credit line mutation inputs (P1)

**Files changed:**
- `apps/graphql-server/src/graphql/inputs/bnpl-credit-line.input.ts` — added `idempotencyKey` (required, validated string 8-255 chars) to all 3 input types
- `apps/graphql-server/src/graphql/resolvers/bnpl-credit-line.resolver.ts` — propagates the key into the service layer
- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line.service.ts` — accepts optional `idempotencyKey` on `updateStatus` (rides into audit metadata; same-status check already short-circuits)
- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line-adjustment.service.ts` — looks up by `(tenantId, idempotencyKey)` BEFORE evaluating the change; returns the existing adjustment row on hit

Backed by a DB-level partial unique index on `bnpl_credit_line_adjustments (tenant_id, idempotency_key)` so concurrent retries can't double-apply.

### FIX-4 — Unit tests for new services + late fee (P1, 5 SP)

**New test files:**
- `services/entity-service/src/bnpl-credit-line/__tests__/bnpl-credit-line.service.spec.ts` — 14 tests covering create idempotency (incl. FIX-9 soft-delete filter), findBy* helpers, full updateStatus state machine, event emission
- `services/entity-service/src/bnpl-credit-line/__tests__/bnpl-credit-line-adjustment.service.spec.ts` — 13 tests covering adjustCreditLimit (decimal math, FIX-3 idempotency hit, available-limit rescaling) + evaluateAndAdjust per trigger type
- `services/entity-service/src/auth/mfa.service.spec.ts` — 14 tests covering enrollment (FIX-6 hashed storage), TOTP + backup-code verification, single-use consumption, regeneration
- `apps/scheduler/src/jobs/auto-deduction.job.spec.ts` — 9 tests covering happy path, failure + retry scheduling, exhaustion → `DEDUCTION_FAILED_PERMANENTLY`, FIX-10 contract status filter
- `apps/scheduler/src/jobs/auto-deduction-retry.job.spec.ts` — 3 tests covering retry query + delegation pattern + per-entry error isolation
- `services/process-engine/src/bnpl/bnpl-installment-late-fee.spec.ts` — 8 tests covering flat-only, percentage-only, combined, cap enforcement (incl. per-bucket cycle), `once` vs `per_bucket` modes, missing config back-compat

**Modified test files:**
- `apps/scheduler/src/jobs/cooling-off-expiry.job.spec.ts` — added `AuditService` stub for the FIX-2 audit instrumentation
- `services/process-engine/src/bnpl/bnpl-origination.service.spec.ts` — added `subscription` + `bnplCreditLine` mocks for the S15-9 origination gate + FIX-7 atomic UPDATE
- `services/process-engine/src/bnpl/__tests__/bnpl-lifecycle.integration.spec.ts` — same mocks added to `makeWorld()`

**Test run summary** (post-fix):

| Package | Suites | Tests |
|---|---|---|
| `@lons/entity-service` | 15 | 175 |
| `@lons/process-engine` | 38 | 444 |
| `@lons/scheduler` | 7 | 36 |
| `@lons/graphql-server` | 9 | 85 |
| `@lons/rest-server` | 7 | 52 |

All green.

### FIX-5 — MFA rate limiting (P1)

**Files changed:**
- `apps/graphql-server/src/graphql/resolvers/auth.resolver.ts` — added `@Throttle({ default: { ttl: 300_000, limit: 5 } })` to `verifyMfa` (5 attempts per 5 minutes per IP)
- `services/entity-service/src/auth/auth.service.ts` — added Redis-backed per-token counter inside `verifyMfaAndLogin`. Key is `mfa:attempts:{userId}:{iat}` so a new login flow gets a fresh counter; TTL matches the MFA token (300s). On the 6th attempt within the window the user gets a 401 "Too many MFA attempts" instead of being allowed to keep guessing.

Defense-in-depth: the `@Throttle` blocks single-IP brute force; the Redis counter blocks distributed attacks rotating across many IPs to hammer one token. Both fail open if Redis is unavailable (the resolver-level throttle still applies).

### FIX-6 — Hash backup codes with SHA-256 (P1)

**Files changed:**
- `services/entity-service/src/auth/mfa.service.ts` — new `hashBackupCode(code)` = `sha256(code.toUpperCase())`. `initiateEnrollment` and `regenerateBackupCodes` now persist hashes (and return plaintext for one-time display). `consumeBackupCode` hashes the submitted code before comparing.
- `packages/common/src/encryption/encrypted-fields.config.ts` — `mfaBackupCodes` removed from both `User` and `PlatformUser` encrypted field lists; `mfaSecret` retained (TOTP verification requires plaintext at runtime).

**Security improvement:** if the AES encryption key leaks, encrypted plaintext backup codes are immediately usable. Hashes are not. The TOTP secret stays encrypted because verification needs the plaintext back — a hashed TOTP secret would be useless.

### FIX-7 — Atomic credit-line deduction (P1)

**File changed:** `services/process-engine/src/bnpl/bnpl-origination.service.ts`

Replaced the racy `findUniqueOrThrow → compare → update` sequence with a single conditional `UPDATE … WHERE available_limit >= $amount`. Postgres serialises row-level UPDATEs at READ COMMITTED; concurrent purchases now either succeed sequentially or the second one's WHERE clause fails and the whole `$transaction` rolls back (releasing the just-created `BnplTransaction` + `InstallmentSchedule` rows).

The misleading "serializable transactions" comment was removed — we use the engine's default `READ COMMITTED`.

### FIX-8 — class-validator decorators on credit line input DTOs (P2)

**File changed:** `apps/graphql-server/src/graphql/inputs/bnpl-credit-line.input.ts`

Added `@IsUUID()`, `@IsString()`, `@IsNotEmpty()`, `@IsOptional()`, `@IsDateString()`, and `@Length()` constraints on every field of all 3 input types. Malformed inputs (non-UUID `customerId`, missing `idempotencyKey`, wrong currency length, etc.) now return a 422 with structured validation errors instead of an opaque Prisma error.

### FIX-9 — `deletedAt: null` filter in credit line create (P2)

**File changed:** `services/entity-service/src/bnpl-credit-line/bnpl-credit-line.service.ts`

The idempotency check at the start of `create()` now includes `deletedAt: null`. A soft-deleted credit line no longer permanently blocks a new line for the same `(tenant, customer, subscription)` tuple.

### FIX-10 — Contract status filter in auto-deduction (P2)

**File changed:** `apps/scheduler/src/jobs/auto-deduction.job.ts`

The query now filters `contract.status IN (active, performing, due, overdue, delinquent)`. Defaulted, cancelled, settled, written-off, and cooling-off contracts are excluded. Avoids the bug where a defaulted contract's auto-deduction job would keep trying to pull from a customer's wallet.

### FIX-11 — Register `SettlementJob` (P2)

**File changed:** `apps/scheduler/src/scheduler.module.ts`

`SettlementJob` was implemented with a `@Cron('0 3 * * *')` decorator but was never added to the module providers — Nest never constructed it, so the cron never fired. Now registered. The job's `AuditService` dependency is already in scope via `AuditModule`.

### FIX-12 — Update e2e ENCRYPTED_FIELDS assertion (P2)

**File changed:** `tests/e2e/security-hardening.e2e-spec.ts`

`PlatformUser` and `User` now have `mfaSecret` in `ENCRYPTED_FIELDS` (Sprint 15) but NOT `mfaBackupCodes` (FIX-6 moved it to hashed storage). The assertion uses `expect.arrayContaining` for forward-compat plus explicit `not.toContain('mfaBackupCodes')` to lock in the FIX-6 behaviour.

### FIX-13 — `@RequiresPlan('growth')` on billing endpoints (P2)

**File changed:** `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts`

Added to both queries (`billingInvoices`, `billingInvoice`) and the `markInvoicePaid` mutation. Billing is a `growth`-tier feature; the rest of the platform was already gated correctly.

### FIX-14 — Re-authentication for MFA enroll + disable (P2)

**Files changed:**
- `services/entity-service/src/auth/auth.service.ts` — new `verifyPassword(userId, tenantId, password, isPlatformAdmin)` method
- `apps/graphql-server/src/graphql/resolvers/auth.resolver.ts` — `initiateMfaEnrollment` and `disableMfa` now require a `password` argument; verified via `AuthService.verifyPassword` before any MFA mutation runs

Closes the attack vector where a stolen session token could either enrol an attacker's authenticator or disable the real user's MFA in a single API call.

### FIX-15 — `productId` index + `idempotencyKey` column (P2)

**Schema:** `packages/database/prisma/schema.prisma`
- `BnplCreditLine`: added `@@index([productId])` (every FK requires an index per CLAUDE.md; the adjustment service's product-config joins were seq-scanning)
- `BnplCreditLineAdjustment`: added `idempotencyKey String? @map("idempotency_key") @db.VarChar(255)` and `@@unique([tenantId, idempotencyKey])`

**Migration:** `packages/database/prisma/migrations/20260512000000_sprint15_fix_index_idempotency/migration.sql`
- `CREATE INDEX bnpl_credit_lines_product_id_idx ON bnpl_credit_lines(product_id)`
- `ALTER TABLE bnpl_credit_line_adjustments ADD COLUMN idempotency_key VARCHAR(255)`
- Partial unique index: `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — keeps NULL keys (used by system-triggered adjustments where the cooldown handles dedupe) from colliding.

Backward compatible — the new column is nullable and existing rows keep working unchanged.

---

## New Migration

**Name:** `20260512000000_sprint15_fix_index_idempotency`

**Changes:**
1. `CREATE INDEX bnpl_credit_lines_product_id_idx ON bnpl_credit_lines(product_id)` — FIX-15
2. `ALTER TABLE bnpl_credit_line_adjustments ADD COLUMN idempotency_key VARCHAR(255)` — FIX-3 / FIX-15
3. Partial unique index on `(tenant_id, idempotency_key)` where the key is non-null

**Backward compatible:** Yes. New column nullable, index addition only.

---

## Files changed summary

```
Schema + migration:
  M packages/database/prisma/schema.prisma
  A packages/database/prisma/migrations/20260512000000_sprint15_fix_index_idempotency/migration.sql

Common:
  M packages/common/src/encryption/encrypted-fields.config.ts            (FIX-6)

Entity service:
  M services/entity-service/src/auth/auth.service.ts                     (FIX-5 + FIX-14)
  M services/entity-service/src/auth/mfa.service.ts                      (FIX-6)
  M services/entity-service/src/bnpl-credit-line/bnpl-credit-line.service.ts            (FIX-3 + FIX-9)
  M services/entity-service/src/bnpl-credit-line/bnpl-credit-line-adjustment.service.ts (FIX-3)

Process engine:
  M services/process-engine/src/bnpl/bnpl-installment.service.ts         (S15-3 defensive guard)
  M services/process-engine/src/bnpl/bnpl-origination.service.ts         (FIX-7)

Apps:
  M apps/graphql-server/src/graphql/inputs/bnpl-credit-line.input.ts     (FIX-3 + FIX-8)
  M apps/graphql-server/src/graphql/resolvers/bnpl-credit-line.resolver.ts (FIX-1, 2, 3)
  M apps/graphql-server/src/graphql/resolvers/auth.resolver.ts           (FIX-5 + FIX-14)
  M apps/graphql-server/src/graphql/resolvers/billing.resolver.ts        (FIX-13)
  M apps/scheduler/src/jobs/auto-deduction.job.ts                        (FIX-10)
  M apps/scheduler/src/scheduler.module.ts                               (FIX-11)

Tests (new):
  A services/entity-service/src/bnpl-credit-line/__tests__/bnpl-credit-line.service.spec.ts
  A services/entity-service/src/bnpl-credit-line/__tests__/bnpl-credit-line-adjustment.service.spec.ts
  A services/entity-service/src/auth/mfa.service.spec.ts
  A apps/scheduler/src/jobs/auto-deduction.job.spec.ts
  A apps/scheduler/src/jobs/auto-deduction-retry.job.spec.ts
  A services/process-engine/src/bnpl/bnpl-installment-late-fee.spec.ts

Tests (modified for new constructor deps / required mocks):
  M apps/scheduler/src/jobs/cooling-off-expiry.job.spec.ts
  M services/process-engine/src/bnpl/bnpl-origination.service.spec.ts
  M services/process-engine/src/bnpl/__tests__/bnpl-lifecycle.integration.spec.ts
  M tests/e2e/security-hardening.e2e-spec.ts                             (FIX-12)
```

---

## Verification

```
$ pnpm --filter @lons/common build           → tsc clean
$ pnpm --filter @lons/event-contracts build  → tsc clean
$ pnpm --filter @lons/entity-service build   → tsc clean
$ pnpm --filter @lons/process-engine build   → tsc clean
$ pnpm --filter @lons/scheduler build        → nest build clean
$ pnpm --filter @lons/graphql-server build   → nest build clean
$ pnpm --filter @lons/rest-server build      → nest build clean
$ pnpm --filter @lons/admin-portal build     → next build clean

$ pnpm --filter @lons/entity-service test    → 175 / 175 passing
$ pnpm --filter @lons/scheduler test         →  36 /  36 passing
$ pnpm --filter @lons/process-engine test    → 444 / 444 passing
$ pnpm --filter @lons/graphql-server test    →  85 /  85 passing
$ pnpm --filter @lons/rest-server test       →  52 /  52 passing
```

---

## Remaining concerns

None blocking close-out. Forward-looking items spotted during the fix
work:

- **MFA TOTP code window:** otplib defaults to a single 30-second window
  with no clock skew tolerance. Some authenticator apps drift; we may
  want to widen the verification window to ±1 step (60 seconds total)
  to reduce false negatives. Configurable via `authenticator.options =
  { window: 1 }`. Track separately.
- **Backup-code regeneration audit:** `regenerateBackupCodes` does emit
  an `@AuditAction` via the resolver but the audit log doesn't capture
  the count of remaining codes vs. count regenerated. Minor — operators
  can see the action; the count is incidental.
- **`SettlementJob` cron timing:** now wired (FIX-11) but the daily
  3am UTC schedule may not match every region's preferred settlement
  window. Per-tenant settlement frequency is read from
  `tenant.settings.settlementFrequency`; the cron itself is fixed.
  Acceptable for v1.
