# Sprint 9 — PM Review Report

**Date:** 2026-04-14
**Reviewer:** PM (Claude)
**Status:** Gaps identified — remediation required before marking sprint complete

---

## Executive Summary

Sprint 9 delivered 9 tasks covering regulatory foundations, portal infrastructure, and CI quality. Tasks 5, 6, and 7 (CI and guard audit) are **fully complete**. Tasks 1–4 (regulatory features) and Tasks 8–9 (portal work) have **meaningful gaps** that need to be addressed before the sprint can close.

**By the numbers:**

| Task | Req'd Items | Pass | Partial | Fail |
|---|---|---|---|---|
| 1. AML Screening | 23 | 15 | 1 | 7 |
| 2. Cooling-Off Period | 18 | 12 | 2 | 4 |
| 3. Exposure Rules | 14 | 9 | 3 | 2 |
| 4. Anonymization | 15 | 6 | 7 | 2 |
| 5. CI Migration Test | 7 | 7 | 0 | 0 |
| 6. CI Health Check | 3 | 3 | 0 | 0 |
| 7. Guard Audit | 5 | 5 | 0 | 0 |
| 8. Cross-Tenant Queries | 11 | 7 | 2 | 2 |
| 9. Report Date Filtering | 10 | 5 | 3 | 2 |
| **TOTAL** | **106** | **69** | **18** | **19** |

---

## Tasks Fully Complete (No Action Required)

### Task 5: CI Prisma Migration Test Job — COMPLETE
All 7 requirements pass. Workflow at `.github/workflows/prisma-migration-test.yml` with PostgreSQL 16 container, path filters, full migration + seed verification.

### Task 6: CI Post-Startup GraphQL Health Check — COMPLETE
All 3 requirements pass. Script at `scripts/graphql-health-check.sh` integrated into CI pipeline. Sends introspection query, validates response, proper cleanup.

### Task 7: APP_GUARD Audit — COMPLETE
All 5 requirements pass. Every guard (IpWhitelistGuard, ApiKeyGuard, AuthGuard, RolesGuard, TenantThrottlerGuard) handles both HTTP and GraphQL contexts correctly. Comprehensive test coverage for both context types. SubscriptionAuthGuard is WebSocket-only (out of scope, correctly excluded).

---

## Gaps Requiring Remediation

### Task 1: AML/Sanctions Screening Adapter

**Backend gaps:**

| # | Gap | Severity | Detail |
|---|---|---|---|
| 1A | Circuit breaker not wired in ComplyAdvantage adapter | HIGH | `resilience/circuit-breaker.ts` exists but is not integrated into `complyadvantage.adapter.ts`. The spec requires 3 consecutive failures → 30s open circuit. Without this, a failing ComplyAdvantage API will cause cascading timeouts. |
| 1B | Process engine pre-disbursement screening hook missing | CRITICAL | `disbursement.service.ts` does not call the ScreeningService before disbursement. The entire purpose of AML screening is to gate disbursement. Loans can currently be disbursed without screening. |
| 1C | Integration tests for screening flow missing | HIGH | No e2e tests for MATCH-blocks-disbursement, POTENTIAL_MATCH-holds-for-review, or CLEAR-proceeds paths. |

**Portal gaps:**

| # | Gap | Severity | Detail |
|---|---|---|---|
| 1D | Screening manual review queue UI missing | HIGH | Backend has `getScreeningsForReview()` and `submitReview()` methods but no admin portal page exists. SP operators cannot act on POTENTIAL_MATCH results. |
| 1E | Loan application detail: inline screening result missing | MEDIUM | No screening status displayed in loan application review. |
| 1F | Platform portal screening dashboard missing | MEDIUM | No cross-tenant screening aggregate view at `/screening`. |
| 1G | Platform portal escalated review missing | MEDIUM | No escalation workflow for platform admins to review cases escalated by SP operators. |

---

### Task 2: Cooling-Off Period Enforcement

