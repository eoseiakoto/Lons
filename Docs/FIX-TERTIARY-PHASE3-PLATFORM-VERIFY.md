# FIX: Tertiary Overhaul — Phase 3: Platform Portal + Glass/KPI Fixes + Verification

**Context:** This is Phase 3 of 3 for the final CSS variable adoption pass. Phase 1 (admin pages) and Phase 2 (admin components) should be completed first. Phase 3 covers platform portal pages, remaining glass/kpi-value fixes, and the full verification checklist.

**Scope:** Visual layer only. Do NOT change GraphQL queries, data logic, routing, or business logic.

**Rule:** Do NOT truncate, skip, or use placeholders like `// ...rest of component`. Every file listed must be modified completely.

---

## Master Color Mapping Table

Use this table for **all** replacements in this document.

### Text Colors

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `text-white` (full opacity) | `text-[color:var(--text-primary)]` |
| `text-white/90` | `text-[color:var(--text-primary)]` |
| `text-white/80` | `text-[color:var(--text-primary)]` |
| `text-white/70` | `text-[color:var(--text-primary)]` |
| `text-white/60` | `text-[color:var(--text-secondary)]` |
| `text-white/50` | `text-[color:var(--text-secondary)]` |
| `text-white/40` | `text-[color:var(--text-tertiary)]` |
| `text-white/30` | `text-[color:var(--text-tertiary)]` |
| `text-white/20` | `text-[color:var(--text-tertiary)]` |
| `text-white/15` | `text-[color:var(--text-tertiary)]` |

### Background & Border Colors

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `bg-white/5` | `bg-[color:var(--bg-muted)]` |
| `bg-white/10` | `bg-[color:var(--bg-muted)]` |
| `bg-white/20` | `bg-[color:var(--bg-hover)]` |
| `border-white/10` | `border-[color:var(--border-subtle)]` |
| `border-white/20` | `border-[color:var(--border-default)]` |

### Status Colors — Text

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `text-emerald-400` / `text-green-400` / `text-green-500` | `text-[color:var(--status-success-text)]` |
| `text-red-400` / `text-red-300` / `text-red-600` | `text-[color:var(--status-error-text)]` |
| `text-yellow-400` / `text-orange-400` / `text-amber-400` | `text-[color:var(--status-warning-text)]` |
| `text-purple-400` | `text-[color:var(--status-info-text)]` |

### Status Colors — Compound Badge Patterns (replace as a unit)

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `bg-emerald-500/20 text-emerald-400 border-emerald-500/30` | `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]` |
| `bg-emerald-500/30 text-emerald-400 border border-emerald-500/30` | `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border border-[color:var(--status-success)]` |
| `bg-red-500/20 text-red-400 border-red-500/30` | `bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]` |
| `bg-red-500/20 text-red-300 border border-red-500/30` | `bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border border-[color:var(--status-error)]` |
| `bg-yellow-500/20 text-yellow-400 border-yellow-500/30` | `bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]` |
| `bg-orange-500/20 text-orange-400 border-orange-500/30` | `bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]` |
| `bg-green-500/20 text-green-400 border border-green-500/30` | `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border border-[color:var(--status-success)]` |
| `bg-purple-500/20 text-purple-400 border border-purple-500/30` | `bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border border-[color:var(--status-info)]` |

### Destructive Action Buttons

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `bg-red-500/20 border border-red-500/30 text-red-400 ... hover:bg-red-500/30` | `bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] ... hover:opacity-80` |
| `bg-red-600/30 border border-red-500/50 text-red-300 ... hover:bg-red-600/40` | `bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] ... hover:opacity-80` |

### Contextual Rules

- **Loading states** (`text-white/40` on "Loading...") → `text-[color:var(--text-secondary)]`
- **Form labels** / `labelCls`: `text-white/60` → `text-[color:var(--text-secondary)]`
- **Section headers** (`text-sm font-medium text-white/60 mb-3`) → `section-label` class
- **Close buttons** (`text-white/40 hover:text-white`) → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- **Required asterisks** (`text-red-400`) → `text-[color:var(--status-error-text)]`

---

## Platform Portal Pages — Line-by-Line Changes

### 1. `apps/platform-portal/src/app/(portal)/analytics/scoring/page.tsx`

**12 `text-white/` + 2 status color instances.**

