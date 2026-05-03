# Fix: AML Screening Review Queue — UX Enhancements

**Priority: HIGH**
**Owner: Claude Code (DEV)**
**Date: 2026-04-16**

---

## Overview

The AML Screening Review Queue now loads data correctly, but the page is not usable for an actual compliance review. Three issues need addressing:

1. **Customer ID shows a raw UUID** — the reviewer sees `a7434620-2e7...` instead of the customer's name and phone number.
2. **No match details are visible** — the "Matches" column shows a count (`1`) but the reviewer cannot see _what_ was matched (entity name, match type, confidence score, source database).
3. **No screening detail view** — there is no way to drill into a screening to see the full context (customer profile, all match entries, match scores, source details) before making an Approve / Block / Escalate decision.

---

## Fix 1: Show customer name instead of UUID

### Problem

The `screeningsForReview` query returns `customerId` (a UUID) and the page renders it truncated. The GraphQL type `ScreeningResultType` has no `customer` field, and the service's `getScreeningsForReview()` method does not join the customer relation.

### Changes required

**1a. Add a `customer` field to `ScreeningResultType`**

**File:** `apps/graphql-server/src/graphql/types/screening.type.ts`

Import the `CustomerType` (or define an inline embedded type to avoid a circular dependency). The simplest approach is an embedded type with just the fields needed:

Add after the `ScreeningMatchFieldType` class (before `ScreeningResultType`):

```typescript
@ObjectType()
export class ScreeningCustomerSummary {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  fullName?: string;

  @Field({ nullable: true })
  phonePrimary?: string;

  @Field({ nullable: true })
  externalId?: string;

  @Field({ nullable: true })
  country?: string;

  @Field({ nullable: true })
  kycLevel?: string;

  @Field({ nullable: true })
  status?: string;
}
```

Then add a `customer` field to `ScreeningResultType`:

```typescript
@Field(() => ScreeningCustomerSummary, { nullable: true })
customer?: ScreeningCustomerSummary;
```

**1b. Update the service to include the customer relation**

**File:** `services/integration-service/src/screening/screening.service.ts`

In `getScreeningsForReview()` (line 141), add `include: { customer: true }`:

Change:
```typescript
const records = await this.prisma.screeningResult.findMany({
  where: {
    tenantId,
    status: 'POTENTIAL_MATCH',
    reviewedAt: null,
  },
  orderBy: { screenedAt: 'desc' },
  take,
});
```

To:
```typescript
const records = await this.prisma.screeningResult.findMany({
  where: {
    tenantId,
    status: 'POTENTIAL_MATCH',
    reviewedAt: null,
  },
  include: { customer: true },
  orderBy: { screenedAt: 'desc' },
  take,
});
```

**1c. Update `IScreeningResult` to carry optional customer data**

**File:** `services/integration-service/src/screening/screening.interface.ts`

Add an optional `customer` field to `IScreeningResult`:

```typescript
export interface IScreeningResult {
  customerId: string;
  tenantId: string;
  screeningId: string;
  status: 'CLEAR' | 'MATCH' | 'POTENTIAL_MATCH' | 'ERROR';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  matches: IScreeningMatch[];
  provider: string;
  screenedAt: Date;
  rawResponse?: Record<string, unknown>;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewDecision?: string;
  customer?: {                    // ← NEW
    id: string;
    fullName?: string | null;
    phonePrimary?: string | null;
    externalId?: string | null;
    country?: string | null;
    kycLevel?: string | null;
    status?: string | null;
  };
}
```

**1d. Update `mapDbToResult` to pass through customer data**

**File:** `services/integration-service/src/screening/screening.service.ts`

In the `mapDbToResult` private method (around line 250), add:

```typescript
private mapDbToResult(record: any): IScreeningResult {
  return {
    customerId: record.customerId,
    tenantId: record.tenantId,
    screeningId: record.id,
    status: record.status,
    riskLevel: record.riskLevel,
    matches: (record.matchDetails as any[]) ?? [],
    provider: record.provider,
    screenedAt: record.screenedAt,
    rawResponse: record.rawResponse
      ? JSON.parse(Buffer.from(record.rawResponse).toString('utf-8'))
      : undefined,
    customer: record.customer            // ← NEW: pass through the Prisma relation
      ? {
          id: record.customer.id,
          fullName: record.customer.fullName,
          phonePrimary: record.customer.phonePrimary,
          externalId: record.customer.externalId,
          country: record.customer.country,
          kycLevel: record.customer.kycLevel,
          status: record.customer.status,
        }
      : undefined,
  };
}
```

