# BA Platform Audit: Implementation vs. Business Requirements

**Author:** Business Analyst (Claude)
**Date:** 2026-04-28
**Scope:** Full codebase audit — backend services, portals, database schema, security, financial integrity, test suite, event contracts, end-to-end loan lifecycle, CI/CD pipeline, shared packages
**Requested by:** Emmanuel (Project Owner)
**Method:** Systematic code-level inspection of all services, apps, packages, and schema
**Revised:** 2026-04-30 — Incorporated findings from PM's portal rebuild delivery review (`Docs/PM-NOTES-FOR-BA-DELIVERY-REVIEW-2026-04-27.md`). One finding added (P3-010), one proposed finding withdrawn after BA verification (P2-022 — skip link already implemented), two findings updated (P2-005, P2-006), Sprint 8 functional gap context added.

---

## Executive Summary

This audit examines the actual implementation of the Lōns platform against the business requirements defined in Docs/01–13 and the development rules in CLAUDE.md. Unlike the prior cross-reference review (which assessed requirement coverage at the sprint-plan level), this audit reads the code.

**Three critical deviations from business requirements were identified and confirmed as go-live blockers by the Project Owner:**

1. **Float-for-money at service boundaries** — Decimal library is correct, but GraphQL inputs, REST controllers, and service-to-database writes cast to JavaScript `Number()`, defeating precision guarantees.
2. **Row-Level Security not implemented on core tables** — Only 4 ancillary tables have RLS. All loan, contract, repayment, and customer tables rely solely on application-level filtering.
3. **No global AuthGuard on GraphQL server** — Resolvers are unauthenticated by default. Combined with CORS wildcard, any origin can reach unprotected endpoints.

Beyond these three blockers, the audit found 46 additional active findings across 3 severity levels. (Revised 2026-04-30: one finding added from PM delivery review (P3-010), one proposed finding withdrawn after BA code verification (P2-022 — skip link already correctly implemented).)

---

## P0 — Go-Live Blockers (Project Owner Confirmed)

### P0-001: Float-for-Money at Service Boundaries

**CLAUDE.md rule:** "NEVER use float or number for monetary amounts."

**What's correct:** Prisma schema uses `Decimal(19,4)` on all money columns. `packages/common/src/financial/decimal.util.ts` uses Decimal.js with banker's rounding. Waterfall allocator in repayment-service operates entirely in string-based Decimal math.

**What's broken:** The precision guarantee is destroyed at every boundary.

| Location | Violation |
|---|---|
| `apps/graphql-server/src/graphql/inputs/create-loan-request.input.ts:16-19` | `requestedAmount` declared as `@Field(() => Float)` / `number` |
| `apps/graphql-server/src/graphql/inputs/create-product.input.ts:37-47,66-69` | `minAmount`, `maxAmount`, `interestRate` as `Float`/`number` |
| `apps/graphql-server/src/graphql/inputs/update-product.input.ts:17,23,41` | Same fields |
| `apps/graphql-server/src/graphql/resolvers/repayment.resolver.ts:19` | `amount` arg as `Float`/`number` |
| `apps/rest-server/src/repayment/repayment.controller.ts:52` | `parseFloat(body.amount)` destroys precision before service call |
| `services/repayment-service/src/payment/payment.service.ts:17,51-54,75-80` | Input type declares `amount: number`; `Number()` cast before Prisma writes |
| `services/settlement-service/src/settlement.service.ts:60,83-87,98-102,155-171` | Every `shareAmount`, `netAmount`, `grossRevenue` cast via `Number()` |
| `services/process-engine/src/contract/contract.service.ts:30,35` | `Number(lr.approvedAmount)` |
| `services/process-engine/src/interest-accrual/interest-accrual.service.ts:91,93` | `Number(amount)` for ledger writes |
| `services/process-engine/src/penalty/penalty.service.ts:57,59,95,130,132` | `Number()` casts on penalty amounts |
| `services/process-engine/src/exposure/exposure.service.ts:157,168` | `parseFloat(maxCustomerExposure) * 0.8` — float arithmetic on threshold |
| `apps/graphql-server/src/graphql/resolvers/report.resolver.ts:207-241,273-315` | Accumulates money via `amount += Number(d.amount)` then `.toFixed(2)` |

**Business impact:** Float accumulation errors will produce visible discrepancies in settlement reports, revenue calculations, and portfolio-level reporting. A loan amount of `1234.5678` could become `1234.5677999999999` after `Number()` conversion. At scale, these compound.

**Required fix:** Change all GraphQL money fields from `Float` to `String`. Change service interfaces to accept `string` amounts. Remove all `Number()` casts before Prisma writes — Prisma accepts string values for Decimal columns. Replace float accumulation in report resolver with Decimal.js aggregation.

