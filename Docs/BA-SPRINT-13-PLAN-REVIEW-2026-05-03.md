# BA Review: Sprint 13 Plan — Integrations, Platform Maturity & Security Hardening

**From:** BA (Claude)
**To:** PM (Claude) / Emmanuel
**Date:** 2026-05-03
**Sprint:** 13 (13A — Integrations & Platform Maturity) + (13B — Security Hardening & Audit)
**Type:** Plan review — pre-execution assessment

---

## Executive Summary

Sprint 13 is the most scope-heavy sprint on the roadmap: **24 items across 13A** and **6 items across 13B**, spanning wallet integrations, credit bureau reporting, SSO, product segmentation, collections workflow, repayment recalculation, disbursement reconciliation, plan tier enforcement (backend + UI), API hardening (REST, webhooks, rate limiting), 6 admin portal screens, 2 platform portal screens, PII encryption, audit logging, and design system cleanup.

This is too much for a single sprint. The plan conflates three distinct workstreams — infrastructure integrations, platform maturity features, and security hardening — into what should be at least two full sprints of work. Several items are individually complex enough to be sprint epics on their own (SSO, collections workflow, plan tier enforcement, PII encryption).

The plan **covers the right requirements** but **underestimates the scope** and has **notable gaps** in sequencing, dependency awareness, and carry-forward items from prior sprints.

---

## Sprint 13A — Integrations & Platform Maturity (24 items)

### Items by Priority

| Priority | Count | Items |
|---|---|---|
| Critical | 3 | MTN MoMo adapter, PlanFeatureMatrix + guard, Plan tier enforcement at all mutations |
| High | 11 | SSO, Product segmentation, Collections workflow, Repayment recalculation, REST API + OpenAPI, Rate limiting, Webhook delivery, API key UI, Settlement dashboard, Report export, Plan tier management UI |
| Medium | 8 | Credit bureau reporting, Disbursement reconciliation, Webhook config UI, System health monitoring, Design pass (accent tokens), Button utilities, Platform portal i18n, plus some overlap |

### Cross-Reference Against Requirements

**Docs/09-integrations.md — Wallet Adapters:**
- ✅ MTN MoMo adapter (§2.2) — correctly marked Critical. This is a Ghana launch blocker.
- ⚠️ M-Pesa adapter (§2.3) is NOT in Sprint 13. The item description says "Only M-Pesa and generic wallet adapters exist" which implies M-Pesa was built in an earlier sprint. If that's accurate, this is fine. If M-Pesa is still a stub, it's a Kenya launch gap. **PM should verify M-Pesa adapter status.**

**Docs/09-integrations.md — Credit Bureau (§4):**
- ✅ Credit bureau batch reporting (FR-CB-002) — correctly scoped. Regulatory obligation for Ghana and Kenya.
- ⚠️ Credit bureau **query** adapter (FR-CB-001) is not in Sprint 13. Was it delivered in a prior sprint? The roadmap (Phase 5, §5.3) lists both query and batch reporting. **PM should verify credit bureau query status.**

**Docs/10-security-compliance.md — Authentication (§1.1):**
- ✅ SSO via SAML/OIDC (FR-SEC-001.6) — correctly scoped as High. Enterprise commercial gate.

**Docs/04-entity-management.md — Products (§2):**
- ✅ Product segmentation (FR-LP-004) — correctly scoped. Required for SPs to restrict product access by customer attributes.

**Docs/03-repayments-recovery.md — Collections (§4):**
- ✅ Collections workflow state machine — correctly scoped. The recovery service recommends strategies but can't track execution.

**Docs/03-repayments-recovery.md — Repayments (§1.2):**
- ✅ Repayment schedule recalculation (FR-RP-002) — correctly scoped. Essential for restructuring and early repayment flows.

**Docs/05-process-engine.md — Disbursement (§7):**
- ✅ Disbursement reconciliation window (FR-DB-003) — correctly scoped. Handles the uncertainty between disbursement initiation and wallet confirmation.

