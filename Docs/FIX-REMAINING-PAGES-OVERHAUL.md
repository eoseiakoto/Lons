# FIX: Propagate Visual Overhaul to All Remaining Pages

**Context:** The anti-AI-slop overhaul (OVERHAUL-ANTI-AI-SLOP.md) was successfully applied to the design token layer (`globals.css`) and both dashboard pages. However, ~50 remaining pages across both portals still use pre-overhaul patterns. This document specifies every change needed to bring them in line.

**Scope:** Visual layer only. Do NOT change GraphQL queries, data logic, routing, or business logic.

**Rule:** Do NOT truncate, skip, or use placeholders like `// ...rest of component`. Every file listed must be modified completely.

---

## Table of Contents

1. [Change Categories](#1-change-categories)
2. [Admin Portal — Pages (Full Old Pattern)](#2-admin-portal--pages-full-old-pattern)
3. [Admin Portal — Pages (Partially Updated)](#3-admin-portal--pages-partially-updated)
4. [Admin Portal — Components](#4-admin-portal--components)
5. [Platform Portal — Pages (Full Old Pattern)](#5-platform-portal--pages-full-old-pattern)
6. [Platform Portal — Pages (Partially Updated)](#6-platform-portal--pages-partially-updated)
7. [Platform Portal — Components](#7-platform-portal--components)
8. [Cross-Portal Pattern Reference](#8-cross-portal-pattern-reference)
9. [Verification Checklist](#9-verification-checklist)

---

## 1. Change Categories

Every page needs some combination of these changes. Each category has an exact before/after pattern.

### Category A: Page Container — Add `animate-enter`

**Currently only 2 of 56 pages have `animate-enter`.** Every page's outermost content `<div>` must include it.

**Before (various patterns):**
```tsx
<div>
<div className="space-y-8">
<div className="space-y-6">
<div className="p-6">
```

**After — add `animate-enter` and ensure `space-y-8` or appropriate spacing:**
```tsx
<div className="space-y-8 animate-enter">
```

If the page already has `space-y-{N}`, just append `animate-enter`. If it has no className at all, add `className="animate-enter"`. Do NOT change the spacing value if one already exists — only add `animate-enter`.

**Exception:** The `login/page.tsx` and root `page.tsx` (redirect pages) do NOT need `animate-enter`.

---

### Category B: Page Title (H1) — Replace Old Header Pattern

**Before (old pattern — 70 instances across both portals):**
```tsx
<h1 className="text-lg font-semibold text-white/80 mb-6">
<h1 className="text-lg font-semibold text-white/80">
<h1 className="text-lg font-semibold text-white mb-2">
<h1 className="text-lg font-semibold text-white/80 mb-4">
```

**After — use the new page header pattern:**

For **top-level page titles** (the main H1 on each page):
```tsx
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
```

Add a subtitle line below the H1 where it makes sense (copy the pattern from dashboard):
```tsx
<p className="text-[15px] text-[color:var(--text-secondary)] mt-2">
  {subtitle text here}
</p>
```

For **section sub-headers** (H2 within a page, e.g., "Collections Queue", detail panel sections):
```tsx
<h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
```

For **card/panel sub-headers** (H3 within cards or wizard steps):
```tsx
<h3 className="text-[18px] font-semibold text-[color:var(--text-primary)]">
```

**Important:** Remove any `mb-6`, `mb-4`, `mb-2` from the H1 itself. Instead, wrap the header in a `<header>` element and let the parent's `space-y-8` handle vertical rhythm:
```tsx
<header>
  <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
    {title}
  </h1>
  <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">
    {subtitle}
  </p>
</header>
```

If the page has a header row with a button (e.g., Products page has "Create Product" button next to the title), use `flex items-center justify-between` on the header wrapper:
```tsx
<header className="flex items-center justify-between">
  <div>
    <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
      {title}
    </h1>
    <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">
      {subtitle}
    </p>
  </div>
  <button className="btn-primary text-sm">{action}</button>
</header>
```

---

### Category C: Glass Table Wrappers — Replace with `card-flush`

**Before (all list/table pages):**
```tsx
<div className="glass overflow-hidden">
  <DataTable ... />
</div>
```

or:
```tsx
<div className="glass p-6">
  <h2 ...>Section Title</h2>
  <table ...>...</table>
</div>
```

**After — use `card-flush` with border-top separator:**
```tsx
<div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
  <DataTable ... />
</div>
```

For sections that have a heading + table together inside a `glass p-6` wrapper, split them apart:
```tsx
<section>
  <div className="flex items-baseline justify-between mb-4">
    <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
      {title}
    </h2>
    {/* any count/action on the right */}
  </div>
  <div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
    <DataTable ... />
  </div>
</section>
```

For inline `<table>` elements (not using `<DataTable>`), add the `.table-clean` class to the `<table>`:
```tsx
<table className="table-clean w-full text-sm">
```

And replace any `text-white/40` on `<th>` elements with:
```tsx
<th className="pb-3 pr-4 text-[13px] font-medium text-[color:var(--text-secondary)]">
```

And replace `border-white/10` and `border-white/5` on table rows with:
```tsx
style={{ borderBottom: '1px solid var(--border-subtle)' }}
```

And replace `hover:bg-white/5` on interactive rows with:
```tsx
className="hover:bg-[color:var(--bg-muted)] cursor-pointer transition-colors"
```

---

### Category D: Equal-Column Metric Grids — Break into Asymmetric Layout

**Before (collections page and similar):**
```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
  <MetricCard title="Overdue" value={...} />
  <MetricCard title="Delinquent" value={...} />
  <MetricCard title="Default" value={...} />
  <MetricCard title="Total Actions" value={...} />
</div>
```

**After — use `gap-px` divider pattern (same as dashboard collections section):**
```tsx
<section className="stagger-children grid grid-cols-1 md:grid-cols-4 gap-px mb-8"
  style={{ backgroundColor: 'var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
>
  {[
    { label: t('collections.overdue'), value: metrics?.overdueCount ?? 0, Icon: Clock },
    { label: t('collections.delinquent'), value: metrics?.delinquentCount ?? 0, Icon: AlertTriangle },
    { label: t('collections.default'), value: metrics?.defaultCount ?? 0, Icon: ShieldAlert },
    { label: t('collections.totalActions'), value: metrics?.totalActions ?? 0, Icon: Activity },
  ].map(({ label, value, Icon }) => (
    <div key={label} className="p-6" style={{ backgroundColor: 'var(--bg-card)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[color:var(--text-tertiary)]" />
        <span className="text-[13px] font-medium text-[color:var(--text-secondary)]">{label}</span>
      </div>
      <p className="kpi-value">{value}</p>
    </div>
  ))}
</section>
```

**For 3-column metric grids** (`grid-cols-3`), use the same `gap-px` pattern with `md:grid-cols-3`.

**For pages where MetricCard component is already used:** If the page uses `<MetricCard>` components in an equal grid, either:
- Option 1: Switch to the inline `gap-px` divider pattern (preferred for 3+ metrics in a row)
- Option 2: Make the first MetricCard `variant="hero"` and the rest standard, using `grid-cols-12` with asymmetric splits (`col-span-5` / `col-span-7` or similar)

**When NOT to change the grid:** `grid-cols-2` for settings cards (like the settings index pages) is fine — those are navigation cards, not KPI metrics. Leave `grid-cols-2` settings layouts alone.

---

### Category E: Uppercase Tracking Section Labels — Replace with Sentence Case

**Before (90 instances across both portals):**
```tsx
<p className="text-xs font-medium uppercase tracking-[0.05em] text-[color:var(--text-secondary)]">
<span className="text-xs uppercase tracking-[0.08em] text-white/40">
<h3 className="text-xs uppercase tracking-wider text-white/40 mb-4">
```

**After — use sentence-case `section-label` class or inline equivalent:**
```tsx
<p className="section-label">
```

The `.section-label` class is already defined in `globals.css` as:
```css
.section-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  /* NOT uppercase, NOT tracking-wide */
}
```

If additional styling is needed (like `mb-4`), add it alongside:
```tsx
<p className="section-label mb-4">
```

**Exception:** The sidebar's "Platform" nav group label (`text-[10px] uppercase tracking-[0.08em]`) is acceptable — nav group dividers in sidebars conventionally use small caps. Do NOT change sidebar.tsx.

**Exception:** `<StatusBadge>` internally uses `uppercase` for its tiny badge text — that's fine for badges. Do NOT change status-badge.tsx.

---

### Category F: `tabular-nums` on Financial Numbers

**Every element that displays a monetary amount, percentage, count, or date should use `tabular-nums` for proper column alignment.**

**Pattern — for inline formatted numbers:**
```tsx
// Before:
<span className="text-white/80 font-mono">
  {formatMoney(amount, currency)}
</span>

// After:
<span className="text-[color:var(--text-primary)] tabular-nums">
  {formatMoney(amount, currency)}
</span>
```

**Pattern — for table cells with financial data:**
```tsx
// Before:
<td className="py-3 pr-4 text-right text-white/80 font-mono">

// After:
<td className="py-3 pr-4 text-right text-[color:var(--text-primary)] tabular-nums">
```

**Note:** `font-mono` is appropriate for UUIDs, contract numbers, reference codes, and technical identifiers. It should NOT be used for monetary amounts or percentages — use `tabular-nums` instead. Keep `font-mono` on ID/code displays but switch financial numbers to `tabular-nums`.

---

### Category G: `stagger-children` on Grid Groups

**Any grid of cards, metrics, or visually grouped items should use `stagger-children` for entry animation.**

```tsx
// Before:
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">

// After:
<div className="stagger-children grid grid-cols-1 md:grid-cols-3 gap-4">
```

This only needs to be added to the FIRST grid/card group on each page, not every list. Apply to:
- Metric card grids
- Settings card grids
- Feature card grids
- Report section grids

Do NOT add to:
- DataTable wrappers (tables have their own row structure)
- Form field layouts
- Nav lists

---

### Category H: Loading States — Replace Old Pattern

**Before:**
```tsx
<div className="text-white/40">{t('common.loading')}</div>
```

**After:**
```tsx
<div className="text-sm text-[color:var(--text-secondary)]">{t('common.loading')}</div>
```

Where a page has multiple loading sections (like the dashboard), use `<SkeletonCard />` components instead. For simple list pages, the text-based loading indicator is acceptable with the updated styling above.

---

### Category I: Hardcoded Color References in Inline Elements

**Before (various inline elements):**
```tsx
className="text-white/80"     → className="text-[color:var(--text-primary)]"
className="text-white/60"     → className="text-[color:var(--text-secondary)]"
className="text-white/40"     → className="text-[color:var(--text-tertiary)]"
className="text-white/30"     → className="text-[color:var(--text-tertiary)]"
className="text-white"        → className="text-[color:var(--text-primary)]"
className="border-white/10"   → style={{ borderColor: 'var(--border-subtle)' }}
className="border-white/5"    → style={{ borderColor: 'var(--border-subtle)' }}
className="hover:bg-white/5"  → className="hover:bg-[color:var(--bg-muted)]"
className="bg-white/5"        → style={{ backgroundColor: 'var(--bg-muted)' }}
className="bg-white/10"       → style={{ backgroundColor: 'var(--bg-elevated)' }}
```

**Note:** The CSS remaps in `globals.css` (lines 633–673) handle many of these at the CSS level, so they render correctly in both themes. However, the source code should use semantic tokens directly for maintainability. When modifying a file for other reasons (Categories A–H above), also convert these hardcoded color references in that same file. Do NOT open files solely to fix color refs — only fix them when the file is already being modified for another category.

---

### Category J: `glass-button-primary` → `btn-primary`

**Before:**
```tsx
<button className="glass-button-primary text-sm">
```

**After:**
```tsx
<button className="btn-primary text-sm">
```

The `btn-primary` class is already defined in `globals.css`. The `glass-button-primary` is a legacy compat shim. When modifying a file for other categories, also swap any `glass-button-primary` to `btn-primary` in that file.

---

## 2. Admin Portal — Pages (Full Old Pattern)

These pages use the pre-overhaul pattern throughout and need all applicable categories applied.

---

### 2.1 `apps/admin-portal/src/app/(portal)/customers/page.tsx`

**Categories: A, B, C, H, I**

**Line 32 — outer div:** Add `animate-enter`
```tsx
// Before:
<div>

// After:
<div className="space-y-8 animate-enter">
```

**Line 33 — page title H1:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80 mb-6">{t('customers.title')}</h1>

// After (wrap in header, add subtitle):
<header>
  <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
    {t('customers.title')}
  </h1>
  <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">
    Browse and manage customer accounts.
  </p>
</header>
```

**Line 47 — loading state:**
```tsx
// Before:
<div className="text-white/40">{t('common.loading')}</div>

// After:
<div className="text-sm text-[color:var(--text-secondary)]">{t('common.loading')}</div>
```

**Line 48 — table wrapper:**
```tsx
// Before:
<div className="glass overflow-hidden">

// After:
<div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
```

---

### 2.2 `apps/admin-portal/src/app/(portal)/loans/contracts/page.tsx`

**Categories: A, B, C, H, I, F**

**Line 37 — outer div:** Add `animate-enter`
```tsx
// Before:
<div>

// After:
<div className="space-y-8 animate-enter">
```

**Line 38 — page title H1:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80 mb-6">{t('loans.contracts')}</h1>

// After:
<header>
  <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
    {t('loans.contracts')}
  </h1>
  <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">
    Active and closed loan contracts.
  </p>
</header>
```

**Line 51 — loading state:**
```tsx
// Before:
<div className="text-white/40">{t('common.loading')}</div>

// After:
<div className="text-sm text-[color:var(--text-secondary)]">{t('common.loading')}</div>
```

**Line 52 — table wrapper:**
```tsx
// Before:
<div className="glass overflow-hidden">

// After:
<div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
```

**Lines 56–57 — financial columns:** The `formatMoney` accessor outputs need `tabular-nums`. Since these are inside DataTable column accessors, wrap the output:
```tsx
// Before:
{ header: t('loans.principal'), accessor: (r: any) => formatMoney(r.principalAmount, r.currency) },
{ header: t('loans.outstanding'), accessor: (r: any) => formatMoney(r.totalOutstanding || '0', r.currency) },

// After:
{ header: t('loans.principal'), accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.principalAmount, r.currency)}</span> },
{ header: t('loans.outstanding'), accessor: (r: any) => <span className="tabular-nums">{formatMoney(r.totalOutstanding || '0', r.currency)}</span> },
```

---

### 2.3 `apps/admin-portal/src/app/(portal)/loans/applications/page.tsx`

**Categories: A, B, C, E, F, H, I**

**Outer div:** Add `animate-enter` (same pattern as 2.1).

**Line 156 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80">...</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
```
Wrap in `<header>` with subtitle.

**Line 314 — section header:**
```tsx
// Before:
<h2 className="text-lg font-semibold text-white/80 mb-6">...</h2>

// After:
<h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h2>
```
Remove `mb-6` — let `space-y-8` handle spacing.

**Lines 167, 206, 240 — uppercase tracking labels:**
Replace each `uppercase tracking-[0.05em]` with `section-label` class or remove uppercase/tracking and use:
```tsx
className="text-[13px] font-medium text-[color:var(--text-secondary)]"
```

**Financial number columns:** Wrap all `formatMoney()` outputs in `<span className="tabular-nums">`.

**Table wrappers:** Replace any `glass` wrapper with `card-flush overflow-hidden` + border-top.

**Loading state:** Update `text-white/40` to `text-sm text-[color:var(--text-secondary)]`.

---

### 2.4 `apps/admin-portal/src/app/(portal)/collections/page.tsx`

**Categories: A, B, C, D, E, F, G, H, I**

This is one of the most important pages — it's a high-traffic operational view.

**Line 142 — outer div:** Add `animate-enter`
```tsx
// Before:
<div>

// After:
<div className="space-y-8 animate-enter">
```

**Line 143 — page title H1:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80 mb-6">{t('collections.title')}</h1>

// After:
<header>
  <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
    {t('collections.title')}
  </h1>
  <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">
    Manage overdue contracts and recovery actions.
  </p>
</header>
```

**Line 144 — loading state:**
```tsx
// Before:
<div className="text-white/40">{t('common.loading')}</div>

// After:
<div className="text-sm text-[color:var(--text-secondary)]">{t('common.loading')}</div>
```

**Lines 146–151 — equal 4-column MetricCard grid (Category D):**
```tsx
// Before:
<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
  <MetricCard title={t('collections.overdue')} value={metrics?.overdueCount ?? 0} />
  <MetricCard title={t('collections.delinquent')} value={metrics?.delinquentCount ?? 0} />
  <MetricCard title={t('collections.default')} value={metrics?.defaultCount ?? 0} />
  <MetricCard title={t('collections.totalActions')} value={metrics?.totalActions ?? 0} />
</div>

// After — gap-px divider pattern with icons and stagger:
<section
  className="stagger-children grid grid-cols-1 md:grid-cols-4 gap-px"
  style={{ backgroundColor: 'var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
>
  {[
    { label: t('collections.overdue'), value: metrics?.overdueCount ?? 0, Icon: Clock },
    { label: t('collections.delinquent'), value: metrics?.delinquentCount ?? 0, Icon: AlertTriangle },
    { label: t('collections.default'), value: metrics?.defaultCount ?? 0, Icon: ShieldAlert },
    { label: t('collections.totalActions'), value: metrics?.totalActions ?? 0, Icon: Activity },
  ].map(({ label, value, Icon }) => (
    <div key={label} className="p-6" style={{ backgroundColor: 'var(--bg-card)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[color:var(--text-tertiary)]" />
        <span className="text-[13px] font-medium text-[color:var(--text-secondary)]">{label}</span>
      </div>
      <p className="kpi-value">{value}</p>
    </div>
  ))}
</section>
```

Add the required icon imports at top of file:
```tsx
import { Clock, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';
```

**Lines 153–218 — Collections Queue table section:**
```tsx
// Before:
<div className="glass p-6">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-semibold text-white/80">{t('collections.collectionsQueue')}</h2>
    ...
  </div>
  ...
  <table className="w-full text-sm">
    <thead>
      <tr className="text-left text-white/40 border-b border-white/10">
        <th className="pb-3 pr-4">...

// After — split heading from table, remove glass wrapper:
<section>
  <div className="flex items-baseline justify-between mb-4">
    <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
      {t('collections.collectionsQueue')}
    </h2>
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-[color:var(--text-tertiary)]">{t('common.sortBy')}</span>
      <select ... className="glass-input text-xs px-2 py-1">
        ...
      </select>
    </div>
  </div>

  <div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
    {queue.length === 0 ? (
      <p className="text-sm text-[color:var(--text-tertiary)] py-8 text-center">{t('collections.noContracts')}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="table-clean w-full text-sm">
          <thead>
            <tr className="text-left" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th className="pb-3 pr-4 text-[13px] font-medium text-[color:var(--text-secondary)]">...
```

**Table row styling (lines 186–213):**
```tsx
// Before:
<tr ... className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors">

// After:
<tr ... className="hover:bg-[color:var(--bg-muted)] cursor-pointer transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
```

**Table cell text colors:**
```tsx
// Before:
className="text-white/80 font-mono text-xs"     → keep font-mono for contract numbers (it's an ID)
className="text-white/80"                        → className="text-[color:var(--text-primary)]"
className="text-white/30 text-xs"                → className="text-[color:var(--text-tertiary)] text-xs"
className="text-white/60"                        → className="text-[color:var(--text-secondary)]"
className="text-white/40 text-xs"                → className="text-[color:var(--text-tertiary)] text-xs"
```

**Line 202 — financial amount cell:** Replace `font-mono` with `tabular-nums` (this is a monetary amount, not an ID):
```tsx
// Before:
<td className="py-3 pr-4 text-right text-white/80 font-mono">

// After:
<td className="py-3 pr-4 text-right text-[color:var(--text-primary)] tabular-nums">
```

---

### 2.5 `apps/admin-portal/src/app/(portal)/products/page.tsx`

**Categories: A, B, C, H, I, J**

**Line 40 — outer div:**
```tsx
// Before:
<div>

// After:
<div className="space-y-8 animate-enter">
```

**Lines 41–49 — header with button:**
```tsx
// Before:
<div className="flex items-center justify-between mb-6">
  <h1 className="text-lg font-semibold text-white/80">{t('products.title')}</h1>
  <button ... className="glass-button-primary text-sm">
    {t('products.createProduct')}
  </button>
</div>

// After:
<header className="flex items-center justify-between">
  <div>
    <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
      {t('products.title')}
    </h1>
    <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">
      Configure and manage loan products.
    </p>
  </div>
  <button onClick={() => router.push('/products/new')} className="btn-primary text-sm">
    {t('products.createProduct')}
  </button>
</header>
```

**Line 52 — loading state:**
```tsx
// Before:
<div className="text-white/40">{t('products.loadingProducts')}</div>

// After:
<div className="text-sm text-[color:var(--text-secondary)]">{t('products.loadingProducts')}</div>
```

**Line 54 — table wrapper:**
```tsx
// Before:
<div className="glass overflow-hidden">

// After:
<div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
```

---

### 2.6 `apps/admin-portal/src/app/(portal)/products/[id]/page.tsx`

**Categories: A, B, D, E, F, I**

**Outer div:** Add `animate-enter`.

**Line 84 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80 mb-4">...</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
```

**Line 85 — `grid-cols-3` metric grid:** Convert to `gap-px` divider pattern or asymmetric layout.

**Financial displays:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

---

### 2.7 `apps/admin-portal/src/app/(portal)/screening/page.tsx`

**Categories: A, B, C, H, I**

**Line 132 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80 mb-6">...</h1>

// After:
<header>
  <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
  <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">AML and watchlist screening results.</p>
</header>
```

**Table wrappers:** Replace `glass` with `card-flush` + border-top.

**Loading state:** Update `text-white/40` pattern.

---

### 2.8 `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx`

**Categories: A, B, D, E, I**

**Line 163 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/90">...</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
```

**Line 176 — `grid-cols-3`:** Convert to `gap-px` divider pattern.

**Lines 181, 227, 252, 265, 313 — uppercase tracking labels:** Replace with `section-label` class.

---

### 2.9 `apps/admin-portal/src/app/(portal)/customers/[id]/page.tsx`

**Categories: A, B, D, E, F, I**

**Line 299 — section header:**
```tsx
// Before:
<h2 className="text-lg font-semibold text-white mb-4">...</h2>

// After:
<h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h2>
```

**Lines 509, 559 — `grid-cols-3` grids:** Convert to `gap-px` divider pattern.

**Lines 143, 199, 558 — uppercase tracking labels:** Replace with `section-label` class.

**Financial displays (lines 562, 566, 593):** Wrap `formatMoney()` in `<span className="tabular-nums">`.

---

### 2.10 `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx`

**Categories: A, B, E, F, I**

**Line 110 — page header:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white mb-2">...</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
```

**Lines 145, 168, 194 — section sub-headers:**
```tsx
// Before:
<h2 className="text-lg font-semibold text-white/80 mb-4">...</h2>

// After:
<h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h2>
```

**Lines 148, 150, 151, 152, 178, 183, 187, 199, 200, 201, 202 — financial amounts:** Each `formatMoney()` call should be wrapped in `<span className="tabular-nums">`.

**Line 112 — contract number:** Keep `font-mono` — this is an ID, not a financial number.

---

### 2.11 `apps/admin-portal/src/app/(portal)/lenders/[id]/page.tsx`

**Categories: A, B, D, E, F, I**

**Outer div:** Add `animate-enter`.

**Line 158 — `grid-cols-3`:** Convert to `gap-px` divider pattern.

**Lines 161, 182, 204, 224, 244, 257 — uppercase tracking labels:** Replace all with `section-label` class.

**Financial displays (lines 166, 236, 237):** Wrap `formatMoney()` in `<span className="tabular-nums">`.

---

### 2.12 `apps/admin-portal/src/app/(portal)/messages/page.tsx`

**Categories: A, B, I**

**Lines 517, 575 — headers:**
```tsx
// Before:
text-lg font-semibold text-white

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```
(or `text-[22px]` if these are sub-section headers)

**Outer div:** Add `animate-enter`.

---

### 2.13 `apps/admin-portal/src/app/(portal)/settings/profile/page.tsx`

**Categories: A, B, I**

**Line 122 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80 mb-6">...</h1>

// After:
<header>
  <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
  <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">Update your personal information.</p>
</header>
```

**Outer div:** Add `animate-enter`.

---

### 2.14 `apps/admin-portal/src/app/(portal)/settings/users/page.tsx`

**Categories: A, B, I**

**Line 179 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80">...</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
```

**Outer div:** Add `animate-enter`.

---

### 2.15 `apps/admin-portal/src/app/(portal)/settings/tenant/page.tsx`

**Categories: A, B, E, I**

**Line 216 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80">...</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
```

**Lines 222, 274, 336, 359, 382, 431 — uppercase tracking labels:** Replace all with `section-label` class.

**Line 293 — `grid-cols-3`:** Acceptable here IF it's a settings form layout. Check: if it's a form field grid, leave it. If it's a metric/KPI grid, convert to asymmetric.

**Outer div:** Add `animate-enter`.

---

### 2.16 `apps/admin-portal/src/app/(portal)/settings/audit-log/page.tsx`

**Categories: A, B, I**

**Line 116 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80 mb-6">...</h1>

// After:
<header>
  <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
  <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">Track all user and system actions.</p>
</header>
```

**Outer div:** Add `animate-enter`.

---

### 2.17 `apps/admin-portal/src/app/(portal)/settings/integrations/page.tsx`

**Categories: A, B, I**

**Lines 176, 260 — section headers:**
```tsx
// Before:
<h2 className="text-lg font-semibold">...</h2>

// After:
<h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h2>
```

**Outer div:** Add `animate-enter`.

---

### 2.18 `apps/admin-portal/src/app/(portal)/platform/feedback/page.tsx`

**Categories: A, B, D, I**

**Line 202 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white mb-4">...</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
```

**Line 203 — `grid-cols-3`:** Convert to `gap-px` divider pattern.

**Outer div:** Add `animate-enter`.

---

### 2.19 `apps/admin-portal/src/app/(portal)/debug/page.tsx`

**Categories: A, B, E, I**

**Line 507 — page title:**
```tsx
// Before:
<h1 className="text-lg font-semibold text-white/80">...</h1>

// After:
<h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">...</h1>
```

**11 instances of uppercase tracking in table headers:** These are debug page table headers. Replace with:
```tsx
className="text-[13px] font-medium text-[color:var(--text-secondary)]"
```

**Outer div:** Add `animate-enter`.

**Note:** The debug page has 20 instances of `font-mono` — these are appropriate for the debug page (UUIDs, URLs, scores). Keep `font-mono` here.

---

## 3. Admin Portal — Pages (Partially Updated)

These pages were partially updated during the overhaul but still have specific gaps.

---

### 3.1 `apps/admin-portal/src/app/(portal)/reports/page.tsx`

**Categories: A, E, G**

**Already correct:** Page title uses `text-[28px]`, section headers use `text-[15px]`, financial numbers use `tabular-nums`, uses CSS variables for colors.

**Missing — outer div (line 35):** Add `animate-enter`
```tsx
// Before:
<div className="space-y-8">

// After:
<div className="space-y-8 animate-enter">
```

**Line 61 — LAST remaining uppercase tracking in admin-portal:**
```tsx
// Before:
<p className="text-xs font-medium uppercase tracking-[0.05em] text-[color:var(--text-secondary)] mt-1">

// After:
<p className="section-label mt-1">
```

**Line 49 — grid-cols-5:** This is a PAR metrics row with 5 items. Convert to `gap-px` divider pattern:
```tsx
// Before:
<div className="grid grid-cols-5 gap-4">

// After:
<div className="stagger-children grid grid-cols-5 gap-px"
  style={{ backgroundColor: 'var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
>
```

And each child item needs `style={{ backgroundColor: 'var(--bg-card)' }}` and padding (already has centered layout, so add `p-5` or `p-6`).

**Font weight fix:** Line 37 uses `font-bold` — change to `font-semibold` for consistency:
```tsx
// Before:
text-[28px] font-bold tracking-[-0.02em]

// After:
text-[28px] font-semibold tracking-[-0.02em]
```

Same for line 58: `text-[28px] font-bold` → `text-[28px] font-semibold`.

---

### 3.2 `apps/admin-portal/src/app/(portal)/settings/page.tsx`

**Categories: A, G**

**Already correct:** Uses `text-[28px]`, `card-interactive`, CSS variables, coral icon backgrounds.

**Missing — outer div (line 17):** Add `animate-enter`
```tsx
// Before:
<div className="space-y-8">

// After:
<div className="space-y-8 animate-enter">
```

**Line 27 — settings card grid:** Add `stagger-children`
```tsx
// Before:
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// After:
<div className="stagger-children grid grid-cols-1 md:grid-cols-2 gap-4">
```

**Font weight fix:** Line 19 uses `font-bold` — change to `font-semibold`.

---

### 3.3 `apps/admin-portal/src/app/(portal)/settings/lenders/page.tsx`

**Categories: A** (check if H1 is already updated)

Add `animate-enter` to outer div.

---

### 3.4 `apps/admin-portal/src/app/(portal)/settings/lenders/[id]/page.tsx`

**Categories: A** (check if H1 is already updated)

Add `animate-enter` to outer div.

---

### 3.5 `apps/admin-portal/src/app/(portal)/platform/tenants/page.tsx`

**Categories: A** — Add `animate-enter` to outer div.

---

### 3.6 `apps/admin-portal/src/app/(portal)/platform/tenants/[id]/page.tsx`

**Categories: A** — Add `animate-enter` to outer div.

---

### 3.7 `apps/admin-portal/src/app/(portal)/platform/tenants/create/page.tsx`

**Categories: A** — Add `animate-enter` to outer div.

---

### 3.8 `apps/admin-portal/src/app/(portal)/platform/integrations/page.tsx`

**Categories: A** — Add `animate-enter` to outer div.

---

## 4. Admin Portal — Components

These shared components are used across multiple pages. Fix them once and the changes propagate.

---

### 4.1 `apps/admin-portal/src/components/lenders/lender-list.tsx`

**Categories: B, I**

**Line 241 — header:**
```tsx
// Before:
text-lg font-semibold text-white mb-2

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

---

### 4.2 `apps/admin-portal/src/components/reports/report-layout.tsx`

**Categories: B**

**Line 38 — header:**
```tsx
// Before:
text-lg font-semibold text-white/80

// After:
text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```
(This is a report section header, not a page title, so use `text-[22px]` not `text-[28px]`.)

---

### 4.3 `apps/admin-portal/src/components/reports/revenue-report.tsx`

**Categories: E, F**

**4 uppercase tracking table headers:** Replace with `text-[13px] font-medium text-[color:var(--text-secondary)]`.

**Financial amounts (lines 193, 199, 303, 309, 315, 359, 365, 384, 392, 401, 410, 450):** Wrap each `formatMoney()` output in `<span className="tabular-nums">`.

---

### 4.4 Product Wizard Step Components

All wizard steps share the same header pattern. Fix each:

**`step-basic-info.tsx` line 41:**
```tsx
// Before:
<h2 className="text-lg font-semibold text-white/80">...</h2>

// After:
<h2 className="text-[18px] font-semibold text-[color:var(--text-primary)]">...</h2>
```

**Apply the same pattern to:**
- `step-fees.tsx` line 120
- `step-eligibility.tsx` line 54
- `step-approval.tsx` line 35
- `step-funding-source.tsx` lines 104, 290
- `step-financial-terms.tsx` line 52
- `step-notifications.tsx` line 206
- `step-review.tsx` line 71

**Uppercase tracking in wizard steps:**
- `step-review.tsx` line 15
- `step-eligibility.tsx` lines 60, 104
- `step-financial-terms.tsx` lines 58, 92, 124
- `step-approval.tsx` line 67
- `step-funding-source.tsx` lines 111, 171, 234

Replace all with `section-label` class.

---

### 4.5 `apps/admin-portal/src/components/collections/collections-dashboard.tsx`

**Categories: E, F**

**Line 74 — uppercase tracking:** Replace with `section-label`.

**Line 57 — financial amount:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

---

### 4.6 `apps/admin-portal/src/components/collections/action-drawer.tsx`

**Categories: E, F**

**3 uppercase tracking section headers (line 106, 129, 161):** Replace with `section-label`.

**Line 129 — financial amount:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

---

### 4.7 `apps/admin-portal/src/components/collections/collections-queue.tsx`

**Categories: F**

**Line 108 — financial amount:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

---

### 4.8 `apps/admin-portal/src/components/collections/ptp-tracker.tsx`

**Categories: F**

**Line 101 — financial amount:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

---

### 4.9 `apps/admin-portal/src/components/platform/tenant-create-wizard.tsx`

**Categories: B, E**

**Line 143 — header:**
```tsx
// Before:
text-lg font-semibold text-white/80 mb-1

// After:
text-[18px] font-semibold text-[color:var(--text-primary)]
```

**Lines 277, 311 — uppercase tracking:** Replace with `section-label`.

---

### 4.10 `apps/admin-portal/src/components/platform/tenant-list-table.tsx`

**Categories: E**

**Line 100 — uppercase tracking:** Replace with `text-[13px] font-medium text-[color:var(--text-secondary)]`.

---

### 4.11 Customer Tab Components

**`tab-profile.tsx` line 64 — uppercase tracking:** Replace with `section-label`.

**`tab-financial-profile.tsx` line 12 — uppercase tracking:** Replace with `section-label`.

**`tab-credit-summary.tsx` lines 247, 261, 279 — uppercase tracking:** Replace all with `section-label`.

**`tab-credit-summary.tsx` lines 199, 227 — financial amounts:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

**`tab-contracts.tsx` lines 69, 70 — financial amounts:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

**`tab-repayment-history.tsx` lines 74, 83 — financial amounts:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

---

### 4.12 Loan Components

**`application-review-drawer.tsx` lines 106, 129, 161 — uppercase tracking:** Replace with `section-label`.

**`application-review-drawer.tsx` line 133 — financial amount:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

**`tab-payment-history.tsx` lines 62, 70, 71, 72, 73 — financial amounts:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

**`tab-ledger.tsx` lines 67, 76, 85 — financial amounts:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

---

### 4.13 Report Components

All report components in `apps/admin-portal/src/components/reports/`:

**`reconciliation-report.tsx` line 95 — financial amount:** Wrap in `<span className="tabular-nums">`.

**`product-performance-report.tsx` lines 60, 61, 64, 66, 93 — financial amounts:** Wrap in `<span className="tabular-nums">`.

**`portfolio-quality-report.tsx` lines 90, 114, 126, 132 — financial amounts:** Wrap in `<span className="tabular-nums">`.

**`disbursement-report.tsx` lines 86, 87 — financial amounts:** Wrap in `<span className="tabular-nums">`.

**`repayment-report.tsx` lines 90, 91, 92, 93 — financial amounts:** Wrap in `<span className="tabular-nums">`.

**`collections-report.tsx` lines 115, 128 — financial amounts:** Wrap in `<span className="tabular-nums">`.

---

## 5. Platform Portal — Pages (Full Old Pattern)

---

### 5.1 `apps/platform-portal/src/app/(portal)/screening/page.tsx`

**Categories: A, B, D, E, I**

**Lines 331, 394, 413, 438 — headers:**
Replace all `text-lg font-semibold text-white` with appropriate size from the new scale.

**Line 338 — `grid-cols-4`:** Convert to `gap-px` divider pattern.

**Outer div:** Add `animate-enter`.

---

### 5.2 `apps/platform-portal/src/app/(portal)/compliance/page.tsx`

**Categories: A, B, D, E, I**

**Lines 281, 416 — headers:**
```tsx
// Before:
text-lg font-semibold text-white

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]   // for page H1
text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]   // for section H2
```

**Line 326 — `grid-cols-3`:** Convert to `gap-px` divider pattern.

**Outer div:** Add `animate-enter`.

---

### 5.3 `apps/platform-portal/src/app/(portal)/feedback/page.tsx`

**Categories: A, B, D, E, I**

**Lines 409, 450, 473, 670 — headers:** Replace with new scale.

**Line 410 — `grid-cols-3`:** Convert to `gap-px` divider pattern.

**Outer div:** Add `animate-enter`.

---

### 5.4 `apps/platform-portal/src/app/(portal)/analytics/scoring/page.tsx`

**Categories: A, D, I**

**Line 217 — `grid-cols-4`:** Convert to `gap-px` divider pattern.

**Outer div:** Add `animate-enter`.

---

### 5.5 `apps/platform-portal/src/app/(portal)/system/page.tsx`

**Categories: A, B, D, I**

**Line 66 — header:**
```tsx
// Before:
text-lg font-semibold text-white

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Line 74 — `grid-cols-3`:** Convert to `gap-px` divider pattern.

**Outer div:** Add `animate-enter`.

---

### 5.6 `apps/platform-portal/src/app/(portal)/messages/page.tsx`

**Categories: A, B, I**

**Lines 570, 628 — headers:** Replace with new scale.

**Outer div:** Add `animate-enter`.

---

### 5.7 `apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx`

**Categories: A, B, D, E, F, I**

**Lines 338, 387, 511, 554 — headers:** Replace with new scale.

**Lines 371, 508, 551 — `grid-cols-3/4` grids:** Convert to `gap-px` divider patterns.

**Lines 71, 122, 301, 305, 309, 324, 328, 440, 449, 458, 467, 476, 485, 505, 547, 588 — uppercase tracking:** Replace all with `section-label` class.

**Lines 461, 512, 518, 524, 530, 555, 598 — financial amounts:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

**Outer div:** Add `animate-enter`.

---

### 5.8 `apps/platform-portal/src/app/(portal)/tenants/[id]/customers/page.tsx`

**Categories: A, B, C, F, I**

**Line 78 — header:**
```tsx
// Before:
text-lg font-semibold text-white/80

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Table wrapper:** Replace `glass` with `card-flush` + border-top.

**Line 118 — financial amount:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

**Outer div:** Add `animate-enter`.

---

### 5.9 `apps/platform-portal/src/app/(portal)/tenants/[id]/products/page.tsx`

**Categories: A, B, C, I**

**Line 61 — header:**
```tsx
// Before:
text-lg font-semibold text-white/80

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Table wrapper:** Replace `glass` with `card-flush` + border-top.

**Outer div:** Add `animate-enter`.

---

### 5.10 `apps/platform-portal/src/app/(portal)/tenants/[id]/contracts/page.tsx`

**Categories: A, B, C, F, I**

**Line 71 — header:**
```tsx
// Before:
text-lg font-semibold text-white/80

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Table wrapper:** Replace `glass` with `card-flush` + border-top.

**Lines 96, 97 — financial amounts:** Wrap `formatMoney()` in `<span className="tabular-nums">`.

**Outer div:** Add `animate-enter`.

---

### 5.11 `apps/platform-portal/src/app/(portal)/tenants/create/page.tsx`

**Categories: A, B, E, I**

**Line 277 — header:**
```tsx
// Before:
text-lg font-semibold text-white/80 mb-1

// After:
text-[18px] font-semibold text-[color:var(--text-primary)]
```

**Lines 424, 479, 523, 541, 564, 586, 601, 619, 631 — uppercase tracking labels:** Replace all with `section-label` class.

**Lines 425, 480, 565 — `grid-cols-4`/`grid-cols-3`:** These are form field grids, so leave the column count — but ensure no `uppercase tracking` on their labels.

**Outer div:** Add `animate-enter`.

---

### 5.12 `apps/platform-portal/src/app/(portal)/settings/profile/page.tsx`

**Categories: A, B, I**

**Line 132 — page title:**
```tsx
// Before:
text-lg font-semibold text-white/80 mb-6

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Outer div:** Add `animate-enter`.

---

### 5.13 `apps/platform-portal/src/app/(portal)/settings/users/page.tsx`

**Categories: A, B, I**

**Line 181 — page title:**
```tsx
// Before:
text-lg font-semibold text-white/80

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Outer div:** Add `animate-enter`.

---

### 5.14 `apps/platform-portal/src/app/(portal)/settings/audit-log/page.tsx`

**Categories: A, B, I**

**Line 129 — page title:**
```tsx
// Before:
text-lg font-semibold text-white/80 mb-6

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Outer div:** Add `animate-enter`.

---

### 5.15 `apps/platform-portal/src/app/(portal)/settings/platform/page.tsx`

**Categories: A, B, E, I**

**Line 14 — page title:**
```tsx
// Before:
text-lg font-semibold text-white/80 mb-6

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Lines 24, 28, 32, 36, 49, 53, 57, 61 — uppercase tracking labels:** Replace all with `section-label` class.

**Outer div:** Add `animate-enter`.

---

### 5.16 `apps/platform-portal/src/app/(portal)/settings/api-keys/page.tsx`

**Categories: A, B, I**

**Line 14 — page title:**
```tsx
// Before:
text-lg font-semibold text-white/80 mb-6

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Outer div:** Add `animate-enter`.

---

### 5.17 `apps/platform-portal/src/app/(portal)/settings/defaults/page.tsx`

**Categories: A, B, E, I**

**Line 69 — page title:**
```tsx
// Before:
text-lg font-semibold text-white/80 mb-6

// After:
text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

**Lines 92, 102, 114 — uppercase tracking labels:** Replace with `section-label` class.

**Outer div:** Add `animate-enter`.

---

### 5.18 `apps/platform-portal/src/app/(portal)/tenants/page.tsx`

**Categories: A**

This page already uses `card-flush` (line 108). Add `animate-enter` to outer div.

---

## 6. Platform Portal — Pages (Partially Updated)

---

### 6.1 `apps/platform-portal/src/app/(portal)/settings/page.tsx`

**Categories: A, G**

**Already correct:** Uses `text-[28px]`, `card-interactive`, CSS variables.

**Missing — outer div (line 47):** Add `animate-enter`
```tsx
// Before:
<div className="space-y-8">

// After:
<div className="space-y-8 animate-enter">
```

**Line 57 — settings card grid:** Add `stagger-children`
```tsx
// Before:
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// After:
<div className="stagger-children grid grid-cols-1 md:grid-cols-2 gap-4">
```

**Font weight fix:** Line 49 uses `font-bold` — change to `font-semibold`.

---

### 6.2 `apps/platform-portal/src/app/(portal)/error.tsx`

**Categories: B**

**Line 25 — error header:**
```tsx
// Before:
text-lg font-semibold text-white/80

// After:
text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]
```

---

## 7. Platform Portal — Components

---

### 7.1 `apps/platform-portal/src/components/layout/header.tsx`

**Categories: E**

**Line 198 — uppercase tracking:** Check context — if this is a nav/header label, it may be acceptable. If it's a section label, replace with `section-label`.

---

## 8. Cross-Portal Pattern Reference

### Quick Reference — Before → After

| Pattern | Before | After |
|---------|--------|-------|
| Page H1 | `text-lg font-semibold text-white/80` | `text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]` |
| Section H2 | `text-lg font-semibold text-white/80` | `text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]` |
| Card/wizard H3 | `text-lg font-semibold text-white/80` | `text-[18px] font-semibold text-[color:var(--text-primary)]` |
| Section label | `text-xs uppercase tracking-[0.05em]` | `section-label` class |
| Table wrapper | `glass overflow-hidden` | `card-flush overflow-hidden` + `borderTop: '1px solid var(--border-subtle)'` |
| Financial numbers | `font-mono` | `tabular-nums` |
| Page container | `<div>` or `<div className="space-y-8">` | Add `animate-enter` |
| Card grids | `grid-cols-4 gap-4` | `gap-px` divider pattern or asymmetric `grid-cols-12` |
| Loading text | `text-white/40` | `text-sm text-[color:var(--text-secondary)]` |
| Primary button | `glass-button-primary` | `btn-primary` |
| Font weight (H1) | `font-bold` | `font-semibold` |

### Icon Imports for Metric Sections

When converting MetricCard grids to the inline `gap-px` divider pattern, you'll need icons. Use these from `lucide-react`:

| Metric Type | Icon |
|---|---|
| Overdue / Time | `Clock` |
| Delinquent / Warning | `AlertTriangle` |
| Default / Shield | `ShieldAlert` |
| Activity / Actions | `Activity` |
| Money / Financial | `DollarSign` |
| Trend / Risk | `TrendingDown` |
| Users / Count | `Users` |
| Check / Success | `CheckCircle` |
| Globe / Country | `Globe` |

---

## 9. Verification Checklist

After completing ALL changes, run these verification commands:

### 1. No remaining old H1 pattern
```bash
grep -rn "text-lg font-semibold" apps/admin-portal/src apps/platform-portal/src
```
**Expected:** Zero results.

### 2. `animate-enter` on all portal pages
```bash
grep -rn "animate-enter" apps/admin-portal/src/app apps/platform-portal/src/app --include="page.tsx"
```
**Expected:** Every `page.tsx` file except `page.tsx` (root redirect), `login/page.tsx`, and `debug/page.tsx` (optional).

### 3. No `glass` table wrappers (only glass-input is acceptable)
```bash
grep -rn '"glass ' apps/admin-portal/src/app apps/platform-portal/src/app --include="page.tsx"
grep -rn '"glass"' apps/admin-portal/src/app apps/platform-portal/src/app --include="page.tsx"
```
**Expected:** Zero results (or only `glass-input` / `glass-button` which are acceptable form elements).

### 4. No remaining uppercase tracking section labels
```bash
grep -rn "uppercase tracking" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "sidebar" | grep -v "status-badge" | grep -v "globals.css" | grep -v "node_modules"
```
**Expected:** Zero results (sidebar and status-badge are excluded exceptions).

### 5. `section-label` class adoption
```bash
grep -rn "section-label" apps/admin-portal/src apps/platform-portal/src --include="*.tsx"
```
**Expected:** Multiple results across both portals.

### 6. `tabular-nums` on financial displays
```bash
grep -rn "formatMoney" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "import" | grep -v "utils.ts"
```
Cross-reference with:
```bash
grep -rn "tabular-nums" apps/admin-portal/src apps/platform-portal/src --include="*.tsx"
```
**Expected:** Every file that uses `formatMoney()` also contains `tabular-nums`.

### 7. `stagger-children` adoption
```bash
grep -rn "stagger-children" apps/admin-portal/src apps/platform-portal/src --include="*.tsx"
```
**Expected:** At least one per portal beyond the dashboard.

### 8. No `font-bold` on page titles (should be `font-semibold`)
```bash
grep -rn "font-bold" apps/admin-portal/src/app apps/platform-portal/src/app --include="page.tsx" | grep "text-\[28px\]"
```
**Expected:** Zero results.

### 9. Equal-column metric grids eliminated
```bash
grep -rn "grid-cols-4 gap-4" apps/admin-portal/src/app apps/platform-portal/src/app --include="page.tsx"
```
**Expected:** Zero results (all converted to `gap-px` or asymmetric).

---

## What NOT to Change

- **Do NOT modify `dashboard/page.tsx`** in either portal — these are already done.
- **Do NOT change GraphQL queries, data logic, or routing.**
- **Do NOT modify `globals.css`** — the token layer is complete.
- **Do NOT change `sidebar.tsx`** — the nav is already overhauled.
- **Do NOT change `metric-card.tsx`** — the component is already overhauled.
- **Do NOT introduce new npm dependencies.**
- **Do NOT change the font (SF Pro) or color palette (coral).**
- **Do NOT add gradient text or colored side-stripe borders.**
- **`glass-input`** is acceptable for form inputs — do NOT replace it.
- **`font-mono`** on UUIDs, contract numbers, and technical IDs is correct — do NOT replace those with `tabular-nums`. Only replace `font-mono` on monetary amounts and percentages.
- **`login/page.tsx`** and root `page.tsx`** — these are auth/redirect pages, not portal pages. Skip them.