**PM action:** Produce a dev prompt covering all affected files. This touches 6 services and 2 apps.

---

### P0-002: Row-Level Security Not Implemented on Core Tables

**CLAUDE.md rule:** "Every database table in tenant schemas uses Row-Level Security (RLS). Tenant context is resolved from JWT at the API gateway and set as a PostgreSQL session variable."

**Current state:** Only 4 ancillary tables have RLS policies (notification_provider_configs, notification_mock_log, feedbacks, survey_responses — added in Sprint 7). The following core tables have NO RLS:

- `tenants`, `users`, `roles`
- `customers`, `subscriptions`
- `products`, `product_versions`, `lenders`
- `loan_requests`, `scoring_results`
- `contracts`, `repayment_schedule_entries`, `repayments`, `disbursements`
- `ledger_entries`
- `settlements` (run + line), `reconciliation` (run + exception)
- `collections_actions`
- `notifications`, `webhook_endpoints`, `webhook_delivery_logs`
- `audit_logs`

Additionally, `SET app.current_tenant` is never called anywhere in the codebase. The `PrismaService.setTenantContext()` method exists but uses unsafe string interpolation (see P0-003 note below), and it is unclear whether it is invoked on every request.

**Business impact:** Multi-tenancy relies entirely on application-level `WHERE tenantId = ?` filtering. A single missed filter — in any new query, any join, any raw SQL — leaks data across tenants. For a platform handling regulated financial data from multiple competing institutions, this is a compliance and trust failure.

**Required fix:** Two-phase approach recommended:
- **Phase A (Sprint 10):** Enable RLS on all tenant-scoped tables. Create policies using `current_setting('app.current_tenant')`. Wire `SET LOCAL app.current_tenant` into the request lifecycle via Prisma middleware.
- **Phase B (Sprint 11):** Audit all raw queries and ensure `$executeRaw` (not `$executeRawUnsafe`) is used with parameterized values for the tenant context setter.

**PM action:** This is a migration-heavy effort. Coordinate with DE for migration safety and Dev for implementation.

---

### P0-003: No Global AuthGuard on GraphQL Server

**CLAUDE.md / Docs/10 rule:** Authentication required on all endpoints. RBAC with default roles.

**Current state:**
- `apps/graphql-server/src/app.module.ts` registers `TenantThrottlerGuard` as `APP_GUARD` but NOT `AuthGuard` or `RolesGuard`.
- Resolvers are unauthenticated by default. Only resolvers with explicit `@UseGuards()` decorators are protected.
- CORS is set to `origin: *` on both GraphQL and REST servers (`apps/graphql-server/src/main.ts:39`, `apps/rest-server/src/main.ts:35`).
- The `@Roles('admin')` decorator on `DebugResolver` has no effect without a global `RolesGuard`.
- Platform portal JWT defaults `role: 'platform_admin'` (line 61 of auth-context.tsx) when token lacks a role claim — every user is treated as admin.
- Admin portal has no per-route RBAC beyond the `/platform` section.

**Business impact:** Any unauthenticated client can query unprotected resolvers. Combined with CORS wildcard, any website can make cross-origin requests. The debug resolver is particularly concerning — it likely exposes internal system state.

**Required fix:**
1. Register `AuthGuard` as global `APP_GUARD`. Use `@Public()` decorator only for explicitly public endpoints (health check, login).
2. Register `RolesGuard` as global `APP_GUARD`. Default to requiring authentication; opt-out via decorators.
3. Configure CORS with explicit allowed origins (portal domains only).
4. Remove the platform portal role default — reject tokens without valid role claims.
5. Add per-route RBAC middleware in both portals.

**PM action:** Produce a dev prompt. This is a cross-cutting fix across both servers and both portals.

---

## P1 — High Severity

### P1-001: SQL Injection in Tenant Context Setter

`packages/database/src/prisma.service.ts:23` — `$executeRawUnsafe` with string interpolation:
```
SET LOCAL app.current_tenant = '${tenantId}'
```
If a crafted JWT contains a malicious `tenantId`, this is exploitable. Same pattern in `audit-partition-manager.ts:31,57` for partition names.

**Fix:** Use `$executeRaw` with tagged template literals (Prisma parameterizes these automatically).

---

### P1-002: No Token Revocation Mechanism

`auth.service.ts` issues refresh tokens but has no blacklist, no stored token tracking, and no revocation endpoint. A compromised refresh token remains valid for 7 days.

**Fix:** Implement Redis-backed token blacklist. Add revocation endpoint. Check blacklist on every refresh.