**Docs/07-api-specifications.md — REST API (§3):**
- ✅ REST API with OpenAPI spec (FR-REST-001, FR-REST-002) — correctly scoped.
- ✅ Webhook delivery system (FR-WH-001, FR-WH-002) — correctly scoped with retry, dead-letter, delivery logs.
- ✅ Rate limiting (FR-RL-001 through FR-RL-004) — correctly scoped with tier-dependent limits.

**Docs/08-admin-portal.md — Portal gaps:**
- ✅ Loan application review workflow — Critical gap correctly identified. SP operators currently cannot approve/reject loans through the portal.
- ✅ Contract write operations (manual payment, restructuring, penalty waiver) — correctly scoped.
- ✅ Report CSV/PDF export — correctly scoped.
- ✅ Settlement & reconciliation dashboard — correctly scoped.
- ✅ API key management UI — correctly scoped.
- ✅ Webhook configuration UI — correctly scoped.

**SPEC-plan-tiers.md — Plan Tier Feature Matrix:**
- ✅ PlanFeatureMatrix + TenantPlanGuard + @RequiresPlan decorator — correctly scoped (8 SP).
- ✅ Redis quota tracking — correctly scoped (5 SP).
- ✅ Enforcement at all mutation/service points — correctly scoped (5 SP).
- ✅ Plan tier management UI (platform portal) — correctly scoped.

### Sprint 13A Findings

**Finding S13-1 (CRITICAL — Scope Overload):** 24 items is not achievable in a single sprint. The SPEC-plan-tiers.md alone estimates 2-3 weeks for plan tier work. Add MTN MoMo (a complex external integration), SSO (SAML + OIDC), collections workflow (new state machine + Prisma model), repayment recalculation, 6 portal screens, and API hardening — this is realistically 4-5 weeks of work.

**Recommendation:** Split Sprint 13A into two sub-sprints:

- **Sprint 13A-1 (Launch-critical):** MTN MoMo adapter, Loan application review workflow, Contract write operations, Plan tier backend (guard + enforcement + quotas), REST API + OpenAPI, Webhook delivery system, Rate limiting. These are all "Must" priority or launch blockers.

- **Sprint 13A-2 (Platform maturity):** SSO, Product segmentation, Collections workflow, Repayment recalculation, Disbursement reconciliation, Credit bureau reporting, Report export, Settlement dashboard, API key UI, Webhook config UI, Plan tier management UIs, System health monitoring, Design system items, Platform portal i18n.

**Finding S13-2 (HIGH — Missing carry-forward from Sprint 11):** The Sprint 11 BA review identified F-BN-1 (partial refund net clawback) as a P1 fix that should land "before Sprint 12 coding begins." This fix is not visible in any sprint group on Monday.com. It's a 10-minute fix but it's a financial incorrectness that overcharges merchants. **PM should verify this has been addressed or create a task for it.**

**Finding S13-3 (HIGH — Missing carry-forward from Sprint 11):** F-OD-1 (waiveOverdraftPenalties idempotencyKey passthrough) was marked P3 for "early Sprint 12." Also not visible. Low risk but should be tracked.

**Finding S13-4 (HIGH — GraphQL Subscriptions missing):** FR-GQL-003.1-3 require WebSocket-based GraphQL subscriptions for real-time events (loan state changes, contract changes, repayment received, alerts, reconciliation exceptions). This is a "Should" priority in the spec but is not in any sprint. Per SPEC-plan-tiers.md §2.4, subscriptions are a Professional/Enterprise tier feature — meaning they're needed for the paying customers. **Recommend adding to Sprint 13A-2 or Sprint 14.**

**Finding S13-5 (MEDIUM — No notification adapter):** Sprint 13 delivers the MTN MoMo wallet adapter but there's no SMS notification adapter task. Docs/09-integrations.md §6 and the Roadmap Phase 5 §5.2 both call for SMS (Africa's Talking or Twilio) and email adapters. Currently the notification service uses a console/log adapter. For launch, customers need to receive real SMS reminders and payment confirmations. This may be hiding in another sprint, but it's not visible in Sprint 13 or 14. **PM should verify SMS adapter status.**

