# Dev Prompt: Sprint 11 Track B — Hardcoded Strings Cleanup

**Date:** 2026-05-02
**Priority:** Low — final polish before Track B close
**Effort:** ~20 minutes
**Reference:** PM verification of FIX-SPRINT-11-TRACK-B-GAPS-2026-05-02.md

---

## Context

All 25 Track B fixes have been verified and pass. The only remaining issue is hardcoded English strings across the three BNPL admin portal files. Every user-facing string must use `t()` for i18n readiness. This prompt covers all instances across all three files.

**Rule:** No hardcoded user-facing strings. Every label, placeholder, error message, loading state, and subtitle must go through `t()`.

---

## File 1: `apps/admin-portal/src/app/(portal)/merchants/[id]/page.tsx`

### 1A — Profile section (line 301)

```typescript
// Current:
<ProfileCell label="Onboarded" value={...} />

// Replace with:
<ProfileCell label={t('merchants.detail.onboarded')} value={...} />
```

### 1B — Metric labels (lines 312–315)

```typescript
// Current:
<Metric label="Transactions (page)" value={String(transactions.length)} sub={`of ${totalCount} total`} />
<Metric label="Gross volume" value={formatMoney(totalGross, totalCurrency)} />
<Metric label="Active" value={String(activeCount)} />
<Metric label="Completed / refunded" value={`${completedCount} / ${refundedOrCancelledCount}`} />

// Replace with:
<Metric label={t('merchants.detail.transactionsPage')} value={String(transactions.length)} sub={t('merchants.detail.ofTotal', { count: totalCount })} />
<Metric label={t('merchants.detail.grossVolume')} value={formatMoney(totalGross, totalCurrency)} />
<Metric label={t('merchants.detail.activeCount')} value={String(activeCount)} />
<Metric label={t('merchants.detail.completedRefunded')} value={`${completedCount} / ${refundedOrCancelledCount}`} />
```

Note the `sub` prop on line 312 — the `of ${totalCount} total` interpolation is also hardcoded English.

### 1C — Loading states (lines 142, 329, 359)

```typescript
// Current (appears 3 times):
subtitle="Loading…"
// and:
Loading…

// Replace all with:
subtitle={t('common.loading')}
// and:
{t('common.loading')}
```

### 1D — Not-found error (line 153)

```typescript
// Current:
subtitle="Merchant not found"

// Replace with:
subtitle={t('merchants.detail.notFound')}
```

---

## File 2: `apps/admin-portal/src/components/merchants/merchant-list.tsx`

### 2A — Error fallback strings in catch blocks (lines 154, 165, 176, 192, 205)

```typescript
// Current (5 instances):
toast('error', e.graphQLErrors?.[0]?.message || e.message || 'Failed to save merchant');
toast('error', e.message || 'Failed to activate');
toast('error', e.message || 'Failed to reactivate');
toast('error', e.message || 'Failed to suspend');
toast('error', e.message || 'Failed to deactivate');

// Replace with:
toast('error', e.graphQLErrors?.[0]?.message || e.message || t('merchants.errors.saveFailed'));
toast('error', e.message || t('merchants.errors.activateFailed'));
toast('error', e.message || t('merchants.errors.reactivateFailed'));
toast('error', e.message || t('merchants.errors.suspendFailed'));
toast('error', e.message || t('merchants.errors.deactivateFailed'));
```

### 2B — Loading states (lines 329, 332)

```typescript
// Current:
subtitle="Loading…"
// and:
Loading…

// Replace with:
subtitle={t('common.loading')}
// and:
{t('common.loading')}
```

### 2C — Merchant count subtitle with hardcoded plural (line 346)

```typescript
// Current:
`${merchants.length} merchant${merchants.length === 1 ? '' : 's'}. ${t('merchants.subtitle')}`

// Replace with:
`${merchants.length} ${t('merchants.countLabel', { count: merchants.length })}. ${t('merchants.subtitle')}`
```

### 2D — Suspend reason placeholder (line 420)

```typescript
// Current:
placeholder="fraud_alert"

// Replace with:
placeholder={t('merchants.suspendReasonPlaceholder')}
```

### 2E — "All" fallback in status filter (line 366)