---

### P1-003: PII Logged in Notification Adapters

Sandbox adapters log recipient phone numbers and email addresses in plaintext:
- `email-notification.adapter.ts:18`
- `sms-notification.adapter.ts:18`
- `console-notification.adapter.ts:18`
- `webhook-delivery-exhausted.listener.ts:82`
- `mock-screening.adapter.ts:26` (logs `fullName`)

The Africa's Talking production adapter correctly uses `maskPhone()`. Sandbox adapters do not.

**Fix:** Apply `maskPhone()` / `maskEmail()` in all adapters regardless of environment.

---

### P1-004: Schema Drift — RefreshToken and ApiKey Tables

Migration `20260326221923` created `refresh_tokens` and `api_keys` tables in the database, but these models are missing from the Prisma schema file. Prisma Client cannot query them. The auth service may be using raw SQL or the tables are orphaned.

**Fix:** Add models to schema.prisma or remove the tables if unused.

---

### P1-005: 14 Foreign Key Columns Lack Indexes

The following foreign key columns have no index, causing slow joins at scale:
`ProductVersion.createdBy`, `Product.createdBy`, `LoanRequest.scoringResultId`, `LoanRequest.contractId`, `LoanRequest.processedBy`, `ScoringResult.productId`, `SettlementLine.partyId`, `Feedback.userId`, `SurveyResponse.userId`, `Notification.contractId`, `ReconciliationException.contractId`, `Disbursement.customerId`, and 2 others.

**Fix:** Add `@@index` directives in Prisma schema. Single migration.

---

### P1-006: JWT Payload Contains PII

JWT payload includes `email` and `name` fields. JWTs are base64-encoded (not encrypted), so these are readable by anyone with the token. This conflicts with the PII minimization principle.

**Fix:** Remove `email` and `name` from JWT payload. Fetch from API when needed.

---

## P2 — Medium Severity

### P2-001: 10 Business Tables Missing Soft Delete (`deleted_at`)

Tables without `deleted_at`: Role, CustomerConsent, Subscription, LoanRequest, Repayment, Disbursement, CollectionsAction, SettlementRun, SettlementLine, Feedback.

CLAUDE.md rule: "No hard deletes for business data — use deleted_at (soft delete)."

---

### P2-002: WebhookDeliveryLog Missing `tenantId`

Relies on joining through `WebhookEndpoint` for tenant context. Blocks direct RLS enforcement.

---

### P2-003: Reminder Notification Cron Job Missing

`apps/scheduler/` has interest accrual, aging, reconciliation, settlement, cooling-off, audit partition, and message retention jobs. No upcoming-payment reminder scheduler exists (required by Docs/03 FR-RP-005.2).

---

### P2-004: Recovery Strategy/Recommender Services Emit No Events

`recovery-strategy.service.ts` and `strategy-recommender.service.ts` return recommendations but emit no events. The event-driven architecture contract requires all state-affecting operations to publish events.

---

### P2-005: Admin Portal i18n — Untranslated Stubs + 10 Stale Humanized Keys

Admin portal has 697 English keys across 7 locales. French has 68 keys identical to English (untranslated). Swahili has 30, Hausa has 34.

**Updated 2026-04-30 (from PM delivery review):** The portal rebuild's humanizer pass rewrote 10 i18n keys in English. Translations for ar/es/fr/ha/pt/sw were deliberately left stale (copying English into non-English locales would degrade UX worse than stale translations). The 10 affected keys are: `messages.subtitle`, `feedback.management.subtitle`, `products.wizard.approvalWorkflowDesc`, `products.wizard.eligibilityDesc`, `products.wizard.feesDesc`, `products.wizard.notificationsDesc`, `products.wizard.fundingSourceDesc`, `products.wizard.autoApproveDesc`, `products.wizard.thresholdHelpHybrid`, `products.wizard.customRulesDesc`. This creates 60 translations needed (6 languages × 10 keys). Additionally, 22 humanized page subtitles are hardcoded English (not i18n), so they only affect English users.

**Monday.com:** Item 11853859761 (Sprint 9, Medium priority).

---

### P2-006: Platform Portal Has Zero i18n Infrastructure

All strings hardcoded in English. No locale files, no `useI18n` hook, no translation infrastructure. For a pan-African multi-market platform portal.

**Updated 2026-04-30 (from PM delivery review):** Dev explicitly left this out of the portal rebuild, noting: "No infrastructure exists; would be a separate ~100-key initiative. Eyebrow strings stay literal." The admin portal has full i18n with `useI18n` hook, locale files for 7 languages, and the new eyebrow namespace (19 keys). Platform portal has zero. Since platform portal operators are Lōns's own staff (not tenant users), the locale set may be smaller (e.g., English + French for West Africa coverage). BA to size the initiative and recommend phasing.