**Finding S13-6 (MEDIUM — No ML scoring or AI recovery):** The Roadmap Phase 5 includes ML scoring service (§5.4) and AI recovery (§5.5). Neither appears in Sprint 13 or 14. Per SPEC-plan-tiers.md, ML scoring and AI recovery are Professional/Enterprise tier features. If these aren't shipping in v1.0, the plan tier matrix should reflect that ML scoring and AI recovery are "Coming Soon" rather than tier-gated. **PM should confirm: are these in or out of v1.0 scope?**

**Finding S13-7 (MEDIUM — Dependency risk on plan tier work):** The plan tier backend (guard, quotas, enforcement) is prerequisite for: rate limiting (tier-dependent), SSO (Enterprise only), some portal features (upgrade modals), and audit log retention (tier-dependent). If plan tier backend slips, it cascades. **Recommendation:** Plan tier backend should be Sprint 13A-1 priority, delivered first.

**Finding S13-8 (LOW — Design system items are polish, not launch-critical):** The accent-primary token adoption and button utility refactoring (items 11838091704, 11838185715) are design debt. They're marked Medium and carry 5-8 SP. These should not compete with launch-critical items. **Recommend moving to Sprint 14 or post-launch fast-follow.**

---

## Sprint 13B — Security Hardening & Audit (6 items)

### Items by Priority

| Priority | Count | Items |
|---|---|---|
| Critical | 2 | Comprehensive audit logging, PII encryption at rest (AES-256-GCM) |
| High | 3 | Audit log retention per tier, Plan tier dashboard + usage display, Security hardening e2e tests |
| Medium | 1 | Usage metrics API for billing |

### Cross-Reference Against Requirements

**Docs/10-security-compliance.md — Audit Trail (§4):**
- ✅ Comprehensive audit logging (FR-SEC-008.1-3) — correctly marked Critical. Covers all state changes, field-level tracking, immutable append-only store.
- ✅ Audit log retention per plan tier (FR-SEC-008.4) — correctly scoped. Tier-dependent: 90 days (Starter), 1 year (Professional), 7 years (Enterprise).

**Docs/10-security-compliance.md — Encryption (§3):**
- ✅ PII encryption at rest (FR-SEC-006.1-3) — correctly marked Critical. AES-256-GCM for national IDs, phone numbers, emails, KYC documents. Key management via AWS KMS.

### Sprint 13B Findings

**Finding S13-9 (HIGH — Missing security items):** Several "Must" security requirements from Docs/10 are not in Sprint 13B or any visible sprint:

| Requirement | ID | Priority | Status |
|---|---|---|---|
| IP whitelisting for API access | FR-SEC-016 | Should | Not in any sprint |
| CSP headers for portal | FR-SEC-014 | Must | Not in any sprint |
| Dependency vulnerability monitoring | FR-SEC-013 | Must | Not in any sprint |
| Vulnerability scanning in CI/CD | FR-SEC-012 | Should | Not in any sprint |
| Log masking for PII | FR-SEC-007.2 | Must | May exist — needs verification |

CSP headers and dependency vulnerability monitoring are "Must" items. **PM should verify if these were delivered in earlier sprints or need to be added.**

**Finding S13-10 (MEDIUM — Sprint 13B depends on Sprint 13A):** Sprint 13B includes "Plan tier dashboard + usage display" and "Audit log retention per tier" — both depend on the plan tier backend from Sprint 13A. If 13A runs long (likely given scope), 13B's tier-dependent items are blocked. **Recommendation:** Sprint 13B should start with the items that have no 13A dependencies (audit logging, PII encryption, security tests) and layer tier-dependent items once 13A's plan tier backend is done.

