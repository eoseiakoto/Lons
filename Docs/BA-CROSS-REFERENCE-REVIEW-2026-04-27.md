# BA Cross-Reference Review: Requirements vs. Implementation

**Author:** Business Analyst (Claude)
**Date:** 2026-04-27
**Scope:** All FR-* requirements in Docs/01–13 verified against sprint plan + codebase evidence
**Requested by:** Emmanuel (Project Owner)

---

## Executive Summary

This review cross-references every functional requirement (FR-*) across Docs/01 through Docs/13 against the current sprint plan, codebase, and BA specifications. The review identifies what is fully covered, what is partially implemented, and what has no implementation or sprint coverage.

**Total requirements assessed:** ~430 FR-* items across 13 documents

| Category | Count | Percentage |
|---|---|---|
| Fully covered (code exists or sprint-planned with spec) | ~230 | ~53% |
| Partially covered (framework exists, detail missing) | ~110 | ~26% |
| Not covered (no code, no sprint plan, no spec) | ~90 | ~21% |

**Key finding:** The platform's foundation is solid — core loan lifecycle, entity management, process engine, authentication, and admin portal structure are in place. The gaps cluster in three areas: (1) product-type-specific features for BNPL and Invoice Factoring, (2) advanced post-processing (settlements, reconciliation, collections AI), and (3) external integrations. These are expected given we are mid-Phase 2, with Phases 3–5 addressing most gaps.

---

## 1. Docs/01 — Loan Portfolio (FR-OD, FR-ML, FR-BN, FR-IF)

### 1.1 Overdraft (FR-OD-001 through FR-OD-005) — 14 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 4 | FR-OD-001.1–001.3 (limit structure, tiered limits, limit expiry), FR-OD-002.1 (auto-repayment on credit) |
| Partial | 4 | FR-OD-001.4 (limit increase rules — product config exists, rules engine stub), FR-OD-002.2 (partial repayment allocation), FR-OD-003 (interest accrual — daily calculation exists, overdraft-specific rates not differentiated) |
| Not covered | 6 | FR-OD-004.1–004.3 (real-time wallet hook, sub-second eligibility, auto-disbursement), FR-OD-005.1–005.2 (overdraft usage analytics, utilization reporting) |

**BA spec status:** ADR-overdraft-realtime.md covers the architecture decision (separate service recommended) but no full implementation spec exists. The real-time wallet integration (FR-OD-004) is the critical dependency — this requires external wallet provider APIs and is planned for Phase 5.

**Risk:** Overdraft is the highest-demand product in African markets. FR-OD-004 (real-time auto-disbursement) is the core value proposition. Currently no code and no sprint plan before Sprint 12.

**Recommendation:** BA should produce a full Overdraft implementation spec (SPEC-overdraft.md) covering the real-time flow, limit management, and interest differentiation. Target: ready before Sprint 11 start so Dev can plan accordingly.

---

### 1.2 Micro-Loan (FR-ML-001 through FR-ML-004) — 12 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 8 | FR-ML-001 (application flow — process engine handles full lifecycle), FR-ML-002 (fixed-term structure, tenor options), FR-ML-003.1–003.2 (repayment schedule generation, lump-sum and installment options), FR-ML-004.1 (early settlement allowed) |
| Partial | 3 | FR-ML-003.3 (waterfall allocation — implemented but penalty allocation order not configurable), FR-ML-004.2 (early settlement fee calculation — code exists but not tested for all product configs) |
| Not covered | 1 | FR-ML-004.3 (early settlement disclosure to customer before confirmation) |

**Assessment:** Micro-Loan is the most complete product type. The core lifecycle works end-to-end. Remaining gaps are refinements, not blockers.

---

### 1.3 BNPL (FR-BN-001 through FR-BN-005) — 14 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 2 | FR-BN-001.1 (installment plan structure in product config), FR-BN-002.1 (customer eligibility check via scoring) |
| Partial | 2 | FR-BN-003 (merchant settlement — concept exists in BA spec but no code), FR-BN-005 (refund handling — BA spec defines flow, not implemented) |
| Not covered | 10 | FR-BN-001.2–001.4 (purchase-triggered origination, POS/checkout integration, merchant-facing API), FR-BN-002.2–002.3 (real-time approval at checkout, split decision), FR-BN-004 (merchant onboarding and management portal), FR-BN-005.2–005.3 (partial refund recalculation, merchant clawback) |