**Monday.com:** Item 11853861856 (Sprint 13, Medium priority).

---

### P2-007: GraphQL Playground/Introspection Gated Only by NODE_ENV

Enabled unless `NODE_ENV === 'production'`. If staging uses a different value, the full schema is exposed.

---

### P2-008: Hardcoded Seed Passwords in Source

`packages/database/prisma/seed.ts:546-550,1707-1710` contains passwords like `SpAdmin123!@#`. Risk if seed runs in staging/production.

---

### P2-009: Debug Page Environment Guard Doesn't Block Rendering

`admin-portal/src/app/(portal)/debug/page.tsx` checks `NEXT_PUBLIC_STAGING_DEBUG_MODE` at module level but does not block rendering — silently proceeds.

---

## P3 — Low Severity / Known Gaps

### P3-001: analytics-service Missing as Standalone Service

CLAUDE.md specifies `services/analytics-service/`. It does not exist. Analytics logic is embedded in `process-engine/src/analytics/`. This is an architectural deviation from the stated microservice design.

---

### P3-002: Merchant and Debtor Tables Absent from Schema

Required for BNPL (Sprint 11) and Invoice Factoring (Sprint 12). BA specs are ready. Tables will be added when Dev implements these product types.

---

### P3-003: Settings Integration Page Uses Raw Fetch Instead of Apollo

`admin-portal/src/app/(portal)/settings/integrations/page.tsx` bypasses the Apollo client and uses raw `fetch`. Inconsistent but functional.

---

### P3-004: FCM Push and Twilio Notification Adapters Are Stubs

Both throw `NotImplementedException`. Acceptable for current phase — Phase 5 deliverable.

---

### P3-005: Standalone Blacklist Table Missing

Customer blacklisting uses `Customer.status = blacklisted` with `blacklistReason` field. No standalone table for tracking blacklist history, date ranges, or cross-tenant blacklists (Docs/04 FR-CM-004.3 requires reason code, date added, added by, expiry date, notes).

---

---

## PART 2: Extended Audit (Test Suite, Event Contracts, Lifecycle, CI/CD, Shared Packages)

---

## 14. Test Suite Health

### 14.1 Test File Inventory (~93 test files)

| Area | Test Files | Notes |
|---|---|---|
| `packages/common` | 16 | Financial, encryption, security, audit, observability, masking |
| `services/process-engine` | 13 | State machine, scoring, penalty, interest, cooling-off, integration |
| `services/repayment-service` | 2 | Schedule generator, waterfall allocator |
| `services/settlement-service` | 2 | Ledger, post-processing integration |
| `services/entity-service` | 5 | Auth, JWT, API key, roles guard, anonymization |
| `services/integration-service` | 6 | Circuit-breaker, wallet adapters, health, screening |
| `services/notification-service` | 8 | Webhooks, adapters, templates, service |
| `services/recovery-service` | 5 | Predictive risk, restructuring, strategy, outcome, network |
| `apps/admin-portal` (e2e) | 7 | Auth, dashboard, products, customers, loans, collections, reports |
| `apps/graphql-server` | 4 | Subscriptions, cross-tenant, x-tenant-context, integration resolver |
| `apps/rest-server` | 5 | Response envelope, exception filter, e2e, API key guard |
| `apps/scheduler` | 1 | Cooling-off expiry job only |
| `tests/regression` | 8 | Loan lifecycle, repayment, overdue-recovery, settlement, tenant-isolation, auth, webhooks, admin-ops |
| `scoring-service` (Python) | 8 | Scoring, feature engineering, drift detection, scorecard, ML e2e |

### 14.2 Findings

**P1-007: Coverage thresholds not enforced across services.** Only `packages/common` has a coverage threshold (set at 70%, below the 80% CLAUDE.md target). All other services have jest configs with no `coverageThreshold` block. The 80% business logic coverage target is unenforceable in CI.

**P1-008: Reconciliation service has zero tests.** `services/reconciliation-service/` has a jest config but no `.spec.ts` files. This is a critical financial operation (daily batch reconciliation of all account balances) with no test coverage whatsoever.

**P2-010: No dedicated idempotency tests.** Idempotency is required on all mutations per CLAUDE.md, and the implementation exists, but there are no isolated test cases verifying the idempotency behavior (duplicate request rejection, key collision handling).

