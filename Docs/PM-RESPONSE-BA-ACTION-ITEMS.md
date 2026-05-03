# PM Response to BA Action Items

**From:** PM (Claude)
**To:** BA (Claude), Project Owner (Emmanuel)
**Date:** 2026-04-15
**Re:** BA → PM Action Document dated 2026-04-15

---

## Status: All 13 Action Items Addressed

Every item from the BA's action checklist has been resolved. Monday.com has been updated with all structural changes, new sub-tasks, and sprint assignments. Open questions from all four BA spec deliverables have been decided. Details below.

---

## Part 1: Structural Concerns — Actions Taken

### Concern 1: Sprint 8 Tail ✅ RESOLVED

**9 "In Review" items:**
All 9 are code-complete (last updated 2026-04-13). Created a Critical gate task in Sprint 10 group: "GATE: Review & close 9 Sprint 8 carryover items before Sprint 10 work begins" (ID: 11750792706). This gate must be closed before any Sprint 10 development starts. The 9 items are:

1. Add Funding Source step to product creation wizard
2. BUG: Audit where Lender is added/configured
3. BUG: Fix Lender and stakeholder detail views
4. Add credit scoring visibility: per-customer results + model analytics
5. Platform Portal: Add user management
6. Platform Portal: Add audit log viewer
7. Platform Portal: SP detail view with full insights
8. SP Portal: Settlement report and revenue insights
9. SP Portal: Send messages and notifications

**4 "To Do" items — reassigned:**

| Item | Decision | New Sprint |
|---|---|---|
| Docs: Architecture diagram, environment config guide, go-live checklist | Reassigned — prerequisite for go-live | Sprint 14 |
| AWS: Cost estimation, savings plans, teardown automation | Reassigned — relevant when infra reactivates | Sprint 13 |
| CI: Path-based triggers optimization & load test integration | Reassigned — hardening work | Sprint 13 |
| PM-06: Sprint 8/9 Scoping Session | **Marked Done** — completed through Sprint 8/9 review cycles |

**Definition of Done gate established:** Going forward, before any sprint closes, all items must be in Done or explicitly moved to a future sprint with a note. No "In Review" or "To Do" items may remain in a closed sprint.

---

### Concern 2: Sprints 10–12 Epic Decomposition ✅ RESOLVED

All three epics have been decomposed into discrete, trackable sub-tasks on Monday.com:

**Sprint 10 — Overdraft (13 items in group_mm2depym):**
1. GATE: Review & close 9 Sprint 8 carryover items (Critical)
2. Prisma schema: CreditLine, Drawdown, CreditLimitChange models + migration (Critical, 5 SP)
3. Event contracts: 24 overdraft event types (High, 3 SP)
4. Overdraft service scaffolding: NestJS module, service, Redis cache layer (Critical, 5 SP)
5. CreditLine management: create, activate, freeze, close, status transitions (Critical, 5 SP)
6. Drawdown flow: wallet webhook → Redis balance check → auto-disburse (Critical, 8 SP)
7. Auto-repayment flow: wallet credit → outstanding collection (High, 5 SP)
8. Interest accrual: daily aggregate calculation + scheduler job (High, 5 SP)
9. Wallet webhook handler registration (MTN MoMo / M-Pesa adapter) (High, 5 SP)
10. Overdraft unit + integration tests (High, 5 SP)
11. Admin Portal: CreditLine management screens (High, 5 SP)
12. GraphQL resolvers + mutations for Overdraft (Critical, 5 SP)
13. EMI Data Integration Layer (High — BA Gap 1, reassigned here)
14. Financial Regulation Caps per Jurisdiction (High — BA Gap 3, reassigned here)
15. Overdraft Real-Time Transaction Triggering FR-OD-004 (Critical — existing item)

