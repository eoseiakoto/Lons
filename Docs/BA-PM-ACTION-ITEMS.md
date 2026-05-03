# BA → PM Action Document: Project Review Findings & Recommendations

**From:** BA (Claude)
**To:** PM (Claude)
**Date:** 2026-04-15
**Priority:** HIGH — Several items are on the critical path for Sprints 10–14
**Context:** Full project review conducted after Sprint 9 closure. Covers structural concerns with the sprint plan, newly identified requirement gaps, and specific recommendations for PM action.

---

## Executive Summary

The Lōns platform is tracking well against its v1.0 scope. All four BA spec deliverables (Overdraft ADR, BNPL Merchant Spec, Invoice Factoring Spec, Plan Tier Matrix) have been completed and are ready for their respective sprints. Sprint 9 (regulatory foundations) has closed with all items marked Done.

However, the project review surfaced **4 structural concerns** with the current sprint plan and **3 genuine requirement gaps** that are not covered in any planned sprint. These need PM attention before Sprints 10–12 begin, as several could become blockers if left unaddressed.

---

## Part 1: Structural Concerns

### Concern 1: Sprint 8 Tail — Incomplete Items Carrying Forward

**What was found:** At the time of review, Sprint 8 had 9 items still in "In Review" status and 6 items in "To Do" status. Sprint 8 was supposed to close before Sprint 9, and Sprint 9 has now closed as Done.

**Risk:** If these Sprint 8 items are genuinely incomplete, they represent unfinished foundation work (Phase 2–3 core features) that later sprints depend on. Overdraft (Sprint 10), BNPL (Sprint 11), and Invoice Factoring (Sprint 12) all build on the process engine, repayment service, and settlement service — if those aren't solid, the product-type sprints will encounter integration issues.

**Recommended PM Actions:**

1. **Audit each Sprint 8 "In Review" item.** Determine whether "In Review" means code-complete-pending-review or partially done. If code-complete, prioritize reviews and merge before Sprint 10 starts.

2. **Audit each Sprint 8 "To Do" item.** Determine whether these were descoped, deferred, or simply not started. For each:
   - If descoped intentionally: move to a Backlog group and document why.
   - If deferred to a later sprint: move to the correct sprint group and update dependencies.
   - If simply not started: escalate — these may be blockers.

3. **Establish a "Definition of Done" gate.** Before each sprint closes, all items should be in Done or explicitly moved to a future sprint with a note. "In Review" and "To Do" items should not remain in a closed sprint — it obscures true progress.

**Urgency:** HIGH — Must be resolved before Sprint 10 starts. Sprint 10 (Overdraft) depends on a working process engine, integration service webhook handlers, and settlement service.

---

### Concern 2: Sprints 10–12 Epic Decomposition

**What was found:** Sprints 10, 11, and 12 each contain a single large epic-level item (e.g., "Implement Overdraft Real-Time Architecture," "Implement BNPL Merchant Entity & Flow," "Implement Invoice Factoring"). These are multi-week bodies of work that need to be broken into discrete, trackable sub-tasks.

**Risk:** A single epic-level item per sprint makes it impossible to track incremental progress, identify which sub-component is blocked, or parallelize work across developer agents. It also makes standup updates meaningless ("still working on overdraft" for 2 weeks).

**Recommended PM Actions:**

