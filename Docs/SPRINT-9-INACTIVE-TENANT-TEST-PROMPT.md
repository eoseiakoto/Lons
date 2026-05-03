# Sprint 9 — Final Test: Inactive Tenant Resolver-Level Integration Test

**Priority: LOW — Last item before sprint close**
**Owner: Claude Code (DEV)**
**Date: 2026-04-14**

---

## Context

The `X-Tenant-Context` header security tests (`apps/graphql-server/src/__tests__/x-tenant-context.spec.ts`) cover 6 of 7 required scenarios at the guard level. The guard validates UUID format and PLATFORM_ADMIN role but does NOT check tenant active/inactive status — that validation happens downstream in the resolvers/services.

We need a resolver-level integration test that proves an inactive tenant ID in the `X-Tenant-Context` header returns a proper error (not a 500 or silent data leak).

## What to Build

**File to create:** `apps/graphql-server/src/__tests__/x-tenant-context-inactive.integration.spec.ts`

This is a single integration test that sends a real GraphQL request through the full stack (guard → resolver → service → database).

```typescript
describe('X-Tenant-Context with inactive tenant (integration)', () => {
  // Setup:
  // - Seed two tenants: tenantA (active), tenantB (inactive/suspended)
  // - Seed a PLATFORM_ADMIN user
  // - Authenticate as PLATFORM_ADMIN

  it('should return a meaningful error when X-Tenant-Context targets an inactive tenant', async () => {
    // Send a GraphQL query (e.g., customers or products list) with:
    //   Authorization: Bearer <platform_admin_token>
    //   X-Tenant-Context: <tenantB_id>  (inactive tenant)
    //
    // Expected behavior (one of):
    //   (a) HTTP 403 with error message like "Target tenant is inactive" or "Tenant not accessible"
    //   (b) GraphQL errors array with a structured error code like TENANT_INACTIVE
    //
    // NOT acceptable:
    //   - HTTP 500 / unhandled exception
    //   - Empty data returned silently (as if tenant has no records)
    //   - Data from a different tenant returned
    //
    // Assertions:
    expect(response.status).not.toBe(500);
    expect(response.errors?.[0]?.message).toMatch(/inactive|suspended|not accessible|not found/i);
    // OR if using HTTP status:
    // expect(response.status).toBe(403);
  });

  it('should NOT create an audit log entry for rejected inactive tenant access', async () => {
    // After the failed request above, query the audit log
    // Verify: no audit entry was created for this rejected access attempt
    // (OR: an audit entry WAS created but with a 'rejected' status — either is acceptable,
    //  but the behavior should be intentional, not accidental)
  });

  it('should continue working normally after an inactive tenant rejection', async () => {
    // After the inactive tenant rejection:
    // Send a second query with X-Tenant-Context: <tenantA_id> (active tenant)
    // Verify: returns tenantA data successfully
    // This confirms the rejection didn't corrupt any state
  });
});
```

## Where to Add the Tenant Status Check (if missing)

If the test reveals that inactive tenant access silently succeeds (returns empty data or a 500), the fix goes in one of these locations:

**Option A (preferred) — Auth guard enhancement:**
In `services/entity-service/src/auth/guards/auth.guard.ts`, after the UUID format validation and before setting the effective tenant ID, add:

```typescript
// After validating UUID format and PLATFORM_ADMIN role:
const targetTenant = await this.tenantService.findById(tenantContextHeader);
if (!targetTenant || targetTenant.status !== 'active') {
  throw new ForbiddenException('Target tenant is inactive or does not exist');
}
```

**Option B — Resolver/service level:**
In the tenant context middleware or a shared service, validate tenant status before executing the query. This keeps the guard lightweight but requires the check in more places.

## Definition of Done

- [ ] Integration test file created and passes
- [ ] Inactive tenant access returns a proper error (not 500, not silent empty data)
- [ ] Subsequent requests with active tenant still work after a rejection
- [ ] All existing X-Tenant-Context tests still pass
- [ ] `pnpm lint` passes