**BA spec status:** SPEC-bnpl-merchant.md is complete and covers FR-BN-001–005 with Prisma schema, GraphQL mutations, and flow diagrams. The spec is ready for Dev.

**Risk:** BNPL requires merchant entity and POS integration — these are new entity types and external API surfaces. Sprint 11 is the target but the merchant onboarding flow alone is a significant piece of work.

---

### 1.4 Invoice Factoring (FR-IF-001 through FR-IF-004) — 10 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 0 | — |
| Partial | 0 | — |
| Not covered | 10 | All of FR-IF-001 through FR-IF-004 (debtor entity, invoice submission, advance calculation, debtor payment collection, reserve release) |

**BA spec status:** SPEC-invoice-factoring.md is complete and covers FR-IF-001–004 with Prisma schema, flow diagrams, and advance rate mechanics. Ready for Dev.

**Risk:** Invoice Factoring is the most complex product type (B2B, debtor management, invoice verification, partial advance). Sprint 12 is the target. This is correctly deferred — Enterprise tier only.

---

## 2. Docs/02 — Qualification & Scoring (FR-PQ, FR-CS, FR-DI, FR-SM)

### 2.1 Pre-Qualification (FR-PQ-001 through FR-PQ-003) — 9 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 6 | FR-PQ-001.1–001.3 (product eligibility rules, blacklist/watchlist check, KYC level check), FR-PQ-002.1–002.2 (pre-qual result caching, re-check on application), FR-PQ-003.1 (bulk pre-qual batch) |
| Partial | 2 | FR-PQ-002.3 (configurable expiry on pre-qual results — hardcoded 24h), FR-PQ-003.2 (pre-qual analytics/conversion funnel) |
| Not covered | 1 | FR-PQ-003.3 (A/B test different pre-qual criteria) |

---

### 2.2 Credit Scoring (FR-CS-001 through FR-CS-004) — 12 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 5 | FR-CS-001.1–001.3 (rule-based scoring engine in Python, configurable rule weights, score bands), FR-CS-002.1 (ML model interface defined in FastAPI), FR-CS-003.1 (score explanation/factors) |
| Partial | 4 | FR-CS-001.4 (scoring model versioning — version field exists, no A/B testing), FR-CS-002.2 (model training pipeline — placeholder, no actual ML), FR-CS-003.2 (score history per customer — stored but no trend analysis), FR-CS-004 (model monitoring — basic logging, no drift detection) |
| Not covered | 3 | FR-CS-002.3 (champion/challenger model deployment), FR-CS-004.2 (automated model retraining triggers), FR-CS-004.3 (regulatory model explainability report) |

---

### 2.3 Data Integration for Scoring (FR-DI-001 through FR-DI-003)

| Status | Count | Details |
|---|---|---|
| Covered | 2 | FR-DI-001 (wallet transaction data ingestion), FR-DI-002 (credit bureau data interface — adapter pattern exists) |
| Not covered | 3 | FR-DI-003.1–003.3 (alternative data sources: USSD usage, airtime purchase patterns, social signals) |

**Note:** Alternative data sources (FR-DI-003) are Phase 5. PM decision: defer to post-launch. This is acceptable — they are "Could" priority.

---

## 3. Docs/03 — Repayments & Recovery (FR-RP, FR-OD-R, FR-CW, FR-RC)

### 3.1 Repayment Processing (FR-RP-001 through FR-RP-005) — 15 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 9 | FR-RP-001 (payment receipt and recording), FR-RP-002.1–002.3 (waterfall allocation: fees → interest → principal), FR-RP-004.1–004.2 (auto-deduction scheduling, retry logic), FR-RP-005.1 (repayment receipt notification) |
| Partial | 4 | FR-RP-002.4 (configurable allocation order — hardcoded waterfall), FR-RP-003 (early settlement — calculation exists, customer disclosure flow not implemented), FR-RP-004.3 (partial auto-deduction when balance insufficient), FR-RP-005.2 (upcoming payment reminder scheduling) |
| Not covered | 2 | FR-RP-003.2 (early settlement penalty waiver rules), FR-RP-005.3 (multi-channel reminder escalation: SMS → push → call) |

