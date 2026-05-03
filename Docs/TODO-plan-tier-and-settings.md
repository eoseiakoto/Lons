# TODO: Plan Tier & Initial Settings — Future Work

> These two items need to be created on the Monday.com Development Tasks board (18405683508) under Sprint 8 (group_mm1xaybk) once the MCP connection is restored.

---

## Task 1: Implement Plan Tier Enforcement

- **Status:** To Do
- **Priority:** Medium
- **Phase:** Phase 6 — Hardening
- **Service/Module:** Entity Service

**Description:**
Plan Tier (starter/professional/enterprise) is captured at tenant creation and stored on the tenants table, but nothing in the backend enforces tier-based limits yet. This task covers:

1. Define what each tier unlocks — max loan products, enabled modules (BNPL, factoring), API rate limits, white-label branding, support SLA.
2. Implement a TenantPlanGuard or middleware that reads planTier from tenant context and enforces feature flags and quota checks.
3. Gate relevant mutations/resolvers behind tier checks (e.g. creating a 5th product on Starter should fail).
4. Add tier-aware rate limiting on public API endpoints.
5. Unit + integration tests for each tier boundary.

---

## Task 2: Define Tenant Settings JSON Schema & Structured Form

- **Status:** To Do
- **Priority:** Medium
- **Phase:** Phase 6 — Hardening
- **Service/Module:** Admin Portal

**Description:**
Initial Settings (JSON) on tenant creation is currently a free-form textarea accepting any JSON. This task covers:

1. Define a canonical settings JSON schema covering: defaultCurrency, timezone, locale, business hours, notification channel preferences (sms/email/push), feature flags per product type (overdraft, microLoan, bnpl, invoiceFactoring), branding overrides, and regulatory jurisdiction.
2. Add server-side validation (JSON Schema or Zod) on the createTenant mutation to reject malformed settings.
3. Replace the raw JSON textarea in the Create Tenant wizard (Step 3) with a structured form — dropdowns for currency/timezone/locale, toggles for feature flags and notification channels.
4. Keep a raw JSON fallback for advanced overrides.
5. Ensure the existing Tenant Settings page (Settings → Tenant Configuration) stays in sync with the schema.