| # | Gap | Severity | Detail |
|---|---|---|---|
| 2A | REST endpoint for cooling-off cancellation missing | LOW | GraphQL mutation exists and works. REST endpoint was specified but not implemented. Given REST is secondary API, low severity. |
| 2B | Notification templates for cooling-off events not defined | MEDIUM | Events are emitted (CONTRACT_COOLING_OFF_STARTED, CANCELLED, EXPIRED) but `template-renderer.ts` has no templates for these events. Customers won't receive cooling-off notifications. This is a regulatory communication requirement. |
| 2C | Platform portal compliance warning page missing | MEDIUM | No compliance check for tenants with products having `coolingOffHours=0`. Spec called for a warning flag on the compliance/system page. |
| 2D | Integration tests for cooling-off flows missing | MEDIUM | No e2e tests covering disburse → cooling_off → cancel or disburse → cooling_off → expiry → active paths. |

---

### Task 3: Cross-Product Exposure Rules

| # | Gap | Severity | Detail |
|---|---|---|---|
| 3A | Loan application detail: exposure check result not displayed inline | MEDIUM | Customer detail page has the exposure summary card, but the loan application review flow doesn't show exposure check pass/fail inline. |
| 3B | `maxCustomerExposureMultiplier` not exposed in admin portal tenant settings | LOW | The Zod schema has the field, but the UI doesn't render it. SP admins can only configure `maxCustomerExposure` and `enableCrossProductCheck`. |
| 3C | Platform portal: default exposure rules for new tenants not implemented | LOW | No UI for platform admins to set default exposure rules applied to newly created tenants. |
| 3D | Platform portal: aggregate stats missing from exposure card | LOW | Card shows configured limits but not avg exposure or customers-approaching-limit stats. |
| 3E | Integration tests for exposure-based loan decline missing | MEDIUM | ExposureService has unit tests (9 cases, good) but no integration test for a loan request being declined specifically due to EXPOSURE_LIMIT_EXCEEDED. |

---

### Task 4: Customer Data Anonymization

| # | Gap | Severity | Detail |
|---|---|---|---|
| 4A | Missing anonymization for address, kycDocuments, alternativeData fields | MEDIUM | Service anonymizes core PII (name, email, phone, nationalId, DOB) but skips address, kycDocuments, and alternativeData. These fields may not exist on the current Customer model, but if they do (or are added), they'd leak PII. |
| 4B | Eligibility check missing: consent recorded and pending screening reviews | MEDIUM | Service checks for active contracts and outstanding balances but does NOT verify customer consent or pending screening reviews before proceeding. |
| 4C | Role authorization uses `customer:delete` permission instead of SP_ADMIN | MEDIUM | Spec requires SP_ADMIN role. Implementation uses `@Roles('customer:delete')` which may be assigned to non-admin roles. |
| 4D | Idempotency key accepted but not enforced | LOW | `idempotencyKey` parameter exists on the mutation but the service doesn't check for duplicate anonymization requests. |
| 4E | Admin portal: anonymization button not role-gated | LOW | "Request Anonymization" button appears for all users viewing customer detail, not just SP_ADMIN. |
| 4F | Admin portal: customer list missing visual indicator for anonymized rows | LOW | "Anonymized" filter option exists but table rows don't show a badge/indicator for anonymized customers. |
| 4G | Platform portal: anonymization metric card missing | MEDIUM | No anonymization counts (completed/pending/blocked) on tenant detail page. |
| 4H | Platform portal: anonymization policy / min retention period missing | LOW | No mechanism for platform admin to enforce minimum data retention before anonymization is allowed. |
| 4I | Integration tests for anonymization flow missing | MEDIUM | Only unit tests exist. No e2e test covering settle-all-contracts → request-anonymization → verify-PII-replaced → verify-records-intact. |

---

### Task 8: Platform Portal Cross-Tenant Query Support

