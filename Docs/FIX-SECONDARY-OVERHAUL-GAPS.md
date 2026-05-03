# FIX: Secondary Overhaul Gaps — Components, Reports, Blue Accent, Glass Wrappers

**Context:** The primary remaining-pages overhaul is complete. All 9 verification checks pass. This document addresses the secondary layer: patterns the first fix doc didn't target. These are primarily in shared components (not pages) and involve `glass p-*` wrappers, `text-2xl font-bold` values, hardcoded `text-blue-400` accent colors, and `bg-gray-100` loading skeletons.

**Scope:** Visual layer only. Do NOT change GraphQL queries, data logic, routing, or business logic.

**Rule:** Do NOT truncate, skip, or use placeholders like `// ...rest of component`. Every file listed must be modified completely.

---

## Table of Contents

1. [Change Categories](#1-change-categories)
2. [Page Files — Missed Headers and Patterns](#2-page-files--missed-headers-and-patterns)
3. [Report Components — Full Overhaul](#3-report-components--full-overhaul)
4. [Collections Components](#4-collections-components)
5. [Product Wizard Components](#5-product-wizard-components)
6. [Customer Tab Components](#6-customer-tab-components)
7. [Loan Components](#7-loan-components)
8. [Platform Components](#8-platform-components)
9. [Lender Components](#9-lender-components)
10. [Dashboard Components](#10-dashboard-components)
11. [Platform Portal Pages — Glass and Color Refs](#11-platform-portal-pages--glass-and-color-refs)
12. [Admin Portal Pages — Remaining Glass Wrappers](#12-admin-portal-pages--remaining-glass-wrappers)
13. [Blue-to-Coral Accent Migration](#13-blue-to-coral-accent-migration)
14. [Verification Checklist](#14-verification-checklist)

---

## 1. Change Categories

### Category K: `glass p-*` → `card p-*` (Content Panels)

The `glass` class is a legacy compat shim. For content panels, form sections, and data containers, replace with the appropriate card variant:

```tsx
// Before:
<div className="glass p-6">
<div className="glass p-4">
<div className="glass p-5">
<div className="glass p-4 text-center">
<div className="glass p-8 text-center">

// After — for content panels, data sections:
<div className="card p-6">
<div className="card p-4">
<div className="card p-5">
<div className="card p-4 text-center">
<div className="card p-8 text-center">
```

**Exception — form inputs:** `glass-input` and `glass-button` are acceptable form element classes. Do NOT replace these.

**Exception — interactive cards:** If the `glass` element has `hover:bg-white/5` or `cursor-pointer`, use `card-interactive` instead of `card`:
```tsx
// Before:
<div className="glass p-4 hover:bg-white/5 cursor-pointer">

// After:
<div className="card-interactive p-4">
```

**Exception — table wrappers:** If the `glass` wraps a `<DataTable>` or `<table>`, use `card-flush` with border-top (same as Category C from the previous fix doc):
```tsx
// Before:
<div className="glass p-4">
  <DataTable ... />
</div>

// After:
<div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
  <DataTable ... />
</div>
```
Note: Remove the `p-4` padding when using `card-flush` — the DataTable handles its own internal padding.

---

### Category L: `text-2xl font-bold` → Proper Typography

Two contexts:

**L1 — Page titles** (`<h1>` elements):
```tsx
// Before:
<h1 className="text-2xl font-bold text-white mb-6">

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
```
Wrap in `<header>` with subtitle, same as Category B in the previous fix doc.

**L2 — KPI/metric values** (`<p>` elements showing numbers):
```tsx
// Before:
<p className="text-2xl font-bold text-white">{count}</p>
<p className="text-2xl font-bold text-emerald-400">{value}</p>
<p className="text-2xl font-bold text-amber-400">{value}</p>
<p className="text-2xl font-bold text-red-400">{value}</p>
<p className="text-2xl font-bold text-blue-400">{value}</p>
<p className="text-2xl font-bold text-orange-400">{value}</p>
<p className="text-2xl font-bold text-white/20">--</p>

// After — use kpi-value class with CSS variable colors:
<p className="kpi-value">{count}</p>
<p className="kpi-value" style={{ color: 'var(--status-success-text)' }}>{value}</p>
<p className="kpi-value" style={{ color: 'var(--status-warning-text)' }}>{value}</p>
<p className="kpi-value" style={{ color: 'var(--status-error-text)' }}>{value}</p>
<p className="kpi-value" style={{ color: 'var(--accent-primary-deep)' }}>{value}</p>
<p className="kpi-value" style={{ color: 'var(--status-warning-text)' }}>{value}</p>
<p className="kpi-value text-[color:var(--text-tertiary)]">--</p>
```

The `.kpi-value` class is already defined in `globals.css` as `font-size: 30px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums`. This replaces the ad-hoc `text-2xl font-bold` pattern and ensures consistent sizing with automatic `tabular-nums`.

**Color mapping reference:**
| Hardcoded Tailwind | CSS Variable |
|---|---|
| `text-white` | `var(--text-primary)` (default in `.kpi-value`) |
| `text-emerald-400` | `var(--status-success-text)` |
| `text-amber-400` | `var(--status-warning-text)` |
| `text-orange-400` | `var(--status-warning-text)` |
| `text-red-400` | `var(--status-error-text)` |
| `text-blue-400` | `var(--accent-primary-deep)` |
| `text-white/20` | `var(--text-tertiary)` |

---

### Category M: Blue-to-Coral Accent Migration

The OVERHAUL spec stated: "Interactive text (links, clickable labels) uses coral-derived color instead of default blue." Currently 49 instances of `text-blue-400` remain.

**M1 — Interactive links and buttons:**
```tsx
// Before:
<button className="text-sm text-blue-400 hover:underline">
<button className="text-sm text-blue-400 hover:text-blue-300">
<a className="text-blue-400 hover:text-blue-300">

// After:
<button className="text-sm text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] hover:underline">
<button className="text-sm text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)]">
<a className="text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)]">
```

**M2 — Icons as accent:**
```tsx
// Before:
<User className="w-7 h-7 text-blue-400" />
<Mail className="w-4 h-4 text-blue-400" />
<Globe className="w-5 h-5 text-blue-400" />

// After:
<User className="w-7 h-7" style={{ color: 'var(--accent-primary)' }} />
<Mail className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
<Globe className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
```

**M3 — Badge/pill backgrounds:**
```tsx
// Before:
'bg-blue-500/20 text-blue-400 border-blue-500/30'

// After:
'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border border-[color:var(--accent-primary-soft)]'
```

Or as separate classes when used in template literals:
```tsx
// Before (in a status map):
normal: 'bg-blue-500/20 text-blue-400 border-blue-500/30',

// After:
normal: 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border-[color:var(--accent-primary-soft)]',
```

**M4 — Tab indicator borders:**
```tsx
// Before:
tab === item.key ? 'border-blue-400 text-blue-400' : 'border-transparent text-white/40 hover:text-white/60'

// After:
tab === item.key
  ? 'border-[color:var(--accent-primary)] text-[color:var(--accent-primary-deep)]'
  : 'border-transparent text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]'
```

**M5 — Profile avatar container:**
```tsx
// Before:
<div className="w-14 h-14 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">

// After:
<div className="w-14 h-14 rounded-full flex items-center justify-center"
  style={{ backgroundColor: 'var(--accent-primary-soft)', border: '1px solid var(--accent-primary-soft)' }}>
```

**M6 — Wizard step indicators:**
```tsx
// Before:
? 'bg-blue-500/30 border-blue-400 text-blue-400 shadow-lg shadow-blue-500/20'

// After:
? 'shadow-lg' + inline styles:
style={{
  backgroundColor: 'var(--accent-primary-soft)',
  borderColor: 'var(--accent-primary)',
  color: 'var(--accent-primary-deep)',
  boxShadow: '0 10px 15px -3px var(--accent-primary-soft)',
}}
```

**M7 — Timeline dots:**
```tsx
// Before:
<div className="... border-2 border-blue-400 bg-slate-900" />

// After:
<div className="..." style={{ border: '2px solid var(--accent-primary)', backgroundColor: 'var(--bg-card)' }} />
```

**M8 — Focus borders on inputs:**
```tsx
// Before:
focus:border-blue-400
focus:border-blue-400/50
focus:border-blue-500/50

// After — use focus ring via box-shadow instead:
focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-primary-ring)]
```

Or inline: `style={{ '--tw-ring-color': 'var(--accent-primary-ring)' }}` if the Tailwind ring utility doesn't pick up the variable.

**Exceptions — DO NOT change:**
- `debug/page.tsx` — The debug page uses blue for HTTP method badges (GET=blue, POST=green, etc.). This is a conventional color coding. Leave it.
- `settings/integrations/page.tsx` — Uses `border-blue-300 bg-blue-50` and `text-blue-700` for a "default provider" indicator. This appears to be a light-mode-only integration settings page with its own color scheme. Leave it unless it causes visual issues.

---

### Category N: Loading State Color Fixes

```tsx
// Before:
<div className="text-white/40">Loading...</div>
<div className="text-white/40">{t('common.loading')}</div>
<div className="glass p-12 text-center text-white/40">Loading...</div>

// After:
<div className="text-sm text-[color:var(--text-secondary)]">Loading...</div>
<div className="text-sm text-[color:var(--text-secondary)]">{t('common.loading')}</div>
<div className="card p-12 text-center text-sm text-[color:var(--text-secondary)]">Loading...</div>
```

---

### Category O: Loading Skeleton Backgrounds

```tsx
// Before:
<div className="h-12 rounded bg-gray-100" />
<div className="h-24 rounded-lg bg-gray-100" />

// After:
<div className="shimmer h-12 rounded" />
<div className="shimmer h-24 rounded-lg" />
```

The `.shimmer` class is already defined in `globals.css` and uses theme-aware colors.

---

### Category P: Sub-label Text Inside Data Sections

```tsx
// Before:
<p className="text-sm text-white/60">Label</p>
<p className="text-xs text-white/40">Sub-label</p>
<span className="text-white/40">Label</span>

// After:
<p className="text-sm text-[color:var(--text-secondary)]">Label</p>
<p className="text-xs text-[color:var(--text-tertiary)]">Sub-label</p>
<span className="text-[color:var(--text-tertiary)]">Label</span>
```

Apply these when modifying a file for other categories. The CSS shim handles rendering, but direct CSS variable usage is preferred for maintainability.

---

## 2. Page Files — Missed Headers and Patterns

### 2.1 `apps/admin-portal/src/app/(portal)/products/new/page.tsx`

**Categories: A, L1, M1**

Full rewrite (it's only 20 lines):
```tsx
// Before (entire file):
<div>
  <button onClick={() => router.back()} className="text-sm text-blue-400 mb-4 hover:underline">
    &larr; {t('common.back')}
  </button>
  <h1 className="text-2xl font-bold text-white mb-6">{t('products.createProduct')}</h1>
  <ProductWizard mode="create" />
</div>

// After:
<div className="space-y-6 animate-enter">
  <header>
    <button
      onClick={() => router.back()}
      className="text-sm text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] hover:underline mb-4 inline-flex items-center gap-1"
    >
      &larr; {t('common.back')}
    </button>
    <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
      {t('products.createProduct')}
    </h1>
  </header>
  <ProductWizard mode="create" />
</div>
```

---

### 2.2 `apps/admin-portal/src/app/(portal)/products/[id]/edit/page.tsx`

**Categories: A, L1, M1, N**

**Line 107 — loading state:**
```tsx
// Before:
<div className="text-white/40">{t('common.loading')}</div>

// After:
<div className="text-sm text-[color:var(--text-secondary)]">{t('common.loading')}</div>
```

**Line 110 — outer div:**
```tsx
// Before:
<div>

// After:
<div className="space-y-6 animate-enter">
```

**Line 111 — back button:**
```tsx
// Before:
<button onClick={() => router.back()} className="text-sm text-blue-400 mb-4 hover:underline">

// After:
<button onClick={() => router.back()} className="text-sm text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] hover:underline mb-4 inline-flex items-center gap-1">
```

**Line 114 — H1:**
```tsx
// Before:
<h1 className="text-2xl font-bold text-white mb-6">

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
```

---

### 2.3 `apps/platform-portal/src/app/(portal)/tenants/create/page.tsx`

**Categories: L1**

**Line 246 — H1:**
```tsx
// Before:
<h1 className="text-2xl font-bold text-white">Create Tenant</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Create Tenant</h1>
```

**Line 247 — subtitle:**
```tsx
// Before:
<p className="text-sm text-white/40 mt-1">

// After:
<p className="text-sm text-[color:var(--text-secondary)] mt-1">
```

---

### 2.4 `apps/admin-portal/src/app/(portal)/platform/integrations/page.tsx`

**Categories: L1, O**

**Line 48 — loading state H1:**
```tsx
// Before:
<h1 className="mb-6 text-2xl font-bold">Platform Integration Overview</h1>

// After:
<h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Platform Integration Overview</h1>
```

**Line 51 — skeleton background:**
```tsx
// Before:
<div key={i} className="h-12 rounded bg-gray-100" />

// After:
<div key={i} className="shimmer h-12 rounded" />
```

---

### 2.5 `apps/admin-portal/src/app/(portal)/settings/integrations/page.tsx`

**Categories: L1, O**

**Line 153 — loading state H1:**
```tsx
// Before:
<h1 className="mb-6 text-2xl font-bold">Integration Settings</h1>

// After:
<h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Integration Settings</h1>
```

**Line 156 — skeleton background:**
```tsx
// Before:
<div key={i} className="h-24 rounded-lg bg-gray-100" />

// After:
<div key={i} className="shimmer h-24 rounded-lg" />
```

---

## 3. Report Components — Full Overhaul

These are the highest-impact components — they render inside the already-overhauled reports page and currently undermine it with old patterns.

### 3.1 `apps/admin-portal/src/components/reports/collections-report.tsx`

**Categories: K, L2, P, N**

**Line 75 — loading state:**
```tsx
// Before:
<div className="text-white/40">Loading...</div>

// After:
<div className="text-sm text-[color:var(--text-secondary)]">Loading...</div>
```

**Lines 79–96 — KPI grid with glass wrappers (4 metrics):**

Replace the entire `grid-cols-4` block with the `gap-px` divider pattern:
```tsx
// Before:
<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
  <div className="glass p-4 text-center">
    <p className="text-sm text-white/60">Overdue</p>
    <p className="text-2xl font-bold text-amber-400">{metrics?.overdueCount ?? 156}</p>
  </div>
  <div className="glass p-4 text-center">
    <p className="text-sm text-white/60">Delinquent</p>
    <p className="text-2xl font-bold text-orange-400">{metrics?.delinquentCount ?? 109}</p>
  </div>
  <div className="glass p-4 text-center">
    <p className="text-sm text-white/60">Default</p>
    <p className="text-2xl font-bold text-red-400">{metrics?.defaultCount ?? 28}</p>
  </div>
  <div className="glass p-4 text-center">
    <p className="text-sm text-white/60">Total in Collections</p>
    <p className="text-2xl font-bold text-white">{metrics?.totalInCollections ?? 293}</p>
  </div>
</div>

// After:
<div
  className="stagger-children grid grid-cols-1 md:grid-cols-4 gap-px mb-6"
  style={{ backgroundColor: 'var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
>
  <div className="p-5 text-center" style={{ backgroundColor: 'var(--bg-card)' }}>
    <p className="section-label mb-2">Overdue</p>
    <p className="kpi-value" style={{ color: 'var(--status-warning-text)' }}>{metrics?.overdueCount ?? 156}</p>
  </div>
  <div className="p-5 text-center" style={{ backgroundColor: 'var(--bg-card)' }}>
    <p className="section-label mb-2">Delinquent</p>
    <p className="kpi-value" style={{ color: 'var(--status-warning-text)' }}>{metrics?.delinquentCount ?? 109}</p>
  </div>
  <div className="p-5 text-center" style={{ backgroundColor: 'var(--bg-card)' }}>
    <p className="section-label mb-2">Default</p>
    <p className="kpi-value" style={{ color: 'var(--status-error-text)' }}>{metrics?.defaultCount ?? 28}</p>
  </div>
  <div className="p-5 text-center" style={{ backgroundColor: 'var(--bg-card)' }}>
    <p className="section-label mb-2">Total in Collections</p>
    <p className="kpi-value">{metrics?.totalInCollections ?? 293}</p>
  </div>
</div>
```

**Lines 108, 122 — remaining glass wrappers:**
```tsx
// Before:
<div className="glass p-4 mb-6">
<div className="glass p-4">

// After:
<div className="card p-4 mb-6">
<div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
```
(Use `card-flush` when it wraps a DataTable; use `card` when it wraps mixed content.)

**Line 109 — sub-header:**
```tsx
// Before:
<h3 className="text-sm font-medium text-white/60 mb-3">

// After:
<h3 className="section-label mb-3">
```

---

### 3.2 `apps/admin-portal/src/components/reports/reconciliation-report.tsx`

**Categories: K, L2, P, N**

Apply the same pattern as 3.1:

**Line 67 — loading:** `text-white/40` → `text-sm text-[color:var(--text-secondary)]`

**Lines 71–84 — 3-column KPI grid:** Replace `glass p-4 text-center` blocks with `gap-px` divider pattern. Use `kpi-value` class. Map colors: `text-emerald-400` → `var(--status-success-text)`, `text-amber-400` → `var(--status-warning-text)`, `text-red-400` → `var(--status-error-text)`.

**Line 86 — table wrapper:** `glass p-4` → `card-flush overflow-hidden` + border-top.

**Line 87 — sub-header:** `text-sm font-medium text-white/60` → `section-label`.

---

### 3.3 `apps/admin-portal/src/components/reports/portfolio-quality-report.tsx`

**Categories: K, L2, P, N**

**Line 79 — loading:** `text-white/40` → `text-sm text-[color:var(--text-secondary)]`

**Lines 83–95 — 3-column KPI grid:** Replace with `gap-px` divider pattern. Map: line 86 `text-white` → default `kpi-value`; line 90 already has correct `text-[color:var(--text-primary)] tabular-nums` but still uses `glass p-4` wrapper; line 94 `text-red-400` → `var(--status-error-text)`.

**Lines 108, 121 — content panels:** `glass p-4` → `card p-4`.

---

### 3.4 `apps/admin-portal/src/components/reports/customer-acquisition-report.tsx`

**Categories: K, L2, P, N**

**Line 72 — loading:** `text-white/40` → `text-sm text-[color:var(--text-secondary)]`

**Lines 76–91 — 3-column KPI grid:** Replace with `gap-px` divider pattern. Map: line 79 `text-white` → default; line 83 `text-emerald-400` → `var(--status-success-text)`; line 87 `text-blue-400` → `var(--accent-primary-deep)`.

**Line 103 — table wrapper:** `glass p-4` → `card-flush overflow-hidden` + border-top.

---

### 3.5 `apps/admin-portal/src/components/reports/revenue-report.tsx`

**Categories: K, P**

**Lines 300–318 — 3-column KPI grid:** Lines 303, 309 already use `font-semibold` + CSS variables + `tabular-nums` (partially updated). But wrappers are still `glass p-4`. Replace with `gap-px` divider pattern.

**Lines 321, 331, 341, 373 — content panels:** `glass p-*` → `card p-*`.

**Lines 302, 308, 314, 333, 343 — sub-labels:** `text-sm text-white/60` → `section-label` or `text-sm text-[color:var(--text-secondary)]`.

---

### 3.6 `apps/admin-portal/src/components/reports/product-performance-report.tsx`

**Categories: K, P**

**Line 52 — loading:** `text-white/40` → `text-sm text-[color:var(--text-secondary)]`

**Line 55 — table wrapper:** `glass p-4` → `card-flush overflow-hidden` + border-top.

**Lines 74–97 — product cards grid:** Each `glass p-4` → `card p-4`. Also fix inline text colors: `text-white/80` → `text-[color:var(--text-primary)]`, `text-white/40` → `text-[color:var(--text-tertiary)]`, `text-emerald-400` → `text-[color:var(--status-success-text)]`, conditional `text-red-400` → `text-[color:var(--status-error-text)]`.

---

### 3.7 `apps/admin-portal/src/components/reports/disbursement-report.tsx`

**Categories: K**

**Line 80 — table wrapper:** `glass p-4` → `card-flush overflow-hidden` + border-top. (Financial columns already have `tabular-nums` — good.)

---

### 3.8 `apps/admin-portal/src/components/reports/repayment-report.tsx`

**Categories: K**

**Line 86 — table wrapper:** `glass p-4` → `card-flush overflow-hidden` + border-top. (Financial columns already have `tabular-nums` — good.)

---

### 3.9 `apps/admin-portal/src/components/reports/report-layout.tsx`

**Categories: L1**

**Line 38 — component header:**
```tsx
// Before:
text-lg font-semibold text-white/80

// After:
text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

---

### 3.10 `apps/admin-portal/src/components/reports/report-filter-bar.tsx`

**Categories: K**

**Line 204:** `glass p-4` → `card p-4`.

---

## 4. Collections Components

### 4.1 `apps/admin-portal/src/components/collections/action-drawer.tsx`

**Categories: K, M3, M7, P**

**Lines 116, 150, 182 — content panels:** `glass p-4` → `card p-4`.

**Line 197 — blue badge:**
```tsx
// Before:
'bg-blue-500/20 border-blue-500/30 text-blue-400'

// After:
'bg-[color:var(--accent-primary-soft)] border-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)]'
```

**Line 157 — timeline dot:**
```tsx
// Before:
border-2 border-blue-400 bg-slate-900

// After:
style={{ border: '2px solid var(--accent-primary)', backgroundColor: 'var(--bg-card)' }}
```

---

### 4.2 `apps/admin-portal/src/components/collections/collections-dashboard.tsx`

**Categories: K**

**Lines 35, 73 — content panels:** `glass p-6` → `card p-6`.

---

### 4.3 `apps/admin-portal/src/components/collections/ptp-tracker.tsx`

**Categories: K**

**Lines 37, 64, 70, 76 — content panels:** `glass p-*` → `card p-*`.

---

## 5. Product Wizard Components

### 5.1 `apps/admin-portal/src/components/products/wizard/product-wizard.tsx`

**Categories: K**

**Line 580:** `glass p-6` → `card p-6`.

---

### 5.2 All Wizard Step Files

Each wizard step uses `glass p-4 space-y-4` for section containers. Replace all with `card p-4 space-y-4`:

**step-funding-source.tsx** — lines 110, 170, 233: `glass p-4` → `card p-4`
**step-notifications.tsx** — lines 236, 295: `glass p-4` / `glass p-8` → `card p-4` / `card p-8`
**step-eligibility.tsx** — lines 59, 103: `glass p-4` → `card p-4`
**step-review.tsx** — line 14: `glass p-4` → `card p-4`
**step-financial-terms.tsx** — lines 57, 91, 123: `glass p-4` → `card p-4`
**step-approval.tsx** — lines 44, 66: line 44 has `glass p-4 ... cursor-pointer` → `card-interactive p-4`; line 66 `glass p-4` → `card p-4`
**step-fees.tsx** — line 55: `glass p-4` → `card p-4`

### 5.3 `apps/admin-portal/src/components/products/wizard/wizard-progress.tsx`

**Categories: M6**

**Line 49 — active step indicator:**
```tsx
// Before:
'bg-blue-500/30 border-blue-400 text-blue-400 shadow-lg shadow-blue-500/20'

// After — use inline styles:
style={{
  backgroundColor: 'var(--accent-primary-soft)',
  borderColor: 'var(--accent-primary)',
  color: 'var(--accent-primary-deep)',
  boxShadow: '0 10px 15px -3px var(--accent-primary-soft)',
}}
```

**Line 66 — active step text:**
```tsx
// Before:
isActive ? 'text-blue-400 font-medium'

// After:
isActive ? 'text-[color:var(--accent-primary-deep)] font-medium'
```

### 5.4 `apps/admin-portal/src/components/products/wizard/step-funding-source.tsx`

**Categories: M1**

**Line 145 — "Add lender" link:**
```tsx
// Before:
className="text-sm text-blue-400 hover:text-blue-300 mt-1 flex items-center gap-1"

// After:
className="text-sm text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] mt-1 flex items-center gap-1"
```

### 5.5 `apps/admin-portal/src/components/products/wizard/step-review.tsx`

**Categories: M3**

**Line 169 — blue badge:**
```tsx
// Before:
bg-blue-500/20 text-blue-400 border border-blue-500/30

// After:
bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border border-[color:var(--accent-primary-soft)]
```

### 5.6 `apps/admin-portal/src/components/products/wizard/step-approval.tsx`

**Categories: M**

**Line 46 — selected card border:**
```tsx
// Before:
'border-blue-400/50 bg-blue-500/5'

// After — use inline styles:
style={{ borderColor: 'var(--accent-primary)', backgroundColor: 'var(--accent-primary-soft)' }}
```

---

## 6. Customer Tab Components

### 6.1 `apps/admin-portal/src/components/customers/tab-credit-summary.tsx`

**Categories: K, L2**

**Lines 178, 196, 205, 222, 246, 260, 278 — content panels:** `glass p-6` → `card p-6`.

**Lines 192, 201, 218, 240 — empty-state KPI values:**
```tsx
// Before:
<p className="text-2xl font-bold text-white/20">--</p>

// After:
<p className="kpi-value text-[color:var(--text-tertiary)]">--</p>
```

**Line 209 — KPI value:**
```tsx
// Before:
<p className="text-2xl font-bold text-white">{formatPercent(creditUtilization)}</p>

// After:
<p className="kpi-value">{formatPercent(creditUtilization)}</p>
```

---

### 6.2 Other Customer Tabs

**tab-profile.tsx** line 63: `glass p-6` → `card p-6`
**tab-financial-profile.tsx** lines 11, 25: `glass p-6` → `card p-6`, `glass p-4` → `card p-4`
**tab-contracts.tsx** line 41: `glass p-6` → `card-flush overflow-hidden` + border-top (wraps a data list)
**tab-repayment-history.tsx** lines 42, 67, 72: `glass p-6` → `card p-6`, `glass p-4` → `card p-4`
**tab-activity-log.tsx** lines 36, 65: `glass p-6` → `card p-6`

**tab-activity-log.tsx line 71 — timeline dot:**
```tsx
// Before:
border-2 border-blue-400 bg-slate-900

// After:
style={{ border: '2px solid var(--accent-primary)', backgroundColor: 'var(--bg-card)' }}
```

---

## 7. Loan Components

### 7.1 `apps/admin-portal/src/components/loans/application-review-drawer.tsx`

**Categories: K, L2, P**

**Lines 105, 128, 160 — content panels:** `glass p-4` → `card p-4`.

**Line 165 — scoring KPI:**
```tsx
// Before:
<p className="text-2xl font-bold text-white">{scoring.score}</p>

// After:
<p className="kpi-value">{scoring.score}</p>
```

**Line 164 — sub-label:** `text-white/40 text-xs` → `text-[color:var(--text-tertiary)] text-xs`

### 7.2 `apps/admin-portal/src/components/loans/tab-timeline.tsx`

**Categories: M7**

**Lines 21, 29 — timeline dot colors:**
```tsx
// Before:
created: 'border-blue-400 bg-blue-400',
settled: 'border-blue-400 bg-blue-400',

// After — use CSS variable inline:
created: '',  // apply via style={{ borderColor: 'var(--accent-primary)', backgroundColor: 'var(--accent-primary)' }}
settled: '',  // same
```

Or define a shared utility and reference it.

---

## 8. Platform Components

### 8.1 `apps/admin-portal/src/components/platform/tenant-create-wizard.tsx`

**Categories: K, M6**

**Lines 142, 276, 310:** `glass p-6` / `glass p-4` → `card p-6` / `card p-4`.

**Line 122 — active wizard step:**
```tsx
// Before:
'bg-blue-500/80 text-white border border-blue-400/50'

// After:
style={{ backgroundColor: 'var(--accent-primary)', color: 'white', border: '1px solid var(--accent-primary)' }}
```

---

### 8.2 `apps/admin-portal/src/components/platform/tenant-list-table.tsx`

**Categories: K**

**Lines 77, 85:** `glass p-8` → `card p-8`.

---

### 8.3 `apps/admin-portal/src/components/platform/tenant-detail-tabs.tsx`

**Categories: K, M4**

**Lines 135, 188, 192, 205, 218, 230:** `glass p-5` / `glass p-8` → `card p-5` / `card p-8`.

**Line 68 — tab indicator:**
```tsx
// Before:
'text-white border-blue-400'

// After:
'text-[color:var(--text-primary)] border-[color:var(--accent-primary)]'
```

---

### 8.4 `apps/admin-portal/src/components/platform/sp-management.tsx`

**Categories: K**

**Lines 94, 101, 129, 135:** `glass p-*` → `card p-*`. Line 135 with hover → `card-interactive p-4`.

---

## 9. Lender Components

### 9.1 `apps/admin-portal/src/components/lenders/lender-list.tsx`

**Categories: L1, K, M3, N, J**

**Lines 201, 211 — page H1:**
```tsx
// Before:
<h1 className="text-2xl font-bold text-white">{t('lenders.title')}</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">{t('lenders.title')}</h1>
```

**Line 203 — loading wrapper:** `glass p-12 text-center text-white/40` → `card p-12 text-center text-sm text-[color:var(--text-secondary)]`

**Line 212 — button:** `glass-button-primary` → `btn-primary`

**Line 240 — modal wrapper:** `glass p-6 rounded-xl max-w-md w-full mx-4 border border-white/10` → `card-elevated p-6 max-w-md w-full mx-4`

**Line 154 — blue badge:**
```tsx
// Before:
bg-blue-500/20 text-blue-400 border border-blue-500/30

// After:
bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border border-[color:var(--accent-primary-soft)]
```

---

## 10. Dashboard Components

### 10.1 `apps/admin-portal/src/components/dashboard/alerts-panel.tsx`

**Categories: K, M3**

**Lines 40, 48:** `glass p-6` / `glass p-5` → `card p-6` / `card p-5`.

**Line 32 — info badge:**
```tsx
// Before:
badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',

// After:
badge: 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border-[color:var(--accent-primary-soft)]',
```

---

### 10.2 `apps/admin-portal/src/components/dashboard/trend-chart.tsx`

**Categories: K**

**Line 122:** `glass p-5` → `card p-5`.

---

## 11. Platform Portal Pages — Glass and Color Refs

### 11.1 `apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx`

**Categories: K, L2, P**

This file has the most `glass p-*` instances (15) of any platform portal page.

**Lines 70, 121, 290, 336, 504, 546, 587 — content panels:** `glass p-6` → `card p-6`
**Lines 437, 446, 455, 464, 473, 482 — KPI cards:** `glass p-5 text-center` → individual cells in a `gap-px` divider pattern

**Lines 442, 451, 469, 478, 487 — KPI values:**
```tsx
// Before:
<p className="text-2xl font-bold text-white">

// After:
<p className="kpi-value">
```

**Line 374 — interactive card:** `glass p-6 hover:bg-white/10 transition-all duration-200 cursor-pointer` → `card-interactive p-6`

**Line 610 — empty state:** `glass p-6 text-center text-white/30` → `card p-6 text-center text-sm text-[color:var(--text-tertiary)]`

**Lines 510, 516, 522, 528, 553, 559, 565, 573, 577 — sub-labels:** `text-xs text-white/40` → `text-xs text-[color:var(--text-tertiary)]`

---

### 11.2 `apps/platform-portal/src/app/(portal)/tenants/create/page.tsx`

**Categories: K, M6**

**Lines 276, 423, 478, 522, 540, 563, 585, 600, 618, 630:** `glass p-*` → `card p-*`

**Line 260 — wizard step indicator:**
```tsx
// Before:
'bg-blue-500/80 text-white border border-blue-400/50'

// After:
style={{ backgroundColor: 'var(--accent-primary)', color: 'white', border: '1px solid var(--accent-primary)' }}
```

---

### 11.3 `apps/platform-portal/src/app/(portal)/analytics/scoring/page.tsx`

**Categories: K**

**Lines 229, 240, 253, 265:** `glass p-5` → `card p-5`.

---

### 11.4 `apps/platform-portal/src/app/(portal)/system/page.tsx`

**Categories: K**

**Line 76:** `glass p-6` → `card p-6`.

---

### 11.5 `apps/platform-portal/src/app/(portal)/compliance/page.tsx`

**Categories: K, M1, M3**

**Lines 301, 391, 429:** `glass p-*` → `card p-*`
**Line 330:** `glass p-4 ... hover:bg-white/5` → `card-interactive p-4`

**Lines 266, 341 — blue links:**
```tsx
// Before:
text-blue-400 hover:text-blue-300

// After:
text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)]
```

**Line 430 — blue icon:**
```tsx
// Before:
<Building2 className="w-5 h-5 text-blue-400 flex-shrink-0" />

// After:
<Building2 className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
```

---

### 11.6 `apps/platform-portal/src/app/(portal)/feedback/page.tsx`

**Categories: K, M3**

**Lines 401, 482, 572, 715, 745:** `glass p-*` → `card p-*`

**Line 179 — suggestion badge:**
```tsx
// Before:
SUGGESTION: 'bg-blue-500/20 text-blue-400 border-blue-500/30',

// After:
SUGGESTION: 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border-[color:var(--accent-primary-soft)]',
```

---

### 11.7 `apps/platform-portal/src/app/(portal)/messages/page.tsx`

**Categories: K, M2, M3**

**Lines 401, 447, 599:** `glass p-*` → `card p-*`

**Line 147 — normal badge:** Blue → coral (same as 11.6).

**Line 487 — mail icon:**
```tsx
// Before:
<Mail className="w-4 h-4 text-blue-400" />

// After:
<Mail className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
```

---

### 11.8 `apps/platform-portal/src/app/(portal)/screening/page.tsx`

**Categories: K, M3, M4, M8**

**Line 441:** `glass p-6` → `card-elevated p-6`

**Lines 368, 378 — tab indicators:**
```tsx
// Before:
'bg-white/10 text-white border-b-2 border-blue-400'

// After:
'bg-[color:var(--bg-muted)] text-[color:var(--text-primary)] border-b-2 border-[color:var(--accent-primary)]'
```

**Line 468 — textarea focus:**
```tsx
// Before:
focus:border-blue-400/50

// After:
focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-primary-ring)]
```

**Line 487 — action button:**
```tsx
// Before:
bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30

// After:
btn-primary text-sm
```
(Or use the coral accent pattern: `bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] hover:bg-[color:var(--accent-primary-soft)] border border-[color:var(--accent-primary-soft)]`)

---

### 11.9 Platform Portal Settings Pages

**settings/profile/page.tsx** — lines 142, 212, 272: `glass p-6` → `card p-6`
**settings/profile/page.tsx** — line 144: blue avatar → coral avatar (Category M5)
**settings/defaults/page.tsx** — lines 72, 140: `glass p-6` → `card p-6`
**settings/defaults/page.tsx** — lines 75, 142: blue icons → coral (Category M2)
**settings/api-keys/page.tsx** — line 16: `glass p-6` → `card p-6`; line 18: blue icon → coral
**settings/platform/page.tsx** — lines 17, 42: `glass p-6` → `card p-6`; lines 19, 44: blue icons → coral
**settings/audit-log/page.tsx** — line 212: `glass p-6` → `card p-6`

**settings/audit-log/page.tsx** — lines 264, 271: blue pagination links → coral (Category M1)
**settings/audit-log/page.tsx** — line 324: blue "update" badge → coral (Category M3)

**settings/users/page.tsx** — line 330: blue link → coral (Category M1)

---

## 12. Admin Portal Pages — Remaining Glass Wrappers

### 12.1 `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx`

**Lines 180, 226, 251, 312:** `glass p-5` → `card p-5`

**Line 217 — blue action button:**
```tsx
// Before:
text-blue-400 bg-blue-500/10 hover:bg-blue-500/20

// After:
text-[color:var(--accent-primary-deep)] bg-[color:var(--accent-primary-soft)] hover:opacity-80
```

---

### 12.2 `apps/admin-portal/src/app/(portal)/lenders/[id]/page.tsx`

**Lines 90, 101, 160, 181, 203, 222, 243, 256:** `glass p-*` → `card p-*`

**Lines 87, 98 — blue back buttons:**
```tsx
// Before:
text-sm text-blue-400 hover:underline flex items-center gap-1

// After:
text-sm text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] hover:underline flex items-center gap-1
```

---

### 12.3 `apps/admin-portal/src/app/(portal)/loans/applications/page.tsx`

**Lines 166, 205, 239:** `glass p-4` → `card p-4`

---

### 12.4 `apps/admin-portal/src/app/(portal)/customers/[id]/page.tsx`

**Lines 154, 158, 198, 298, 508, 557, 615:** `glass p-6` → `card p-6`

**Line 500 — tab indicator:**
```tsx
// Before:
tab === item.key ? 'border-blue-400 text-blue-400' : 'border-transparent text-white/40 hover:text-white/60'

// After:
tab === item.key
  ? 'border-[color:var(--accent-primary)] text-[color:var(--accent-primary-deep)]'
  : 'border-transparent text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]'
```

**Lines 184, 210 — blue references:** `text-blue-400` / `bg-blue-500/20 text-blue-400` → coral equivalents.

---

### 12.5 `apps/admin-portal/src/app/(portal)/settings/tenant/page.tsx`

**Lines 221, 273, 335, 358, 381, 430:** `glass p-6` → `card p-6`

---

### 12.6 `apps/admin-portal/src/app/(portal)/settings/profile/page.tsx`

**Lines 132, 214, 274:** `glass p-6` → `card p-6`

**Line 134 — blue avatar:** Same as platform portal (Category M5).

**Line 135 — blue icon:** `text-blue-400` → `style={{ color: 'var(--accent-primary)' }}`.

---

### 12.7 `apps/admin-portal/src/app/(portal)/settings/audit-log/page.tsx`

**Line 148:** `glass p-6` → `card p-6`

**Lines 194, 201 — blue pagination links:** → coral (Category M1).

**Line 261 — blue "update" badge:** → coral (Category M3).

---

### 12.8 `apps/admin-portal/src/app/(portal)/settings/users/page.tsx`

**Line 293 — blue link:** → coral (Category M1).

---

### 12.9 `apps/admin-portal/src/app/(portal)/messages/page.tsx`

**Lines 348, 394, 546, 581:** `glass p-*` → `card p-*`

**Line 110 — normal badge:** Blue → coral (Category M3).

**Line 434 — mail icon:** Blue → coral (Category M2).

---

### 12.10 `apps/admin-portal/src/app/(portal)/platform/feedback/page.tsx`

**Lines 289, 447, 481:** `glass p-*` → `card p-*`

**Line 109 — suggestion badge:** Blue → coral (Category M3).

---

### 12.11 `apps/admin-portal/src/app/(portal)/platform/tenants/page.tsx`

**Line 122:** `glass p-4` → `card p-4`.

---

### 12.12 `apps/admin-portal/src/app/(portal)/platform/tenants/[id]/page.tsx`

**Lines 178, 199, 209:** `glass p-*` → `card p-*`.

---

### 12.13 `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx`

**Line 109:** `glass p-6 max-w-md w-full mx-4` → `card-elevated p-6 max-w-md w-full mx-4`.

---

### 12.14 `apps/admin-portal/src/app/(portal)/reports/[type]/page.tsx`

**Line 38:** `glass p-6 text-center` → `card p-6 text-center`.

---

### 12.15 `apps/admin-portal/src/app/(portal)/debug/page.tsx`

**Lines 352, 517:** `glass p-4` → `card p-4`.

Note: Keep the blue HTTP method colors in the debug page (GET=blue, etc.) — these are conventional color codings.

---

### 12.16 `apps/admin-portal/src/app/(portal)/platform/layout.tsx`

**Line 19:** `glass p-8` → `card p-8`.

---

## 13. Blue-to-Coral Accent Migration

This section lists EVERY remaining `text-blue-400` instance NOT already covered in sections 2–12 above. If a file is listed in both a previous section and here, apply the change when modifying the file — do not open the file twice.

### Already covered above:
All `text-blue-400` instances are covered in the relevant file sections above. Cross-reference:

- `products/new/page.tsx:13` → Section 2.1
- `products/[id]/edit/page.tsx:111` → Section 2.2
- `wizard-progress.tsx:49,66` → Section 5.3
- `step-funding-source.tsx:145` → Section 5.4
- `step-review.tsx:169` → Section 5.5
- `step-approval.tsx:46` → Section 5.6
- `action-drawer.tsx:197` → Section 4.1
- `alerts-panel.tsx:32` → Section 10.1
- `lender-list.tsx:154` → Section 9.1
- `customer-acquisition-report.tsx:87` → Section 3.4 (via L2)
- `screening/page.tsx:83` (admin) → leave as-is (badge map)
- `screening/[id]/page.tsx:74,217` → Section 12.1
- `messages/page.tsx:110,434` (admin) → Section 12.9
- `messages/page.tsx:147,487` (platform) → Section 11.7
- `settings/users/page.tsx:293` (admin) → Section 12.8
- `settings/users/page.tsx:330` (platform) → Section 11.9
- `settings/profile/page.tsx:135` (admin) → Section 12.6
- `settings/profile/page.tsx:145` (platform) → Section 11.9
- `settings/audit-log/page.tsx:194,201,261` (admin) → Section 12.7
- `settings/audit-log/page.tsx:264,271,324` (platform) → Section 11.9
- `platform/feedback/page.tsx:109` (admin) → Section 12.10
- `feedback/page.tsx:179` (platform) → Section 11.6
- `compliance/page.tsx:266,341,430` → Section 11.5
- `customers/[id]/page.tsx:184,210,500` → Section 12.4
- `lenders/[id]/page.tsx:87,98` → Section 12.2
- `screening/page.tsx:487` (platform) → Section 11.8
- `settings/platform/page.tsx:19,44` → Section 11.9
- `settings/api-keys/page.tsx:18` → Section 11.9
- `settings/defaults/page.tsx:75,142` → Section 11.9
- `step-notifications.tsx:221` → `text-blue-400/70` → replace with `text-[color:var(--accent-primary-deep)] opacity-70`

### Exception files (DO NOT change blue):
- `debug/page.tsx:162,195,323,363` — HTTP method color coding
- `settings/integrations/page.tsx:189,227` — Light-mode integration provider UI

---

## 14. Verification Checklist

After completing ALL changes, run these commands:

### 1. No remaining `text-2xl font-bold` (except debug page if justified)
```bash
grep -rn "text-2xl font-bold" apps/admin-portal/src apps/platform-portal/src --include="*.tsx"
```
**Expected:** Zero results.

### 2. No remaining `glass p-` in components or pages
```bash
grep -rn '"glass p-' apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "node_modules"
```
**Expected:** Zero results. (Note: `glass-input`, `glass-button`, `glass-button-primary` are acceptable — those don't match `"glass p-"`.)

### 3. No remaining `text-blue-400` (except debug + integrations exceptions)
```bash
grep -rn "text-blue-400" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | grep -v "settings/integrations"
```
**Expected:** Zero results.

### 4. No remaining `border-blue-` (except debug + integrations exceptions)
```bash
grep -rn "border-blue-" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | grep -v "settings/integrations"
```
**Expected:** Zero results.

### 5. No remaining `bg-gray-100`
```bash
grep -rn "bg-gray-100" apps/admin-portal/src apps/platform-portal/src --include="*.tsx"
```
**Expected:** Zero results.

### 6. `card` class adoption (confirm glass replacements)
```bash
grep -rn '"card ' apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | wc -l
```
**Expected:** Significantly more than before (was ~5).

### 7. `kpi-value` adoption in report components
```bash
grep -rn "kpi-value" apps/admin-portal/src/components/reports --include="*.tsx"
```
**Expected:** Multiple matches across all 7 report files.

### 8. No remaining `bg-blue-500/20` (except debug + integrations exceptions)
```bash
grep -rn "bg-blue-500" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | grep -v "settings/integrations"
```
**Expected:** Zero results.

---

## What NOT to Change

- **Do NOT modify `globals.css`** — the token layer is complete.
- **Do NOT modify `dashboard/page.tsx`** in either portal — already done.
- **Do NOT modify `sidebar.tsx`** — already overhauled.
- **Do NOT modify `metric-card.tsx`** — already overhauled.
- **Do NOT change `glass-input` or `glass-button`** — acceptable form element classes.
- **Do NOT change blue colors in `debug/page.tsx`** — HTTP method color coding is conventional.
- **Do NOT change blue colors in `settings/integrations/page.tsx`** — light-mode integration UI.
- **Do NOT introduce new npm dependencies.**
- **Do NOT change the font (SF Pro) or color palette (coral).**
- **Do NOT change GraphQL queries, data logic, or routing.**
- **`font-mono` on IDs/codes is correct** — only financial numbers should use `tabular-nums`.
