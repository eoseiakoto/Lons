# Sprint 10A — Dev Prompt: P0 Blockers + Critical P1 Remediation

**From:** PM
**To:** Dev (Claude Code)
**Date:** 2026-04-30
**Sprint:** 10A — P0 Blockers + Critical P1s
**Priority:** CRITICAL — All P0s are confirmed go-live blockers by project owner
**Estimated total:** ~32 story points across 8 items
**Reference docs:**
- `Docs/BA-BRIEF-P0-BLOCKERS-2026-04-28.md` — Full fix specifications with file/line citations
- `Docs/BA-PLATFORM-AUDIT-2026-04-28.md` — Full audit (49 findings)
- `CLAUDE.md` — Project rules (money, RLS, security)

---

## Context

The BA completed a full codebase audit on 2026-04-28. Emmanuel confirmed three P0 findings as go-live blockers. This sprint addresses all three P0s plus five critical P1s. No feature work — this is remediation only.

**Quality bar for this sprint:** Every change must be lint-clean, typecheck-clean, build-clean. Every P0 fix must include tests that prove the vulnerability is resolved. Run `pnpm verify:synced` before delivery to ensure portal parity is maintained.

**Key constraint:** Do NOT change business logic. These fixes address security, data integrity, and operational gaps. The GraphQL schema, resolver logic, and service behavior should remain functionally identical (except where the fix itself is the functional change, e.g., P1-012 adding a missing resolver).

---

## Task 1: P0-001 — Fix Float-for-Money at All Service Boundaries (8 pts)

**CLAUDE.md rule:** "NEVER use `float` or `number` for monetary amounts."

**Problem:** The Decimal library and Prisma schema are correct, but precision is destroyed at every service boundary. GraphQL inputs use `Float`, REST controllers call `parseFloat()`, and services cast `Number()` on Decimal strings before database writes.

**What to do:**

### Step 1: Create shared money type
In `packages/shared-types/`, add:
```typescript
/** Represents a monetary amount as a string to preserve Decimal precision. */
export type MoneyString = string;
```

### Step 2: Fix GraphQL input types
Change all money fields from `@Field(() => Float)` to `@Field(() => String)`:

| File | Fields to fix |
|---|---|
| `apps/graphql-server/src/graphql/inputs/create-loan-request.input.ts` lines 16-19 | `requestedAmount`: `Float`/`number` → `String`/`string` |
| `apps/graphql-server/src/graphql/inputs/create-product.input.ts` lines 37-47, 66-69 | `minAmount`, `maxAmount`, `interestRate`: `Float` → `String` |
| `apps/graphql-server/src/graphql/inputs/update-product.input.ts` lines 17, 23, 41 | Same fields |
| `apps/graphql-server/src/graphql/resolvers/repayment.resolver.ts` line 19 | `amount` arg: `Float` → `String` |

### Step 3: Fix service method signatures
Change all service methods that accept money values from `amount: number` to `amount: string`:

| File | What to fix |
|---|---|
| `services/repayment-service/src/payment/payment.service.ts` line 17 | `amount: number` → `amount: string` |

### Step 4: Remove all `Number()` casts before Prisma writes
Prisma accepts `string` values for `Decimal` columns directly. Remove every `Number()` and `parseFloat()` cast on money values:

| File | Lines | What to remove |
|---|---|---|
| `services/repayment-service/src/payment/payment.service.ts` | 51-54, 75-80 | `Number()` before writes |
| `services/settlement-service/src/settlement.service.ts` | 60, 83-87, 98-102, 155-171 | `Number()` on all settlement amounts |
| `services/process-engine/src/contract/contract.service.ts` | 30, 35 | `Number(lr.approvedAmount)` |
| `services/process-engine/src/interest-accrual/interest-accrual.service.ts` | 91, 93 | `Number(amount)` for ledger |
| `services/process-engine/src/penalty/penalty.service.ts` | 57, 59, 95, 130, 132 | `Number()` on penalty amounts |
| `services/process-engine/src/exposure/exposure.service.ts` | 157, 168 | `parseFloat` for threshold calc |
| `apps/rest-server/src/repayment/repayment.controller.ts` | 52 | `parseFloat(body.amount)` |

### Step 5: Fix report resolver aggregation
In `apps/graphql-server/src/graphql/resolvers/report.resolver.ts` lines 207-241 and 273-315, replace float accumulation with `Decimal.js` aggregation using the existing `packages/common/src/financial/decimal.util.ts`.