**1e. Update the resolver's `mapToType` to include customer**

**File:** `apps/graphql-server/src/graphql/resolvers/screening.resolver.ts`

In the `mapToType` method (line 72), add the customer mapping:

```typescript
private mapToType(result: any): ScreeningResultType {
  return {
    screeningId: result.screeningId,
    customerId: result.customerId,
    tenantId: result.tenantId,
    status: result.status,
    riskLevel: result.riskLevel,
    matches: (result.matches ?? []).map((m: any) => ({
      matchId: m.matchId ?? '',
      matchType: m.matchType ?? 'WATCHLIST',
      entityName: m.entityName ?? '',
      matchScore: m.matchScore ?? 0,
      source: m.source ?? '',
      details: m.details,
    })),
    provider: result.provider,
    screenedAt: result.screenedAt,
    rawResponse: result.rawResponse,
    reviewedBy: result.reviewedBy,
    reviewedAt: result.reviewedAt,
    reviewDecision: result.reviewDecision,
    customer: result.customer,             // ← NEW
  };
}
```

**1f. Update the frontend query and column**

**File:** `apps/admin-portal/src/app/(portal)/screening/page.tsx`

Update the GraphQL query to request customer data:

```graphql
query ScreeningsForReview($first: Int) {
  screeningsForReview(first: $first) {
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
    }
    provider
    status
  }
}
```

Update the `ScreeningRow` interface:

```typescript
interface ScreeningCustomer {
  id: string;
  fullName?: string;
  phonePrimary?: string;
  externalId?: string;
  country?: string;
  kycLevel?: string;
  status?: string;
}

interface ScreeningRow {
  screeningId: string;
  customerId: string;
  customer?: ScreeningCustomer;
  screenedAt: string;
  riskLevel: string;
  matches: ScreeningMatch[];
  provider: string;
  status: string;
}
```

Replace the "Customer ID" column with a "Customer" column:

```typescript
{
  header: 'Customer',
  accessor: (r: ScreeningRow) => (
    <div>
      <div className="text-sm text-white/90 font-medium">
        {r.customer?.fullName || 'Unknown'}
      </div>
      {r.customer?.phonePrimary && (
        <div className="text-xs text-white/40">{r.customer.phonePrimary}</div>
      )}
    </div>
  ),
},
```

---

## Fix 2: Show match details in the queue table

### Problem

The "Matches" column currently shows only a count (`1`). The reviewer cannot see what type of match triggered the alert (PEP, Sanctions, Adverse Media), the entity name matched, or the confidence score — information that is already returned by the GraphQL query in the `matches` array.

### Changes required

Replace the current Matches column with a richer display:

**File:** `apps/admin-portal/src/app/(portal)/screening/page.tsx`

Replace the Matches column:

```typescript
{
  header: 'Match Details',
  accessor: (r: ScreeningRow) => (
    <div className="space-y-1">
      {r.matches.map((m, i) => (
        <div key={m.matchId || i} className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${matchTypeBadgeColor(m.matchType)}`}>
            {m.matchType.replace('_', ' ')}
          </span>
          <span className="text-xs text-white/60 truncate max-w-[140px]" title={m.entityName}>
            {m.entityName}
          </span>
          <span className="text-xs text-white/40">
            {m.matchScore}%
          </span>
        </div>
      ))}
      {r.matches.length === 0 && (
        <span className="text-xs text-white/30">No matches</span>
      )}
    </div>
  ),
},
```

Add a helper function for match type badge colors (next to the existing `riskLevelBadge` function):

```typescript
function matchTypeBadgeColor(type: string): string {
  const colors: Record<string, string> = {
    SANCTIONS: 'bg-red-500/20 text-red-400',
    PEP: 'bg-orange-500/20 text-orange-400',
    ADVERSE_MEDIA: 'bg-amber-500/20 text-amber-400',
    WATCHLIST: 'bg-blue-500/20 text-blue-400',
  };
  return colors[type] || 'bg-white/10 text-white/60';
}
```

---

## Fix 3: Add a screening detail page

### Problem

There is no way to drill into a screening to see the full context before making a review decision. A compliance reviewer needs to see the complete customer profile, all match entries with their details, the match source, and the match score — along with a review form that allows adding a reason before approving, blocking, or escalating.

### Changes required

**3a. Create the detail page**

**File:** `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx` (NEW)

```typescript
'use client';

