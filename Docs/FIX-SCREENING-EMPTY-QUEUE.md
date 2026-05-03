# Fix: AML Screening Review Queue — Empty Page, GraphQL Mismatches, Missing Seed Data

**Priority: HIGH**
**Owner: Claude Code (DEV)**
**Date: 2026-04-16**

---

## Overview

The AML Screening Review Queue page (`/screening`) renders correctly but always shows "No screenings pending review." Three issues contribute to this:

1. **GraphQL query-argument mismatch** — the frontend passes `take`, but the resolver expects `first`.
2. **GraphQL field-name mismatches** — the frontend queries `id`, `matchCount`, and `matchDetails`, but the GraphQL type exposes `screeningId`, `matches` (a structured list), and has no `matchCount` field.
3. **No seed data** — the seed file creates zero `ScreeningResult` records, and no seeded customer names trigger the mock adapter's match logic, so the queue is structurally empty.

---

## Fix 1: Align the GraphQL query in the frontend

### What's wrong

**File:** `apps/admin-portal/src/app/(portal)/screening/page.tsx`

The Apollo query sends argument name `take` and requests fields that don't exist on the `ScreeningResultType` GraphQL type:

```graphql
# CURRENT (broken)
query ScreeningsForReview($take: Int) {
  screeningsForReview(take: $take) {
    id              # ← wrong: type exposes "screeningId"
    customerId
    screenedAt
    riskLevel
    matchCount      # ← wrong: field does not exist on the type
    matchDetails    # ← wrong: type exposes "matches" (list of ScreeningMatchFieldType)
    provider
    status
  }
}
```

The GraphQL type (`apps/graphql-server/src/graphql/types/screening.type.ts`) defines:

```typescript
class ScreeningResultType {
  screeningId: string;   // ← not "id"
  customerId: string;
  tenantId: string;
  status: ScreeningStatusEnum;
  riskLevel: ScreeningRiskLevelEnum;
  matches: ScreeningMatchFieldType[];  // ← not "matchCount" or "matchDetails"
  provider: string;
  screenedAt: Date;
  rawResponse?: Record<string, unknown>;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewDecision?: string;
}
```

The resolver argument is `first`, not `take`:

```typescript
@Args('first', { type: () => Int, nullable: true, defaultValue: 50 }) first: number,
```

### Target state

**Step 1 — Fix the GraphQL query (lines 9–21)**

Replace:
```typescript
const SCREENINGS_FOR_REVIEW = gql`
  query ScreeningsForReview($take: Int) {
    screeningsForReview(take: $take) {
      id
      customerId
      screenedAt
      riskLevel
      matchCount
      matchDetails
      provider
      status
    }
  }
`;
```

With:
```typescript
const SCREENINGS_FOR_REVIEW = gql`
  query ScreeningsForReview($first: Int) {
    screeningsForReview(first: $first) {
      screeningId
      customerId
      screenedAt
      riskLevel
      matches {
        matchId
        matchType
        entityName
        matchScore
        source
      }
      provider
      status
    }
  }
`;
```

**Step 2 — Fix the query variables (line 62)**

Change:
```typescript
variables: { take: 50 },
```
To:
```typescript
variables: { first: 50 },
```

**Step 3 — Update the `ScreeningRow` interface (lines 34–43)**

Replace:
```typescript
interface ScreeningRow {
  id: string;
  customerId: string;
  screenedAt: string;
  riskLevel: string;
  matchCount: number;
  matchDetails: string;
  provider: string;
  status: string;
}
```

With:
```typescript
interface ScreeningMatch {
  matchId: string;
  matchType: string;
  entityName: string;
  matchScore: number;
  source: string;
}

interface ScreeningRow {
  screeningId: string;
  customerId: string;
  screenedAt: string;
  riskLevel: string;
  matches: ScreeningMatch[];
  provider: string;
  status: string;
}
```

**Step 4 — Update the data mapping (line 67)**

Change:
```typescript
const screenings: ScreeningRow[] = data?.screeningsForReview || [];
```
To:
```typescript
const screenings: ScreeningRow[] = (data?.screeningsForReview || []).map((s: any) => ({
  ...s,
  id: s.screeningId,  // alias for action handlers
}));
```

**Step 5 — Update the `handleReview` call references**

The `handleReview` function receives `screeningId` as its first argument. The action buttons currently pass `r.id`. Since we aliased `id` from `screeningId` in Step 4, the buttons continue to work. However, for clarity, update the three button `onClick` handlers to use `r.screeningId` instead of `r.id`:

```typescript
onClick={(e) => {
  e.stopPropagation();
  handleReview(r.screeningId, 'APPROVE');
}}
```

Repeat for `'BLOCK'` and `'ESCALATE'` buttons.