- Lines 230, 241, 254, 266: section headers `text-white/60` → `section-label`
- Lines 232, 243, 256, 268, 285: loading/empty `text-white/40` → `text-[color:var(--text-secondary)]`
- Lines 236, 247, 260: no-data `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 276: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 279: `text-red-400` → `text-[color:var(--status-error-text)]`

### 2. `apps/platform-portal/src/app/(portal)/compliance/page.tsx`

**17 `text-white/` + 5 status color instances.**

**Status map (lines 62–65):**
- Line 62: `'text-emerald-400'` → `'text-[color:var(--status-success-text)]'`
- Line 63: `'text-white/50'` → `'text-[color:var(--text-secondary)]'`
- Line 64: `'text-red-400'` → `'text-[color:var(--status-error-text)]'`
- Line 65: `'text-white/30'` → `'text-[color:var(--text-tertiary)]'`

**Badge fallback (line 246):** `'text-white/60'` → `'text-[color:var(--text-secondary)]'`

**Tenant info (lines 226–229):** `text-white/30` → `text-[color:var(--text-tertiary)]`, `text-white/80` → `text-[color:var(--text-primary)]`
**Error count (line 238):** `text-red-400` → `text-[color:var(--status-error-text)]`
**Status message (line 301):** `glass p-3` → `card p-3`, `text-emerald-400` / `text-red-400` → vars
**Warning banner (line 309):** `glass border border-amber-500/30 bg-amber-500/10` → `card border border-[color:var(--status-warning)] bg-[color:var(--status-warning-soft)]`
**Detail panel (lines 316–465):** all `text-white/40` → `text-[color:var(--text-tertiary)]`, `text-white/30` → `text-[color:var(--text-tertiary)]`, close button `text-white/40 hover:text-white` → tertiary/primary

### 3. `apps/platform-portal/src/app/(portal)/error.tsx`

- Line 26: `text-white/40` → `text-[color:var(--text-secondary)]`

### 4. `apps/platform-portal/src/app/(portal)/feedback/page.tsx`

**39 `text-white/` + 7 status color instances.**

Mirrors admin feedback page. Same badge maps, same table patterns, same detail panel patterns. Apply identical rules:

**Badges (lines 176–187):** same compound mappings as admin feedback
**NPS grid (lines 458–504):** text-white/ opacity tiers → respective CSS vars
**Table (lines 578–637):** same patterns as admin — header, cells, empty states
**Detail panel (lines 674–764):** same label/value pattern
**Description (line 715):** `glass p-3` → `card p-3`
**Status message (line 401):** `glass p-3` → `card p-3`
**Table wrapper (line 578):** `glass overflow-x-auto` → `card-flush overflow-hidden`
**SLA response (lines 488–491):** `text-emerald-400` / `text-yellow-400` / `text-red-400` → respective status vars
**Error (line 573):** `text-red-400` → `text-[color:var(--status-error-text)]`

### 5. `apps/platform-portal/src/app/(portal)/messages/page.tsx`

**34 `text-white/` + 4 status color instances.**

Mirrors admin messages page. Apply identical rules. Key additions:

**Tenant picker dropdown (lines 694–727):**
- Line 694: `text-white/90` → `text-[color:var(--text-primary)]`
- Line 695: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 701, 713: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 704: `text-red-400/70` → `text-[color:var(--status-error-text)]`
- Line 721: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Lines 722, 723: `text-white/60`, `text-white/80` → `text-[color:var(--text-secondary)]`, `text-[color:var(--text-primary)]`
- Line 727: `text-white/30 hover:text-white/60` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`

**Status message (line 401):** `glass p-3` → `card p-3`
**Table wrapper (line 453):** `glass overflow-x-auto` → `card-flush overflow-hidden`

### 6. `apps/platform-portal/src/app/(portal)/screening/page.tsx`

**18 `text-white/` + 12 status color instances.**

Apply same compound badge patterns as admin screening page. Tab switching (lines 369, 379): `text-white/40 hover:text-white/60` → tertiary/secondary. Form labels (lines 447, 454, 477): `text-white/40`, `text-white/60` → respective vars. Table cells (lines 160–251): `text-white/70`, `text-white/60` → primary/secondary. Action buttons (lines 209, 219, 263, 272): same emerald/red → status vars.

**Required asterisk (line 457):** `text-red-400` → `text-[color:var(--status-error-text)]`
**Badge fallbacks (lines 99, 107, 109):** bg-white/10 compounds → muted compounds

### 7. `apps/platform-portal/src/app/(portal)/settings/*` Pages

**audit-log/page.tsx** — mirrors admin audit-log. Apply identical rules to lines 180–331.

**defaults/page.tsx:**
- Line 79: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 82, 85: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 122: conditional `text-emerald-400` / `text-white/40` → `text-[color:var(--status-success-text)]` / `text-[color:var(--text-tertiary)]`
- Lines 147, 151: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 154: `text-white/40` → `text-[color:var(--text-tertiary)]`

**platform/page.tsx (lines 33–62):** All `text-white/60` → `text-[color:var(--text-secondary)]`

**profile/page.tsx** — mirrors admin profile. Apply identical rules.

