# Fix: AML Screening — Remaining Gaps

**Priority: MEDIUM**
**Owner: Claude Code (DEV)**
**Date: 2026-04-16**

---

## Overview

A thorough review of the screening implementation across both portals, the GraphQL layer, and the service layer identified 6 gaps:

1. **Escalation decision casing mismatch** — the admin portal sends `'ESCALATE'` but the platform resolver queries for `reviewDecision: 'escalated'`. Escalated screenings never appear in the platform portal's escalated queue.
2. **Decision + reason concatenation corrupts the `reviewDecision` field** — when a reason is provided, the resolver stores `"ESCALATE: some reason text"` as the decision value, making all downstream filters fail.
3. **Detail page fetches all screenings then filters client-side** — there is no `screeningById` backend query, forcing the detail page to fetch up to 100 records and `.find()` locally.
4. **Platform portal shows UUIDs for tenant and customer** — the same raw-UUID problem the admin portal had before the fix.
5. **All screening page strings are hardcoded English** — neither the admin portal screening pages nor the platform portal screening page use i18n keys.
6. **`String.replace('_', ' ')` only replaces the first underscore** — should use a global regex. Currently safe because no value has multiple underscores, but fragile.

---

## Fix 1: Standardize review decision values (CRITICAL)

### Problem

The admin portal sends uppercase decision strings:

```typescript
// admin-portal screening page & detail page
handleReview(r.screeningId, 'APPROVE');
handleReview(r.screeningId, 'BLOCK');
handleReview(r.screeningId, 'ESCALATE');
```

The screening resolver then concatenates the reason into the decision field when a reason is provided:

```typescript
// screening.resolver.ts line 66
reason ? `${decision}: ${reason}` : decision
```

This means the stored `reviewDecision` value in the database is one of:
- `"APPROVE"` or `"APPROVE: some reason text"`
- `"BLOCK"` or `"BLOCK: some reason text"`
- `"ESCALATE"` or `"ESCALATE: some reason text"`

But the platform resolver filters for escalated cases using:

```typescript
// platform-screening.resolver.ts lines 99, 149
reviewDecision: 'escalated'  // ← lowercase, no prefix support
```

And the platform portal sends its own lowercase decisions:

```typescript
// platform-portal screening page
decision: 'blocked'            // line 292
decision: 'approved'           // line 304
decision: 'flagged_investigation'  // line 306
```

**Result:** Escalated screenings from the admin portal NEVER appear in the platform portal's escalated queue. The two systems use incompatible decision formats.

### Fix

Standardize on uppercase enum-style values across all layers. Store decision and reason as separate fields.

**Step 1 — Stop concatenating reason into the decision field**

**File:** `apps/graphql-server/src/graphql/resolvers/screening.resolver.ts` (line 63–66)

Change:
```typescript
const result = await this.screeningService.submitReview(
  tenantId,
  screeningId,
  reason ? `${decision}: ${reason}` : decision,
  user.userId,
);
```

To:
```typescript
const result = await this.screeningService.submitReview(
  tenantId,
  screeningId,
  decision,
  user.userId,
  reason,
);
```

**Step 2 — Update the service to store reason separately**

**File:** `services/integration-service/src/screening/screening.service.ts`

Update the `submitReview` method signature and implementation:

Change:
```typescript
async submitReview(
  tenantId: string,
  screeningId: string,
  decision: string,
  reviewedBy: string,
): Promise<IScreeningResult> {
```

To:
```typescript
async submitReview(
  tenantId: string,
  screeningId: string,
  decision: string,
  reviewedBy: string,
  reason?: string,
): Promise<IScreeningResult> {
```

The `data` block in the `update` call stays the same (`reviewDecision: decision`) — the reason field is a new concern (see Step 3).

