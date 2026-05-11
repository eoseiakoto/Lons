# Delivery Notes: Sprint 13B — Security Hardening & Sprint 13A Fixes

**Status:** Complete
**Sprint:** 13B — 6 items, ~31 SP
**Date:** 2026-05-09
**Reference dev prompt:** `Docs/DEV-SPRINT-13B-2026-05-09.md`

---

## Per-item status

### S13B-1 — Audit logging coverage sweep ✅

- **Resolver coverage:** scanned all 40 GraphQL resolver files. 7 mutations were missing `@AuditAction` — 4 added decorators, 3 marked `// @audit-exempt:` with rationale (per-user inbox state mutations).
- **Decorators added:**
  - `feedback.resolver.ts`: `submitFeedback` → `submit.feedback`, `updateFeedbackStatus` → `update.feedback`
  - `platform-config.resolver.ts`: `updatePlatformDefaults` → `update.platformDefaults`
  - `survey.resolver.ts`: `submitSurveyResponse` → `submit.surveyResponse`
- **Audit-exempt markers** (`message.resolver.ts`): `markMessageRead`, `markAllMessagesRead`, `archiveMessage` — per-user inbox state, high volume, not platform-state changes.
- **REST server:** registered `AuditEventInterceptor` as a global `APP_INTERCEPTOR` in `apps/rest-server/src/app.module.ts` with the `AUDIT_SERVICE` provider — the GraphQL pattern, mirrored.
- **Webhook controller:** the inbound debtor-payment matching service (`services/process-engine/src/factoring/debtor-payment-matching.service.ts`) now writes audit entries on every match outcome (matched, no_matching_invoice, currency_mismatch). Action labels: `match.debtorPayment` / `unmatch.debtorPayment`. Metadata includes `provider`, `transactionRef`, `amount`, `currency`, `matchResult`, `matchStrategy` — these power the S13B-6 webhook activity feed.
- **Scheduler jobs (system actor entries added):**
  - `invoice-offer-expiry.job.ts` → `transition.invoice` for each `offer_generated → cancelled` transition
  - `recourse-grace-expiry.job.ts` → `enforce.recourseGrace` for each grace-elapsed enforcement
  - `cooling-off.service.ts` (called from `cooling-off-expiry.job.ts`) → `transition.contract` for each `cooling_off → active` transition
- **Action label convention:** standardised on `verb.noun` (e.g. `create.product`, `update.customer`, `transition.invoice`).
- **Guardrail test:** `tests/e2e/audit-coverage.e2e-spec.ts` — static-analysis test that walks every resolver file and fails if any `@Mutation` is missing `@AuditAction` and lacks an `// @audit-exempt:` comment. Verified locally with a Python equivalent reporting 0 gaps.

### S13B-2 — PII encryption field expansion ✅

- **Models added to `ENCRYPTED_FIELDS`:**
  - `PlatformUser`: `email`
  - `User`: `email`, `phone`
  - `Debtor`: `contactEmail`, `contactPhone`, `contactName`, `taxId`, `registrationNumber`
  - `Merchant`: `contactEmail`, `contactPhone`
- **Hash columns added (Prisma schema + SQL migration):**
  - `PlatformUser.emailHash` (+ index)
  - `User.emailHash` (+ tenant-scoped index `[tenantId, emailHash]`)
  - `Debtor.taxIdHash` (+ tenant-scoped index)
  - `Debtor.registrationNumberHash` (+ tenant-scoped index)