**users/page.tsx** — mirrors admin users. Apply identical rules. Additional:
- Line 295: destructive button `bg-red-500/20 border border-red-500/30 text-red-400` → destructive compound
- Line 304: strong destructive `bg-red-600/30 border border-red-500/50 text-red-300` → destructive compound

**api-keys/page.tsx:**
- Line 21: `text-white/40` → `text-[color:var(--text-tertiary)]`

### 8. `apps/platform-portal/src/app/(portal)/system/page.tsx`

- Line 89: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 92: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 94: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 96: `text-red-400` → `text-[color:var(--status-error-text)]`

### 9. `apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx`

**25 `text-white/` + 5 status color instances.**

- Lines 110, 117, 149, 156: `text-white/60`, `text-white/30` → secondary/tertiary
- Lines 238, 244: loading/not found `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 316: `text-white/30 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- Line 339: `text-white/40 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- Line 345: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 356: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 358: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 379: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 393: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 432: `text-white/40` → `text-[color:var(--text-secondary)]`
- Lines 457, 466, 484: icon colors `text-emerald-400`, `text-red-400`, `text-purple-400` → success/error/info text vars
- Line 460: `text-2xl font-semibold` → `kpi-value` (Category V)
- Lines 490, 510, 516, 522, 528, 553: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 560, 566: conditional `text-emerald-400` / `text-white/40` / `text-amber-400` → respective status/text vars

### 10. `apps/platform-portal/src/app/(portal)/tenants/[id]/contracts/page.tsx`

- Line 100: `text-white/50` → `text-[color:var(--text-secondary)]`, `text-amber-400` → `text-[color:var(--status-warning-text)]`, `text-red-400` → `text-[color:var(--status-error-text)]`

### 11. `apps/platform-portal/src/app/(portal)/tenants/create/page.tsx`

**19 `text-white/` + 3 status color instances.**

- Line 236: errCls `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 262: `'bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'` → success compound
- Line 643: `text-red-400` → `text-[color:var(--status-error-text)]`
- Apply all `text-white/` label/hint patterns using master mapping (same patterns as admin tenant-create-wizard)

---

## Remaining glass and kpi-value Fixes

### Category U: glass → card (14 instances across all phases)

These glass instances should be caught during the page-by-page pass above, but listing them here as a cross-check:

| File | Line | Before | After |
|---|---|---|---|
| `admin/messages/page.tsx` | 348 | `glass p-3` | `card p-3` |
| `admin/messages/page.tsx` | 400 | `glass overflow-x-auto` | `card-flush overflow-hidden` |
| `admin/platform/feedback/page.tsx` | 295 | `glass overflow-x-auto` | `card-flush overflow-hidden` |
| `admin/platform/feedback/page.tsx` | 447 | `glass p-3` | `card p-3` |
| `admin/products/wizard/step-approval.tsx` | 44 | `glass p-4` | `card p-4` |
| `admin/products/wizard/step-notifications.tsx` | 236 | `glass p-4` | `card p-4` |
| `admin/products/wizard/step-funding-source.tsx` | 289 | `glass rounded-xl p-6` | `card-elevated rounded-xl p-6` |
| `platform/compliance/page.tsx` | 301 | `glass p-3` | `card p-3` |
| `platform/compliance/page.tsx` | 309 | `glass border border-amber...` | `card border border-[color:var(--status-warning)]...` |
| `platform/feedback/page.tsx` | 401 | `glass p-3` | `card p-3` |
| `platform/feedback/page.tsx` | 578 | `glass overflow-x-auto` | `card-flush overflow-hidden` |
| `platform/feedback/page.tsx` | 715 | `glass p-3` | `card p-3` |
| `platform/messages/page.tsx` | 401 | `glass p-3` | `card p-3` |
| `platform/messages/page.tsx` | 453 | `glass overflow-x-auto` | `card-flush overflow-hidden` |

### Category V: `text-2xl font-semibold` → `kpi-value` (7 instances) + hardcoded hex (1 instance)

| File | Line | Before | After |
|---|---|---|---|
| `admin/components/reports/revenue-report.tsx` | 302 | `text-2xl font-semibold text-[color:var(--status-success-text)] tabular-nums` | `kpi-value text-[color:var(--status-success-text)]` |
| `admin/components/reports/revenue-report.tsx` | 308 | `text-2xl font-semibold text-[color:var(--accent-primary-deep)] tabular-nums` | `kpi-value text-[color:var(--accent-primary-deep)]` |
| `admin/components/reports/revenue-report.tsx` | 314 | `text-2xl font-semibold text-[#8E44C8] tabular-nums` | `kpi-value text-[color:var(--status-info-text)]` |
| `admin/components/reports/portfolio-quality-report.tsx` | 90 | `text-2xl font-semibold text-[color:var(--text-primary)] tabular-nums` | `kpi-value` |
| `admin/components/customers/tab-credit-summary.tsx` | 199 | `text-2xl font-semibold text-[color:var(--text-primary)] tabular-nums` | `kpi-value` |
| `admin/components/customers/tab-credit-summary.tsx` | 226 | `text-2xl font-semibold text-[color:var(--text-primary)] tabular-nums` | `kpi-value` |
| `platform/tenants/[id]/page.tsx` | 460 | `text-2xl font-semibold text-[color:var(--text-primary)] tabular-nums` | `kpi-value` |