**Step 6 — Update the Matches column**

The current column uses `matchCount` as a simple number. Replace the Matches column definition:

Change:
```typescript
{
  header: 'Matches',
  accessor: 'matchCount' as keyof ScreeningRow,
},
```

To:
```typescript
{
  header: 'Matches',
  accessor: (r: ScreeningRow) => (
    <span className="font-mono text-xs">{r.matches.length}</span>
  ),
},
```

---

## Fix 2: Add screening seed data

### What's wrong

The seed file (`packages/database/prisma/seed.ts`) creates zero `ScreeningResult` records. Additionally, all seeded customer names (e.g. "Kwame Asante", "Ama Mensah") are normal names that the mock adapter classifies as CLEAR. No names contain the trigger keywords ("SANCTIONS", "PEP", "ADVERSE") that produce POTENTIAL_MATCH or MATCH results.

### Target state

Rather than inserting raw database rows (which would bypass the mock adapter logic and risk schema drift), the seed should call the screening service flow by inserting records directly via Prisma with the correct structure. This ensures the review queue is populated.

**Step 1 — Add screening seed records after customers are created**

In `seed.ts`, after the customer creation loop (around line 727, after `console.log('  Created ${customerRecords.length} customers with consents')`), add a new section:

```typescript
    // ---------------------------------------------------------------------
    // Screening results (for AML review queue)
    // ---------------------------------------------------------------------
    console.log('  Seeding screening results...');

    const existingScreenings = await prisma.screeningResult.count({ where: { tenantId: tenant.id } });
    if (existingScreenings === 0) {
      const screeningSeeds = [
        // POTENTIAL_MATCH — PEP (unreviewed, will appear in review queue)
        {
          tenantId: tenant.id,
          customerId: customerRecords[2].id,  // 3rd customer
          externalId: `mock-pep-${tenant.id.slice(0, 8)}-001`,
          provider: 'mock',
          status: 'POTENTIAL_MATCH' as const,
          riskLevel: 'HIGH' as const,
          matchCount: 1,
          matchDetails: [
            {
              matchId: `match-pep-001`,
              matchType: 'PEP',
              entityName: customerRecords[2].fullName,
              matchScore: 78,
              source: 'World PEP Database',
              details: { remarks: 'Mock PEP match for testing' },
            },
          ],
          screenedAt: daysAgo(3),
          expiresAt: daysAgo(-21),  // 21 days in the future
        },
        // POTENTIAL_MATCH — PEP (unreviewed)
        {
          tenantId: tenant.id,
          customerId: customerRecords[5].id,  // 6th customer
          externalId: `mock-pep-${tenant.id.slice(0, 8)}-002`,
          provider: 'mock',
          status: 'POTENTIAL_MATCH' as const,
          riskLevel: 'HIGH' as const,
          matchCount: 1,
          matchDetails: [
            {
              matchId: `match-pep-002`,
              matchType: 'PEP',
              entityName: customerRecords[5].fullName,
              matchScore: 72,
              source: 'World PEP Database',
              details: { remarks: 'Mock PEP match for testing' },
            },
          ],
          screenedAt: daysAgo(2),
          expiresAt: daysAgo(-22),
        },
        // POTENTIAL_MATCH — ADVERSE_MEDIA (unreviewed)
        {
          tenantId: tenant.id,
          customerId: customerRecords[8].id,  // 9th customer
          externalId: `mock-adverse-${tenant.id.slice(0, 8)}-001`,
          provider: 'mock',
          status: 'POTENTIAL_MATCH' as const,
          riskLevel: 'MEDIUM' as const,
          matchCount: 1,
          matchDetails: [
            {
              matchId: `match-adverse-001`,
              matchType: 'ADVERSE_MEDIA',
              entityName: customerRecords[8].fullName,
              matchScore: 65,
              source: 'Global Adverse Media DB',
              details: { remarks: 'Mock adverse media match for testing' },
            },
          ],
          screenedAt: daysAgo(1),
          expiresAt: daysAgo(-23),
        },
        // POTENTIAL_MATCH — ADVERSE_MEDIA (unreviewed)
        {
          tenantId: tenant.id,
          customerId: customerRecords[11].id,  // 12th customer
          externalId: `mock-adverse-${tenant.id.slice(0, 8)}-002`,
          provider: 'mock',
          status: 'POTENTIAL_MATCH' as const,
          riskLevel: 'MEDIUM' as const,
          matchCount: 1,
          matchDetails: [
            {
              matchId: `match-adverse-002`,
              matchType: 'ADVERSE_MEDIA',
              entityName: customerRecords[11].fullName,
              matchScore: 58,
              source: 'Global Adverse Media DB',
              details: { remarks: 'Mock adverse media match for testing' },
            },
          ],
          screenedAt: daysAgo(1),
          expiresAt: daysAgo(-23),
        },
        // MATCH — SANCTIONS (unreviewed, urgent)
        {
          tenantId: tenant.id,
          customerId: customerRecords[14].id,  // 15th customer
          externalId: `mock-sanctions-${tenant.id.slice(0, 8)}-001`,
          provider: 'mock',
          status: 'POTENTIAL_MATCH' as const,
          riskLevel: 'CRITICAL' as const,
          matchCount: 1,
          matchDetails: [
            {
              matchId: `match-sanctions-001`,
              matchType: 'SANCTIONS',
              entityName: customerRecords[14].fullName,
              matchScore: 85,
              source: 'OFAC SDN List',
              details: { remarks: 'Mock sanctions match for testing' },
            },
          ],
          screenedAt: daysAgo(0),
          expiresAt: daysAgo(-24),
        },
        // CLEAR — already resolved (should NOT appear in review queue)
        {
          tenantId: tenant.id,
          customerId: customerRecords[0].id,  // 1st customer
          externalId: `mock-clear-${tenant.id.slice(0, 8)}-001`,
          provider: 'mock',
          status: 'CLEAR' as const,
          riskLevel: 'LOW' as const,
          matchCount: 0,
          matchDetails: [],
          screenedAt: daysAgo(10),
          expiresAt: daysAgo(-14),
        },
        // POTENTIAL_MATCH — already reviewed (should NOT appear in review queue)
        {
          tenantId: tenant.id,
          customerId: customerRecords[3].id,  // 4th customer
          externalId: `mock-reviewed-${tenant.id.slice(0, 8)}-001`,
          provider: 'mock',
          status: 'POTENTIAL_MATCH' as const,
          riskLevel: 'HIGH' as const,
          matchCount: 1,
          matchDetails: [
            {
              matchId: `match-reviewed-001`,
              matchType: 'PEP',
              entityName: customerRecords[3].fullName,
              matchScore: 70,
              source: 'World PEP Database',
              details: { remarks: 'Mock PEP match — already reviewed' },
            },
          ],
          screenedAt: daysAgo(15),
          expiresAt: daysAgo(-9),
          reviewedBy: userRecords[0]?.id,  // first seeded user (SP Admin)
          reviewedAt: daysAgo(14),
          reviewDecision: 'APPROVE',
        },
      ];

      for (const s of screeningSeeds) {
        await prisma.screeningResult.create({ data: s as any });
      }
      console.log(`  Created ${screeningSeeds.length} screening results (${screeningSeeds.filter(s => s.status === 'POTENTIAL_MATCH' && !s.reviewedAt).length} pending review)`);
    }
```