### Step 6: Comprehensive grep
Run:
```bash
grep -rn "Number(" --include="*.ts" services/ apps/ | grep -iE "amount|balance|principal|interest|fee|penalty|revenue|share"
grep -rn "parseFloat(" --include="*.ts" services/ apps/ | grep -iE "amount|balance|principal|interest|fee|penalty|revenue|share"
```
Fix ALL remaining instances found.

### Step 7: Update tests
Update all test files that pass numeric money values as inputs — they need to pass strings now.

### Verification
- All tests pass with string money inputs
- No remaining `Number()` or `parseFloat()` on money variables in services/ or apps/
- GraphQL playground confirms money inputs accept strings, reject numbers

---

## Task 2: P0-002 — Implement Row-Level Security on All Tenant-Scoped Tables (8 pts)

**CLAUDE.md rule:** "Every database table in tenant schemas uses Row-Level Security (RLS). Tenant context is resolved from JWT and set as a PostgreSQL session variable."

**Problem:** Only 4 ancillary tables have RLS. All core tables rely on application-level `WHERE tenantId = ?`. The `SET app.current_tenant` session variable is never called.

**What to do:**

### Step 1: Write the migration
Create a new Prisma migration that for EVERY tenant-scoped table:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <table>
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

**Tables requiring RLS policies (all tenant-scoped):**
`tenants`, `users`, `roles`, `customers`, `customer_consents`, `subscriptions`, `products`, `product_versions`, `lenders`, `loan_requests`, `scoring_results`, `contracts`, `repayment_schedule_entries`, `repayments`, `disbursements`, `ledger_entries`, `settlement_runs`, `settlement_lines`, `reconciliation_runs`, `reconciliation_exceptions`, `collections_actions`, `notifications`, `webhook_endpoints`, `webhook_delivery_logs`, `notification_provider_configs`, `notification_mock_log`, `feedbacks`, `survey_responses`, `screening_results`, `messages`, `message_recipients`.

### Step 2: Wire tenant context into the request lifecycle
In the Prisma service or middleware, execute at the start of every database transaction:

```typescript
await prisma.$executeRaw`SET LOCAL app.current_tenant = ${tenantId}`;
```

Use `SET LOCAL` so the variable is scoped to the current transaction. The `tenantId` comes from the JWT (resolved by the AuthGuard — see Task 3).

**Implementation options (pick one):**
- **Prisma middleware:** Add a middleware to the Prisma client that runs before every query, extracting `tenantId` from a request-scoped context (e.g., NestJS `REQUEST` scope or `AsyncLocalStorage`).
- **Explicit transaction wrapper:** Create a helper `withTenantContext(tenantId, fn)` that wraps every service call in a `$transaction` with `SET LOCAL` at the top.