---

### 3.2 Overdue & Collections (FR-OD-R, FR-CW, FR-RC) — 16 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 7 | FR-OD-R-001 (aging classification: current, 1-30, 31-60, 61-90, 90+), FR-OD-R-002 (penalty calculation and application), FR-CW-001.1 (collections queue generation), FR-CW-001.2 (queue prioritization by amount and age) |
| Partial | 5 | FR-CW-002.1 (collections workflow stages — defined, not all transitions coded), FR-CW-002.2 (collections action logging), FR-RC-001 (recovery rate tracking — basic metrics, no cohort analysis), FR-OD-R-003 (provision calculation — aging bands exist, provision rates not configurable) |
| Not covered | 4 | FR-CW-002.3 (promise-to-pay tracking and breach detection), FR-CW-003 (AI-driven recovery strategy engine), FR-RC-002 (write-off workflow with approval chain), FR-RC-003 (regulatory reporting on defaults/NPLs) |

**Note:** FR-CW-003 (AI recovery) is Phase 5 and correctly deferred. FR-RC-002 (write-off) and FR-RC-003 (regulatory default reporting) should be Sprint 13A at the latest — they are compliance-adjacent.

---

## 4. Docs/04 — Entity Management (FR-SP, FR-LP, FR-CM)

### 4.1 Service Provider / Tenant (FR-SP-001 through FR-SP-004) — 14 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 10 | FR-SP-001.1–001.2 (tenant creation, schema provisioning), FR-SP-002.1–002.2 (configuration, audit), FR-SP-003.1–003.3 (user CRUD, RBAC, default roles), FR-SP-004.1–004.3 (lender CRUD, config, product linkage) |
| Partial | 3 | FR-SP-001.3 (60s provisioning SLA — not measured), FR-SP-003.4 (MFA — JWT auth exists, TOTP not implemented), FR-SP-003.5 (account lockout — not implemented) |
| Not covered | 1 | FR-SP-005 (Self-Funded Lender — just added to spec today, implementation at FIX-SELF-FUNDED-PRODUCT-ACTIVATION.md, code fix pending) |

**Note:** FR-SP-005 was added to Docs/04 in this review session. The fix prompt exists. Dev should implement in current sprint.

---

### 4.2 Loan Products (FR-LP-001 through FR-LP-004) — 12 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 8 | FR-LP-001.1–001.4 (product lifecycle states), FR-LP-002.1 (product configuration — comprehensive), FR-LP-002.2 (product-type-specific params), FR-LP-003.1 (versioning on config change) |
| Partial | 3 | FR-LP-003.2 (contracts bound to version — field exists, not enforced on all paths), FR-LP-003.3 (version history API — not exposed in GraphQL), FR-LP-004.1 (customer segmentation — target segment field exists, enforcement not coded) |
| Not covered | 1 | FR-LP-003.4 (side-by-side version comparison UI) |

---

### 4.3 Customer Management (FR-CM-001 through FR-CM-006) — 18 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 8 | FR-CM-001.1–001.2 (customer record, auto-creation), FR-CM-004.1–004.4 (blacklist/watchlist with reason codes, pre-qual check), FR-CM-005.1 (consent recording), FR-CM-006.1 (PII encryption) |
| Partial | 5 | FR-CM-001.3 (de-duplication — external ID match exists, no phone+ID composite matching), FR-CM-005.2 (consent versioning — timestamps exist, no revocation tracking), FR-CM-005.3 (consent enforcement — not wired to data access), FR-CM-006.3 (retention periods — not configurable, uses defaults) |
| Not covered | 5 | FR-CM-002.1–002.3 (financial profile aggregation, real-time update, historical retention), FR-CM-003.1–003.2 (credit summary view — no API endpoint, no portal UI), FR-CM-006.2 (data anonymization), FR-CM-006.4 (data portability export) |

**Risk:** FR-CM-002 (financial profile) and FR-CM-003 (credit summary) are Must-priority requirements with zero implementation. These are foundational for the scoring engine and customer-level risk visibility. They should be prioritized in Sprint 10 or 11.

---

