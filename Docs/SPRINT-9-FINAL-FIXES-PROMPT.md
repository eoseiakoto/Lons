# Sprint 9 — Final Fixes Prompt

**Priority: LOW — Minor polish before sprint close**
**Owner: Claude Code (DEV)**
**Date: 2026-04-14**
**Reference: Sprint 9 re-audit identified 2 remaining items from the original 37 gaps**

These are the only outstanding items from Sprint 9. Everything else has been verified as complete.

---

## Fix 1: Make Platform Portal Default Exposure Rules Editable (Gap 3C)

**Current state:** `apps/platform-portal/src/app/(portal)/settings/page.tsx` displays default tenant exposure settings as read-only hardcoded text:
- Max Customer Exposure: "GHS 500,000"
- Cross-Product Check: "Enabled"  
- Income Multiplier: "5x"

Platform admins can see the defaults but cannot change them.

**What to do:**

1. Convert the read-only display values into editable form fields. Follow the pattern used in the admin portal's tenant settings page (`apps/admin-portal/src/app/(portal)/settings/tenant/page.tsx`, lines 380–427) which already has working editable fields for the same exposure config.

2. Add form state and a save handler:

```tsx
const [defaults, setDefaults] = useState({
  maxCustomerExposure: '500000.00',
  enableCrossProductCheck: true,
  maxCustomerExposureMultiplier: 5,
});
```

3. Replace the static display with input fields:

```tsx
{/* Max Customer Exposure — text input for decimal string */}
<label className="text-sm text-white/60">Max Customer Exposure</label>
<input
  type="text"
  value={defaults.maxCustomerExposure}
  onChange={(e) => setDefaults(prev => ({ ...prev, maxCustomerExposure: e.target.value }))}
  placeholder="500000.00"
  className="..."
/>

{/* Cross-Product Check — toggle */}
<label className="text-sm text-white/60">Cross-Product Check</label>
<input
  type="checkbox"
  checked={defaults.enableCrossProductCheck}
  onChange={(e) => setDefaults(prev => ({ ...prev, enableCrossProductCheck: e.target.checked }))}
/>

{/* Income Multiplier — number input */}
<label className="text-sm text-white/60">Income Multiplier</label>
<input
  type="number"
  step="0.1"
  min="0"
  value={defaults.maxCustomerExposureMultiplier}
  onChange={(e) => setDefaults(prev => ({ ...prev, maxCustomerExposureMultiplier: parseFloat(e.target.value) || 0 }))}
  placeholder="0 to disable"
  className="..."
/>
```

4. Add a "Save Defaults" button that calls a GraphQL mutation:

```graphql
mutation UpdatePlatformDefaults($input: PlatformDefaultsInput!) {
  updatePlatformDefaults(input: $input) {
    maxCustomerExposure
    enableCrossProductCheck
    maxCustomerExposureMultiplier
  }
}
```

5. **Backend:** If the mutation doesn't exist yet, create it in the platform admin resolvers. Store defaults in a platform-level configuration table or a dedicated `PlatformConfig` model. When a new tenant is created, seed its exposure settings from these defaults.

6. Add a GraphQL query to load current defaults on page mount:

```graphql
query PlatformDefaults {
  platformDefaults {
    maxCustomerExposure
    enableCrossProductCheck
    maxCustomerExposureMultiplier
  }
}
```

7. Match the styling of the existing "Data Retention Policy" section on the same page — glass card, icon header, form fields with labels.

---

## Fix 2: Add X-Tenant-Context Header Security Tests (Gap 8D)

**Current state:** `tests/regression/tenant-isolation.spec.ts` (179 lines) has solid tenant isolation tests with 403 enforcement, but doesn't explicitly test the `X-Tenant-Context` header mechanism used by platform portal drill-down pages.

**File to create:** `apps/graphql-server/src/__tests__/x-tenant-context.spec.ts`

**What to test:**

### Test 1: Non-PLATFORM_ADMIN rejected when using X-Tenant-Context header
```typescript
it('should return 403 when non-admin sends X-Tenant-Context header', async () => {
  // Authenticate as a regular SP_ADMIN or SP_OPERATOR user
  // Send a GraphQL query with X-Tenant-Context header set to any tenant ID
  // Expect: 403 Forbidden or UnauthorizedException
  // Verify: error message indicates insufficient role
});
```

### Test 2: PLATFORM_ADMIN with valid tenant ID succeeds
```typescript
it('should allow PLATFORM_ADMIN to query another tenant via X-Tenant-Context', async () => {
  // Authenticate as PLATFORM_ADMIN
  // Send a GraphQL query (e.g., customers list) with X-Tenant-Context: tenantB_id
  // Expect: 200 with tenantB's data
  // Verify: returned data belongs to tenantB (not the admin's own tenant)
});
```

### Test 3: PLATFORM_ADMIN with non-existent tenant ID returns proper error
```typescript
it('should return error for non-existent tenant ID in X-Tenant-Context', async () => {
  // Authenticate as PLATFORM_ADMIN
  // Send query with X-Tenant-Context: non-existent-uuid
  // Expect: 400 or 404 with clear error message (NOT a 500)
});
```

### Test 4: PLATFORM_ADMIN with inactive tenant ID returns proper error
```typescript
it('should return error for inactive tenant ID in X-Tenant-Context', async () => {
  // Authenticate as PLATFORM_ADMIN
  // Send query with X-Tenant-Context: inactive-tenant-uuid
  // Expect: 400 or 403 with message indicating tenant is inactive
});
```

### Test 5: Audit log entry created for cross-tenant access
```typescript
it('should create audit log entry when X-Tenant-Context is used', async () => {
  // Authenticate as PLATFORM_ADMIN
  // Send query with X-Tenant-Context: tenantB_id
  // Query audit log for this action
  // Verify: entry contains actorId (platform admin), targetTenantId (tenantB), action type, timestamp
});
```

### Test 6: Session isolation — override doesn't leak to subsequent requests
```typescript
it('should not leak tenant context to subsequent requests without header', async () => {
  // Authenticate as PLATFORM_ADMIN
  // Request 1: Send query WITH X-Tenant-Context: tenantB_id → expect tenantB data
  // Request 2: Send same query WITHOUT X-Tenant-Context header → expect platform admin's own tenant data (or empty if admin has no tenant)
  // Verify: Request 2 does NOT return tenantB data (no sticky session)
});
```

### Test 7: Invalid UUID format rejected
```typescript
it('should reject malformed UUID in X-Tenant-Context header', async () => {
  // Authenticate as PLATFORM_ADMIN
  // Send query with X-Tenant-Context: "not-a-valid-uuid"
  // Expect: 400 with validation error
});
```

**Implementation notes:**
- Use the existing test infrastructure (check `tests/regression/` or `apps/graphql-server/src/__tests__/` for test setup patterns — how auth tokens are created, how GraphQL queries are sent, how the test database is seeded)
- These tests need at least 2 tenants seeded in the test database, plus a PLATFORM_ADMIN user
- The auth guard that parses `X-Tenant-Context` is in `services/entity-service/src/auth/guards/auth.guard.ts` — the tests should exercise this guard via real HTTP requests to the GraphQL endpoint, not by mocking the guard directly

---

## Definition of Done

- [ ] Platform portal default exposure rules are editable with save functionality
- [ ] Backend mutation for saving platform defaults exists and works
- [ ] New tenants inherit defaults from platform config
- [ ] All 7 X-Tenant-Context security tests pass
- [ ] No regressions in existing tenant isolation tests
- [ ] All code passes lint