- **Migration SQL:** `packages/database/prisma/migrations/20260509000000_add_searchable_pii_hash_columns/migration.sql`
- **Backfill script:** `scripts/backfill-pii-hashes-and-encrypt.ts` — idempotent, batched (1000 rows), encrypts existing plaintext and populates hash columns atomically per row. Run via `pnpm tsx scripts/backfill-pii-hashes-and-encrypt.ts`.
- **Searchable hash util:** `packages/common/src/encryption/searchable-hash.util.ts` — SHA-256 of trimmed lowercase value. Exports `computeSearchableHash`, plus aliases `computeEmailHash` / `computeTaxIdHash` / `computeRegistrationNumberHash`.
- **Field-encryption middleware** (`field-encryption.middleware.ts`) extended with `HASH_FIELD_MAP`: when a write touches a field with a hash companion, the SHA-256 of the plaintext is written atomically alongside the ciphertext. Idempotent: skips encryption when the value is already a blob, and clears the hash column when plaintext is set to null.
- **Lookup queries updated:**
  - `services/entity-service/src/auth/auth.service.ts`: `loginTenantUser` and `loginPlatformUser` route equality through `emailHash`. `loginPlatformUser` switched from `findUnique({ email })` to `findFirst({ emailHash })`.
  - `services/entity-service/src/user/user.service.ts`: `create()` existence check uses `emailHash`.
  - `services/entity-service/src/platform-user/platform-user.service.ts`: `create()` existence check uses `emailHash`.
  - `services/process-engine/src/factoring/debtor-payment-matching.service.ts`: lookup by `debtorRef` routes through `taxIdHash` / `registrationNumberHash` (UUID `id` path unchanged — UUIDs aren't encrypted).
  - `services/process-engine/src/factoring/debtor.service.ts`: idempotency check on create uses `registrationNumberHash`; debtor list search OR clause replaces ciphertext partial-match with `companyName` partial + `registrationNumberHash` exact.
  - `apps/graphql-server/src/graphql/resolvers/factoring.resolver.ts`: debtor list search same change.
- **Log masking:** verified webhook controller logs (`debtor-payment-webhook.controller.ts:122–124, 113–118`) only output non-PII fields (`transactionRef`, `provider`, `amount`, `currency`). Scheduler job logs use tenant `name` only — no customer/debtor PII. `masking.util.ts` exports remain `maskPhone` / `maskNationalId` / `maskEmail` / `maskName` for downstream consumers.

### S13B-3 — Security hardening tests ✅

- **File:** `tests/e2e/security-hardening.e2e-spec.ts` (existing — appended new `describe` blocks).
- **New describe blocks:**
  1. `Audit hash chain integrity` — sequential chain construction + tampering detection (3 tests)
  2. `Audit field-level diff` — only-changed-fields, decimal-as-string, empty-diff (3 tests)
  3. `AuditEventInterceptor wiring` — passes through without decorator, writes entry with decorator + tenant context (2 tests)
  4. `ENCRYPTED_FIELDS configuration` — Customer baseline + S13B-2 expansion (2 tests)
  5. `Round-trip encryption` — JSON-blob shape, round-trip plaintext, random IV (3 tests)
  6. `Searchable hash for encrypted fields` — hex format, normalisation, null handling, collision sanity (4 tests)
  7. `PII masking utilities` — phone / national ID / email / name (4 tests)
- **Test count:** 21 new tests across audit-logging, PII encryption, and cross-cutting concerns.
- **Plus** the static-analysis guardrail in `tests/e2e/audit-coverage.e2e-spec.ts` (1 test that walks all 40 resolver files).
- **Note:** the e2e test file runs against the existing test infrastructure (no DB required for these new tests — they exercise pure functions and the interceptor logic with mocks). Real-DB tests for audit hash-chain persistence and PII round-trip through Prisma middleware would belong in a future integration-level e2e once the test harness boots a Postgres instance.

### S13B-4 — `paymentRef` validator constraint ✅

- **DTO** (`apps/rest-server/src/debtor-payment-webhook/debtor-payment-webhook.dto.ts`): `HasAtLeastOneMatcher` no longer accepts `paymentRef` as a satisfier. Error message: `'at least one of invoiceNumber or debtorRef must be provided'`. `paymentRef` description rewritten to clarify it's supplementary metadata.
- **Controller** (`debtor-payment-webhook.controller.ts:88`): belt-and-braces check matches the validator (`!body.invoiceNumber && !body.debtorRef`).
- **Tests** (`debtor-payment-webhook.controller.spec.ts`): added 4 new tests covering paymentRef-only rejection (DTO + controller), invoiceNumber+paymentRef happy path, and the controller-level fallback. Pre-existing assertions tightened to match the new error message.

### S13B-5 — `offerExpiresAt` admin portal display ✅

- **GraphQL fragment** (`apps/admin-portal/src/lib/graphql/factoring.ts`): `INVOICE_FIELDS_FRAGMENT` now selects `offerExpiresAt`. `IInvoice` interface extended.
- **Detail page** (`apps/admin-portal/src/app/(portal)/loans/factoring/[id]/page.tsx`): new `formatOfferExpiry()` helper + a conditional row in the Financial Terms section.
  - `offer_generated` + future expiry → "Expires in 23h 14m" (info badge)
  - any other status with non-null expiry → "Expired 2026-05-08 14:30 UTC" (error badge)
  - null → row not rendered
- **i18n keys:** `factoring.invoice.offerExpiresAt`, `factoring.invoice.offerExpiresIn`, `factoring.invoice.offerExpired` mirrored across all 7 locales (en, ar, es, fr, ha, pt, sw).

### S13B-6 — Webhook activity audit-log resolver ✅

- **GraphQL types** (`apps/graphql-server/src/graphql/types/webhook-activity.type.ts`):
  - `MatchResultTypeGql` enum (`matched`, `no_matching_invoice`, `currency_mismatch`)
  - `MatchResult` (type + optional strategy)
  - `WebhookActivityEntry` (id, timestamp, eventType, provider, transactionRef, amount, currency, matchResult, payloadSummary)
  - `WebhookActivityEdge` + `WebhookActivityConnection` (Relay pattern)
- **Resolver** (`apps/graphql-server/src/graphql/resolvers/factoring.resolver.ts`): new query `invoiceWebhookActivity(invoiceId, first, after)` filters audit logs by `resourceType='invoice'`, `resourceId=invoiceId`, `action IN ('match.debtorPayment', 'unmatch.debtorPayment')`. Cursor pagination via composite `id_createdAt` cursor (matches `AuditService.findAllCrossTenant`). Tenant-scoped via `@CurrentTenant`. `toWebhookActivityEntry()` private helper maps audit metadata → activity entry, building a human-readable `payloadSummary` server-side.
- **Audit context from matching service:** `DebtorPaymentMatchingService.recordWebhookAudit()` (added in S13B-1) emits the metadata the resolver expects. Provider is forwarded from the controller.
- **Admin portal:** `useInvoiceWebhookEvents` hook now wired to the real `INVOICE_WEBHOOK_ACTIVITY_QUERY` (was stubbed `[]`). Display logic updated to map `matchResult.type` to the appropriate label (matched-strategy / unmatched / currency mismatch). New i18n keys `factoring.webhookActivity.strategyCurrencyMismatch` and `factoring.webhookActivity.strategyUnmatched` mirrored across all 7 locales.
- **Tenant isolation:** the resolver uses `@CurrentTenant() tenantId` and filters `tenantId` in the where clause; cursor lookup also re-checks tenant. RLS handles the deeper guarantee.

---

## Test coverage

| Package | Before | After | Δ |
|---|---|---|---|
| `@lons/common` | 246 | 246 | unchanged (existing utilities re-tested) |
| `@lons/process-engine` | ~424 | 424 | spec mocks adjusted for AuditService dep |
| `@lons/entity-service` | 109 | 109 | spec fixtures adjusted for `emailHash` |
| `@lons/rest-server` | 46 | 50 | +4 (S13B-4 paymentRef cases) |
| `@lons/scheduler` | 24 | 24 | spec mocks adjusted for AuditService dep |
| `tests/e2e` (security-hardening) | 18 | 39 | +21 (S13B-3) |
| `tests/e2e` (audit-coverage) | — | 1 | new file (S13B-1 guardrail) |

All tests pass on the affected packages. The 1 pre-existing failure in `@lons/integration-service` (screening service test) and the 2 pre-existing lint errors in `@lons/process-engine` / `@lons/graphql-server` are unrelated to S13B (verified by `git stash` round-trip on `main`).

## Migrations

`packages/database/prisma/migrations/20260509000000_add_searchable_pii_hash_columns/migration.sql`:

- Adds `email_hash` to `platform_users` (+ index)
- Adds `email_hash` to `users` (+ `(tenant_id, email_hash)` index)
- Adds `tax_id_hash` and `registration_number_hash` to `debtors` (+ `(tenant_id, *)` indexes)

Backward-compatible — all new columns are nullable. Existing rows will have NULL hashes until the backfill script runs.

## Verification commands

```bash
# 1. Backend builds (admin-portal has a pre-existing static-page error unrelated to S13B)
pnpm build --filter='!@lons/admin-portal' --filter='!@lons/platform-portal'

# 2. Affected unit/integration tests
pnpm --filter '@lons/common' test
pnpm --filter '@lons/process-engine' test
pnpm --filter '@lons/entity-service' test
pnpm --filter '@lons/rest-server' test
pnpm --filter '@lons/scheduler' test

# 3. Run the migration + backfill in a staging environment
pnpm --filter '@lons/database' db:migrate
pnpm tsx scripts/backfill-pii-hashes-and-encrypt.ts

# 4. Audit-coverage guardrail (in CI; locally requires e2e harness types)
# Verified equivalent via static analysis: 0 gaps.
```

---

## Important notes for review

- **No Plan Tier work** was implemented — those items remain blocked pending the Lōns-to-SP commercial model decision (per dev prompt).
- **Encryption uses the env-var key provider** (`ENCRYPTION_KEY`) for local/dev. AWS KMS path is wired but inactive.
- **Audit log is append-only** — the `audit_writer` role enforces this at the DB layer; application code only INSERTs.
- **Hash columns are critical for correctness** — without them, login (email lookup) and debtor matching (taxId/registrationNumber lookup) break after encryption. The backfill must run before the data migration is considered complete.
- **Decimal-string convention** preserved everywhere money is touched (`amount`, `currency`, etc. in audit metadata, webhook activity entries, format helpers).
- **i18n mirrored across all 7 locales** as English fallback strings (matching existing convention — translation pass is a separate workstream).
- **Schema unique on `[tenantId, companyName, registrationNumber]`** is now effectively a no-op (encrypted columns produce different ciphertext per write). Application-level dedupe via `registrationNumberHash` replaces it. The constraint stays in place as an extra guardrail, but consider dropping it in a future schema cleanup.
