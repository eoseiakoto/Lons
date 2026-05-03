# SPEC: Plan Tier Feature Matrix

**Status:** Proposed
**Date:** 2026-04-14
**Author:** Business Analyst (Claude)
**Monday.com:** 11694495574
**Needed by:** Sprint 13 start

---

## 1. Overview

The Lōns platform offers three plan tiers for Service Providers (SPs): **Starter**, **Professional**, and **Enterprise**. The `planTier` field already exists on the Tenant model (enum: `starter`, `professional`, `enterprise`) and is set during tenant onboarding, but nothing in the backend enforces tier-based limits.

This spec defines what each tier unlocks across all dimensions: product types, feature modules, operational limits, API access, support SLA, and branding.

---

## 2. Tier Feature Matrix

### 2.1 Product Types

| Capability | Starter | Professional | Enterprise |
|---|---|---|---|
| Micro-Loan | Yes | Yes | Yes |
| Overdraft | No | Yes | Yes |
| BNPL | No | Yes | Yes |
| Invoice Factoring | No | No | Yes |

**Rationale:** Micro-Loan is the simplest product type and serves as the entry point. Overdraft and BNPL require more complex integrations (real-time wallet hooks, merchant onboarding) that justify Professional tier. Invoice Factoring is the most complex (debtor management, B2B flows) and targets larger SPs.

### 2.2 Operational Limits

| Limit | Starter | Professional | Enterprise |
|---|---|---|---|
| Maximum active products | 3 | 10 | Unlimited |
| Maximum customers | 10,000 | 100,000 | Unlimited |
| Monthly disbursement volume | USD 500,000 equivalent | USD 5,000,000 equivalent | Unlimited |
| Monthly transaction count | 5,000 | 50,000 | Unlimited |
| Maximum lender configurations | 1 | 5 | Unlimited |
| Maximum merchant configurations (BNPL) | N/A | 50 | Unlimited |
| Maximum users (SP portal) | 5 | 25 | Unlimited |
| Data retention (months) | 12 | 36 | 84 (7 years) |

### 2.3 Feature Modules

| Feature | Starter | Professional | Enterprise |
|---|---|---|---|
| Rule-based credit scoring | Yes | Yes | Yes |
| ML credit scoring | No | Yes | Yes |
| AI recovery recommendations | No | Yes | Yes |
| Collections workflow | Basic (queue only) | Full (queue + actions + automation) | Full + external agency integration |
| Standard reports | Yes | Yes | Yes |
| Custom report builder | No | Yes | Yes |
| Scheduled reports (email) | No | Yes | Yes |
| Settlement engine | Basic (Lōns↔SP only) | Full (multi-party) | Full + custom waterfall |
| Reconciliation | Daily batch | Daily batch + on-demand | Real-time + daily batch |
| Notifications | SMS + Email | SMS + Email + Push | SMS + Email + Push + USSD + Custom |
| Webhook delivery | 3 endpoints | 10 endpoints | Unlimited |
| Audit log retention | 90 days | 1 year | 7 years (regulatory) |

### 2.4 API Access

| Capability | Starter | Professional | Enterprise |
|---|---|---|---|
| GraphQL API | Yes | Yes | Yes |
| REST API | No | Yes | Yes |
| API rate limit (requests/min) | 60 | 300 | 1,000 (configurable) |
| GraphQL subscriptions (WebSocket) | No | Yes | Yes |
| Bulk operations API | No | Yes | Yes |
| API keys per tenant | 2 | 10 | Unlimited |
| Webhook signing | Yes | Yes | Yes + custom headers |

### 2.5 Authentication & Security

| Capability | Starter | Professional | Enterprise |
|---|---|---|---|
| JWT authentication | Yes | Yes | Yes |
| MFA (TOTP) | Optional | Required for admin roles | Required for all roles |
| SSO (SAML/OIDC) | No | No | Yes |
| IP whitelisting | No | Yes | Yes |
| Custom RBAC roles | No | No | Yes |
| Field-level access control | No | Yes | Yes |
| PII encryption at rest | Yes | Yes | Yes |

