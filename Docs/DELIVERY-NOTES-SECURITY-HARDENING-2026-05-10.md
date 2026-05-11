# Delivery Notes: Security Hardening Sprint — 2026-05-10

**Status:** Complete (9 items)
**Date:** 2026-05-10
**Reference prompt:** `Docs/SECURITY-HARDENING-2026-05-10.md`

This sprint closes 9 platform-wide security findings discovered after the
Sprint 13B encryption expansion. Three of the nine were P1 (silent
correctness/security regressions); two were P2; the rest were
defence-in-depth. All are landed with corresponding tests.

---

## Per-finding status

### SEC-1 (P1) — Customer encrypted-field search ✅

Pre-fix, `CustomerService.search/findAll/count` ran Prisma `WHERE`
filters directly against AES-GCM ciphertext columns. Equality and
substring matches were never going to succeed; admin-portal customer
search silently returned empty for every query.

**Files changed:**
- `packages/database/prisma/schema.prisma` — added three hash columns to
  `Customer` (`emailHash`, `phonePrimaryHash`, `nationalIdHash`); replaced
  the obsolete `@@index([phonePrimary])` and `@@index([nationalId])`
  with tenant-scoped composite indexes on the hash columns.
- `packages/database/prisma/migrations/20260510100000_customer_hash_columns_and_index_cleanup/migration.sql`
  — new migration adding the three columns + indexes and dropping the
  obsolete ones.
- `packages/common/src/encryption/field-encryption.middleware.ts` —
  extended `HASH_FIELD_MAP` with `Customer: { email, phonePrimary, nationalId }`.
  Hashes are computed atomically with the ciphertext on every write.
- `services/entity-service/src/customer/customer.service.ts` —
  `search()` routes `phonePrimary` filter through `phonePrimaryHash`;
  `findAll/count` route free-text search through a new `buildSearchOr()`
  helper that exposes only `externalId` (plaintext) + `phonePrimaryHash`
  / `emailHash` (HMAC). The encrypted PII columns no longer appear in
  any `where` clause.
- `services/entity-service/src/customer/customer.service.spec.ts` —
  **new file.** 6 unit tests cover the hash routing and absence of
  encrypted-column references.

**Known trade-off:** name / partial-phone / partial-email substring
search is gone. Operators searching for "John" can no longer surface
customers by name through the platform. Re-introducing partial PII
search requires a tokenised search index — out of scope here, tracked
as a follow-up.

### SEC-2 (P1) — Debtor `registrationNumber` search ✅

Already partly addressed in S13B-2; this sprint hardens the OR-clause
construction. The previous `registrationNumberHash: computeSearchableHash(...) ?? undefined`
would, when the search string was empty, produce
`{ registrationNumberHash: undefined }` — Prisma reduces that to `{}`
which matches every row (an unintended catastrophic widening).

**Files changed:**
- `services/process-engine/src/factoring/debtor.service.ts`
- `apps/graphql-server/src/graphql/resolvers/factoring.resolver.ts`

Both now use `...(searchHash ? [{ registrationNumberHash: searchHash }] : [])`
to spread the clause conditionally. Empty / null searches drop the
clause entirely.

### SEC-3 (P1) — API key secret validation ✅

The REST `ApiKeyGuard` extracted `X-API-Secret` and asserted it was
present, but `ApiKeyService.validateApiKey()` never compared it. Two-
factor auth was security theater.

**Files changed:**
- `packages/database/prisma/schema.prisma` — `ApiKey.secretHash` column
  (`VARCHAR(64) NOT NULL DEFAULT ''`).
- `packages/database/prisma/migrations/20260510100001_add_api_key_secret_hash/migration.sql`
  — new migration adding the column with the empty default for
  backwards-compatibility.