1. **Decompose each epic using the BA specs as the guide.** Each spec already defines the natural sub-tasks. Suggested breakdown:

   **Sprint 10 — Overdraft (from `Docs/ADR-overdraft-realtime.md`):**
   - Prisma schema: CreditLine, Drawdown, CreditLimitChange models
   - Event contracts: 24 new event types in `packages/event-contracts/`
   - Overdraft service scaffolding (NestJS service, module, Redis cache layer)
   - CreditLine management: create, activate, freeze, close, status transitions
   - Drawdown flow: wallet webhook → Redis check → auto-disburse
   - Auto-repayment flow: wallet credit → outstanding collection
   - Interest accrual: intra-day calculation, scheduler job
   - Integration: wallet webhook handler registration (MTN MoMo / M-Pesa adapter)
   - Unit + integration tests for overdraft flows
   - Admin portal: CreditLine management screens

   **Sprint 11 — BNPL (from `Docs/SPEC-bnpl-merchant.md`):**
   - Prisma schema: Merchant, BnplTransaction, InstallmentSchedule, MerchantSettlement models
   - Event contracts: BNPL-specific events
   - Merchant CRUD service + onboarding flow
   - Purchase-triggered origination flow (REST API for merchant integration)
   - Pre-qualification at checkout (sub-2-second SLA)
   - Installment schedule generation + management
   - Merchant settlement engine (T+0 / T+1)
   - Refund handling (full + partial)
   - Unit + integration tests
   - Admin portal: Merchant management screens

   **Sprint 12 — Invoice Factoring (from `Docs/SPEC-invoice-factoring.md`):**
   - Prisma schema: Debtor, Invoice models + enums
   - Event contracts: Invoice factoring events
   - Debtor CRUD service + risk assessment
   - Invoice submission + verification flow
   - Advance rate calculation engine
   - Factoring origination state machine (9 steps)
   - Reserve mechanics: hold, release (full/partial), recourse enforcement
   - Concentration limit checks (debtor, industry, seller-debtor)
   - Aging classification for unpaid invoices (30/60/90+)
   - Unit + integration tests
   - Admin portal: Debtor/Invoice management screens

2. **Create these sub-tasks as Monday.com items** within the respective sprint groups. Link them to the parent epic if Monday.com supports sub-items.

3. **Assign estimated effort** to each sub-task. The BA specs include effort estimates — use those as a starting point and adjust based on developer agent velocity observed in Sprints 7–9.

**Urgency:** HIGH — Sprint 10 starts imminently. Decomposition for Sprint 10 must happen now. Sprints 11 and 12 can be decomposed one sprint ahead.

---

### Concern 3: Sprint 13 Overload

**What was found:** Sprint 13 contains approximately 15 items spanning Plan Tier enforcement, API hardening (REST API + OpenAPI, rate limiting, webhook delivery), comprehensive audit logging, and PII encryption at rest. These are diverse, cross-cutting concerns that touch nearly every service in the monorepo.

**Risk:** This is roughly 2–3x the volume of work compared to other sprints. Even with parallel developer agents, the cross-cutting nature of these items means they'll step on each other (e.g., plan tier enforcement touches all resolvers/controllers, audit logging touches all mutation handlers, rate limiting touches the API gateway).

**Recommended PM Actions:**

1. **Split Sprint 13 into two sprints (13A and 13B)** or redistribute items:

   **Sprint 13A — Plan Tier Enforcement + API Hardening:**
   - PlanFeatureMatrix configuration
   - TenantPlanGuard middleware + @RequiresPlan decorator
   - Redis quota tracking (monthly volume, transaction count, API calls)
   - Enforcement at all mutation/service points
   - REST API with OpenAPI/Swagger spec
   - Rate limiting (per-tenant, Redis-backed sliding window)
   - Webhook delivery system

   **Sprint 13B — Security Hardening + Audit:**
   - Comprehensive audit logging (all state changes, field-level)
   - Audit log retention per plan tier
   - PII encryption at rest (AES-256-GCM)
   - Usage metrics API (for billing integration)
   - Admin portal: plan tier dashboard, usage display, upgrade modals

2. **Alternatively, move the lower-priority items to Sprint 14 or Post-Launch.** The Usage Metrics API and Admin Portal tier dashboard could be Post-Launch if time is tight — plan enforcement can work without a pretty UI on day one.

3. **Identify dependency ordering within Sprint 13.** Plan tier enforcement should come before rate limiting (rate limits are tier-dependent). Audit logging is independent and can be parallelized. PII encryption is independent but must be done before go-live.

**Urgency:** MEDIUM — Sprint 13 is ~4 weeks out. Decision needed within the next 2 sprints.

---

### Concern 4: Sprint 14 — Go-Live Mixed with Development

**What was found:** Sprint 14 contains both go-live operational tasks (production deployment, monitoring setup, DNS configuration) and active development work (performance optimization, load testing, CI/CD pipeline). Mixing development with go-live creates a conflict: go-live requires a code freeze and stability focus, while development work introduces new changes and potential regressions.

**Risk:** If performance optimization or load testing reveals issues that require significant code changes, those changes could destabilize the system right before launch. Conversely, if go-live activities start before development is complete, the deployed system may be missing hardening work.

**Recommended PM Actions:**

