# Fix: AML Screening — Final Polish

**Priority: LOW**
**Owner: Claude Code (DEV)**
**Date: 2026-04-16**

---

## Overview

Follow-up review of the screening implementation after Dev completed FIX-SCREENING-REMAINING-GAPS.md. All 6 major gaps were addressed. This document covers the remaining minor issues found during the final review pass — 4 items total.

---

## Fix 1: Admin portal confirm dialogs still use hardcoded English

### Problem

Both admin portal screening pages use `window.confirm()` with hardcoded English strings instead of the i18n key that was already created for this exact purpose.

**File:** `apps/admin-portal/src/app/(portal)/screening/page.tsx` (lines 114–116)

```typescript
const confirmed = window.confirm(
  `Are you sure you want to ${decision.toLowerCase()} this screening?`
);
```

**File:** `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx` (lines 115–117)

```typescript
const confirmed = window.confirm(
  `Are you sure you want to ${decision.toLowerCase()} this screening?`
);
```

The i18n key `screening.confirm` already exists in all 7 locale files with the `{{action}}` interpolation placeholder (e.g. `"confirm": "Are you sure you want to {{action}} this screening?"` in `en.json`). It's just never used.

### Fix

**File:** `apps/admin-portal/src/app/(portal)/screening/page.tsx`

Change lines 114–116:
```typescript
// From:
const confirmed = window.confirm(
  `Are you sure you want to ${decision.toLowerCase()} this screening?`
);

// To:
const confirmed = window.confirm(
  t('screening.confirm', { action: decision.toLowerCase() })
);
```

**File:** `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx`

Change lines 115–117:
```typescript
// From:
const confirmed = window.confirm(
  `Are you sure you want to ${decision.toLowerCase()} this screening?`
);

// To:
const confirmed = window.confirm(
  t('screening.confirm', { action: decision.toLowerCase() })
);
```

Also in both files, the error fallback message is hardcoded English:

**File:** `apps/admin-portal/src/app/(portal)/screening/page.tsx` (line 125)
```typescript
// From:
const message = err?.graphQLErrors?.[0]?.message || 'Failed to submit review';

// To:
const message = err?.graphQLErrors?.[0]?.message || t('screening.submitError');
```

**File:** `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx` (line 126)
```typescript
// From:
const message = err?.graphQLErrors?.[0]?.message || 'Failed to submit review';

// To:
const message = err?.graphQLErrors?.[0]?.message || t('screening.submitError');
```

Add the new i18n key to `en.json` screening section:
```json
"submitError": "Failed to submit review"
```

And add translated equivalents in all 6 non-English locale files.

Additionally, line 147 in `page.tsx` has one last hardcoded `'Unknown'` fallback and line 181 has `'No matches'`:

```typescript
// page.tsx line 147 — change:
{r.customer?.fullName || 'Unknown'}
// To:
{r.customer?.fullName || t('screening.detail.unknown')}

// page.tsx line 181 — change:
<span className="text-xs text-white/30">No matches</span>
// To:
<span className="text-xs text-white/30">{t('screening.detail.noMatches')}</span>
```

Both `screening.detail.unknown` and `screening.detail.noMatches` already exist in all 7 locale files.

---

## Fix 2: Platform portal Decision column — remove dead `.split(':')` code

### Problem

**File:** `apps/platform-portal/src/app/(portal)/screening/page.tsx` (line 208)

```typescript
{row.reviewDecision
  ? row.reviewDecision.split(':')[0]
  : '-'}
```

This `.split(':')[0]` was a defensive measure from when the resolver concatenated `"ESCALATE: reason text"` into the decision field. Now that Fix 1 of FIX-SCREENING-REMAINING-GAPS.md has been implemented and decision values are stored cleanly (e.g. just `"ESCALATE"`), this split is dead code. It's harmless today but misleading — a future developer reading it would assume the decision field still contains colon-separated data.

### Fix

**File:** `apps/platform-portal/src/app/(portal)/screening/page.tsx`

Change line 206–209:
```typescript
// From:
{row.reviewDecision
  ? row.reviewDecision.split(':')[0]
  : '-'}

// To:
{row.reviewDecision || '-'}
```

---

## Fix 3: `String.replace('_', ' ')` — non-global instances outside screening

### Problem

While the screening pages were fixed to use `/_/g`, the same non-global pattern exists in the feedback pages of both portals. These will only replace the first underscore in status values.

**File:** `apps/platform-portal/src/app/(portal)/feedback/page.tsx`
- Line 270: `newStatus.replace('_', ' ')`
- Line 335: `fb.status.replace('_', ' ')`
- Line 620: `fb.status.replace('_', ' ')`

**File:** `apps/admin-portal/src/app/(portal)/platform/feedback/page.tsx`
- Line 176: `newStatus.replace('_', ' ')`
- Line 350: `fb.status.replace('_', ' ')`

### Fix

Replace all 5 instances with the global regex form:

```typescript
// From (all instances):
.replace('_', ' ')

// To:
.replace(/_/g, ' ')
```

---

## Fix 4: `platformScreeningDecision` mutation — missing `tenantName` and `customerName` in response

### Problem

**File:** `apps/graphql-server/src/graphql/resolvers/platform-screening.resolver.ts` (lines 204–225)

