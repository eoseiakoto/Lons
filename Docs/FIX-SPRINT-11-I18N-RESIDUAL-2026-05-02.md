# Dev Prompt: i18n Residual Fixes

**Date:** 2026-05-02
**Priority:** Low — final cleanup before Sprint 11 close
**Effort:** ~15 minutes
**Reference:** PM verification of FIX-SPRINT-11-I18N-HARDCODED-STRINGS-2026-05-02.md

---

## Context

The platform-wide i18n pass is 98% complete. 5 files still have hardcoded English strings, and the locale file is missing one namespace. This prompt covers all residual items.

---

## File 1: `apps/admin-portal/src/app/login/page.tsx`

### 1A — Hero headline (lines 822–824)

```typescript
// Current:
From <span className="italic text-[color:var(--accent-primary-deep)]">origination</span>
<br />
to <span className="italic text-[color:var(--accent-primary-deep)]">recovery</span>.

// Replace with:
{t('login.heroFrom')} <span className="italic text-[color:var(--accent-primary-deep)]">{t('login.heroOrigination')}</span>
<br />
{t('login.heroTo')} <span className="italic text-[color:var(--accent-primary-deep)]">{t('login.heroRecovery')}</span>.
```

### 1B — Hero description (line 830)

```typescript
// Current:
Lending platform used by banks, microfinance lenders, and telcos across Africa.

// Replace with:
{t('login.heroDescription')}
```

### 1C — Desktop card heading (line 1067)

```typescript
// Current:
Sign in

// Replace with:
{t('login.signIn')}
```

### 1D — Copyright tagline (line 1158)

```typescript
// Current:
© {new Date().getFullYear()} Lōns · Lending platform for financial institutions

// Replace with:
© {new Date().getFullYear()} Lōns · {t('login.copyrightTagline')}
```

---

## File 2: `apps/admin-portal/src/app/(portal)/products/page.tsx`

### 2A — TYPE_LABEL constant (lines 59–64)

The constant uses hardcoded English labels. Replace with `t()` calls — but since the constant is defined outside the component, move the label resolution inline or convert to a function.

```typescript
// Current:
const TYPE_LABEL: Record<string, string> = {
  micro_loan: 'Micro loan',
  overdraft: 'Overdraft',
  bnpl: 'BNPL',
  invoice_factoring: 'Invoice factoring',
};

// Replace with a function inside the component (after useI18n):
const typeLabel = (type: string) =>
  t(`products.typeLabel.${type}`) || type.replace(/_/g, ' ');
```

Then update every usage of `TYPE_LABEL[x]` → `typeLabel(x)`.

### 2B — Filtered count (line 212)

```typescript
// Current:
{filtered.length} of {products.length}

// Replace with:
{t('products.filteredCount', { filtered: filtered.length, total: products.length })}
```

### 2C — Clear fallback (line 208)

```typescript
// Current:
{t('common.clear') || 'Clear'}

// Replace with (drop the fallback — the key exists):
{t('common.clear')}
```

---

## File 3: `apps/admin-portal/src/app/(portal)/products/[id]/page.tsx`

### 3A — Grace period "days" (line 59)

```typescript
// Current:
`${product.gracePeriodDays} days`

// Replace with:
t('products.gracePeriodValue', { days: product.gracePeriodDays })
```

### 3B — Product eyebrow (line 97)

```typescript
// Current:
Product · {product.type.replace(/_/g, ' ')} · v{product.version}

// Replace with:
{t('products.detailEyebrow', { type: product.type.replace(/_/g, ' '), version: product.version })}
```

---

## File 4: `apps/admin-portal/src/app/(portal)/reports/page.tsx`

### 4A — Subtitle (line 55)

```typescript
// Current:
subtitle="PAR buckets and IFRS-9 classification, by product."

// Replace with:
subtitle={t('reports.subtitle')}
```

---

## File 5: `apps/admin-portal/src/components/merchants/merchant-form.tsx`

### 5A — Input placeholders (lines 127, 141, 157, 169, 229, 241)

These 6 placeholders were flagged in the original prompt but are still hardcoded.

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

### Add to `login`:

```json
"heroFrom": "From",
"heroTo": "to",
"heroOrigination": "origination",
"heroRecovery": "recovery",
"heroDescription": "Lending platform used by banks, microfinance lenders, and telcos across Africa.",
"copyrightTagline": "Lending platform for financial institutions"
```

Note: `login.signIn` already exists — reuse it for Fix 1C.

### Add to `products`:

```json
"typeLabel": {
  "micro_loan": "Micro loan",
  "overdraft": "Overdraft",
  "bnpl": "BNPL",
  "invoice_factoring": "Invoice factoring"
},
"filteredCount": "{{filtered}} of {{total}}",
"gracePeriodValue": "{{days}} days",
"detailEyebrow": "Product · {{type}} · v{{version}}"
```

### Add to `reports`:

```json
"subtitle": "PAR buckets and IFRS-9 classification, by product."
```

### Add to `merchants.form`:

```json
"placeholders": {
  "name": "Acme Stores",
  "code": "ACME",
  "email": "ops@acme.com",
  "phone": "+233...",
  "walletId": "WALLET_...",
  "walletProvider": "mtn_momo"
}
```

---

## Summary

| # | File | Count | What |
|---|------|-------|------|
| 1A–1D | `login/page.tsx` | 4 | Hero text, card heading, copyright tagline |
| 2A–2C | `products/page.tsx` | 3 | Type labels, filtered count, fallback drop |
| 3A–3B | `products/[id]/page.tsx` | 2 | Grace period unit, eyebrow |
| 4A | `reports/page.tsx` | 1 | Subtitle |
| 5A | `merchant-form.tsx` | 6 | Input placeholders |
| Locale | `en.json` | ~16 keys | New keys in `login`, `products`, `reports`, `merchants.form.placeholders` |

**Total: 16 hardcoded strings → `t()` calls, plus ~16 locale keys to add.** Report back when done.