- `services/entity-service/src/api-key/api-key.service.ts` —
  - `createApiKey()` generates an independent `plaintextSecret`
    (`lons_secret_<64-hex>`) and stores its SHA-256 alongside the key
    hash; returns both plaintexts to the caller.
  - `validateApiKey(plaintextKey, plaintextSecret)` is the new signature.
    The service computes the candidate secret hash and compares with
    `crypto.timingSafeEqual` against the stored hash. Generic
    `Invalid API credentials` errors avoid telling an attacker which
    factor failed. Legacy keys with empty `secretHash` placeholder fail
    closed with a "rotate via admin portal" message.
  - `lastUsedAt` is updated only on successful authentication, so
    brute-force attempts don't pollute the audit timeline.
  - Returns `apiKeyId` (opaque UUID) instead of expecting the guard to
    echo the plaintext key.
  - Side-fix: the `rateLimitPerMin` typo in `listApiKeys` /
    `getApiKey` is corrected to read from `rateLimitPerMinute` (the
    actual schema column). Pre-fix, those getters returned `undefined`
    for the rate limit on every call.
- `services/entity-service/src/api-key/api-key-rotation.service.ts` —
  rotation now generates independent key + secret, hashes them
  separately, and writes both to the new row. Pre-fix it combined the
  pair as `hash(key:secret)`, which was incompatible with
  `validateApiKey()` and silently broke rotated keys. Same
  `rateLimitPerMinute` typo corrected.
- `apps/rest-server/src/guards/api-key.guard.ts` — passes both headers
  to `validateApiKey()`. Stamps the opaque `apiKeyId` from the service
  result onto the request (never the plaintext key).
- `services/entity-service/src/api-key/api-key.service.spec.ts` — full
  rewrite of the `validateApiKey` test block: 8 cases covering valid
  pair, wrong secret (timing-safe compare verified), missing secret,
  legacy empty `secretHash`, format errors, revoked, expired, and
  `lastUsedAt` update.
- `apps/rest-server/src/guards/__tests__/api-key.guard.spec.ts` —
  updated to verify the two-arg dispatch and the opaque `apiKeyId` is
  the value stamped on the request. Two new tests for the
  `key-only` and `secret-only` rejection paths.

**Existing API key rotation:** legacy rows have an empty `secret_hash`
default. They cannot authenticate after this deploy and must be rotated.
Recommended path:
- Notify SP integrators that all existing keys need rotation.
- They call `POST /api-keys/rotate` (which the controller already
  exposes); the response includes both the new key and secret.
- Old keys keep working only for the configured grace period (24h
  default, see `ApiKeyRotationService.rotateApiKey`).

### SEC-4 (P2) — Customer obsolete encrypted-column indexes ✅

Folded into the SEC-1 migration. The legacy
`@@index([phonePrimary])` and `@@index([nationalId])` indexed
non-deterministic ciphertext (random IV per write), so every row was
effectively a unique key in the index — pure storage and write-IO waste
with no useful lookup behaviour.

Both indexes are dropped in
`20260510100000_customer_hash_columns_and_index_cleanup/migration.sql`.

### SEC-5 (P2) — HMAC-SHA-256 for searchable hashes ✅

Plain SHA-256 hashes of low-entropy PII (10-digit phone numbers, known-
domain emails) are within reach of an offline cracker if the database
is exfiltrated. Switched to HMAC-SHA-256 keyed by a server-side
`HASH_PEPPER`.

**Files changed:**
- `packages/common/src/encryption/searchable-hash.util.ts` — switched
  from `crypto.createHash('sha256')` to `crypto.createHmac('sha256', getPepper())`.
  The pepper is loaded once and cached; failure modes:
  - `HASH_PEPPER` unset → throws on first call (fail closed — silent
    success would let every hash collide on a constant value).
  - `HASH_PEPPER` shorter than 32 chars → throws.
  Exposes `__resetPepperCacheForTests` for tests that need to verify
  the missing-pepper branch.
- `.env.example` — `HASH_PEPPER` documented with generation command
  and rotation policy.
- `packages/common/jest.setup.ts` (new) — sets a fixed test pepper
  before any module loads.