1. **Establish a clear code freeze date** within Sprint 14. Recommended: development work (performance optimization, load testing, CI/CD) in the first half; code freeze + go-live activities (deployment, monitoring, DNS, smoke testing) in the second half.

2. **Define go-live acceptance criteria now.** What must pass before production deployment is triggered? Suggested minimum:
   - All integration tests pass
   - Load test meets target throughput (define specific numbers — e.g., X requests/sec for Y concurrent tenants)
   - No P1/P2 bugs open
   - Monitoring dashboards active and alerting configured
   - Rollback procedure documented and tested
   - At least one successful staging deployment with production-like data

3. **Create a go-live runbook** as a separate document. This should be a step-by-step checklist that can be executed on launch day, independent of the sprint board. Include: pre-deployment checks, deployment steps, post-deployment validation, rollback triggers.

4. **Consider a Sprint 14.5 buffer.** Given the June 30 deadline, build in 3–5 days of buffer between "development complete" and "production go-live" for unexpected issues. If everything goes smoothly, the buffer becomes extra QA time.

**Urgency:** MEDIUM — Sprint 14 is ~6 weeks out, but the go-live criteria and runbook should be drafted earlier so the team knows the target.

---

## Part 2: Requirement Gaps

Three genuine requirement gaps were identified that are not covered in any current sprint. Monday.com items have been created for each (Sprint 9 group — PM should reassign to appropriate sprints).

### Gap 1: EMI Data Integration Layer

**Monday.com Item ID:** 11750595331
**Priority:** High
**Recommended Sprint:** Sprint 10 or 11 (before BNPL, which has merchant data requirements)

**What's Missing:**

The requirements docs (specifically `Docs/09-integrations.md` §6 and `Docs/12-non-functional.md` §4) reference Electronic Money Issuer (EMI) data integration — the ability for SPs who are licensed EMIs to push/pull customer data, transaction history, and wallet balances from their EMI core systems into Lōns. This is distinct from the wallet payment adapters (MTN MoMo, M-Pesa) which handle disbursement/collection transactions.

The EMI data integration layer would:
- Import customer KYC data from the SP's existing EMI system (avoids duplicate data entry)
- Sync wallet balances for credit line decisions (overdraft requires real-time balance awareness)
- Import transaction history for credit scoring (ML model needs historical data)
- Provide a standardized adapter interface similar to the wallet adapter pattern

**Why It Matters:**

Without this, SPs must manually enter all customer data into Lōns even though they already have it in their EMI systems. For large SPs with 100K+ customers, this is a non-starter. The overdraft product specifically depends on real-time wallet balance data from the EMI — the wallet webhook model in the Overdraft ADR assumes this data pipeline exists.

**Recommended Approach:**

1. Define a generic EMI data adapter interface (similar to `IWalletAdapter` in `Docs/09-integrations.md`)
2. Implement a batch import endpoint for initial customer/transaction data load
3. Implement a webhook/event listener for real-time balance and transaction updates
4. Build a mock EMI adapter for testing
5. Estimate: 3–4 days of development work

**BA Recommendation:** Include in Sprint 10 alongside Overdraft, since the overdraft drawdown flow depends on wallet balance events which originate from the EMI integration layer.

---

### Gap 2: Disaster Recovery Runbooks

**Monday.com Item ID:** 11750589187
**Priority:** Medium
**Recommended Sprint:** Sprint 14 (pre-go-live)

**What's Missing:**

`Docs/13-deployment.md` §5 specifies disaster recovery requirements including RPO (Recovery Point Objective), RTO (Recovery Time Objective), failover procedures, and backup verification. The current sprint plan includes infrastructure deployment, monitoring, and CI/CD pipeline, but no explicit task for creating DR runbooks and testing failover procedures.

The DR runbooks should cover:
- Database failover procedure (PostgreSQL primary → replica promotion)
- Redis failover (cache rebuild vs replica promotion)
- Service recovery order (which services must come up first?)
- Data backup verification procedure (how to confirm backups are valid and restorable)
- Cross-region failover (if multi-region is in scope for v1.0)
- Communication protocol during an outage (who is notified, in what order)

**Why It Matters:**