## 5. Docs/05 — Process Engine (FR-PE, FR-AE)

### Process Engine (FR-PE-001 through FR-PE-006) — 18 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 13 | FR-PE-001 (state machine: received → disbursed), FR-PE-002 (validation rules), FR-PE-003 (scoring integration), FR-PE-004 (approval routing — auto/manual/hybrid), FR-PE-005 (offer generation and acceptance), FR-PE-006.1 (contract creation from accepted offer) |
| Partial | 3 | FR-PE-004.2 (approval authority limits — role check exists, amount limits not enforced), FR-PE-006.2 (disbursement retry logic — basic retry, no exponential backoff), FR-PE-006.3 (disbursement status callback from wallet) |
| Not covered | 2 | FR-AE-002.4 (approval escalation chain with timeout), FR-PE-007 (application withdrawal/cancellation by customer) |

**Assessment:** Process engine is the strongest area of the codebase. 72% fully covered. The state machine is well-implemented with event-driven transitions.

---

## 6. Docs/06 — Post-Processing (FR-LE, FR-RS, FR-RC, FR-DF)

### 6.1 Ledger Engine (FR-LE-001 through FR-LE-003) — 9 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 6 | FR-LE-001 (double-entry append-only), FR-LE-002.1 (entry types: disbursement, repayment, interest, fee, penalty, adjustment), FR-LE-002.2 (balance derivation from entries), FR-LE-003.1 (ledger immutability) |
| Partial | 2 | FR-LE-002.3 (correction entries — code exists but no reversal workflow), FR-LE-003.2 (audit trail for corrections) |
| Not covered | 1 | FR-LE-003.3 (ledger reconciliation with external systems) |

---

### 6.2 Revenue & Settlement (FR-RS-001 through FR-RS-003) — 9 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 3 | FR-RS-001.1 (revenue calculation from interest/fees), FR-RS-002.1 (settlement generation with line items) |
| Partial | 3 | FR-RS-001.2 (distribution models — percentage split works, tiered/threshold models not implemented; PM decided percentage-only for v1.0), FR-RS-002.2 (settlement approval workflow — basic, no multi-level), FR-RS-003.1 (settlement execution — record created, actual fund transfer not wired to wallet) |
| Not covered | 3 | FR-RS-003.2 (settlement execution via wallet API), FR-RS-003.3 (settlement reconciliation — receipt matching), FR-RS-003.4 (settlement dispute handling) |

---

### 6.3 Reconciliation (FR-RC-001 through FR-RC-003) — 6 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 2 | FR-RC-001.1 (daily reconciliation batch job exists in scheduler), FR-RC-001.2 (mismatch detection) |
| Partial | 2 | FR-RC-002 (exception handling — mismatches flagged, no resolution workflow), FR-RC-003.1 (reconciliation reporting — basic, no history/trend) |
| Not covered | 2 | FR-RC-003.2 (reconciliation history/audit trail), FR-RC-003.3 (auto-resolution rules for common mismatches) |

---

## 7. Docs/07 — API Specifications (FR-GQL, FR-REST, FR-WH)

### 7.1 GraphQL API (FR-GQL-001 through FR-GQL-004) — 12 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 9 | FR-GQL-001 (code-first schema with NestJS decorators), FR-GQL-002 (queries: entities, products, customers, contracts, ledger), FR-GQL-003.1–003.3 (mutations with idempotencyKey, structured errors), FR-GQL-004.1 (cursor-based pagination) |
| Partial | 2 | FR-GQL-002.4 (field-level authorization on PII — resolver guards exist, not on all sensitive fields), FR-GQL-004.2 (query complexity limits — not configured) |
| Not covered | 1 | FR-GQL-005 (GraphQL subscriptions for real-time events) |

---

### 7.2 REST API & Webhooks (FR-REST, FR-WH) — 10 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 4 | FR-REST-001 (REST server with Swagger/OpenAPI), FR-REST-002 (webhook endpoint for wallet callbacks), FR-REST-003 (API key authentication for integrations) |
| Partial | 3 | FR-REST-004 (rate limiting — throttler configured but crashed in testing per BA-OBS-001), FR-WH-001 (webhook delivery — schema defined in event-contracts, delivery mechanism not built), FR-WH-002 (webhook retry with exponential backoff — not implemented) |
| Not covered | 3 | FR-WH-003 (webhook management UI in admin portal), FR-WH-004 (webhook signing/verification), FR-REST-005 (API versioning strategy) |