**Finding S13-11 (MEDIUM — AWS staging reactivation timing):** Per memory, staging reactivates at Sprint 13B start. PII encryption (AWS KMS) and the full security test suite need a staging environment. If Sprint 13B starts before staging is ready, the Critical PII encryption item is blocked. **DE should be briefed at Sprint 13A start** (as noted in PROJECT-CONTEXT.md) to ensure staging is ready for 13B.

---

## Requirements Coverage Summary

### What Sprint 13 Covers Well

The plan hits the major "Must" requirements across APIs, security, plan tiers, and portal operations. The loan application review workflow (Critical portal gap) and MTN MoMo adapter (Ghana launch blocker) are correctly prioritized. The security hardening items (PII encryption, audit logging) are appropriately scoped for Sprint 13B before Sprint 14's go-live push.

### What's Missing or At Risk

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| S13-1 | Scope overload — 24 items in 13A is unrealistic | Critical | Split into 13A-1 (launch-critical) and 13A-2 (platform maturity) |
| S13-2 | F-BN-1 (partial refund net clawback) not tracked | High | Verify status or create task |
| S13-3 | F-OD-1 (idempotencyKey passthrough) not tracked | High | Verify status or create task |
| S13-4 | GraphQL subscriptions (FR-GQL-003) not planned | High | Add to 13A-2 or Sprint 14 |
| S13-5 | SMS/email notification adapter not visible | Medium | Verify status — launch blocker if missing |
| S13-6 | ML scoring + AI recovery not in any sprint | Medium | Confirm in/out of v1.0; update plan tier matrix |
| S13-7 | Plan tier backend is dependency for many items | Medium | Prioritise first in Sprint 13A |
| S13-8 | Design system items competing with launch-critical | Low | Move to Sprint 14 or post-launch |
| S13-9 | CSP headers + dep vulnerability monitoring missing | High | Verify or add to 13B |
| S13-10 | 13B items depend on 13A plan tier backend | Medium | Sequence 13B to start with non-dependent items |
| S13-11 | AWS staging needed for PII encryption testing | Medium | Brief DE at Sprint 13A start |

### Items Not in Sprint 13 That Should Be Tracked

These are requirements from the specs that aren't in Sprint 13 and also aren't visible in Sprint 12 or 14:

1. **Real-time monitoring / borrower risk indicators** (FR-RM-001-003, Docs/02 §4) — Roadmap Phase 5 §5.6. Not in any sprint.
2. **Consent management** (FR-CM-005, Docs/10 §5) — Required for GDPR / Ghana DPA / Kenya DPA compliance.
3. **Data anonymization / right to deletion** (FR-SEC-010.2) — Regulatory requirement for data protection compliance.
4. **Multi-level approval workflows** (FR-AE-002) — Currently only single-level auto-approve exists. Enterprise SPs may need approval chains.
5. **Scheduled report email delivery** (Docs/08 §7) — Mentioned in the report export task description but may be deferred.

---

## Sign-Off Recommendation

**The plan is directionally correct but needs restructuring before execution.** The requirement coverage is good — Sprint 13 addresses the right gaps. The issue is purely one of scope management and sequencing.

**Actions requested:**

1. **PM:** Split Sprint 13A into two sub-sprints (launch-critical vs. platform maturity) or explicitly de-scope lower-priority items to post-launch.
2. **PM:** Verify carry-forward fixes (F-BN-1, F-OD-1) are addressed.
3. **PM:** Verify M-Pesa adapter, SMS notification adapter, and credit bureau query adapter status from prior sprints.
4. **PM:** Confirm ML scoring / AI recovery / GraphQL subscriptions are in or out of v1.0.
5. **PM:** Verify CSP headers and dependency vulnerability monitoring status.
6. **PM/DE:** Ensure staging environment is ready at Sprint 13B start for PII encryption and security testing.

---

*BA will produce detailed specs or fix prompts for any Sprint 13 items upon request. The plan tier spec (SPEC-plan-tiers.md) is already complete and ready for Dev consumption.*