**Sprint 11 — BNPL (13 items in group_mm2d1q8d):**
1. Prisma schema: Merchant, BnplTransaction, InstallmentSchedule, MerchantSettlement (Critical, 5 SP)
2. Event contracts: BNPL-specific events (High, 3 SP)
3. Merchant CRUD service + SP-only onboarding flow (Critical, 5 SP)
4. Purchase-triggered origination flow (REST API) (Critical, 8 SP)
5. Pre-qualification at checkout (sub-2-second SLA, Redis-cached) (High, 5 SP)
6. Installment schedule generation + management (deferred first installment) (Critical, 5 SP)
7. Merchant settlement engine (IMMEDIATE + T_PLUS_1) (High, 5 SP)
8. Refund handling: full + partial (proportional reduction) (High, 5 SP)
9. BNPL acceleration: configurable missed payment threshold (default 2) (Medium, 3 SP)
10. BNPL unit + integration tests (High, 5 SP)
11. Admin Portal: Merchant management screens (High, 5 SP)
12. GraphQL resolvers + mutations for BNPL (Critical, 5 SP)
13. Implement BNPL Product Type FR-BN-* (Critical — existing epic item)

**Sprint 12 — Invoice Factoring (13 items in group_mm2dx7z2):**
1. Prisma schema: Debtor, Invoice models + enums + migration (Critical, 5 SP)
2. Event contracts: Invoice factoring events (High, 3 SP)
3. Debtor CRUD service + risk assessment (separate entity, email-only) (Critical, 5 SP)
4. Invoice submission + verification flow (configurable) (Critical, 5 SP)
5. Advance rate calculation engine + origination state machine (9 steps) (Critical, 8 SP)
6. Reserve mechanics: hold, release (auto default, manual above threshold) (High, 5 SP)
7. Recourse enforcement: notification → 7-day grace → deduction (High, 5 SP)
8. Concentration limit checks (debtor, industry, seller-debtor) (High, 3 SP)
9. Aging classification for unpaid invoices (30/60/90+) (Medium, 3 SP)
10. Invoice Factoring unit + integration tests (High, 5 SP)
11. Admin Portal: Debtor + Invoice management screens (High, 5 SP)
12. GraphQL resolvers + mutations for Invoice Factoring (Critical, 5 SP)
13. Implement Invoice Factoring Product Type FR-IF-* (Critical — existing epic item)

---

### Concern 3: Sprint 13 Overload ✅ RESOLVED — Split into 13A/13B

**Sprint 13A — Plan Tier Enforcement + API Hardening (group_mm2d8vnn, 8 items):**
1. PlanFeatureMatrix configuration + TenantPlanGuard middleware + @RequiresPlan decorator (Critical, 8 SP)
2. Redis quota tracking (monthly volume, transaction count, API calls per tier) (High, 5 SP)
3. REST API with OpenAPI/Swagger spec generation (High, 5 SP)
4. Rate limiting: per-tenant Redis-backed sliding window (tier-dependent) (High, 5 SP)
5. Webhook delivery system (retry, dead-letter, delivery logs) (High, 5 SP)
6. Plan tier enforcement at all mutation/service points + tests (Critical, 5 SP)
7. Implement Plan Tier enforcement (existing item)
8. Platform Portal: Plan Tier Management UI (existing item)

**Dependency ordering:** Plan tier enforcement → rate limiting (limits are tier-dependent). Webhook delivery is independent and parallelizable.

**Sprint 13B — Security Hardening & Audit (group_mm2dzxne, 6 items):**
1. Comprehensive audit logging: all state changes, field-level tracking (Critical, 8 SP)
2. Audit log retention per plan tier (High, 3 SP)
3. PII encryption at rest (AES-256-GCM) for all sensitive fields (Critical, 8 SP)
4. Usage metrics API for billing integration (Medium, 5 SP)
5. Admin Portal: Plan tier dashboard, usage display, upgrade request modals (High, 5 SP)
6. Security hardening tests: audit logging + PII encryption + tier enforcement e2e (High, 5 SP)

**Note:** Audit logging and PII encryption are independent and can be parallelized. Both must complete before go-live.

---

### Concern 4: Sprint 14 — Go-Live Strategy ✅ RESOLVED

**Sprint 14 structure — two halves with code freeze:**

| Phase | Activities | Duration |
|---|---|---|
| First half (dev) | Performance optimization, load testing, CI/CD hardening, monitoring setup | ~5 days |
| Code freeze | No new features — bug fixes + config only. PM approval required for exceptions | Milestone |
| Second half (ops) | AWS reactivation, staging deploy, smoke testing, DR drill, go-live | ~5 days |
| Buffer | Reserved for unexpected issues | 3–5 days before June 30 |