| # | Gap | Severity | Detail |
|---|---|---|---|
| 8A | Products page missing aggregate columns | LOW | `/tenants/[id]/products` lists products but doesn't show active contracts count or total disbursed per product. |
| 8B | Customers page missing aggregate columns and name search | MEDIUM | `/tenants/[id]/customers` lists customers but doesn't show active contracts count or total exposure. Search is by status only, not by name/ID. |
| 8C | Audit trail: unclear if all cross-tenant queries are decorated | LOW | `@AuditAction` decorator exists but needs verification that every resolver touched by tenant context override is decorated. |
| 8D | Tests insufficient for security validation | MEDIUM | No dedicated test for 403 on non-admin X-Tenant-Context attempt. No data leakage security tests. |

---

### Task 9: Admin Portal Report Date Range Filtering

| # | Gap | Severity | Detail |
|---|---|---|---|
| 9A | 4 of 8 reports still using mock data with no date range integration | HIGH | `disbursement-report`, `repayment-report`, `customer-acquisition-report`, and `product-performance-report` use mock/hardcoded data. They do NOT integrate with ReportFilterBar or pass date parameters to GraphQL queries. Only `portfolio-quality-report`, `revenue-report`, `reconciliation-report`, and `collections-report` are properly wired. |
| 9B | Platform portal: no date range filtering on tenant detail charts | LOW | Tenant detail page doesn't have chart visualizations with date range controls. |
| 9C | No unit tests for ReportFilterBar or URL param persistence | MEDIUM | E2E tests exist for navigation but no unit tests for date logic, preset calculation, or URL serialization. |

---

## Priority Remediation Order

### Must-Fix Before Sprint Close (Critical/High)

1. **1B** — Wire AML screening into process engine pre-disbursement hook (CRITICAL — defeats purpose of the feature)
2. **1A** — Integrate circuit breaker into ComplyAdvantage adapter (HIGH — resilience requirement)
3. **1D** — Build screening manual review queue UI (HIGH — POTENTIAL_MATCH results have no operator action path)
4. **9A** — Wire remaining 4 reports to GraphQL with date range parameters (HIGH — half the reports are non-functional)
5. **1C** — Add integration tests for screening disbursement flow (HIGH — critical path untested)

### Should-Fix Before Sprint Close (Medium)

6. **2B** — Add notification templates for cooling-off events (regulatory comms)
7. **4B** — Add consent and pending-screening eligibility checks to anonymization
8. **4C** — Change anonymization role guard to SP_ADMIN
9. **2C** — Add compliance warning for zero cooling-off products
10. **4G** — Add anonymization metrics to platform portal tenant detail
11. **3A** — Show exposure check inline in loan application review
12. **8B** — Add aggregate columns and name/ID search to platform portal customers page
13. **2D, 3E, 4I, 8D, 9C** — Missing integration/security tests across Tasks 2, 3, 4, 8, 9

### Can Defer to Next Sprint (Low)

14. **2A** — REST endpoint for cooling-off cancellation
15. **3B, 3C, 3D** — Exposure multiplier UI, platform defaults, aggregate stats
16. **4D, 4E, 4F, 4H** — Idempotency enforcement, role-gating button, list indicator, retention policy
17. **8A, 8C** — Products page aggregates, audit decorator verification
18. **9B** — Platform portal date filtering
19. **1E, 1F, 1G** — Loan app inline screening, platform dashboard, escalation workflow

---

## Recommendation

The sprint is approximately **75% complete**. The backend foundation for all 4 regulatory features is solid — the services, Prisma models, events, and admin portal components are largely in place. The critical gap is **1B (screening not wired into disbursement)** which must be fixed immediately as it's the core purpose of Task 1.

The 5 must-fix items above represent roughly 2–3 days of dev work. The medium-severity items add another 2–3 days. I recommend addressing the must-fix items as a Sprint 9 remediation pass before starting Sprint 10, and rolling the medium items into Sprint 10's scope alongside the Overdraft service work.