### 2.6 Branding & White-Label

| Capability | Starter | Professional | Enterprise |
|---|---|---|---|
| Custom logo | Yes | Yes | Yes |
| Primary color customization | Yes | Yes | Yes |
| Full brand palette | No | Yes | Yes |
| Custom email templates | No | Yes | Yes |
| Custom SMS sender ID | No | No | Yes |
| White-label portal (remove Lōns branding) | No | No | Yes |
| Custom domain for portal | No | No | Yes |

### 2.7 Support SLA

| Dimension | Starter | Professional | Enterprise |
|---|---|---|---|
| Support channels | Email only | Email + Chat | Email + Chat + Phone + Dedicated Slack |
| Response time (P1 — system down) | 4 hours | 1 hour | 15 minutes |
| Response time (P2 — major feature broken) | 8 hours | 4 hours | 1 hour |
| Response time (P3 — minor issue) | 2 business days | 1 business day | 4 hours |
| Dedicated account manager | No | No | Yes |
| Quarterly business reviews | No | No | Yes |
| Custom integration support | No | Paid add-on | Included |
| Onboarding assistance | Self-serve docs | Guided onboarding (1 session) | White-glove (dedicated onboarding manager) |

### 2.8 Integrations

| Integration | Starter | Professional | Enterprise |
|---|---|---|---|
| MTN MoMo | Yes (sandbox + prod) | Yes | Yes |
| M-Pesa | No | Yes | Yes |
| Generic wallet adapter | No | Yes (1 provider) | Yes (unlimited) |
| Credit bureau query | Yes (1 bureau) | Yes (multiple) | Yes (multiple + batch reporting) |
| USSD gateway | No | No | Yes |
| Custom webhook integrations | No | Yes | Yes |

---

## 3. Enforcement Architecture

### 3.1 TenantPlanGuard Middleware

A NestJS guard that reads `planTier` from the tenant context (already available via JWT) and checks feature/quota eligibility before processing the request.

```typescript
// Conceptual structure — not implementation-ready code

@Injectable()
export class TenantPlanGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const tenant = getTenantContext(context);
    const requiredFeature = getRequiredFeature(context); // from decorator
    
    return PlanFeatureMatrix.isAllowed(tenant.planTier, requiredFeature);
  }
}

// Usage on resolver/controller:
@RequiresPlan('professional')  // Only professional and enterprise
@Mutation(() => Product)
async createBnplProduct(...) { ... }
```

### 3.2 Quota Enforcement Points

| Quota | Enforcement Point | Mechanism |
|---|---|---|
| Max active products | `createProduct` mutation | Count active products, reject if at limit |
| Max customers | `createCustomer` / customer sync | Count customers, reject if at limit |
| Monthly disbursement volume | Disbursement service | Running monthly total in Redis, reject if exceeded |
| Monthly transaction count | Process engine | Running monthly count in Redis, reject if exceeded |
| Max users | `createUser` mutation | Count active users, reject if at limit |
| Max API keys | API key creation | Count active keys, reject if at limit |
| API rate limit | API gateway (per-tenant) | Redis-backed sliding window rate limiter |
| Max lenders | `createLender` mutation | Count active lenders, reject if at limit |
| Max merchants | `createMerchant` mutation | Count active merchants, reject if at limit |

### 3.3 Feature Gate Points

| Feature | Gate Location | Mechanism |
|---|---|---|
| ML scoring | Scoring service | If tier < professional, use rule-based only |
| AI recovery | Recovery service | If tier < professional, skip AI recommendations |
| Custom reports | Report builder resolver | If tier < professional, return "upgrade required" |
| SSO | Auth service | If tier < enterprise, SSO config endpoints return 403 |
| USSD | Integration service | If tier < enterprise, USSD endpoints return 403 |
| GraphQL subscriptions | Subscription handler | If tier < professional, reject WebSocket upgrade |

### 3.4 Upgrade/Downgrade Handling

**Upgrade (e.g., Starter → Professional):**
- Immediate effect. New features and limits become available on the next API call.
- No data migration needed — limits are checked at runtime.
- Notification sent to all SP users.