- `services/entity-service/jest.setup.ts`, `services/process-engine/jest.setup.ts`,
  `apps/rest-server/jest.setup.ts`, `apps/graphql-server/jest.setup.ts`,
  `apps/scheduler/jest.setup.ts`, `tests/jest.setup.ts` (new each) —
  same fixed test pepper for every package's Jest suite.
- Each affected `jest.config.ts` — `setupFiles: ['<rootDir>/jest.setup.ts']`.
- `tests/regression/jest.config.ts` — references `../jest.setup.ts`.
- `services/process-engine/src/factoring/debtor-payment-matching.service.spec.ts`
  — replaced the inline `crypto.createHash('sha256')` `fixtureHash`
  helper with a delegate to `computeSearchableHash` so test mocks stay
  in sync with future hash-algorithm changes.
- `packages/common/src/encryption/__tests__/searchable-hash.spec.ts`
  (new) — 10 tests covering: 64-char hex output, determinism,
  normalisation, null handling, collision sanity, HMAC vs plain SHA-256
  divergence, pepper-rotation invalidation, missing-pepper failure,
  too-short-pepper failure, alias equivalence.

**Pepper rotation policy:** rotating `HASH_PEPPER` invalidates ALL
existing hashes. Every encrypted-PII lookup will silently miss until
`scripts/backfill-pii-hashes-and-encrypt.ts` reruns. The script's
`backfillModel` was already updated (SEC-1) to handle decrypt-to-hash
for already-encrypted rows, so a pepper-only rotation flow is:

1. Update `HASH_PEPPER` in the secret store (Vault / AWS SM).
2. Restart application instances so they pick up the new pepper.
3. Run `pnpm tsx scripts/backfill-pii-hashes-and-encrypt.ts` — it
   detects ciphertext rows, decrypts them in-place, recomputes hashes
   with the new pepper, and writes only the hash columns. The
   ciphertext is unchanged.

### SEC-6 (P2) — REST server audit logging ✅

`AuditEventInterceptor` was already registered globally on
`apps/rest-server/src/app.module.ts` (this happened in S13B-1). What
was missing: `@AuditAction` decorators on REST controller mutation
handlers — the interceptor only writes audit entries when the metadata
is set.

**Decorators added (action labels follow the verb.noun convention):**
- `customer.controller.ts` — `create.customer`
- `loan-request.controller.ts` — `create.loanRequest`, `accept.loanOffer`
- `repayment.controller.ts` — `record.repayment`
- `contract.controller.ts` — `cancel.contractCoolingOff`
- `api-key.controller.ts` — `rotate.apiKey`
- `bnpl.controller.ts` — `initiate.bnplPurchase`,
  `record.bnplInstallmentPayment`, `refund.bnplPurchase`
- `factoring.controller.ts` — `submit.invoice`, `accept.invoiceOffer`,
  `decline.invoiceOffer`, `create.debtor`
- `webhook.controller.ts` — `register.webhook`, `delete.webhook`