For a financial services platform handling disbursements and repayments, an outage without a tested recovery procedure could result in financial inconsistencies (e.g., disbursement sent but not recorded, repayment collected but not allocated). Regulators in the target markets (Ghana BoG, Kenya CBK) expect financial service providers to have documented and tested DR procedures.

**Recommended Approach:**

1. Draft DR runbooks as markdown documents in `Docs/` or `infrastructure/runbooks/`
2. Define RPO/RTO targets per service tier (e.g., database: RPO < 1 hour, RTO < 4 hours)
3. Create automated health-check scripts that can verify service recovery
4. Conduct at least one DR drill on staging before go-live
5. Estimate: 2–3 days (documentation + scripting + one drill)

**BA Recommendation:** Place in Sprint 14, early phase (before code freeze). This is a prerequisite for production go-live and should be part of the go-live acceptance criteria recommended in Concern 4.

---

### Gap 3: Financial Regulation Caps per Jurisdiction

**Monday.com Item ID:** 11750622595
**Priority:** High
**Recommended Sprint:** Sprint 9 extension or Sprint 10

**What's Missing:**

`Docs/10-security-compliance.md` §2 and `Docs/01-loan-portfolio.md` §6 reference jurisdiction-specific financial regulations that impose caps on interest rates, fees, loan amounts, and collection practices. The current system has configurable product parameters (interest rate, max amount, fees), but no enforcement layer that prevents an SP from configuring products that violate local regulations.

Specific regulatory constraints that need enforcement:

| Jurisdiction | Constraint | Reference |
|---|---|---|
| Ghana (BoG) | Maximum interest rate cap for micro-loans | Banking Act 2004, BoG notices |
| Ghana (BoG) | Minimum cooling-off period for consumer loans | Borrowers & Lenders Act |
| Kenya (CBK) | Interest rate disclosure requirements | Banking Amendment Act 2016 |
| Kenya (CBK) | Maximum penalty fee percentages | CBK Prudential Guidelines |
| Both | Anti-usury provisions — total cost of credit cap | Consumer protection regulations |
| Both | Minimum loan term requirements | Varies by product type |

The enforcement layer would:
- Store per-jurisdiction, per-product-type regulatory limits in a configuration (similar to PlanFeatureMatrix)
- Validate product configuration at creation/edit time against jurisdiction limits
- Reject or warn when an SP configures a product that would violate local regulations
- Log all regulatory validation outcomes for audit purposes
- Be updatable without code deployment (regulations change — use database or config service)

**Why It Matters:**

Lōns is a multi-market platform launching in Ghana and Kenya simultaneously. If SPs can configure products that violate local regulations, Lōns is exposed to regulatory sanctions and the SPs' licenses could be at risk. Sprint 9 implemented AML screening, cooling-off periods, and exposure rules — but these are borrower-side protections. This gap is about product-side regulatory compliance: preventing non-compliant products from being created in the first place.

**Recommended Approach:**

1. Define a `RegulatoryLimits` configuration structure (per country, per product type)
2. Add a `RegulatoryValidationService` that checks product configurations against limits
3. Integrate validation into the product creation/edit mutation (hard block) and product review screen (warning display)
4. Populate initial limits for Ghana and Kenya based on current regulations
5. Add an admin-only endpoint for updating limits without redeployment
6. Estimate: 3–4 days of development work

**BA Recommendation:** This should be implemented as early as possible — ideally Sprint 10, alongside the first new product type (Overdraft). Every product type sprint after this will benefit from having regulatory guardrails in place.

---

## Part 3: Additional Recommendations

### 3.1 AWS Infrastructure Reactivation Timeline

All AWS infrastructure was deactivated on 2026-04-14 to control costs. The PM should define a reactivation timeline:

- **Recommended reactivation:** Sprint 13 start (when API hardening and production-readiness work begins)
- **Minimum lead time:** 1 week before Sprint 14 (go-live sprint) to allow staging environment validation
- **Cost-saving approach:** Reactivate staging environment first; production environment only in Sprint 14's second half

The Deployment Engineer (DE) agent should be briefed on the reactivation plan so infrastructure can be brought up cleanly.

### 3.2 Spec Deliverable Status

All four BA spec deliverables are complete and ready for use:

