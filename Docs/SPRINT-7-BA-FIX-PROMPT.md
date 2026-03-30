# Sprint 7 — BA Review Fix Prompt (Claude Code)

> **Context:** The Business Analyst reviewed all Sprint 7 DEV deliverables and flagged 4 issues requiring code fixes. Fix all 4 in order — DEV-11 is Critical and must land first because DEV-12 depends on it.

---

## Fix 1 (Critical): DEV-11 — Add `allWalletProviderConfigs` GraphQL Query

**Problem:** The Platform Admin integration page (`apps/admin-portal/src/app/(portal)/platform/integrations/page.tsx`) calls an `allWalletProviderConfigs` query that does not exist in the backend resolver. The page will error for Platform Admin users.

**File to modify:** `apps/graphql-server/src/graphql/resolvers/integration.resolver.ts`

**What to add:** A new query named `allWalletProviderConfigs` that:

1. Returns `[WalletProviderConfigType]` (flat array, not a connection — the frontend expects a simple array, see line 28-32 of the platform integrations page)
2. Is guarded by `platform_admin` role — this is a cross-tenant query, only Platform Admin should access it
3. Queries `prisma.walletProviderConfig.findMany()` WITHOUT a tenant filter (cross-tenant visibility)
4. Filters only non-deleted records: `where: { deletedAt: null }`
5. Orders by `createdAt: 'desc'`
6. Masks sensitive `configJson` fields using the existing `maskSensitiveConfigFields()` helper already in the file
7. Logs the access via the existing audit pattern in the file

**Frontend expects these fields** (from `apps/admin-portal/src/app/(portal)/platform/integrations/page.tsx` lines 6-14):
```typescript
id, tenantId, providerType, environmentMode, displayName, isActive, isDefault, createdAt
```

**Add the query after the existing `walletProviderConfig` single-fetch query (around line 105).** Pattern to follow — use the existing query structure but without pagination and without tenant scoping:

```typescript
@Query(() => [WalletProviderConfigType], { name: 'allWalletProviderConfigs' })
@Roles('platform_admin')
async allWalletProviderConfigs(
  @CurrentUser() user: any,
): Promise<WalletProviderConfigType[]> {
  this.logger.log(`Platform admin ${user.userId} fetching all wallet provider configs`);

  const configs = await this.prisma.walletProviderConfig.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  return configs.map((config) => ({
    ...config,
    configJson: config.configJson
      ? maskSensitiveConfigFields(config.configJson as Record<string, unknown>)
      : null,
  }));
}
```

**Verification:**
- The Platform Admin integration page should load without errors
- The query should NOT be accessible to `sp_admin` or regular users
- Sensitive config fields should be masked in responses

---

## Fix 2 (High): DEV-03 — Replace `parseFloat` with Decimal in MockWalletAdapter

**Problem:** `services/integration-service/src/adapters/mock/mock-wallet.adapter.ts` uses `parseFloat()` for balance arithmetic at lines 170, 213, and 222. This violates the CLAUDE.md rule: "NEVER use float or number for monetary amounts." Even in a mock adapter, `parseFloat` can produce floating-point rounding errors that confuse SP prospects during staging testing.

**File to modify:** `services/integration-service/src/adapters/mock/mock-wallet.adapter.ts`

**Required changes:**

1. Add import at the top of the file:
```typescript
import { Decimal } from '@prisma/client/runtime/library';
```

2. Replace line 170 (`transfer` method):
```typescript
// BEFORE:
const newBalance = (parseFloat(state.balance) + parseFloat(params.amount)).toFixed(4);

// AFTER:
const newBalance = new Decimal(state.balance).plus(new Decimal(params.amount)).toFixed(4);
```

3. Replace line 213 (`collect` method — balance check):
```typescript
// BEFORE:
if (parseFloat(state.balance) < parseFloat(params.amount)) {

// AFTER:
if (new Decimal(state.balance).lessThan(new Decimal(params.amount))) {
```

4. Replace line 222 (`collect` method — debit):
```typescript
// BEFORE:
const newBalance = (parseFloat(state.balance) - parseFloat(params.amount)).toFixed(4);

// AFTER:
const newBalance = new Decimal(state.balance).minus(new Decimal(params.amount)).toFixed(4);
```

**Verification:**
- `grep -rn "parseFloat" services/integration-service/src/adapters/mock/mock-wallet.adapter.ts` should return 0 results
- Existing MockWalletAdapter tests should still pass
- If any tests use `parseFloat` for assertions, update those too

---

## Fix 3 (High): DEV-08 — Add Scoring Breakdowns Section to Debug Panel

**Problem:** The debug panel (`apps/admin-portal/src/app/(portal)/debug/page.tsx`) implements 4 of the required sections (API logs, adapter operations, event bus, state transitions) but is missing the **Scoring Breakdowns** section specified in the DEV-08 acceptance criteria.

**File to modify:** `apps/admin-portal/src/app/(portal)/debug/page.tsx`

**What to add:**

1. Add a new GraphQL query for scoring debug data:
```typescript
const DEBUG_SCORING_BREAKDOWNS = gql`
  query DebugScoringBreakdowns($limit: Int) {
    debugScoringBreakdowns(limit: $limit) {
      id
      customerId
      loanRequestId
      scoringModel
      finalScore
      decision
      rules {
        ruleName
        passed
        score
        weight
        weightedScore
        reason
      }
      executedAt
    }
  }
`;
```

2. Add a 5th tab to the Tabs component: `"Scoring Breakdowns"`