**Webhook controllers that don't get decorators:** `wallet-webhook` and
`debtor-payment-webhook` are `@Public()` (HMAC-authenticated) and the
matching service emits direct `AuditService.log()` calls already
(SEC-7's pattern). No changes there.

**Read-only controller:** `product.controller.ts` has no mutation
methods — nothing to decorate.

### SEC-7 (P2) — Scheduler audit logging ✅

Five state-changing scheduler jobs now emit system-actor audit entries.
Each job audits per-tenant batch outcomes (not per-row, to avoid
flooding the log with no-op runs).

**Files changed:**
- `apps/scheduler/src/jobs/interest-accrual.job.ts` — `execute.interestAccrual`
- `apps/scheduler/src/jobs/aging.job.ts` — `classify.contractAging`,
  `classify.overdraftAging`
- `apps/scheduler/src/jobs/invoice-aging.job.ts` — `classify.invoiceAging`
- `apps/scheduler/src/jobs/bnpl-installment.job.ts` — `classify.bnplOverdue`,
  `execute.merchantSettlementBatch`
- `apps/scheduler/src/jobs/bnpl-auto-collect.job.ts` — `execute.bnplAutoCollect`

Each job:
- Injects `AuditService` from `@lons/entity-service` (already
  exported via `AuditModule` in `scheduler.module.ts`, S13B-1).
- Logs per-tenant only when there's an actual state change
  (transitions > 0 / processedCount > 0 / etc.) — prevents the audit
  log from being flooded with empty-batch runs.
- Includes `metadata.job` for downstream operator filtering.

Already audited from S13B-1 (no change in this sprint):
`invoice-offer-expiry.job.ts`, `recourse-grace-expiry.job.ts`,
`cooling-off.service.ts`.

Updated test specs to inject the new `AuditService` dependency:
- `apps/scheduler/src/jobs/invoice-aging.job.spec.ts`
- `apps/scheduler/src/jobs/bnpl-auto-collect.job.spec.ts`

### SEC-8 (P3) — GraphQL P2002 field name sanitization ✅

The pre-fix filter echoed `meta.target` directly in both the message
and `extensions.fields`. With S13B-2 / SEC-1's hash columns, this
leaked the encrypted-PII layout — `emailHash`, `registrationNumberHash`,
`taxIdHash` would all appear in client-visible error responses,
revealing which columns are encrypted.

**File changed:**
- `apps/graphql-server/src/filters/graphql-exception.filter.ts` —
  added `FIELD_DISPLAY_MAP` (hash columns → plaintext display name;
  `tenantId` → empty/dropped; non-PII columns whitelisted by name) and
  `sanitizeTargetForDisplay()`. The new shape:
  - Maps known column names to user-facing labels.
  - Collapses unknown column names to a generic `value` (no schema leak).
  - **Never** includes the raw `target` array in `extensions`.
- `apps/graphql-server/src/filters/graphql-exception.filter.spec.ts`
  (new) — 9 tests covering the product-code special case, hash-column
  rename in both camelCase and snake_case, tenantId-dropping, unknown-
  column collapse, raw-target-omission, scalar target, missing meta,
  and the still-correct `DUPLICATE_ENTRY` extension code.

### SEC-9 (P3) — JWT ephemeral key production guard ✅

The pre-fix constructor silently fell back to ephemeral RSA keys when
the configured paths were unreadable. In production this means every
restart invalidates all live tokens — a denial-of-service waiting to
happen, and a security continuity gap.

**File changed:**
- `services/entity-service/src/auth/jwt.service.ts` — when
  `NODE_ENV === 'production'`, throws on boot with a clear message:
  > `JWT signing keys could not be loaded (JWT_PRIVATE_KEY=..., JWT_PUBLIC_KEY=..., reason=ENOENT). Ephemeral RSA keys are not permitted in production. Generate a 2048-bit RSA key pair and configure both paths.`
  In non-production environments the legacy ephemeral-key fallback is
  preserved (now logged via NestJS `Logger`, including the resolved
  `NODE_ENV` for clarity).
- `.env.example` — JWT section now documents the
  `openssl genrsa` / `openssl rsa -pubout` commands for generating a
  2048-bit RSA pair.
- `services/entity-service/src/auth/jwt.service.spec.ts` — 3 new tests:
  production + missing files → throws; development + missing files →
  ephemeral OK; unset NODE_ENV → ephemeral OK.

---

## Test coverage summary

| Package | Before | After | Δ |
|---|---|---|---|
| `@lons/common` | 246 | 256 | +10 (SEC-5 searchable-hash spec) |
| `@lons/entity-service` | 109 | 121 | +12 (SEC-3 +6, SEC-9 +3, SEC-1 +6, minus 3 SEC-3 reorganised) |
| `@lons/process-engine` | 424 | 424 | unchanged (SEC-2 logic test unchanged; fixtureHash now delegates) |
| `@lons/rest-server` | 50 | 52 | +2 (SEC-3 missing-key/missing-secret guard tests) |
| `@lons/scheduler` | 24 | 24 | unchanged (SEC-7 stubs added to existing tests) |
| `@lons/graphql-server` | 76 | 85 | +9 (SEC-8 filter spec) |

All tests pass on every affected package. No new lint errors. Pre-
existing failures (`@lons/integration-service` screening test, two
non-fix lint errors in process-engine / graphql-server, the admin-
portal Next.js static-page error) are unrelated and confirmed via
`git stash` round-trip in earlier sprints.

---

## Migrations introduced

1. `20260510100000_customer_hash_columns_and_index_cleanup` — Customer
   hash columns + obsolete index cleanup (SEC-1, SEC-4).
2. `20260510100001_add_api_key_secret_hash` — `api_keys.secret_hash`
   column with `NOT NULL DEFAULT ''` (SEC-3).

Both are backwards-compatible:
- New columns are nullable (Customer) or have an empty default (ApiKey).
- The Sprint 13B fix migration `20260510000000_swap_unique_constraints_to_hash_columns`
  remains the prerequisite for the unique-constraint moves.

---

## Deployment ordering (critical)

1. **Set `HASH_PEPPER`** in every environment (dev / staging / pre-prod
   / prod). Generate a random 32-byte hex string per environment and
   store in the secret manager. **Do not reuse pepper values across
   environments** — rotating one shouldn't invalidate hashes in another.
2. **Deploy code** (this sprint's changes).
3. **Run migrations** — Prisma will run both new migrations in order.
4. **Run backfill** — `pnpm tsx scripts/backfill-pii-hashes-and-encrypt.ts`.
   This step:
   - Encrypts plaintext PII rows that were never encrypted before
     (idempotent — already-encrypted rows skip encryption).
   - Decrypts already-encrypted rows to recover plaintext, computes
     fresh HMAC hashes (SEC-5), and writes the hash columns.
   - Now includes the `customer` model (SEC-1) — pre-Sprint-13B
     Customer rows are encrypted but had no hash columns until this
     migration; the backfill populates them.
5. **API key rotation comms** — notify SP integrators that all
   pre-existing API keys must be rotated via `POST /api-keys/rotate`
   (existing endpoint). Pre-rotation keys cannot authenticate after
   this deploy.

The Sprint 13B fix migration's unique-constraint moves
(`20260510000000_swap_unique_constraints_to_hash_columns`) need the
Customer backfill to land **before** any future migration that adds
unique constraints on Customer hash columns. We do not declare any
such constraints in this sprint — the Customer hash columns are
indexed but not unique.

---

## Verification commands

```bash
# 1. Backend builds (admin-portal pre-existing failure unrelated)
pnpm exec turbo build --filter='!@lons/admin-portal' --filter='!@lons/platform-portal'

# 2. Affected unit/integration tests
pnpm --filter '@lons/common' test                 # 256 passed
pnpm --filter '@lons/entity-service' test         # 121 passed
pnpm --filter '@lons/process-engine' test         # 424 passed
pnpm --filter '@lons/rest-server' test            # 52 passed
pnpm --filter '@lons/scheduler' test              # 24 passed
pnpm --filter '@lons/graphql-server' test         # 85 passed

# 3. Migrations (against staging DB)
pnpm --filter '@lons/database' db:migrate

# 4. Backfill (after migration; requires HASH_PEPPER + ENCRYPTION_KEY set)
pnpm tsx scripts/backfill-pii-hashes-and-encrypt.ts

# 5. Production-guard sanity check (locally with NODE_ENV=production +
#    deliberately broken JWT paths) — service should fail to boot:
NODE_ENV=production JWT_PRIVATE_KEY=/nonexistent JWT_PUBLIC_KEY=/nonexistent \
  pnpm --filter '@lons/graphql-server' dev
# Expected: "Ephemeral RSA keys are not permitted in production." and exit.
```

---

## Files changed summary

### Schema + migrations
- `packages/database/prisma/schema.prisma` — Customer hash columns, API
  key `secretHash` column, obsolete-index removal.
- `packages/database/prisma/migrations/20260510100000_customer_hash_columns_and_index_cleanup/migration.sql` — new.
- `packages/database/prisma/migrations/20260510100001_add_api_key_secret_hash/migration.sql` — new.

### Encryption / hashing
- `packages/common/src/encryption/searchable-hash.util.ts` — HMAC + pepper.
- `packages/common/src/encryption/field-encryption.middleware.ts` — Customer in `HASH_FIELD_MAP`.
- `scripts/backfill-pii-hashes-and-encrypt.ts` — Customer model added,
  decrypt-to-hash for already-encrypted rows.

### Services
- `services/entity-service/src/customer/customer.service.ts` — hash routing.
- `services/entity-service/src/api-key/api-key.service.ts` — secret + timing-safe.
- `services/entity-service/src/api-key/api-key-rotation.service.ts` — secret + rateLimitPerMinute.
- `services/entity-service/src/auth/jwt.service.ts` — production guard.
- `services/process-engine/src/factoring/debtor.service.ts` — safer OR spread.

### Resolvers / controllers
- `apps/graphql-server/src/graphql/resolvers/factoring.resolver.ts` — safer OR spread.
- `apps/graphql-server/src/filters/graphql-exception.filter.ts` — P2002 sanitisation.
- `apps/rest-server/src/guards/api-key.guard.ts` — pass secret + opaque apiKeyId.
- `apps/rest-server/src/customer/customer.controller.ts` — `@AuditAction`.
- `apps/rest-server/src/loan-request/loan-request.controller.ts` — `@AuditAction` ×2.
- `apps/rest-server/src/repayment/repayment.controller.ts` — `@AuditAction`.
- `apps/rest-server/src/contract/contract.controller.ts` — `@AuditAction`.
- `apps/rest-server/src/api-key/api-key.controller.ts` — `@AuditAction`.
- `apps/rest-server/src/bnpl/bnpl.controller.ts` — `@AuditAction` ×3.
- `apps/rest-server/src/factoring/factoring.controller.ts` — `@AuditAction` ×4.
- `apps/rest-server/src/webhook/webhook.controller.ts` — `@AuditAction` ×2.

### Scheduler
- `apps/scheduler/src/jobs/interest-accrual.job.ts` — audit.
- `apps/scheduler/src/jobs/aging.job.ts` — audit.
- `apps/scheduler/src/jobs/invoice-aging.job.ts` — audit.
- `apps/scheduler/src/jobs/bnpl-installment.job.ts` — audit.
- `apps/scheduler/src/jobs/bnpl-auto-collect.job.ts` — audit.

### Tests
- `packages/common/jest.setup.ts` (new) — HASH_PEPPER for tests.
- `packages/common/src/encryption/__tests__/searchable-hash.spec.ts` (new) — 10 tests.
- `services/entity-service/jest.setup.ts` (new).
- `services/entity-service/src/customer/customer.service.spec.ts` (new) — 6 tests.
- `services/entity-service/src/api-key/api-key.service.spec.ts` — `validateApiKey` block rewritten.
- `services/entity-service/src/auth/jwt.service.spec.ts` — 3 SEC-9 cases.
- `services/process-engine/jest.setup.ts` (new).
- `services/process-engine/src/factoring/debtor-payment-matching.service.spec.ts` — fixtureHash delegates.
- `apps/rest-server/jest.setup.ts` (new).
- `apps/rest-server/src/guards/__tests__/api-key.guard.spec.ts` — two-arg + missing-header tests.
- `apps/scheduler/jest.setup.ts` (new).
- `apps/scheduler/src/jobs/invoice-aging.job.spec.ts` — AuditService stub.
- `apps/scheduler/src/jobs/bnpl-auto-collect.job.spec.ts` — AuditService stub.
- `apps/graphql-server/jest.setup.ts` (new).
- `apps/graphql-server/src/filters/graphql-exception.filter.spec.ts` (new) — 9 tests.
- `tests/jest.setup.ts` (new).
- Each affected `jest.config.ts` wired with `setupFiles`.

### Configuration
- `.env.example` — `HASH_PEPPER` documented; JWT key generation steps.

### Documentation
- `Docs/DELIVERY-NOTES-SECURITY-HARDENING-2026-05-10.md` — this file.