---

## 8. Docs/08 — Admin Portal (FR-PT, FR-DB, FR-PM, FR-CS-UI, FR-LO, FR-CO, FR-RPT, FR-ST)

### Admin Portal — ~40 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 22 | Dashboard layout, product management screens (list, create wizard, detail), customer search/list, loan contract list and detail, settings pages, audit log viewer, lender management, basic metrics display |
| Partial | 10 | FR-DB-001 (dashboard metrics — UI exists, some metrics hardcoded/mock), FR-PM-002 (product wizard — 7-step wizard exists but some steps lack backend wiring), FR-CS-UI-001 (customer detail — basic view, no financial profile tab), FR-RPT-001 (standard reports — chart components exist, data pipeline partial) |
| Not covered | 8 | FR-PT-003 (i18n — admin portal has infrastructure but 10 stale keys; platform portal has zero i18n), FR-CO-001 (collections dashboard — UI stub, no queue data), FR-RPT-002.1 (custom report builder), FR-ST-003 (notification template editor UI), FR-WH-003 (webhook configuration UI), FR-ST-004 (white-label branding configuration) |

**Note on i18n:** Admin portal has `useI18n` hook with 7 locales and the eyebrow namespace (19 keys). 10 keys are stale after humanizer pass (60 translations needed across 6 non-English locales). Platform portal has zero i18n infrastructure (~100 keys needed). PM has this as Sprint 13 medium-priority.

---

## 9. Docs/09 — Integrations (FR-WL, FR-NS, FR-CB, FR-PG, FR-TL)