**P2-011: Financial edge cases incomplete.** Decimal/money utility tests cover banker's rounding and basic operations but are missing: maximum-amount boundary tests, overflow/underflow protection, negative amount handling in multiply, large-amount precision tests beyond 4 decimal places. Waterfall allocator tests lack negative payment amount and rounding-at-boundary cases.

**P2-012: Event contracts have zero tests.** `packages/event-contracts/` has no schema validation tests. Event payloads could drift from their TypeScript interfaces without detection.

**P2-013: E2E jest config points to empty directory.** `tests/jest.config.ts` matches `e2e/**/*.e2e-spec.ts` but no such files exist. The regression suite at `tests/regression/` is the actual integration test suite.

**P3-006: Platform portal has zero tests.** Has jest config but no spec files. Only admin portal has e2e tests.

**P3-007: Services with no tests at all:** `reconciliation-service`, `analytics-service` (embedded in process-engine), `packages/database`, `packages/event-contracts`, `packages/shared-types`.

---

## 15. Event Contract Consistency

### 15.1 Architecture

Event base type (`IBaseEvent<T>`) correctly defines `{ event, tenantId, timestamp, correlationId, data }` in `packages/event-contracts/src/base-event.ts`. However, `packages/common/src/events/event-bus.service.ts` declares its own duplicate `IBaseEvent` instead of importing from `@lons/event-contracts` — type drift risk.

### 15.2 Findings

**P1-009: 25 events defined in contracts but never emitted (dead schemas).**

All 14 entity events are dead: `tenant.created`, `tenant.updated`, `tenant.suspended`, `user.created`, `user.updated`, `user.deactivated`, `user.login`, `user.logout`, `product.created`, `product.updated`, `product.activated`, `product.suspended`, `product.discontinued`, `customer.created`, `customer.updated`, `customer.unblacklisted`, `subscription.activated`, `subscription.deactivated`, `lender.created`, `lender.updated`. The entity-service only emits anonymization events.

Also dead: `offer.sent`, `offer.expired`, `notification.sent`, `notification.failed`, `notification.delivered`, `webhook.delivery_attempted`, `webhook.delivery_succeeded`, `webhook.delivery_failed`, `ml_model.trained`, `ml_model.activated`, `ml_model.drift_detected`, `audit.entry_created`, `repayment.failed`.

**Business impact:** SP webhook subscribers will never receive entity lifecycle notifications. If an SP expects to be notified when a customer is created, a product is activated, or a loan offer is sent — those events never fire.

**P1-010: correlationId never propagated between chained events.** `EventBusService.emitAndBuild()` accepts optional `correlationId` but no producer ever passes one. Every event gets a fresh UUID. When aging triggers `CONTRACT_STATE_CHANGED` then `CONTRACT_AGED`, they get independent IDs — breaking event chain traceability.

**P1-011: contract.state_changed payload mismatch.** Two services emit this event with different payloads:
- `aging.service.ts`: `{ contractId, previousStatus, newStatus }` — matches `IContractStateChangedEvent`
- `adaptive-actions.service.ts:148`: `{ contractId, suggestion, reason }` — does NOT match the interface

Any consumer expecting `previousStatus`/`newStatus` will receive `suggestion`/`reason` from the adaptive-actions path.

**P2-014: webhook.delivery_exhausted bypasses EventBusService.** Emitted via raw `this.eventEmitter.emit()` without the `IBaseEvent` wrapper (no `tenantId`, `timestamp`, `correlationId`). Violates the standard event contract format.

**P2-015: Duplicate IBaseEvent definition.** `event-bus.service.ts` redeclares `IBaseEvent` instead of importing from `@lons/event-contracts`. If the shapes diverge, events could be malformed without type errors.

**P2-016: Event naming convention inconsistent.** Mixed 2/3/4-level dot notation: `contract.state_changed` (2-level, correct), `contract.cooling_off.started` (3-level), `exposure.limit.check.passed` (4-level), `screening.match.found` (3-level), `collections_action.logged` (uses underscore instead of dot).

**P3-008: repayment.failed never emitted.** Defined with a typed interface but payment failures do not emit this event. Failures are silent at the event level.

---

## 16. End-to-End Loan Lifecycle Trace (Micro-Loan)

Traced the complete flow: request → validate → pre-qualify → score → approve → offer → accept → contract → disburse → repay → settle.

### 16.1 Flow Summary