import { gql, useQuery, useMutation } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatDateTime } from '@/lib/utils';
import { countryName } from '@/lib/constants';
import { useI18n } from '@/lib/i18n/i18n-context';

const SCREENING_DETAIL = gql`
  query ScreeningsForReview($first: Int) {
    screeningsForReview(first: $first) {
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
    }
  }
`;

const CUSTOMER_SCREENINGS = gql`
  query CustomerScreenings($customerId: ID!, $first: Int) {
    customerScreenings(customerId: $customerId, first: $first) {
      screeningId
      status
      riskLevel
      screenedAt
      provider
      reviewDecision
      reviewedAt
    }
  }
`;

const SUBMIT_SCREENING_REVIEW = gql`
  mutation SubmitScreeningReview($screeningId: ID!, $decision: String!, $reason: String) {
    submitScreeningReview(screeningId: $screeningId, decision: $decision, reason: $reason) {
      screeningId
      reviewDecision
      reviewedAt
    }
  }
`;

function matchTypeBadgeColor(type: string): string {
  const colors: Record<string, string> = {
    SANCTIONS: 'bg-red-500/20 text-red-400',
    PEP: 'bg-orange-500/20 text-orange-400',
    ADVERSE_MEDIA: 'bg-amber-500/20 text-amber-400',
    WATCHLIST: 'bg-blue-500/20 text-blue-400',
  };
  return colors[type] || 'bg-white/10 text-white/60';
}