> **Note on reason storage:** The Prisma schema has `reviewDecision String? @db.VarChar(50)`. A reason could be longer than 50 characters. Two options:
>
> - **Option A (simple):** Add a `reviewReason` column to `ScreeningResult` (`String? @map("review_reason")`). This is the clean approach.
> - **Option B (minimal):** Store only the decision enum in `reviewDecision` and discard the free-text reason (it's still in the audit log via the `AuditAction` decorator). This avoids a migration.
>
> Recommendation: **Option A** — add `reviewReason` column. But either option works for fixing the immediate mismatch. If Option B is chosen, skip the `reason` parameter and just ensure the decision value is standardized.

**Step 3 — Standardize the platform resolver's decision filters**

**File:** `apps/graphql-server/src/graphql/resolvers/platform-screening.resolver.ts`

Change both occurrences of `reviewDecision: 'escalated'` (lines 99, 149):

```typescript
// From:
reviewDecision: 'escalated',

// To:
reviewDecision: 'ESCALATE',
```

**Step 4 — Standardize the platform portal's decision values**

**File:** `apps/platform-portal/src/app/(portal)/screening/page.tsx`

Change `handleAction` (line 292):
```typescript
// From:
decision: 'blocked',
reason: 'Platform admin confirmed block from escalation',

// To:
decision: 'BLOCK',
reason: 'Platform admin confirmed block from escalation',
```

Change `handleSubmitAction` (lines 303–306):
```typescript
// From:
const decision =
  actionModal.action === 'override_approve'
    ? 'approved'
    : 'flagged_investigation';

// To:
const decision =
  actionModal.action === 'override_approve'
    ? 'APPROVE'
    : 'FLAG_INVESTIGATION';
```

**Step 5 — Update the platform resolver's mutation**

**File:** `apps/graphql-server/src/graphql/resolvers/platform-screening.resolver.ts`

Same issue — the `platformScreeningDecision` mutation (line 178) also concatenates:

```typescript
const decisionValue = reason ? `${decision}: ${reason}` : decision;
```

Change to:
```typescript
const updated = await this.prisma.screeningResult.update({
  where: { id: screeningId },
  data: {
    reviewedBy: user.userId,
    reviewedAt: new Date(),
    reviewDecision: decision,
    // If Option A (reviewReason column) is implemented:
    // reviewReason: reason ?? null,
  },
});
```

---

## Fix 2: Add a `screeningById` query (MEDIUM)

### Problem

The detail page (`screening/[id]/page.tsx`) has no dedicated backend query for a single screening. It fetches all pending screenings (`screeningsForReview(first: 100)`) and then does a client-side `.find()`:

```typescript
const screening = (data?.screeningsForReview || []).find(
  (s: any) => s.screeningId === id
);
```

This is inefficient and will break if the queue grows beyond 100 items. It also means if a user bookmarks the URL and the screening is later reviewed by someone else, the page shows "not found" with no context.

### Fix

**Step 1 — Add service method**

**File:** `services/integration-service/src/screening/screening.service.ts`

Add after `getScreeningsForReview`:

```typescript
/**
 * Return a single screening by ID, with customer data included.
 */
async getScreeningById(
  tenantId: string,
  screeningId: string,
): Promise<IScreeningResult | null> {
  const record = await this.prisma.screeningResult.findFirst({
    where: { id: screeningId, tenantId },
    include: { customer: true },
  });

  if (!record) return null;

  return this.mapDbToResult(record);
}
```

**Step 2 — Add resolver query**

**File:** `apps/graphql-server/src/graphql/resolvers/screening.resolver.ts`

Add after the `screeningsForReview` query:

```typescript
@Query(() => ScreeningResultType, { nullable: true })
@AuditAction(AuditActionType.READ, AuditResourceType.CUSTOMER)
@Roles('customer:read')
async screeningById(
  @CurrentTenant() tenantId: string,
  @Args('screeningId', { type: () => ID }) screeningId: string,
): Promise<ScreeningResultType | null> {
  const result = await this.screeningService.getScreeningById(tenantId, screeningId);
  if (!result) return null;
  return this.mapToType(result);
}
```

**Step 3 — Update the detail page to use the new query**

**File:** `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx`

Replace the `SCREENING_DETAIL` query:

```typescript
const SCREENING_DETAIL = gql`
  query ScreeningById($screeningId: ID!) {
    screeningById(screeningId: $screeningId) {
      screeningId
      customerId
      customer {
        id
        fullName
        phonePrimary
        externalId
        country
        kycLevel
        status
      }
      screenedAt
      riskLevel
      matches {
        matchId
        matchType
        entityName
        matchScore
        source
        details
      }
      provider
      status
      reviewedBy
      reviewedAt
      reviewDecision
    }
  }
`;
```

Update the `useQuery` call:

```typescript
const { data, loading } = useQuery(SCREENING_DETAIL, {
  variables: { screeningId: id },
});

const screening = data?.screeningById;
```

This also means the detail page can now show already-reviewed screenings (useful for audit trail), not just pending ones. The "not found" state would genuinely mean the ID doesn't exist, not that the screening was reviewed.

---

## Fix 3: Platform portal shows UUIDs for tenant and customer (MEDIUM)

### Problem

The platform portal screening page shows truncated UUIDs for both the Tenant and Customer columns (lines 152, 160, 212, 220). The same problem the admin portal had before it was fixed.

### Fix

The platform resolver (`PlatformScreeningEntry`) needs tenant name and customer name. Since this is a cross-tenant query (platform admin level), it needs to join both relations.

**Step 1 — Add fields to `PlatformScreeningEntry`**

**File:** `apps/graphql-server/src/graphql/resolvers/platform-screening.resolver.ts`

Add to `PlatformScreeningEntry`:

```typescript
@Field({ nullable: true })
tenantName?: string;

@Field({ nullable: true })
customerName?: string;
```

**Step 2 — Include relations in the Prisma queries**

In `platformScreeningStats` (the `recentScreenings` query, line 111):

```typescript
this.prisma.screeningResult.findMany({
  orderBy: { screenedAt: 'desc' },
  take: 50,
  include: {
    customer: { select: { fullName: true } },
  },
}),
```

For the tenant name, `ScreeningResult` does not have a direct Tenant relation in the Prisma schema. Instead, look up tenant names with a separate query:

```typescript
// After fetching recentScreenings, collect unique tenantIds
const tenantIds = [...new Set(recentScreenings.map(r => r.tenantId))];
const tenants = await this.prisma.tenant.findMany({
  where: { id: { in: tenantIds } },
  select: { id: true, name: true },
});
const tenantMap = new Map(tenants.map(t => [t.id, t.name]));
```

Then in the mapping:

```typescript
recentScreenings: recentScreenings.map((r) => ({
  ...existing fields...,
  tenantName: tenantMap.get(r.tenantId) ?? undefined,
  customerName: (r as any).customer?.fullName ?? undefined,
})),
```

Apply the same pattern to `platformEscalatedScreenings`.

**Step 3 — Update the platform portal columns**

**File:** `apps/platform-portal/src/app/(portal)/screening/page.tsx`

Update the `ScreeningEntry` interface:

```typescript
interface ScreeningEntry {
  id: string;
  tenantId: string;
  customerId: string;
  tenantName?: string;     // ← NEW
  customerName?: string;   // ← NEW
  // ...rest
}
```

Update the Tenant column (both `recentColumns` and `escalatedColumns`):

```typescript
{
  header: 'Tenant',
  accessor: (row: ScreeningEntry) => (
    <span className="text-sm text-white/70">
      {row.tenantName || row.tenantId.slice(0, 8) + '...'}
    </span>
  ),
},
```

Update the Customer column:

```typescript
{
  header: 'Customer',
  accessor: (row: ScreeningEntry) => (
    <span className="text-sm text-white/70">
      {row.customerName || row.customerId.slice(0, 8) + '...'}
    </span>
  ),
},
```

Update both GraphQL queries to request `tenantName` and `customerName`.

---

## Fix 4: Hardcoded English strings — no i18n (LOW)

### Problem

Both the admin portal screening pages (`page.tsx`, `[id]/page.tsx`) and the platform portal screening page contain hardcoded English strings. Every other admin portal page uses `t('key')` from the i18n context. The screening pages use `t('common.loading')` in one spot but everything else is raw English.

### Fix

**Step 1 — Add screening i18n keys to `en.json`**

**File:** `apps/admin-portal/src/lib/i18n/locales/en.json`

Add a `"screening"` section:

```json
"screening": {
  "queueTitle": "AML Screening Review Queue",
  "reviewTitle": "Screening Review",
  "backToQueue": "Back to Queue",
  "notFound": "Screening not found or already reviewed.",
  "noMatchesRecorded": "No matches recorded.",
  "noPendingReview": "No screenings pending review",
  "columns": {
    "customer": "Customer",
    "screened": "Screened",
    "riskLevel": "Risk Level",
    "matchDetails": "Match Details",
    "provider": "Provider",
    "status": "Status",
    "actions": "Actions"
  },
  "actions": {
    "approve": "Approve",
    "block": "Block",
    "escalate": "Escalate",
    "approveFull": "Approve — Clear Customer",
    "blockFull": "Block — Confirmed Match",
    "escalateFull": "Escalate — Needs Further Review"
  },
  "detail": {
    "customerSection": "Customer",
    "externalId": "External ID",
    "country": "Country",
    "kycLevel": "KYC Level",
    "viewProfile": "View Full Profile",
    "historySection": "Screening History",
    "matchSection": "Match Details",
    "source": "Source",
    "matchId": "Match ID",
    "reviewSection": "Review Decision",
    "reasonLabel": "Reason / Notes (optional)",
    "reasonPlaceholder": "Add context for this decision...",
    "unknown": "Unknown",
    "noMatches": "No matches"
  },
  "confirm": "Are you sure you want to {{action}} this screening?"
}
```

**Step 2 — Add corresponding keys to all 6 non-English locale files**

Add translated `"screening"` sections to `fr.json`, `es.json`, `pt.json`, `ar.json`, `ha.json`, `sw.json`.

**Step 3 — Replace hardcoded strings in both screening pages**

Replace all hardcoded strings with `t('screening.xxx')` calls. For example:

```typescript
// Before:
<h1>AML Screening Review Queue</h1>

// After:
<h1>{t('screening.queueTitle')}</h1>
```

---

## Fix 5: `String.replace('_', ' ')` → global regex (LOW)

### Problem

Multiple places use `string.replace('_', ' ')` which only replaces the **first** underscore. JavaScript's `String.replace()` with a string first argument is not global:

```typescript
// screening/page.tsx line 170
m.matchType.replace('_', ' ')

// screening/[id]/page.tsx line 204
customer.kycLevel.replace('_', ' ')

// screening/[id]/page.tsx line 266
m.matchType.replace('_', ' ')
```

Currently safe because `ADVERSE_MEDIA` has only one underscore and `tier_1` has only one underscore. But it's fragile — any future value with multiple underscores (e.g. a new match type) would render incorrectly.

### Fix

Replace all instances of `.replace('_', ' ')` with `.replace(/_/g, ' ')`:

```typescript
// All occurrences in both files:
m.matchType.replace(/_/g, ' ')
customer.kycLevel.replace(/_/g, ' ')
```

Note: The platform portal already uses the correct regex form on line 177: `row.status.replace(/_/g, ' ')`.

---

## Summary of all changes

| # | File | Action | Priority |
|---|---|---|---|
| 1 | `apps/graphql-server/src/graphql/resolvers/screening.resolver.ts` | **EDIT** — stop concatenating reason into decision; add `screeningById` query | CRITICAL |
| 2 | `services/integration-service/src/screening/screening.service.ts` | **EDIT** — add optional `reason` param to `submitReview`; add `getScreeningById` method | CRITICAL |
| 3 | `apps/graphql-server/src/graphql/resolvers/platform-screening.resolver.ts` | **EDIT** — change `'escalated'` → `'ESCALATE'` in filters; stop concatenating reason; add tenant/customer name joins | CRITICAL |
| 4 | `apps/platform-portal/src/app/(portal)/screening/page.tsx` | **EDIT** — change decision values to uppercase (`'BLOCK'`, `'APPROVE'`, `'FLAG_INVESTIGATION'`); show tenant/customer names; update GraphQL queries | MEDIUM |
| 5 | `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx` | **EDIT** — use new `screeningById` query; replace hardcoded strings with i18n; fix `.replace` to global regex | MEDIUM |
| 6 | `apps/admin-portal/src/app/(portal)/screening/page.tsx` | **EDIT** — replace hardcoded strings with i18n; fix `.replace` to global regex | LOW |
| 7 | `apps/admin-portal/src/lib/i18n/locales/en.json` | **EDIT** — add `"screening"` section | LOW |
| 8 | `apps/admin-portal/src/lib/i18n/locales/{fr,es,pt,ar,ha,sw}.json` | **EDIT** — add translated `"screening"` sections | LOW |

---

## Definition of Done

- [ ] Admin portal sends `'APPROVE'`, `'BLOCK'`, `'ESCALATE'` as decision values (already the case — no change needed)
- [ ] Platform portal sends `'BLOCK'`, `'APPROVE'`, `'FLAG_INVESTIGATION'` (uppercased to match convention)
- [ ] Platform resolver filters escalated cases with `reviewDecision: 'ESCALATE'` (matching what the admin sends)
- [ ] The `reviewDecision` column stores only the decision enum (e.g. `"ESCALATE"`), not `"ESCALATE: reason text"`
- [ ] If `reviewReason` column is added: reason is stored separately; if not, reason is discarded (audit log still captures it)
- [ ] `screeningById` query exists and returns a single screening with customer data
- [ ] Detail page uses `screeningById(screeningId: $id)` instead of fetching all and filtering
- [ ] Detail page works for both pending and already-reviewed screenings
- [ ] Platform portal shows tenant name (not UUID) in both Recent and Escalated tables
- [ ] Platform portal shows customer name (not UUID) in both tables
- [ ] After an admin portal user escalates a screening, it appears in the platform portal's Escalated tab
- [ ] All screening page strings in the admin portal use i18n keys
- [ ] All 7 locale files have the `"screening"` i18n section
- [ ] All `.replace('_', ' ')` calls use the global regex `/_/g` form
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] All existing tests pass