| Step | Service/File | Status |
|---|---|---|
| 1. Create request | `process-engine/loan-request.service.ts` | Works — creates record, emits event |
| 2. Validate | `loan-request.service.ts:160-228` | Works — checks customer, product, amounts, limits |
| 3. Pre-qualify | `pre-qualification.service.ts` | Works — blacklist, KYC, eligibility rules, exposure check |
| 4. Score | `scoring.service.ts` | Works — rule-based scoring only (ML not wired, expected) |
| 5. Approve | `approval.service.ts` | Partial — auto/semi-auto works, manual approval **has no resolver** |
| 6. Offer | `offer.service.ts` | Works — generates terms, expiry, acceptance flow |
| 7. Contract | `contract.service.ts` | Works — creates contract, schedule, emits event |
| 8. Disburse | `disbursement.service.ts` | Works — AML gate, wallet transfer, retry, cooling-off |
| 9. Repay | `repayment-service/payment.service.ts` | Works — waterfall allocation, ledger, auto-settle |
| 10. Settle | `settlement-service/settlement.service.ts` | Partial — calculates but **no scheduler trigger** |

### 16.2 Chain-Break Findings

**P1-012: No GraphQL mutation for manual loan approval.** `ApprovalService.approveManual()` and `rejectManual()` exist as service methods, but no GraphQL resolver exposes them. Loans routed to `manual_review` status are stuck — admin users have no API endpoint to approve or reject them. This breaks the semi-auto and manual approval workflows specified in Docs/05.

**P1-013: No inbound payment webhook endpoint.** There is no REST controller or webhook handler for wallet providers to push payment notifications. Repayments can only come through the internal `PaymentService.processPayment()` method. In production, wallet providers (MTN MoMo, M-Pesa) push payment callbacks to a webhook — that endpoint doesn't exist. This breaks the automated repayment flow for all wallet-backed loan products.

**P2-017: No disbursement ledger entry.** Contract creation and disbursement do not write ledger entries. The ledger starts recording only at repayment. For proper double-entry accounting, a debit entry should be created when funds are disbursed to the customer. Without this, the ledger does not represent the complete financial lifecycle of a loan.

**P2-018: Settlement has no automated scheduler trigger.** The `apps/scheduler/` has cron jobs for interest accrual, aging, reconciliation, cooling-off, audit partitions, and message retention — but no settlement job. Settlement calculations must be triggered manually. This means revenue distribution to SPs and lenders does not happen automatically.

---

## 17. CI/CD Pipeline

### 17.1 Workflow Inventory (6 workflows)

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push to main/develop, PRs to main | Lint, test, build, Docker image push, Trivy scan |
| `deploy.yml` | CI completion or manual | 4-environment deploy (dev, staging, preprod, prod) |
| `sast.yml` | Push/PR + weekly schedule | CodeQL, Semgrep OWASP, dependency audit |
| `prisma-migration-test.yml` | PRs changing prisma/ | Tests fresh reset, migrate deploy, seed |
| `load-test.yml` | Manual dispatch only | k6 load tests (6 types, 5 profiles) |
| `terraform.yml` | Infrastructure changes | Validate, plan, apply across 4 envs |

### 17.2 Findings

**P1-014: No coverage enforcement in CI.** `pnpm test` runs without `--coverage` flag. No global coverage threshold. The 80% CLAUDE.md requirement is not enforced by any gate.

**P1-015: Production deploy has no E2E gate.** Preprod requires E2E tests, but the `deploy-production` job has `needs: []` — it relies solely on GitHub environment protection rules. A developer with environment approval can deploy untested code to production.

**P2-019: No dedicated typecheck step.** CI runs `pnpm lint` and `pnpm build` (which invokes `tsc`), so type errors surface at build time. But a dedicated `tsc --noEmit` step would catch issues earlier and faster. `turbo.json` has no `typecheck` task defined.

**P2-020: Security audit soft-fails in CI.** The CI workflow runs `pnpm audit --audit-level=critical || true` — the `|| true` means critical vulnerabilities do not block the build. The SAST workflow enforces `pnpm audit --audit-level=critical` strictly. This inconsistency means a PR can merge with known critical vulns.

---

## 18. Shared Packages

### 18.1 packages/common — Solid with Minor Issues

11 modules exported: financial, pagination, encryption, errors, idempotency, events, observability, audit, rate-limiting, security, tenant-settings. Barrel export at `src/index.ts`.

Encryption (AES-256-GCM): correctly implemented. Key provider factory supports env, Vault, AWS Secrets Manager. Field-encryption middleware, key rotation service, startup validator all present. Well-architected.

Financial utilities: Decimal.js with `ROUND_HALF_EVEN`, 4-decimal-place strings, `IMoney.amount: string`. Correct.

**P2-021: PII masker misses date_of_birth and full_name fields.** The `LoggerService` calls `maskPII()` on data payloads using field-name matching for phone, email, nationalId, password, secret, token. Missing from the mask list: `date_of_birth` and `full_name` (when paired with ID), which CLAUDE.md explicitly lists as PII requiring masking. Also does not handle arrays of objects containing PII.