function riskLevelBadge(level: string) {
  const colors: Record<string, string> = {
    LOW: 'bg-emerald-500/20 text-emerald-400',
    MEDIUM: 'bg-amber-500/20 text-amber-400',
    HIGH: 'bg-orange-500/20 text-orange-400',
    CRITICAL: 'bg-red-500/20 text-red-400',
  };
  const bg = colors[level] || 'bg-white/10 text-white/60';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${bg}`}>
      {level}
    </span>
  );
}

export default function ScreeningDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [reason, setReason] = useState('');

  // Fetch all screenings for review, then find the one matching this ID
  const { data, loading } = useQuery(SCREENING_DETAIL, {
    variables: { first: 100 },
  });

  const screening = (data?.screeningsForReview || []).find(
    (s: any) => s.screeningId === id
  );

  // Fetch screening history for this customer
  const { data: historyData } = useQuery(CUSTOMER_SCREENINGS, {
    variables: { customerId: screening?.customerId, first: 10 },
    skip: !screening?.customerId,
  });

  const [submitReview, { loading: submitting }] = useMutation(SUBMIT_SCREENING_REVIEW);

  const handleReview = async (decision: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to ${decision.toLowerCase()} this screening?`
    );
    if (!confirmed) return;

    try {
      await submitReview({
        variables: { screeningId: id, decision, reason: reason || undefined },
      });
      router.push('/screening');
    } catch (err: any) {
      const message = err?.graphQLErrors?.[0]?.message || 'Failed to submit review';
      alert(message);
    }
  };

  if (loading) {
    return <div className="text-white/40 p-6">{t('common.loading')}</div>;
  }

  if (!screening) {
    return (
      <div className="p-6">
        <button onClick={() => router.push('/screening')} className="flex items-center gap-2 text-white/50 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Queue
        </button>
        <div className="text-white/40">Screening not found or already reviewed.</div>
      </div>
    );
  }

  const customer = screening.customer;
  const matches = screening.matches || [];
  const history = historyData?.customerScreenings || [];

  return (
    <div className="max-w-5xl">
      {/* Back button */}
      <button
        onClick={() => router.push('/screening')}
        className="flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Queue
      </button>

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white/90">
            Screening Review
          </h1>
          <p className="text-sm text-white/40 mt-1">
            {screening.provider} &middot; {formatDateTime(screening.screenedAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {riskLevelBadge(screening.riskLevel)}
          <StatusBadge status={screening.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Customer + History */}
        <div className="lg:col-span-1 space-y-6">
          {/* Customer Card */}
          <div className="glass p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Customer</h2>
            <div className="space-y-2">
              <div>
                <div className="text-sm text-white/90 font-medium">{customer?.fullName || 'Unknown'}</div>
                {customer?.phonePrimary && (
                  <div className="text-xs text-white/40">{customer.phonePrimary}</div>
                )}
              </div>
              {customer?.externalId && (
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">External ID</span>
                  <span className="text-white/70 font-mono">{customer.externalId}</span>
                </div>
              )}
              {customer?.country && (
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Country</span>
                  <span className="text-white/70">{countryName(customer.country)}</span>
                </div>
              )}
              {customer?.kycLevel && (
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">KYC Level</span>
                  <span className="text-white/70 capitalize">{customer.kycLevel.replace('_', ' ')}</span>
                </div>
              )}
              {customer?.status && (
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Status</span>
                  <StatusBadge status={customer.status} />
                </div>
              )}
            </div>
            {customer?.id && (
              <button
                onClick={() => router.push(`/customers/${customer.id}`)}
                className="w-full mt-2 px-3 py-1.5 rounded text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
              >
                View Full Profile
              </button>
            )}
          </div>

          {/* Screening History */}
          {history.length > 1 && (
            <div className="glass p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Screening History</h2>
              <div className="space-y-2">
                {history.map((h: any) => (
                  <div
                    key={h.screeningId}
                    className={`flex items-center justify-between text-xs p-2 rounded ${h.screeningId === id ? 'bg-white/10 border border-white/10' : ''}`}
                  >
                    <div>
                      <div className="text-white/70">{formatDate(h.screenedAt)}</div>
                      <div className="text-white/40">{h.provider}</div>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={h.reviewDecision || h.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Match Details + Review */}
        <div className="lg:col-span-2 space-y-6">
          {/* Match Details */}
          <div className="glass p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
              Match Details ({matches.length})
            </h2>

            {matches.length === 0 ? (
              <div className="text-sm text-white/30">No matches recorded.</div>
            ) : (
              <div className="space-y-3">
                {matches.map((m: any, i: number) => (
                  <div key={m.matchId || i} className="border border-white/10 rounded-lg p-4 space-y-3">
                    {/* Match header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${matchTypeBadgeColor(m.matchType)}`}>
                          {m.matchType.replace('_', ' ')}
                        </span>
                        <span className="text-sm text-white/90 font-medium">{m.entityName}</span>
                      </div>
                      {/* Score bar */}
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.matchScore >= 80 ? 'bg-red-400' : m.matchScore >= 60 ? 'bg-amber-400' : 'bg-blue-400'}`}
                            style={{ width: `${m.matchScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-white/60 w-8 text-right">{m.matchScore}%</span>
                      </div>
                    </div>

                    {/* Match metadata */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/40">Source</span>
                        <span className="text-white/70">{m.source}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Match ID</span>
                        <span className="text-white/70 font-mono">{m.matchId}</span>
                      </div>
                    </div>

                    {/* Match details (if present) */}
                    {m.details && Object.keys(m.details).length > 0 && (
                      <div className="bg-white/5 rounded p-3 space-y-1">
                        {Object.entries(m.details).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-white/40 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span className="text-white/70">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review Decision */}
          <div className="glass p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Review Decision</h2>

            <div>
              <label className="block text-xs text-white/40 mb-1.5">Reason / Notes (optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Add context for this decision..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 resize-none"
                rows={3}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                disabled={submitting}
                onClick={() => handleReview('APPROVE')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
              >
                Approve — Clear Customer
              </button>
              <button
                disabled={submitting}
                onClick={() => handleReview('BLOCK')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                Block — Confirmed Match
              </button>
              <button
                disabled={submitting}
                onClick={() => handleReview('ESCALATE')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                Escalate — Needs Further Review
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**3b. Make rows in the queue clickable**

**File:** `apps/admin-portal/src/app/(portal)/screening/page.tsx`

Add `useRouter` import (if not already present) and add an `onRowClick` handler to the `DataTable`:

```typescript
import { useRouter } from 'next/navigation';

// inside ScreeningPage():
const router = useRouter();
```

Add `onRowClick` to the `DataTable` component:

```typescript
<DataTable
  columns={[...]}
  data={screenings}
  emptyMessage="No screenings pending review"
  onRowClick={(r: ScreeningRow) => router.push(`/screening/${r.screeningId}`)}
/>
```

> **Note:** If the `DataTable` component does not support `onRowClick`, add it. The component is at `apps/admin-portal/src/components/ui/data-table.tsx`. Add an optional `onRowClick` prop:
>
> ```typescript
> interface DataTableProps<T> {
>   columns: Column<T>[];
>   data: T[];
>   emptyMessage?: string;
>   onRowClick?: (row: T) => void;  // ← add this
> }
> ```
>
> Then on each `<tr>` in the data rows:
>
> ```tsx
> <tr
>   key={index}
>   onClick={() => onRowClick?.(row)}
>   className={cn(
>     '...existing classes...',
>     onRowClick && 'cursor-pointer hover:bg-white/5'
>   )}
> >
> ```

**3c. Update the mutation to accept `reason`**

The `submitScreeningReview` mutation and resolver already accept an optional `reason` argument (line 61 in the resolver). Update the frontend mutation in the queue page to match:

**File:** `apps/admin-portal/src/app/(portal)/screening/page.tsx`

Change:
```graphql
mutation SubmitScreeningReview($screeningId: ID!, $decision: String!) {
  submitScreeningReview(screeningId: $screeningId, decision: $decision) {
```

To:
```graphql
mutation SubmitScreeningReview($screeningId: ID!, $decision: String!, $reason: String) {
  submitScreeningReview(screeningId: $screeningId, decision: $decision, reason: $reason) {
```

This makes the queue-level quick-action buttons and the detail page's review form use the same mutation shape.

---

## Summary of all changes

| File | Action |
|---|---|
| `apps/graphql-server/src/graphql/types/screening.type.ts` | **EDIT** — add `ScreeningCustomerSummary` type and `customer` field to `ScreeningResultType` |
| `services/integration-service/src/screening/screening.interface.ts` | **EDIT** — add optional `customer` field to `IScreeningResult` |
| `services/integration-service/src/screening/screening.service.ts` | **EDIT** — add `include: { customer: true }` in `getScreeningsForReview()` and map customer in `mapDbToResult()` |
| `apps/graphql-server/src/graphql/resolvers/screening.resolver.ts` | **EDIT** — pass through `customer` in `mapToType()` |
| `apps/admin-portal/src/app/(portal)/screening/page.tsx` | **EDIT** — update query to include `customer { ... }`, update interface, replace Customer ID column with customer name/phone, replace Matches column with match type + entity + score, add `onRowClick` for navigation, add `matchTypeBadgeColor` helper, add `$reason` to mutation |
| `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx` | **NEW** — full screening detail page with customer card, match detail cards (type, entity, score bar, source, details), screening history, and review form with reason textarea |
| `apps/admin-portal/src/components/ui/data-table.tsx` | **EDIT** — add optional `onRowClick` prop (if not already supported) |

---

## Definition of Done

- [ ] Queue table shows customer name and phone (not UUID) in the first column
- [ ] Queue table shows match type badge, entity name, and score percentage in the Match Details column
- [ ] Clicking a row in the queue navigates to `/screening/[screeningId]`
- [ ] Detail page shows customer card with: full name, phone, external ID, country, KYC level, status
- [ ] Detail page shows "View Full Profile" link to `/customers/[id]`
- [ ] Detail page shows each match in its own card with: type badge, entity name, score with visual bar, source database, match ID, and any additional details
- [ ] Detail page shows screening history for the same customer (prior screenings and their outcomes)
- [ ] Detail page has a reason/notes textarea and three review buttons (Approve, Block, Escalate)
- [ ] After submitting a review decision, user is returned to the queue and the reviewed screening is gone
- [ ] Review decision includes the optional reason text
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] All existing tests pass