**Downgrade (e.g., Professional → Starter):**
- Existing data and configurations are preserved (not deleted).
- Features above the new tier become read-only. Existing BNPL transactions continue to process, but no new BNPL products can be created.
- Quota limits are enforced on the next creation attempt. If the SP already has 5 products and Starter allows 3, existing products remain active but no new ones can be created until count is below 3.
- Grace period: 30 days after downgrade, SP receives warnings. After grace period, excess products are suspended (not deleted).
- API rate limits take effect immediately.

---

## 4. Pricing Model (for Product/Commercial team)

This spec does not define pricing. The feature matrix above is designed to support common SaaS pricing patterns:

| Model | How It Maps |
|---|---|
| Flat monthly fee per tier | Tier determines feature access; price is fixed per tier |
| Base fee + usage-based | Tier sets the base; disbursement volume or transaction count is metered |
| Per-active-product pricing | Tiers set the cap; pricing per product within the cap |

The backend should expose a usage metrics API that the billing system can query:
- Monthly active customers
- Monthly disbursement volume
- Monthly transaction count
- Active product count
- API call count

These metrics are already captured by the analytics service and can be exposed via a dedicated billing endpoint.

---

## 5. Implementation Scope

### 5.1 What Needs to Be Built

1. **`PlanFeatureMatrix` configuration** — A central definition of what each tier allows. Stored as a configuration file (not database) for simplicity. Changes require a deployment.

2. **`TenantPlanGuard`** — NestJS guard middleware. Applied to resolvers and controllers via decorator.

3. **`@RequiresPlan()` decorator** — Applied to GraphQL resolvers, REST controllers, and service methods that are tier-gated.

4. **Quota tracking in Redis** — Running counters for monthly volume, transaction count, API calls. Reset monthly. Read on each relevant request.

5. **Quota check utilities** — Shared functions called at entity creation points (createProduct, createCustomer, etc.).

6. **Admin portal UI** — Display current tier and usage on the SP dashboard. Show "upgrade required" modals when tier-gated features are accessed. Platform admin: ability to change an SP's tier.

7. **Usage metrics API** — Endpoint returning current usage against tier limits (for billing integration).

### 5.2 What Already Exists

- `planTier` field on `Tenant` model (schema.prisma)
- `PlanTier` enum (starter, professional, enterprise)
- Tenant creation wizard with planTier dropdown
- Tenant context available in all requests via JWT

### 5.3 Estimated Effort

| Component | Estimate |
|---|---|
| PlanFeatureMatrix config + guard + decorator | 2-3 days |
| Quota tracking (Redis counters) | 2 days |
| Enforcement at all mutation/service points | 3-4 days |
| Admin portal UI (usage dashboard, upgrade modals) | 3 days |
| Usage metrics API | 1 day |
| Tests (unit + integration) | 3 days |
| **Total** | **~2–3 weeks** |

---

## 6. Open Questions for Decision

| # | Question | Options | BA Recommendation |
|---|---|---|---|
| 1 | Tier naming | (A) Starter/Professional/Enterprise, (B) Growth/Scale/Enterprise, (C) Other | A — already in the enum. Changing requires schema migration. |
| 2 | Can SPs self-upgrade? | (A) Self-serve via portal, (B) Contact sales only | B for launch. Self-serve upgrade requires billing integration. |
| 3 | Downgrade grace period | (A) Immediate enforcement, (B) 30-day grace, (C) No downgrade allowed | B — 30-day grace. Avoid disrupting active operations. |
| 4 | Per-tier pricing | (A) Define now, (B) Defer to commercial team | B — this spec defines features, not prices. Pricing is a commercial decision. |
| 5 | Custom tier for specific SPs? | (A) No — three tiers only, (B) Allow custom overrides | B — allow per-tenant overrides via a `planOverrides` JSON field on Tenant. Useful for strategic deals. |
| 6 | Feature matrix storage | (A) Code config file, (B) Database table, (C) Environment variables | A — code config. Changes are infrequent and should go through code review. Database is overkill. |