> **Note:** The code references `userRecords` for the reviewed-by field. If `userRecords` is not in scope at this point in the seed, use a hardcoded `null` for `reviewedBy` on the already-reviewed record, or query the first user:
> ```typescript
> const firstUser = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
> ```

**Step 2 — Verify the `daysAgo` helper exists**

The seed file already defines a `daysAgo` helper. Confirm it returns a `Date`:

```typescript
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
```

Negative values (e.g. `daysAgo(-21)`) produce future dates, which is correct for `expiresAt`.

---

## Summary of all changes

| File | Action |
|---|---|
| `apps/admin-portal/src/app/(portal)/screening/page.tsx` | **EDIT** — fix GraphQL query (argument `take` → `first`; fields `id` → `screeningId`, remove `matchCount`/`matchDetails`, add `matches { ... }`), update `ScreeningRow` interface, update column accessors and action handlers |
| `packages/database/prisma/seed.ts` | **EDIT** — add 7 `ScreeningResult` records (5 pending review, 1 CLEAR, 1 already reviewed) |

---

## Definition of Done

- [ ] GraphQL query argument is `first` (not `take`), matching the resolver
- [ ] Query requests `screeningId` (not `id`), matching the GraphQL type
- [ ] Query requests `matches { matchId matchType entityName matchScore source }` instead of `matchCount`/`matchDetails`
- [ ] `ScreeningRow` interface includes `screeningId: string` and `matches: ScreeningMatch[]`
- [ ] Action buttons pass `r.screeningId` to `handleReview`
- [ ] Matches column shows `r.matches.length`
- [ ] Seed file creates 7 screening results across customer records
- [ ] 5 of 7 seeded records have `status: POTENTIAL_MATCH` with `reviewedAt: null` (appear in queue)
- [ ] 1 seeded record is CLEAR, 1 is already reviewed (do NOT appear in queue)
- [ ] After `pnpm --filter database db:seed`, the AML Screening Review Queue shows 5 entries per tenant
- [ ] Approve / Block / Escalate actions work (screening disappears from queue after review)
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] All existing tests pass