| Deliverable | File | Needed By | Status |
|---|---|---|---|
| Overdraft Architecture ADR | `Docs/ADR-overdraft-realtime.md` | Sprint 10 start | Complete (incl. Appendix A) |
| BNPL Merchant & Flow Spec | `Docs/SPEC-bnpl-merchant.md` | Sprint 11 start | Complete |
| Invoice Factoring Spec | `Docs/SPEC-invoice-factoring.md` | Sprint 12 start | Complete |
| Plan Tier Feature Matrix | `Docs/SPEC-plan-tiers.md` | Sprint 13 start | Complete |

Each spec includes open questions flagged for PM/Project Owner decision. These should be reviewed before the respective sprint starts so the developer agent has clear direction.

### 3.3 Open Questions Requiring Decision

Across the four specs, there are **25 open questions** that need PM or Project Owner decisions. The highest-priority ones (needed before Sprint 10):

**From Overdraft ADR:**
1. Separate overdraft-service vs process engine extension? (BA recommends: separate service)
2. Partial drawdown allowed when credit limit insufficient? (BA recommends: yes, up to available balance)
3. Interest accrual frequency? (BA recommends: per-drawdown, calculated at repayment)
4. Push vs pull model for wallet events? (BA recommends: push — wallet sends webhook)

**From BNPL Spec (needed before Sprint 11):**
5. Merchant portal for v1.0 or API-only? (BA recommends: API-only, portal post-launch)
6. Settlement timing: T+0 or T+1? (BA recommends: configurable per merchant agreement)
7. First installment at purchase or deferred? (BA recommends: configurable per product)

**From Invoice Factoring Spec (needed before Sprint 12):**
8. Debtor as separate entity or Customer sub-type? (BA recommends: separate entity)
9. Recourse vs non-recourse configurable per product or per invoice? (BA recommends: per product, overridable per invoice)
10. Invoice verification mandatory? (BA recommends: configurable — optional for trusted debtors)

**From Plan Tier Spec (needed before Sprint 13):**
11. Self-serve tier upgrades or contact sales? (BA recommends: contact sales for launch)
12. Feature matrix in code config or database? (BA recommends: code config — changes are infrequent)

### 3.4 Cross-Verification Completeness

All specs were cross-verified against the requirements documents:
- All FR-* requirement references from `Docs/01-loan-portfolio.md` are covered
- Prisma schema conventions from `Docs/11-data-models.md` are followed
- Event naming follows `packages/event-contracts/` conventions
- API patterns align with `Docs/07-api-specifications.md`
- The Overdraft ADR was updated with Appendix A to address initially missed FR-OD-001 (product management) and FR-OD-002 (subscription management)

---

## Summary Action Checklist for PM

| # | Action | Urgency | Due By |
|---|---|---|---|
| 1 | Audit Sprint 8 "In Review" and "To Do" items — resolve or reassign | HIGH | Before Sprint 10 start |
| 2 | Decompose Sprint 10 epic into sub-tasks (use Overdraft ADR) | HIGH | Before Sprint 10 start |
| 3 | Reassign 3 new gap items from Sprint 9 group to proper sprints | HIGH | This week |
| 4 | Review and decide Overdraft ADR open questions (4 questions) | HIGH | Before Sprint 10 start |
| 5 | Plan Sprint 13 split (13A/13B) or item redistribution | MEDIUM | Before Sprint 12 ends |
| 6 | Decompose Sprint 11 epic into sub-tasks (use BNPL Spec) | MEDIUM | Before Sprint 11 start |
| 7 | Review and decide BNPL Spec open questions (3 questions) | MEDIUM | Before Sprint 11 start |
| 8 | Define go-live acceptance criteria and code freeze date | MEDIUM | Before Sprint 13 ends |
| 9 | Decompose Sprint 12 epic into sub-tasks (use IF Spec) | MEDIUM | Before Sprint 12 start |
| 10 | Define AWS reactivation timeline and brief DE agent | MEDIUM | Before Sprint 13 start |
| 11 | Review and decide IF Spec open questions (3 questions) | LOW | Before Sprint 12 start |
| 12 | Review and decide Plan Tier open questions (2 questions) | LOW | Before Sprint 13 start |
| 13 | Draft go-live runbook and DR drill plan | LOW | Sprint 14 first half |

---

*Document prepared by BA (Claude) — April 15, 2026*
*All referenced specs are in the `Docs/` directory. All Monday.com items are on board 18405683508.*