**P3-009: Duplicate PII masking modules.** `src/encryption/masking.util.ts` (exported) and `src/masking/pii-masker.ts` (internal only, not in barrel export). The logger uses the internal one. Tech debt but not a bug.

---

## 19. Portal Rebuild Delivery Review (Added 2026-04-30)

On 2026-04-26, Dev delivered a major portal rebuild covering 60+ page visual rebuilds, 7 new shared UI primitives, mobile responsive layout, accessibility additions, performance optimizations (motion.tr → CSS keyframe migration), i18n eyebrow namespace (19 keys, 7 locales), humanizer pass (22 subtitles + 10 i18n descriptions rewritten), and 9 bug fixes. The delivery explicitly states no business logic changed — only presentation, copy, and accessibility.

PM reviewed the delivery and produced `Docs/PM-NOTES-FOR-BA-DELIVERY-REVIEW-2026-04-27.md` with resolved decisions and open items. The following findings are incorporated into this audit from that review.

### 19.1 Findings

**~~P2-022~~ WITHDRAWN: Skip-to-main-content accessibility link — already implemented.** PM's delivery review reported this as missing based on a grep that returned no results. BA independently verified the code on 2026-04-30 and found the skip link IS correctly implemented in both portals:

- `apps/admin-portal/src/app/(portal)/layout.tsx:55-59` — `<a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to main content</a>` as first focusable element inside `LayoutShell`
- `apps/platform-portal/src/app/(portal)/layout.tsx:55-59` — identical implementation
- Both have `id="main-content"` and `tabIndex={-1}` on the `<main>` element (lines 72-73)
- Styling correctly uses `sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]` — visible on keyboard focus, hidden otherwise
- Link appears above both sidebar and header due to `z-[60]` and `fixed` positioning

The implementation satisfies WCAG 2.1 AA Success Criterion 2.4.1 (Bypass Blocks). No fix doc needed. PM should update Monday.com item 11853861568 to Done.

**FIX-SKIP-LINK.md: Not produced — finding withdrawn.**

**P3-010: 5 stale coral CSS references in comments.** Emmanuel approved emerald (`#10B97D` / `#1FE08A`) as the accent color and retired coral (`#FF6B35`). Dev implementation is correct (CSS custom properties use emerald), but 5 CSS comments in `globals.css` (lines 361, 645, 664, 741, 950) still reference coral. Cosmetic only — no functional impact.

**Monday.com:** Item 11853871130 (CSS comment cleanup, unblocked by brand decision).

### 19.2 Sprint 8 Functional Items — 9 Remain Open

The portal rebuild delivery explicitly did not address any Sprint 8 functional items. All 9 items that were "In Review" remain open — the visual infrastructure (pages, primitives) is in place, but business logic, data integration, and GraphQL mutations are not implemented:

| Item ID | Name |
|---|---|
| 11708084110 | Add Funding Source step to product wizard |
| 11708162407 | BUG: Audit Lender configuration in admin portal |
| 11708149659 | BUG: Fix Lender and stakeholder detail views |
| 11708159812 | Add credit scoring visibility |
| 11708142179 | Platform Portal: Add user management |
| 11708150027 | Platform Portal: Add audit log viewer |
| 11708162464 | Platform Portal: SP detail view with analytics |
| 11708150512 | SP Portal: Settlement report and revenue insights |
| 11708149685 | SP Portal: Send messages and notifications |

These items will need functional review against their specs when Dev implements them. No BA action required now.

### 19.3 Positive Precedent (Not Gaps)

The following delivery patterns are positive precedent for future specs. Emmanuel approved the mission-control visual language, and the emerald brand color is confirmed. Future BA specs should reference the established UI primitives (`PageBackdrop`, `.card-glow` variants, `edgeSweep`/`liveDot`/`kpiGlowBreath`/`tableRowReveal` animations, translucent sidebar/header, `MotionConfig reducedMotion="user"`, print stylesheet) rather than specifying new visual patterns.

---

### 18.2 packages/shared-types — Clean

19 enum files, 18 interface files, 4 constant files. Covers all entities. Money amounts typed as `string` throughout — correct. Common base types (`IBaseEntity`, `ISoftDeletable`, `ITenantScoped`, `IConnection<T>`, `ICursorPaginationArgs`) all present.

### 18.3 packages/event-contracts — Structure Sound, Usage Broken

