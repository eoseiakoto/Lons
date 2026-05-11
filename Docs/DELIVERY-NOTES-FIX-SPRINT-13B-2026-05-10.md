# Delivery Notes: Sprint 13B Fix — Unique Constraints + Backfill Transaction

**Status:** Complete
**Date:** 2026-05-10
**Reference fix prompt:** `Docs/FIX-SPRINT-13B-2026-05-10.md`

---

## FIX 1 (P1) — Unique constraint migration ✅

Encrypted PII columns (`PlatformUser.email`, `User.email`, `Debtor.registrationNumber`) had unique constraints that silently became no-ops after Sprint 13B encryption (AES-GCM produces non-deterministic ciphertext per write). The unique invariant moves to the deterministic SHA-256 hash columns.

### Prisma schema changes (`packages/database/prisma/schema.prisma`)

- **PlatformUser**: removed `@unique` from `email`; replaced `@@index([emailHash])` with `@@unique([emailHash])`.
- **User**: removed `@@unique([tenantId, email])` and the redundant `@@index([tenantId, emailHash])`; added `@@unique([tenantId, emailHash])` (which provides the implicit index).
- **Debtor**: replaced `@@unique([tenantId, companyName, registrationNumber])` with `@@unique([tenantId, companyName, registrationNumberHash])`; removed the now-redundant `@@index([tenantId, registrationNumberHash])`.
- The `taxIdHash` index on Debtor stays — it's used by `DebtorPaymentMatchingService` lookups but doesn't need uniqueness (a debtor can have a tax id that's null, and tax ids are single-column not paired with a company name).

### Migration

**File:** `packages/database/prisma/migrations/20260510000000_swap_unique_constraints_to_hash_columns/migration.sql`

```sql
-- PlatformUser
ALTER TABLE "platform_users" DROP CONSTRAINT "platform_users_email_key";
DROP INDEX IF EXISTS "platform_users_email_hash_idx";
CREATE UNIQUE INDEX "platform_users_email_hash_key" ON "platform_users"("email_hash");

-- User
ALTER TABLE "users" DROP CONSTRAINT "users_tenant_id_email_key";
DROP INDEX IF EXISTS "users_tenant_id_email_hash_idx";
CREATE UNIQUE INDEX "users_tenant_id_email_hash_key" ON "users"("tenant_id", "email_hash");

-- Debtor
ALTER TABLE "debtors" DROP CONSTRAINT "debtors_tenant_id_company_name_registration_number_key";
DROP INDEX IF EXISTS "debtors_tenant_id_registration_number_hash_idx";
CREATE UNIQUE INDEX "debtors_tenant_id_company_name_registration_number_hash_key"
  ON "debtors"("tenant_id", "company_name", "registration_number_hash");
```

### Deployment ordering (critical)

1. Sprint 13B migration (already deployed) added the hash columns nullable.
2. **Run `scripts/backfill-pii-hashes-and-encrypt.ts` to populate hashes + encrypt plaintext.**
3. **Then** apply this migration. Pre-backfill rows have NULL hashes; Postgres treats NULLs as distinct in unique constraints, so the migration will succeed even if the backfill hasn't completed — but those rows aren't protected against duplicates until the backfill lands. The fix prompt's §"Migration ordering" calls this out explicitly.

### Tests

**File:** `tests/regression/encrypted-pii-uniqueness.spec.ts` (new) — runs as part of `pnpm test:regression`. Requires a real Postgres.

- ✅ User: duplicate `(tenantId, emailHash)` rejected with Prisma `P2002`.
- ✅ PlatformUser: duplicate `emailHash` rejected with `P2002`.
- ✅ Debtor: duplicate `(tenantId, companyName, registrationNumberHash)` rejected with `P2002`.
- ✅ User: rows with NULL `emailHash` are admitted (Postgres NULL-is-distinct semantics — confirms pre-backfill safety).

The existing `auth.service.spec.ts` fixtures already include `emailHash: null` (per the original Sprint 13B work). Re-ran the full `@lons/entity-service` suite (109 tests) to confirm — all pass.

---

## FIX 2 (P3) — Backfill batched transactions ✅

### File: `scripts/backfill-pii-hashes-and-encrypt.ts`

The `backfillModel` function previously ran per-row `model.update()` calls outside any transaction. A mid-batch failure left the prefix of the batch committed and the rest unprocessed; the next run would still pick up the unprocessed rows (because `isEncryptedBlob` is idempotent), but operators couldn't reason about "what state is the batch in" without re-scanning.

The new shape:

1. Each row's prepared updates (computed hashes + encrypted ciphertext) are accumulated into a `prepared` array.
2. The whole batch is dispatched as a single `prisma.$transaction([...])` containing the per-row updates.
3. If the transaction fails, the entire batch rolls back and the error increments `errors` by the batch size; the next run picks them up via the idempotency check.
4. The per-row try/catch around *preparation* (hashing/encryption) stays — those failures are computational and aren't helped by a rollback.

`BATCH_SIZE` stays at 1000 (Prisma's batch transaction handles this efficiently).

### Notes

- This is defence-in-depth — the primary safeguard remains the `isEncryptedBlob` idempotency check, which lets the script re-run safely.
- The transaction is tighter: only the database writes are transactional; the read (`model.findMany`) and the prepare loop are intentionally outside, since prepare-stage errors don't need a rollback.
- The existing progress logging (`processed/totalCount, updated, errors`) is unchanged.

---

## Test coverage

| Package | Before | After | Δ |
|---|---|---|---|
| `@lons/common` | 246 | 246 | unchanged |
| `@lons/entity-service` | 109 | 109 | unchanged (existing `emailHash: null` fixtures already valid) |
| `@lons/process-engine` | 424 | 424 | unchanged |
| `@lons/rest-server` | 50 | 50 | unchanged |
| `@lons/scheduler` | 24 | 24 | unchanged |
| `tests/regression` (encrypted-pii-uniqueness) | — | 4 | new file (FIX-1) |

All tests pass on the affected packages. Pre-existing failures (`@lons/integration-service` screening test, `@lons/process-engine` and `@lons/graphql-server` lint errors, `@lons/admin-portal` Next.js static-page error) are unrelated and confirmed via `git stash` round-trip in the Sprint 13B delivery.

---

## Verification commands

```bash
# 1. Backend builds clean (admin-portal pre-existing failure unrelated)
pnpm exec turbo build --filter='!@lons/admin-portal' --filter='!@lons/platform-portal'

# 2. Affected unit/integration tests
pnpm --filter '@lons/entity-service' --filter '@lons/process-engine' --filter '@lons/rest-server' test

# 3. Migration dry-run (against a staging DB)
pnpm --filter '@lons/database' db:migrate

# 4. Constraint regression tests (DB required — runs in CI)
pnpm test:regression -- --testNamePattern "encrypted-pii-uniqueness"
```

---

## Files changed

- `packages/database/prisma/schema.prisma` — Prisma schema swap.
- `packages/database/prisma/migrations/20260510000000_swap_unique_constraints_to_hash_columns/migration.sql` — new SQL migration.
- `scripts/backfill-pii-hashes-and-encrypt.ts` — `$transaction` wrapper around per-batch updates.
- `tests/regression/encrypted-pii-uniqueness.spec.ts` — new constraint regression tests (4 cases).
- `Docs/DELIVERY-NOTES-FIX-SPRINT-13B-2026-05-10.md` — this file.