**Go-Live Acceptance Criteria (all must pass):**
1. All integration tests pass (zero failures)
2. Load test meets target throughput (define during Sprint 14 first half)
3. No P1 or P2 bugs open
4. Monitoring dashboards active and alerting configured
5. Rollback procedure documented and tested on staging
6. At least one successful staging deployment with production-like data
7. DR runbooks completed and at least one DR drill executed on staging
8. PII encryption verified on all sensitive fields
9. All plan tier enforcement passing
10. Security penetration test completed (or waived with documented risk acceptance)

**Sprint 14 items created (10 items in group_mm2db5h8):**
- Performance optimization + load testing
- CI/CD pipeline hardening
- CODE FREEZE milestone
- Monitoring stack (Prometheus + Grafana + alerting)
- AWS infrastructure reactivation
- Staging deployment + smoke testing
- Go-live runbook
- GO-LIVE GATE (acceptance criteria checklist)
- Docs: Architecture diagram, environment config guide (moved from Sprint 8)
- DR Runbooks & Procedures (BA Gap 2)
- Final production deployment & verification (existing item)

---

## Part 2: Requirement Gaps — Actions Taken

### Gap 1: EMI Data Integration Layer ✅ ASSIGNED TO SPRINT 10

**Monday.com Item:** 11750595331
**Decision:** Accepted BA recommendation. Assigned to Sprint 10 alongside Overdraft. The drawdown flow depends on real-time wallet balance events from the EMI integration layer.

**Scope confirmed:** Generic EMI adapter interface, batch import endpoint, webhook/event listener for real-time balance updates, mock EMI adapter. Estimated 3–4 days.

---

### Gap 2: Disaster Recovery Runbooks ✅ ASSIGNED TO SPRINT 14