### Integrations — 20 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 5 | FR-WL-001 (wallet adapter interface — mock adapter works), FR-NS-001 (notification service with multi-channel dispatch — console adapter), FR-NS-002.1 (notification templates — basic), FR-CB-001 (credit bureau adapter interface) |
| Partial | 5 | FR-WL-002 (MTN MoMo adapter — interface defined, no API integration), FR-WL-003 (M-Pesa — same), FR-NS-002.2 (SMS adapter — Africa's Talking interface defined, not connected), FR-CB-002 (bureau data parsing — adapter exists, no real provider), FR-NS-002.3 (multi-language notification templates — only English) |
| Not covered | 10 | FR-WL-004 (generic configurable wallet adapter), FR-PG-001 (payment gateway integration), FR-TL-001 (telecom data access for alternative scoring), FR-NS-003 (notification delivery tracking/analytics), FR-NS-004 (notification opt-out management), all USSD endpoints (deferred by design) |

**Assessment:** Integrations are the weakest area, as expected — Phase 5 work. The adapter pattern is correctly in place. Mock adapters allow end-to-end testing of business logic without external dependencies.

---

## 10. Docs/10 — Security & Compliance (FR-SEC)

### Security — 22 sub-requirements

| Status | Count | Details |
|---|---|---|
| Covered | 12 | FR-SEC-001.1–001.4 (JWT RS256, API key auth, RBAC, token refresh), FR-SEC-002 (PII encryption at rest — AES-256-GCM), FR-SEC-003 (PII masking in logs), FR-SEC-005 (input validation — class-validator), FR-SEC-006 (CORS configuration), FR-SEC-008 (audit logging — append-only) |
| Partial | 5 | FR-SEC-004 (rate limiting — throttler exists but has a crash bug per BA-OBS-001), FR-SEC-007 (CSRF — configured on REST, not verified on all mutation endpoints), FR-SEC-010 (data retention — soft delete exists, configurable retention periods not implemented), FR-SEC-012 (API key rotation — generation works, rotation workflow not built) |
| Not covered | 5 | FR-SEC-001.5 (OAuth 2.0 for third-party integrations), FR-SEC-001.6 (SSO/SAML — Enterprise tier, no implementation), FR-SEC-009.3 (suspicious transaction detection/alerting), FR-SEC-011.3 (regulatory reports for central banks), FR-SEC-014 (Content Security Policy headers) |

---

## 11. Docs/11 — Data Models

Data model requirements are structural and largely covered by the Prisma schema. Key findings:

| Status | Details |
|---|---|
| Covered | All core entity tables exist (tenants, users, roles, customers, products, lenders, loan_requests, contracts, repayment_schedules, ledger_entries, notifications). UUID v7 PKs, created_at/updated_at, soft delete via deleted_at. |
| Partial | Merchant and Debtor tables defined in BA specs but not in Prisma schema yet (BNPL/IF — Sprint 11/12). Some junction tables missing (customer_consents, product_versions). |
| Not covered | Settlement execution tables, reconciliation history tables, webhook delivery log table. |

---

## 12. Docs/12 — Non-Functional Requirements

| Status | Count | Details |
|---|---|---|
| Covered | 8 | NFR-PERF-001 (API response < 500ms p95 — not measured but architecture supports it), NFR-AV-001 (stateless services for horizontal scaling), NFR-AV-002 (health check endpoints — exist in all services), NFR-LOG-001 (structured JSON logging), NFR-LOG-002 (correlation IDs in log entries) |
| Partial | 5 | NFR-DB-001 (database connection pooling — Prisma default, not tuned), NFR-DB-002 (read replicas — not configured), NFR-PERF-002 (load testing — no test suite exists), NFR-AV-003 (circuit breaker on external calls — not implemented), NFR-OPS-003 (monitoring dashboards — Prometheus metrics exposed, no Grafana dashboards) |
| Not covered | 5 | NFR-DB-003 (connection pool sizing and monitoring), NFR-AV-005 (graceful degradation under partial failure), NFR-OPS-001 (incident response procedures — documented in INCIDENT-RESPONSE.md but no automated runbooks), NFR-OPS-002 (on-call rotation and escalation), NFR-PERF-003 (CDN configuration for static assets) |

---

## 13. Docs/13 — Deployment

| Status | Count | Details |
|---|---|---|
| Covered | 10 | Terraform modules, Helm charts (defined in DE plan), Docker Compose for local dev, GitHub Actions CI, branching strategy, environment configuration (4 environments), AWS infrastructure design, domain/DNS plan, container registry |
| Partial | 5 | Backward-compatible migrations (convention exists, not enforced by CI), blue-green deployment (Helm supports it, not tested), secrets management (AWS Secrets Manager planned, currently .env files), SSL/TLS (planned, not provisioned) |
| Not covered | 3 | Production monitoring stack (Prometheus + Grafana — not deployed), automated rollback triggers, canary deployment capability |

**Note:** AWS infrastructure was deactivated 2026-04-14. DE plan calls for reactivation in Sprint 13B (staging) and Sprint 14 (production). The deployment pipeline is well-designed on paper but untested in a real cloud environment.

---

## Priority Gap Analysis

### P0 — Must address before go-live (June 30)

1. **FR-CM-002/003 — Customer financial profile and credit summary** (Must priority, zero implementation). The scoring engine depends on this data. Without it, credit decisions are based on incomplete information. **Target: Sprint 10.**

2. **FR-SEC-004 — Rate limiting crash bug** (documented in BA-OBS-001). The ThrottlerModule crashes the REST server. This is a security vulnerability in production. **Target: Sprint 10 hotfix.**

3. **FR-RP-003 — Early settlement flow** (Must priority). Customers must be able to settle loans early with proper fee disclosure. Calculation exists but the customer-facing flow does not. **Target: Sprint 11.**

4. **FR-SP-005 — Self-funded product activation** (just spec'd, fix prompt ready). SPs cannot activate self-funded products — a blocking business logic bug. **Target: current sprint.**

5. **FR-RS-003 — Settlement execution** (Must priority). Revenue settlements are calculated but cannot be executed (no wallet transfer). Without this, SPs and lenders cannot receive their money. **Target: Sprint 12–13A.**

6. **FR-SEC-009.3 — Suspicious transaction detection** (Must for compliance in regulated markets). No implementation. At minimum, need rule-based flagging of anomalous patterns. **Target: Sprint 13A.**

### P1 — Should address before go-live

7. **FR-OD-004 — Overdraft real-time disbursement** (core product value proposition). Architecture decided (separate service), no implementation. Requires wallet provider API. **Target: Sprint 12.**

8. **FR-SP-003.4/003.5 — MFA and account lockout** (Must priority security requirements). JWT auth works but no second factor and no brute-force protection. **Target: Sprint 11.**

9. **FR-CW-002.3 — Promise-to-pay tracking** (Must priority for collections). Collections workflow exists but cannot record or track repayment promises. **Target: Sprint 11.**

10. **FR-WH-001/002 — Webhook delivery system** (Must for SP integrations). Event schemas exist, delivery mechanism does not. SPs need webhooks to integrate Lōns into their systems. **Target: Sprint 12.**

11. **FR-RC-002 — Write-off workflow** (compliance requirement). No process for writing off irrecoverable loans. Needed for accurate financial reporting. **Target: Sprint 13A.**

12. **Platform portal i18n** (FR-PT-003). Zero i18n infrastructure in platform portal. For pan-African multi-market launch, platform operators need localized UI. **Target: Sprint 13.**

### P2 — Can defer to post-launch

13. FR-BN-* (BNPL full implementation) — BA spec ready, planned for Sprint 11–12.
14. FR-IF-* (Invoice Factoring full implementation) — BA spec ready, planned for Sprint 12. Enterprise tier only.
15. FR-DI-003 (alternative data sources) — Phase 5, "Could" priority.
16. FR-CS-002.3 (champion/challenger ML models) — Phase 5.
17. FR-CW-003 (AI recovery engine) — Phase 5.
18. FR-SEC-001.6 (SSO/SAML) — Enterprise tier, Phase 6.
19. FR-GQL-005 (GraphQL subscriptions) — Nice-to-have, not blocking.
20. FR-RPT-002.1 (custom report builder) — Phase 4 stretch.
21. USSD endpoints — Deferred by PM decision, post-launch.

---

## BA Specification Coverage

| BA Spec | Docs/01 FRs Covered | Status |
|---|---|---|
| SPEC-bnpl-merchant.md | FR-BN-001–005 | Complete, ready for Dev |
| SPEC-invoice-factoring.md | FR-IF-001–004 | Complete, ready for Dev |
| SPEC-plan-tiers.md | Tier enforcement matrix | Complete, ready for Dev |
| ADR-overdraft-realtime.md | FR-OD-004 (architecture only) | Architecture decided, full spec needed |

**Gap:** No standalone BA spec for Overdraft implementation (beyond the ADR). Micro-Loan does not need a standalone spec — Docs/01 + Docs/05 provide sufficient detail and the implementation is largely complete.

---

## Amendments Made During This Review

1. **Docs/04-entity-management.md — Self-Funded Products (FR-SP-005)**
   - Amended FR-LP-002.1 to note self-funded lender auto-creation
   - Amended FR-SP-004.3 to describe the self-funded lender behavior
   - Added new FR-SP-005 (Self-Funded Lender Record) with 5 sub-requirements
   - Revenue sharing note added (0% lender share for self-funded)

2. **Brand color decision recorded** — Emerald (#10B97D / #1FE08A) approved by Emmanuel, coral retired. Memory updated. No active spec docs reference coral (historical fix docs left as-is since they are records of past work).

---

## Recommendations for PM

1. **Sprint 10 must include** FR-CM-002/003 (customer financial profile/credit summary) and the throttler crash fix. These are the highest-impact gaps.

2. **BA will produce SPEC-overdraft.md** covering the full real-time flow, limit management, interest calculation, and wallet integration requirements. Target delivery: before Sprint 11 start.

3. **Collections and write-off gaps** (FR-CW-002.3, FR-RC-002) should be explicitly scheduled in Sprint 11 or 13A — they are compliance requirements for regulated lending.

4. **Webhook system** (FR-WH-001–004) is a prerequisite for any SP integration. It should be prioritized in Sprint 12 alongside the first real wallet adapter.

5. **Platform portal i18n** needs a sizing pass. BA recommends an audit to count exact strings, then a phased approach (navigation/layout first in Sprint 13, page content in Sprint 14).

6. **9 Sprint 8 functional items remain open** (listed in PM-NOTES-FOR-BA-DELIVERY-REVIEW). These are all "In Review" status on Monday.com but have no implementation. PM should re-prioritize them into Sprint 10.

---

*End of BA Cross-Reference Review*