### Step 3: Platform admin bypass
Platform admin queries that need cross-tenant access (e.g., the platform portal's dashboard) should use a separate Prisma client instance that does NOT set the tenant context, or set a bypass role that has an exemption policy.

### Step 4: Fix unsafe raw SQL (P1-001 bundled here)
Replace `$executeRawUnsafe` with parameterized `$executeRaw`:
- `prisma.service.ts` line 23
- `audit-partition-manager.ts` lines 31, 57

```typescript
// BEFORE (unsafe)
await prisma.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);

// AFTER (safe)
await prisma.$executeRaw`SET LOCAL app.current_tenant = ${tenantId}`;
```

### Step 5: Seed data migration
The seed script must set the tenant context before inserting data, or the RLS policies will block seed inserts. Update `packages/database/prisma/seed.ts` to set the session variable.

### Verification
- Run migrations successfully on a clean database
- Seed data still works
- All existing tests pass (they may need tenant context setup in their test fixtures)
- Write a new integration test that proves: a query without `SET app.current_tenant` returns zero rows on an RLS-protected table
- Write a test that proves: setting tenant A context does not return tenant B data

---

## Task 3: P0-003 — Add Global AuthGuard + Fix CORS Wildcard (5 pts)

**CLAUDE.md rule:** "CORS, CSRF, rate limiting configured on all public endpoints."

**Problem:** Three compounding gaps: (1) No `AuthGuard` registered globally — resolvers are unauthenticated by default. (2) CORS is `origin: *`. (3) Platform portal defaults JWT role to `platform_admin` when token lacks a role claim.

**What to do:**

### Step 1: Register global guards on GraphQL server
In `apps/graphql-server/src/app.module.ts`:

```typescript
import { APP_GUARD } from '@nestjs/core';

providers: [
  { provide: APP_GUARD, useClass: AuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
  { provide: APP_GUARD, useClass: TenantThrottlerGuard }, // existing
],
```

Create a `@Public()` decorator for endpoints that should be exempt from authentication (health check, login/signup mutations):
```typescript
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

Update `AuthGuard` to check for the `@Public()` decorator and skip authentication if present.

### Step 2: Register global guards on REST server
Same pattern in `apps/rest-server/src/app.module.ts`. Webhook endpoints (`/webhooks/*`) should use `@Public()` since they authenticate via HMAC signature, not JWT.

### Step 3: Fix CORS
In both `graphql-server/src/main.ts` (line 39) and `rest-server/src/main.ts` (line 35):

```typescript
// BEFORE
app.enableCors({ origin: '*' });

// AFTER
app.enableCors({
  origin: [
    process.env.ADMIN_PORTAL_URL || 'http://localhost:3001',
    process.env.PLATFORM_PORTAL_URL || 'http://localhost:3002',
  ],
  credentials: true,
});
```

Add `ADMIN_PORTAL_URL` and `PLATFORM_PORTAL_URL` to `.env.example`.

### Step 4: Fix platform portal role default
In `apps/platform-portal/src/*/auth-context.tsx` (line 61 area), remove the default role assignment:

```typescript
// BEFORE
const role = token.role || 'platform_admin';

// AFTER
if (!token.role) {
  // Token has no role — redirect to login
  throw new UnauthorizedError('Token missing role claim');
}
const role = token.role;
```

### Step 5: Add `@Roles()` decorators
Apply `@Roles('admin', 'operator')` on sensitive admin mutations (product CRUD, user management, settlement operations). Apply `@Roles('platform_admin')` on platform-level operations.

### Verification
- All resolvers that don't have `@Public()` return 401 without a valid JWT
- CORS rejects requests from origins not in the allowlist
- Platform portal with a role-less token redirects to login instead of granting admin access
- Existing tests pass (test setup may need to provide mock JWT tokens)

---

## Task 4: P1-001 — Fix SQL Injection in Tenant Context Setter (2 pts)

**Bundled with Task 2 (P0-002).** The raw SQL fixes in P0-002 Step 4 cover this item. Ensure:
- `prisma.service.ts:23` — `$executeRawUnsafe` → `$executeRaw` with template literal
- `audit-partition-manager.ts:31,57` — same fix

If Dev completes P0-002, this is automatically resolved. Verify with a test that passes a tenant ID containing SQL injection payload (e.g., `'; DROP TABLE users; --`) and confirms it's safely parameterized.

---

## Task 5: P1-003 — Mask PII in Notification Sandbox Adapters (1 pt)

**CLAUDE.md rule:** "PII must NEVER appear in logs — mask as `+233***7890`, `GHA-***-XXX`."

**Problem:** Console/log notification adapters log phone numbers, email addresses, and customer names in cleartext.

**What to do:**
1. Find all sandbox/mock notification adapters (likely in `services/notification-service/src/adapters/` or similar)
2. Add PII masking before any `console.log` or `logger.*` calls:
   - Phone: `+233***7890` format (show country code + last 4 digits)
   - Email: `e***@gmail.com` format (first char + *** + domain)
   - Name: `E*** O***` format (first char of each name)
3. Use or create a shared masking utility in `packages/common/src/security/pii-mask.ts`
4. Grep the entire codebase for any other PII logging: `grep -rn "phone\|email\|fullName\|full_name\|nationalId\|national_id" --include="*.ts" services/ apps/ | grep -i "log\|console"`

### Verification
- Run the notification service in sandbox mode, trigger a notification, verify logs show masked PII
- No cleartext PII in any log output

---

## Task 6: P1-004 — Fix Schema Drift (RefreshToken + ApiKey Tables) (2 pts)

**Problem:** `RefreshToken` and `ApiKey` tables exist in the database but are missing from the Prisma schema. This means Prisma's migration tracking is out of sync with the actual database state.

**What to do:**
1. Run `npx prisma db pull` to introspect the existing database and see the full schema
2. Add the `RefreshToken` and `ApiKey` models to `packages/database/prisma/schema.prisma` matching the existing table structure
3. Generate a migration: `npx prisma migrate dev --name align_refresh_token_api_key`
4. Ensure the migration is a no-op for existing databases (since the tables already exist) but correctly tracks them going forward
5. If there are any discrepancies between the introspected schema and the existing Prisma schema, document them in the delivery notes

### Verification
- `prisma migrate status` shows no pending migrations
- `prisma generate` succeeds
- `pnpm build` succeeds with the new models available in the Prisma client

---

## Task 7: P1-008 — Add Tests for Reconciliation Service (3 pts)

**CLAUDE.md rule:** "Business logic: unit tests (Jest/Pytest) with 80%+ coverage."

**Problem:** The reconciliation service (`services/reconciliation-service/`) has zero test files. This is a critical financial batch operation that runs daily.

**What to do:**
1. Create test files mirroring the service structure
2. Write unit tests covering:
   - Daily reconciliation batch execution
   - Expected vs. actual balance matching
   - Exception identification and recording
   - Edge cases: zero transactions, all matching, all mismatched
   - Decimal arithmetic accuracy (use property-based testing for financial calculations)
3. Write at least one integration test that runs a full reconciliation cycle against a test database
4. Add `coverageThreshold` to the service's Jest config:
   ```json
   "coverageThreshold": {
     "global": {
       "branches": 80,
       "functions": 80,
       "lines": 80,
       "statements": 80
     }
   }
   ```

### Verification
- `pnpm --filter reconciliation-service test` passes
- Coverage meets 80% threshold
- Tests include financial calculation property tests

---

## Task 8: P1-012 — Expose Manual Loan Approval Resolver (3 pts)

**Problem:** `ApprovalService.approveManual()` exists in the process engine but no GraphQL resolver exposes it. Loans that enter `manual_review` status are stuck with no way to approve or reject them. This blocks the semi-automatic and manual approval workflows defined in Docs/05-process-engine.md.

**What to do:**
1. Add a GraphQL mutation in the appropriate resolver:
   ```graphql
   mutation approveLoanManual(
     loanRequestId: ID!
     decision: ApprovalDecision!  # APPROVE or REJECT
     reasonCode: String
     reasonDetail: String
     adjustedAmount: String       # Optional — operator may adjust approved amount
     idempotencyKey: String!
   ): LoanRequest
   ```
2. Apply `@Roles('admin', 'operator')` — only authorized operators should approve loans
3. The resolver should call the existing `ApprovalService.approveManual()` method
4. Emit the appropriate loan state transition event on approval/rejection
5. Add a corresponding admin portal UI element (button or action) on the loan request detail page for requests in `manual_review` status — this can be a simple button that calls the mutation

### Verification
- Create a loan request that enters `manual_review` status
- Call `approveLoanManual` with `APPROVE` → loan progresses to next state
- Call `approveLoanManual` with `REJECT` → loan transitions to rejected
- Unauthorized users get 403
- Idempotency key prevents duplicate approvals

---

## Delivery Checklist

Before submitting delivery notes:

1. [ ] `pnpm lint` — clean
2. [ ] `pnpm typecheck` — clean (or equivalent `tsc --noEmit`)
3. [ ] `pnpm build` — clean
4. [ ] `pnpm test` — all pass
5. [ ] `pnpm verify:synced` — portal parity maintained
6. [ ] No `Number()` or `parseFloat()` on any money variable (grep verification)
7. [ ] No `$executeRawUnsafe` remaining in codebase
8. [ ] No `origin: '*'` in any CORS config
9. [ ] No cleartext PII in any log output
10. [ ] All new code has tests
11. [ ] Delivery notes document every file changed with before/after

---

## Monday.com Items

| Item ID | Task | Story Points |
|---|---|---|
| 11887429880 | P0-001: Fix float-for-money | 8 |
| 11887414403 | P0-002: Implement RLS (Phase A) | 8 |
| 11887414436 | P0-003: Global AuthGuard + CORS | 5 |
| 11887417241 | P1-001: Fix SQL injection (bundled with P0-002) | 2 |
| 11887430035 | P1-003: Mask PII in notification adapters | 1 |
| 11887414512 | P1-004: Fix schema drift | 2 |
| 11887417245 | P1-008: Reconciliation service tests | 3 |
| 11887430338 | P1-012: Manual loan approval resolver | 3 |

Update each item to "In Progress" when you start work, and "Done" when complete. Include the item ID in your commit messages.