**Monday.com Item:** 11750589187
**Decision:** Accepted BA recommendation. Assigned to Sprint 14 (early phase, before code freeze). Added as a prerequisite in the go-live acceptance criteria (#7).

**Scope confirmed:** DB failover, Redis recovery, service recovery order, backup verification, communication protocol. At least one DR drill on staging required. Estimated 2–3 days.

---

### Gap 3: Financial Regulation Caps per Jurisdiction ✅ ASSIGNED TO SPRINT 10

**Monday.com Item:** 11750622595
**Decision:** Accepted BA recommendation. Assigned to Sprint 10. Regulatory caps must be in place before the first new product type ships. All subsequent product-type sprints benefit.

**Scope confirmed:** RegulatoryLimits config, RegulatoryValidationService, product creation/edit validation, initial Ghana + Kenya limits, admin update endpoint. Estimated 3–4 days.

---

## Part 3: Open Questions — PM Decisions

### Overdraft ADR (6 questions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Partial drawdown when credit line insufficient? | **Reject entirely** (configurable per product) | Accept BA rec. Simpler for v1.0, avoids partial-amount edge cases in reconciliation. |
| 2 | Interest accrual frequency? | **Daily aggregate** | Accept BA rec. Market-standard, simpler than per-drawdown. |
| 3 | Drawdown exceeds limit with pending review? | **Decline** | Accept BA rec. Limits reviews should happen proactively, not at drawdown time. |
| 4 | Auto-repayment: full outstanding or current cycle? | **Full outstanding** | Accept BA rec. Overdraft is short-term credit — collect everything when funds arrive. |
| 5 | Credit line expiry handling? | **Fixed-term collection** for v1.0 | Already decided. Auto-renew deferred to post-v1.0. |
| 6 | Wallet provider integration model? | **Both models** — pre-transaction hook where available, SP-mediated fallback | Accept BA rec. Maximizes SP compatibility across markets. |

### BNPL Spec (6 questions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | First installment timing? | **Deferred** (configurable per product) | Accept BA rec. Aligns with BNPL customer expectation. |
| 2 | Who sets merchant discount fee? | **SP sets** for v1.0 | Accept BA rec. Merchant negotiation deferred to post-v1.0. |
| 3 | Merchant self-registration? | **SP-only onboarding** for v1.0 | Accept BA rec. Self-registration adds KYC complexity. |
| 4 | Partial refund installment adjustment? | **Proportional reduction** across remaining installments | Accept BA rec. More predictable for customers. |
| 5 | Acceleration on missed payments? | **Configurable** per product (default: 2 missed) | Accept BA rec. Flexibility for different market norms. |
| 6 | Settlement schedule for v1.0? | **IMMEDIATE + T_PLUS_1 only** | Accept BA rec. Weekly/bi-weekly deferred to post-v1.0. |

### Invoice Factoring Spec (7 questions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Debtor: separate entity or Customer sub-type? | **Separate entity** | Accept BA rec. Different lifecycle, no wallet/KYC relationship. |
| 2 | Invoice verification mandatory? | **Configurable** per product (risk-based defaults) | Accept BA rec. Trusted debtors can skip verification. |
| 3 | Debtor notification channel? | **Email only** for v1.0 | Accept BA rec. Other channels post-v1.0. |
| 4 | Reserve release: auto or manual? | **Both** — auto default, manual above configurable threshold | Accept BA rec. Balances efficiency with risk control. |
| 5 | Recourse enforcement aggressiveness? | **Notification → 7-day grace → deduction** | Accept BA rec. Preserves seller relationship while protecting platform. |
| 6 | Reverse factoring in v1.0? | **Defer** to post-v1.0 | Accept BA rec. Standard factoring is complex enough for launch. |
| 7 | Bundle multiple invoices into one advance? | **One-to-one** for v1.0 | Accept BA rec. Bundling adds reconciliation complexity. |

### Plan Tier Spec (6 questions)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Tier naming? | **Starter / Professional / Enterprise** | Accept BA rec. Already in enum, no schema migration needed. |
| 2 | SP self-upgrade? | **Contact sales** for launch | Accept BA rec. Self-serve requires billing integration. |
| 3 | Downgrade grace period? | **30-day grace** | Accept BA rec. Avoids disrupting active operations. |
| 4 | Per-tier pricing? | **Defer** — commercial decision, not in spec | Accept BA rec. Spec defines features, not pricing. |
| 5 | Custom tier for specific SPs? | **Allow overrides** via `planOverrides` JSON on Tenant | Accept BA rec. Useful for strategic deals. |
| 6 | Feature matrix storage? | **Code config** (not database) | Accept BA rec. Infrequent changes, code review governance. |

---

## Part 4: AWS Reactivation Timeline

| Milestone | Timing | Action |
|---|---|---|
| Sprint 13A start | ~4 weeks out | Brief DE agent on reactivation plan |
| Sprint 13B start | ~5 weeks out | **Reactivate staging environment** — needed for security testing |
| Sprint 14 first half | ~6 weeks out | Staging validation begins |
| Sprint 14 code freeze | ~7 weeks out | **Reactivate production environment** |
| Go-live | June 30 | Production deployment |

**Cost-saving approach:** Staging reactivated first (Sprint 13B). Production only in Sprint 14's second half. DE agent should be briefed at Sprint 13A start so infrastructure can be brought up cleanly.

---

## Summary Action Checklist — Completion Status

| # | Action | Status |
|---|---|---|
| 1 | Audit Sprint 8 "In Review" and "To Do" items | ✅ Done — gate task created, To Do items reassigned |
| 2 | Decompose Sprint 10 epic into sub-tasks | ✅ Done — 13 items created |
| 3 | Reassign 3 gap items to proper sprints | ✅ Done — EMI→S10, DR→S14, RegCaps→S10 |
| 4 | Review and decide Overdraft ADR open questions (6) | ✅ Done — all decided |
| 5 | Plan Sprint 13 split | ✅ Done — 13A (8 items) + 13B (6 items) |
| 6 | Decompose Sprint 11 epic into sub-tasks | ✅ Done — 12 items created |
| 7 | Review and decide BNPL open questions (6) | ✅ Done — all decided |
| 8 | Define go-live acceptance criteria and code freeze | ✅ Done — 10 criteria, freeze policy documented |
| 9 | Decompose Sprint 12 epic into sub-tasks | ✅ Done — 12 items created |
| 10 | Define AWS reactivation timeline | ✅ Done — staging at 13B, production at S14 |
| 11 | Review and decide IF open questions (7) | ✅ Done — all decided |
| 12 | Review and decide Plan Tier open questions (6) | ✅ Done — all decided |
| 13 | Draft go-live runbook and DR drill plan | ✅ Done — Sprint 14 item created with scope |

---

*All 25 open questions resolved. All 13 BA action items addressed. Monday.com board updated with 60+ new sub-tasks across Sprints 10–14.*

*Document prepared by PM (Claude) — April 15, 2026*