---

## Verification Checklist

After completing ALL three phases, run these commands from the repo root:

### 1. No remaining `text-white/` (except debug page)
```bash
grep -rn "text-white/" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | wc -l
```
**Expected:** Zero results.

### 2. No remaining `bg-white/` (except debug page)
```bash
grep -rn "bg-white/" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | wc -l
```
**Expected:** Zero results.

### 3. No remaining `border-white/` (except debug page)
```bash
grep -rn "border-white/" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | wc -l
```
**Expected:** Zero results.

### 4. No remaining `text-emerald-` (except debug page)
```bash
grep -rn "text-emerald-" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | wc -l
```
**Expected:** Zero results.

### 5. No remaining `text-red-` (except debug page)
```bash
grep -rn "text-red-" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | wc -l
```
**Expected:** Zero results.

### 6. No remaining `text-yellow-` or `text-orange-` or `text-amber-` or `text-green-` or `text-purple-` (except debug page)
```bash
grep -rn "text-yellow-\|text-orange-\|text-amber-\|text-green-\|text-purple-" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | wc -l
```
**Expected:** Zero results.

### 7. No remaining `bg-emerald-|bg-red-|bg-yellow-|bg-orange-|bg-green-|bg-purple-` (except debug page)
```bash
grep -rn "bg-emerald-\|bg-red-\|bg-yellow-\|bg-orange-\|bg-green-\|bg-purple-" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "debug/page" | wc -l
```
**Expected:** Zero results.

### 8. No remaining `text-2xl font-semibold`
```bash
grep -rn "text-2xl font-semibold" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | wc -l
```
**Expected:** Zero results.

### 9. No remaining `glass p-` or bare `glass` (outside glass-input/glass-button)
```bash
grep -rn '"glass ' apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | grep -v "glass-input\|glass-button\|glass-button-primary" | wc -l
```
**Expected:** Zero results.

### 10. No remaining hardcoded hex text colors
```bash
grep -rn 'text-\[#' apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | wc -l
```
**Expected:** Zero results.

### 11. CSS variable adoption — confirm volume
```bash
grep -rn "var(--text-" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | wc -l
```
**Expected:** Significantly higher than before (was mostly in pages; now should be in components too).

### 12. CSS variable status colors adoption
```bash
grep -rn "var(--status-" apps/admin-portal/src apps/platform-portal/src --include="*.tsx" | wc -l
```
**Expected:** Should be 100+ (all status badges, error messages, success confirmations now use CSS variables).

---

## What NOT to Change

- **Do NOT modify `globals.css`** — the token layer is complete.
- **Do NOT modify `dashboard/page.tsx`** in either portal — already done.
- **Do NOT modify `sidebar.tsx`** — already overhauled.
- **Do NOT modify `metric-card.tsx`** — already overhauled.
- **Do NOT change `glass-input` or `glass-button` or `glass-button-primary`** — acceptable form element classes.
- **Do NOT change ANY colors in `debug/page.tsx`** — the ONE exception file.
- **Do NOT change colors in `settings/integrations/page.tsx`** — light-mode integration UI.
- **Do NOT introduce new npm dependencies.**
- **Do NOT change the font (SF Pro) or color palette (coral).**
- **Do NOT change GraphQL queries, data logic, or routing.**
- **`font-mono` on IDs/codes is correct** — do not replace with `tabular-nums`.
- **Do NOT change semantic `hover:opacity-80`** — recommended hover on status-colored action buttons.

---

## Summary of Actions for Dev (Phase 3)

1. Open each of the 16 platform portal page files listed above.
2. Apply the Master Color Mapping Table to every `text-white/`, `bg-white/`, and `border-white/` instance.
3. Replace all hardcoded Tailwind status colors with CSS variable equivalents.
4. Replace compound badge patterns as a unit.
5. Cross-check: ensure ALL 14 `glass` instances from the Category U table have been replaced (some are in admin files from Phases 1-2).
6. Cross-check: ensure ALL 7 `text-2xl font-semibold` instances from the Category V table have been replaced (some are in admin files from Phase 2).
7. Replace the 1 hardcoded hex color (`text-[#8E44C8]`) with `text-[color:var(--status-info-text)]` in revenue-report.tsx.
8. Run ALL 12 verification commands and confirm expected results.