```typescript
// Current:
<option value="">{t('common.all') || 'All'}</option>

// Replace with (drop the fallback — the key exists):
<option value="">{t('common.all')}</option>
```

### 2F — "BNPL" eyebrow fallback (lines 327, 342)

```typescript
// Current (2 instances):
eyebrow={t('eyebrow.fundingPartners') || 'BNPL'}

// Replace with (drop the fallback):
eyebrow={t('eyebrow.fundingPartners')}
```

If the `eyebrow.fundingPartners` key doesn't exist in the locale file, add it (see locale additions below).

---

## File 3: `apps/admin-portal/src/components/merchants/merchant-form.tsx`

### 3A — Validation error messages (lines 67, 71, 79, 83)

```typescript
// Current:
setError(`${t('merchants.name')} is required`);
setError(`${t('merchants.code')} is required`);
setError('Discount rate must be a valid number');
setError('Discount rate must be in [0, 100)');

// Replace with:
setError(t('merchants.form.validation.nameRequired'));
setError(t('merchants.form.validation.codeRequired'));
setError(t('merchants.form.validation.discountRateInvalid'));
setError(t('merchants.form.validation.discountRateRange'));
```

### 3B — Input placeholders (lines 127, 141, 157, 169, 229, 241)

```typescript
// Current:
placeholder="Acme Stores"
placeholder="ACME"
placeholder="ops@acme.com"
placeholder="+233..."
placeholder="WALLET_..."
placeholder="mtn_momo"

// Replace with:
placeholder={t('merchants.form.placeholders.name')}
placeholder={t('merchants.form.placeholders.code')}
placeholder={t('merchants.form.placeholders.email')}
placeholder={t('merchants.form.placeholders.phone')}
placeholder={t('merchants.form.placeholders.walletId')}
placeholder={t('merchants.form.placeholders.walletProvider')}
```

---

## Locale File Additions

**File:** `apps/admin-portal/src/lib/i18n/locales/en.json`

Add these keys inside the existing `merchants` object. Merge into the appropriate nested objects where they already exist:

```json
{
  "merchants": {
    "countLabel": "merchant(s)",
    "suspendReasonPlaceholder": "e.g. fraud_alert",
    "detail": {
      "onboarded": "Onboarded",
      "transactionsPage": "Transactions (page)",
      "ofTotal": "of {{count}} total",
      "grossVolume": "Gross volume",
      "activeCount": "Active",
      "completedRefunded": "Completed / refunded",
      "notFound": "Merchant not found"
    },
    "errors": {
      "saveFailed": "Failed to save merchant",
      "activateFailed": "Failed to activate",
      "reactivateFailed": "Failed to reactivate",
      "suspendFailed": "Failed to suspend",
      "deactivateFailed": "Failed to deactivate"
    },
    "form": {
      "validation": {
        "nameRequired": "Merchant name is required",
        "codeRequired": "Merchant code is required",
        "discountRateInvalid": "Discount rate must be a valid number",
        "discountRateRange": "Discount rate must be in [0, 100)"
      },
      "placeholders": {
        "name": "Acme Stores",
        "code": "ACME",
        "email": "ops@acme.com",
        "phone": "+233...",
        "walletId": "WALLET_...",
        "walletProvider": "mtn_momo"
      }
    }
  }
}
```

Also verify the `eyebrow.fundingPartners` key exists in the locale file. If not, add:

```json
{
  "eyebrow": {
    "fundingPartners": "BNPL"
  }
}
```

And verify `common.loading` exists. If not, add:

```json
{
  "common": {
    "loading": "Loading…"
  }
}
```

---

## Summary

| # | File | Count | What |
|---|------|-------|------|
| 1A–1D | `[id]/page.tsx` | 10 | Metric labels, profile label, loading states, not-found |
| 2A–2F | `merchant-list.tsx` | 11 | Error fallbacks, loading, plural, placeholder, fallback drops |
| 3A–3B | `merchant-form.tsx` | 10 | Validation messages, input placeholders |
| Locale | `en.json` | ~20 keys | New keys in `merchants.detail`, `merchants.errors`, `merchants.form.validation`, `merchants.form.placeholders` |

**Total: 31 hardcoded strings → `t()` calls, plus ~20 locale keys to add.** Report back when done.