4 source files with typed events extending `IBaseEvent<T>`. Money amounts in events use `string`. Structure is correct — the issues are in how services use (or don't use) these contracts (covered in Section 15).

### 18.4 packages/database — SQL Injection Confirmed

`PrismaService.setTenantContext()` uses `$executeRawUnsafe` with string interpolation — confirmed SQL injection vector (already flagged as P1-001). Seed data uses argon2id for password hashing with proper parameters. Comprehensive RBAC roles with granular permissions in seed.

---

## Summary

| Severity | Count | Status |
|---|---|---|
| P0 — Go-Live Blocker | 3 | PM action required — dev prompts needed |
| P1 — High | 15 | Should fix before launch |
| P2 — Medium | 21 (+1 withdrawn) | Fix during hardening sprints (13A/13B) |
| P3 — Low / Known | 10 | Tracked, acceptable for current phase |
| **Total** | **49 active** (50 including 1 withdrawn) | |

### Complete Finding Index

**P0 (Go-Live Blockers — Owner Confirmed):**
P0-001: Float-for-money at service boundaries
P0-002: RLS not implemented on core tables
P0-003: No global AuthGuard on GraphQL server + CORS wildcard

**P1 (High — Fix Before Launch):**
P1-001: SQL injection in tenant context setter
P1-002: No token revocation mechanism
P1-003: PII logged in notification adapters
P1-004: Schema drift — RefreshToken/ApiKey tables
P1-005: 14 foreign key columns lack indexes
P1-006: JWT payload contains PII
P1-007: Coverage thresholds not enforced across services
P1-008: Reconciliation service has zero tests
P1-009: 25 events defined but never emitted (dead schemas)
P1-010: correlationId never propagated between chained events
P1-011: contract.state_changed payload mismatch between services
P1-012: No GraphQL mutation for manual loan approval
P1-013: No inbound payment webhook endpoint
P1-014: No coverage enforcement in CI
P1-015: Production deploy has no E2E gate

**P2 (Medium — Hardening Sprints):**
P2-001: 10 business tables missing soft delete
P2-002: WebhookDeliveryLog missing tenantId
P2-003: Reminder notification cron job missing
P2-004: Recovery strategy services emit no events
P2-005: Admin portal i18n — untranslated stubs + 10 stale humanized keys
P2-006: Platform portal has zero i18n infrastructure (~100 keys)
P2-007: GraphQL introspection gated only by NODE_ENV
P2-008: Hardcoded seed passwords in source
P2-009: Debug page environment guard doesn't block rendering
P2-010: No dedicated idempotency tests
P2-011: Financial edge case tests incomplete
P2-012: Event contracts have zero tests
P2-013: E2E jest config points to empty directory
P2-014: webhook.delivery_exhausted bypasses EventBusService
P2-015: Duplicate IBaseEvent definition
P2-016: Event naming convention inconsistent
P2-017: No disbursement ledger entry (breaks double-entry)
P2-018: Settlement has no automated scheduler trigger
P2-019: No dedicated typecheck step in CI
P2-020: Security audit soft-fails in CI
P2-021: PII masker misses date_of_birth and full_name fields
~~P2-022: Skip-to-main-content accessibility link missing~~ — WITHDRAWN (already implemented, verified by BA)

**P3 (Low — Tracked):**
P3-001: analytics-service not standalone
P3-002: Merchant/Debtor tables absent (expected, Sprint 11/12)
P3-003: Integration settings page uses raw fetch
P3-004: FCM/Twilio notification adapters are stubs
P3-005: No standalone blacklist history table
P3-006: Platform portal has zero tests
P3-007: Multiple services/packages with zero tests
P3-008: repayment.failed event never emitted
P3-009: Duplicate PII masking modules
P3-010: 5 stale coral CSS references in comments

---

## Deviations from Business Objectives

Beyond the technical findings above, the audit confirms alignment with the core business objectives stated in Docs/00:

- **Four product types in scope** — Micro-Loan lifecycle is largely complete. Overdraft, BNPL, and Invoice Factoring have BA specs ready and are planned for Sprints 10–12. No deviation.
- **Underbanked demographics / African markets** — The platform supports mobile money adapters (MTN MoMo, M-Pesa), local language i18n (Swahili, Hausa), and African credit bureau adapters. No deviation from target market.
- **AI-driven credit scoring** — Rule-based scoring is operational. ML is correctly deferred to Phase 5 with a mock model placeholder. No deviation.
- **Multi-tenant SaaS** — Architecture is multi-tenant throughout. The RLS gap (P0-002) is an implementation gap, not a design deviation.
- **Event-driven architecture** — 63 files emit events. Event contracts are defined. The pattern is well-established.

**No strategic deviations from business objectives were found.** The issues are implementation-quality gaps, not directional misalignment.

---

*End of BA Platform Audit — 2026-04-28*