When a platform admin takes an action (block, approve, flag), the `platformScreeningDecision` mutation updates the record but returns a `PlatformScreeningEntry` without `tenantName` or `customerName`:

```typescript
return {
  id: updated.id,
  tenantId: updated.tenantId,
  customerId: updated.customerId,
  screenedAt: updated.screenedAt,
  status: updated.status,
  riskLevel: updated.riskLevel,
  provider: updated.provider,
  reviewDecision: updated.reviewDecision ?? undefined,
  reviewedBy: updated.reviewedBy ?? undefined,
  reviewedAt: updated.reviewedAt ?? undefined,
  // ← tenantName and customerName are missing
};
```

This is mitigated by `refetchStats()` and `refetchEscalated()` in the `onCompleted` callback, so tables refresh with full data. However, for consistency with the type definition and to support future Apollo cache updates, the mutation should return complete data.

### Fix

**File:** `apps/graphql-server/src/graphql/resolvers/platform-screening.resolver.ts`

Update the `platformScreeningDecision` mutation to include customer and tenant name lookups:

```typescript
async platformScreeningDecision(
  @CurrentUser() user: IAuthenticatedUser,
  @Args('screeningId', { type: () => ID }) screeningId: string,
  @Args('decision') decision: string,
  @Args('reason', { nullable: true }) reason?: string,
): Promise<PlatformScreeningEntry> {
  const updated = await this.prisma.screeningResult.update({
    where: { id: screeningId },
    data: {
      reviewedBy: user.userId,
      reviewedAt: new Date(),
      reviewDecision: decision,
    },
    include: { customer: { select: { fullName: true } } },
  });

  // Resolve tenant name
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: updated.tenantId },
    select: { name: true },
  });

  return {
    id: updated.id,
    tenantId: updated.tenantId,
    customerId: updated.customerId,
    screenedAt: updated.screenedAt,
    status: updated.status,
    riskLevel: updated.riskLevel,
    provider: updated.provider,
    reviewDecision: updated.reviewDecision ?? undefined,
    reviewedBy: updated.reviewedBy ?? undefined,
    reviewedAt: updated.reviewedAt ?? undefined,
    tenantName: tenant?.name ?? undefined,
    customerName: (updated as any).customer?.fullName ?? undefined,
  };
}
```

Update the frontend mutation query to request the additional fields:

**File:** `apps/platform-portal/src/app/(portal)/screening/page.tsx`

```graphql
# From:
mutation PlatformScreeningDecision($screeningId: ID!, $decision: String!, $reason: String) {
  platformScreeningDecision(screeningId: $screeningId, decision: $decision, reason: $reason) {
    id
    reviewDecision
    reviewedAt
  }
}

# To:
mutation PlatformScreeningDecision($screeningId: ID!, $decision: String!, $reason: String) {
  platformScreeningDecision(screeningId: $screeningId, decision: $decision, reason: $reason) {
    id
    tenantName
    customerName
    reviewDecision
    reviewedAt
  }
}
```

---

## Summary of all changes

| # | File | Action | Priority |
|---|---|---|---|
| 1a | `apps/admin-portal/src/app/(portal)/screening/page.tsx` | **EDIT** — use `t('screening.confirm', ...)` in `window.confirm()`; use `t('screening.submitError')` in error fallback; use `t('screening.detail.unknown')` and `t('screening.detail.noMatches')` for remaining hardcoded strings | LOW |
| 1b | `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx` | **EDIT** — use `t('screening.confirm', ...)` in `window.confirm()`; use `t('screening.submitError')` in error fallback | LOW |
| 1c | `apps/admin-portal/src/lib/i18n/locales/*.json` | **EDIT** — add `"submitError"` key to `screening` section in all 7 locale files | LOW |
| 2 | `apps/platform-portal/src/app/(portal)/screening/page.tsx` | **EDIT** — remove `.split(':')[0]` from Decision column; update mutation query to request `tenantName` and `customerName` | LOW |
| 3a | `apps/platform-portal/src/app/(portal)/feedback/page.tsx` | **EDIT** — change 3x `.replace('_', ' ')` to `.replace(/_/g, ' ')` | LOW |
| 3b | `apps/admin-portal/src/app/(portal)/platform/feedback/page.tsx` | **EDIT** — change 2x `.replace('_', ' ')` to `.replace(/_/g, ' ')` | LOW |
| 4 | `apps/graphql-server/src/graphql/resolvers/platform-screening.resolver.ts` | **EDIT** — include tenant + customer name in `platformScreeningDecision` mutation response | LOW |

---

## Definition of Done

- [ ] Both admin portal `window.confirm()` calls use `t('screening.confirm', { action: ... })` instead of hardcoded English
- [ ] Both admin portal error fallbacks use `t('screening.submitError')` instead of hardcoded English
- [ ] Admin portal queue page uses `t('screening.detail.unknown')` and `t('screening.detail.noMatches')` for the two remaining hardcoded fallbacks
- [ ] `"submitError"` key exists in all 7 admin portal locale files
- [ ] Platform portal Decision column uses `row.reviewDecision || '-'` (no `.split(':')`)
- [ ] All 5 feedback page `.replace('_', ' ')` calls use `/_/g` global regex
- [ ] `platformScreeningDecision` mutation returns `tenantName` and `customerName`
- [ ] Platform portal mutation query requests `tenantName` and `customerName`
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] All existing tests pass