3. Implement the scoring breakdowns tab content showing:
   - A table with columns: Customer ID, Loan Request ID, Model, Final Score, Decision, Executed At
   - Each row expandable to show the individual rule breakdown:
     - Rule Name | Passed (✓/✗) | Raw Score | Weight | Weighted Score | Reason
   - Decision column color-coded: APPROVED=green, DECLINED=red, MANUAL_REVIEW=amber
   - Final Score displayed with visual indicator (e.g., progress bar or color gradient)

4. Add the corresponding backend query. In the appropriate resolver (or create a new `debug.resolver.ts` if one doesn't exist), add:
   - Query `debugScoringBreakdowns` that reads from the scoring events or process engine logs
   - Guard it with the same staging-only check as other debug queries
   - If no dedicated scoring debug table exists, query from `process_engine` events where `eventType = 'scoring.completed'` and parse the scoring data from event payloads

**Verification:**
- The debug panel should show 5 tabs (not 4)
- Scoring breakdowns tab should render with mock/seeded scoring data
- Each row should be expandable to show individual rule results

---

## Fix 4 (Medium): DEV-13 — Add 2 Missing Integration Test Scenarios

**Problem:** `tests/staging/loan-lifecycle.staging-spec.ts` has 4 test scenarios but is missing 2 important ones that SP prospects will evaluate.

**File to modify:** `tests/staging/loan-lifecycle.staging-spec.ts`

**What to add:**

### Scenario 1: Reconciliation batch processes exceptions correctly

Add a new `describe` block after the existing "REST API — Staging Integration" block:

```typescript
describe('Reconciliation — Exception Handling', () => {
  it('should detect and flag reconciliation exceptions', async () => {
    // Query reconciliation batches from seeded data
    const { data, errors } = await graphqlQuery(`
      query {
        reconciliationBatches(first: 5) {
          edges {
            node {
              id
              status
              totalTransactions
              matchedCount
              exceptionCount
              exceptions {
                id
                type
                status
                transactionRef
                amount
                description
              }
            }
          }
        }
      }
    `);

    if (!errors) {
      const batches = data?.reconciliationBatches?.edges;
      expect(batches).toBeDefined();
      expect(batches.length).toBeGreaterThan(0);

      // Find a batch with exceptions (seeded data should include at least one)
      const batchWithExceptions = batches.find(
        (e: any) => e.node.exceptionCount > 0,
      );
      if (batchWithExceptions) {
        const batch = batchWithExceptions.node;
        expect(batch.exceptions.length).toBe(batch.exceptionCount);
        // Each exception should have required fields
        batch.exceptions.forEach((ex: any) => {
          expect(ex.type).toBeDefined();
          expect(ex.status).toBeDefined();
          expect(ex.transactionRef).toBeDefined();
          expect(ex.amount).toBeDefined();
        });
      }
    }
  });
});
```

### Scenario 2: Settlement generates correct revenue splits

```typescript
describe('Settlement — Revenue Sharing', () => {
  it('should generate correct 4-party revenue splits', async () => {
    const { data, errors } = await graphqlQuery(`
      query {
        settlements(first: 5) {
          edges {
            node {
              id
              status
              totalAmount
              splits {
                party
                amount
                percentage
                type
              }
            }
          }
        }
      }
    `);

    if (!errors) {
      const settlements = data?.settlements?.edges;
      expect(settlements).toBeDefined();
      expect(settlements.length).toBeGreaterThan(0);

      const settlement = settlements[0].node;
      expect(settlement.splits).toBeDefined();
      expect(settlement.splits.length).toBeGreaterThanOrEqual(2);

      // Verify splits sum to total — use string comparison to avoid float issues
      const { Decimal } = require('@prisma/client/runtime/library');
      const splitSum = settlement.splits.reduce(
        (sum: any, s: any) => new Decimal(sum).plus(new Decimal(s.amount)),
        new Decimal('0'),
      );
      const total = new Decimal(settlement.totalAmount);
      expect(splitSum.equals(total)).toBe(true);

      // Verify expected party types exist
      const partyTypes = settlement.splits.map((s: any) => s.party);
      // At minimum, platform fee and lender share should exist
      expect(
        partyTypes.some((p: string) =>
          ['PLATFORM_FEE', 'PLATFORM'].includes(p),
        ),
      ).toBe(true);
      expect(
        partyTypes.some((p: string) =>
          ['LENDER_SHARE', 'LENDER'].includes(p),
        ),
      ).toBe(true);
    }
  });
});
```

**Verification:**
- `tests/staging/loan-lifecycle.staging-spec.ts` should have 6 describe blocks (up from 4)
- Both new test scenarios should compile without TypeScript errors
- Tests should pass when run against seeded staging data

---

## Execution Order

1. **Fix 1 (DEV-11)** first — Critical, and DEV-12 depends on it
2. **Fix 2 (DEV-03)** — High priority, simple replacement
3. **Fix 3 (DEV-08)** — High priority, more complex (new tab + backend query)
4. **Fix 4 (DEV-13)** — Medium priority, test additions

## Post-Fix Verification Checklist

- [ ] `allWalletProviderConfigs` query exists and returns cross-tenant data for platform_admin only
- [ ] Zero `parseFloat` usage in `mock-wallet.adapter.ts`
- [ ] Debug panel shows 5 tabs including "Scoring Breakdowns"
- [ ] Integration tests file has 6 describe blocks including reconciliation and settlement
- [ ] All existing tests still pass: `pnpm test`
- [ ] No TypeScript compilation errors: `pnpm build`
