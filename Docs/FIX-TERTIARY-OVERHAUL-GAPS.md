# FIX: Tertiary Overhaul Gaps — CSS Variable Adoption for Text, Background, and Status Colors

**Context:** The primary (pages) and secondary (glass, kpi-value, blue-to-coral) overhaul passes are both complete. All 17 verification checks from those docs pass. This document addresses the **final layer**: 722 `text-white/` opacity patterns, 175 hardcoded Tailwind status colors, 97 `bg-white/` patterns, 8 remaining `glass p-*` instances, 7 `text-2xl font-semibold` instances that should be `kpi-value`, and 1 hardcoded hex color. After this pass, **every color in both portals will use the CSS variable system** defined in `globals.css`.

**Scope:** Visual layer only. Do NOT change GraphQL queries, data logic, routing, or business logic.

**Rule:** Do NOT truncate, skip, or use placeholders like `// ...rest of component`. Every file listed must be modified completely.

**Total files affected:** 72 files across both portals (17 admin pages, 42 admin components, 16 platform pages).

---

## Table of Contents

1. [Master Color Mapping Table](#1-master-color-mapping-table)
2. [Change Categories (Q–V)](#2-change-categories-qv)
3. [Admin Portal Pages — Line-by-Line Changes](#3-admin-portal-pages--line-by-line-changes)
4. [Admin Portal Components — Line-by-Line Changes](#4-admin-portal-components--line-by-line-changes)
5. [Platform Portal Pages — Line-by-Line Changes](#5-platform-portal-pages--line-by-line-changes)
6. [Remaining glass and kpi-value Fixes](#6-remaining-glass-and-kpi-value-fixes)
7. [Verification Checklist](#7-verification-checklist)
8. [What NOT to Change](#8-what-not-to-change)

---

## 1. Master Color Mapping Table

Every `text-white/` and `bg-white/` pattern maps to a CSS variable. Use this table for **all** replacements throughout this document.

### Text Colors

| Tailwind Hardcoded | CSS Variable Replacement | Semantic Role |
|---|---|---|
| `text-white` (full opacity, on dark bg) | `text-[color:var(--text-primary)]` | Primary text |
| `text-white/90` | `text-[color:var(--text-primary)]` | Near-primary → promote to primary |
| `text-white/80` | `text-[color:var(--text-primary)]` | Body text → promote to primary |
| `text-white/70` | `text-[color:var(--text-primary)]` | Body / data cell text → promote to primary |
| `text-white/60` | `text-[color:var(--text-secondary)]` | Secondary text, labels, descriptions |
| `text-white/50` | `text-[color:var(--text-secondary)]` | Muted labels → promote to secondary |
| `text-white/40` | `text-[color:var(--text-tertiary)]` | Tertiary text, placeholders, hints |
| `text-white/30` | `text-[color:var(--text-tertiary)]` | Dim hints, help text → promote to tertiary |
| `text-white/20` | `text-[color:var(--text-tertiary)]` | Placeholder/divider → promote to tertiary |
| `text-white/15` | `text-[color:var(--text-tertiary)]` | Ghost text → promote to tertiary |
| `text-white font-medium` (read state) | `text-[color:var(--text-primary)] font-medium` | Unread/active indicators |

### Background Colors

| Tailwind Hardcoded | CSS Variable Replacement | Semantic Role |
|---|---|---|
| `bg-white/5` | `bg-[color:var(--bg-muted)]` | Subtle surface, code blocks, read-only inputs |
| `bg-white/10` | `bg-[color:var(--bg-muted)]` | Badge backgrounds, pill backgrounds |
| `bg-white/20` | `bg-[color:var(--bg-hover)]` | Hover state background |

### Border Colors

| Tailwind Hardcoded | CSS Variable Replacement | Semantic Role |
|---|---|---|
| `border-white/10` | `border-[color:var(--border-subtle)]` | Subtle borders on badges, pills |
| `border-white/20` | `border-[color:var(--border-default)]` | Default borders |

### Status Colors — Text

| Tailwind Hardcoded | CSS Variable Replacement | Semantic Role |
|---|---|---|
| `text-emerald-400` | `text-[color:var(--status-success-text)]` | Success state text |
| `text-green-400` | `text-[color:var(--status-success-text)]` | Success state text (alias) |
| `text-green-500` | `text-[color:var(--status-success-text)]` | Success state text (alias) |
| `text-green-800` | `text-[color:var(--status-success-text)]` | Dark success text |
| `text-red-400` | `text-[color:var(--status-error-text)]` | Error/danger state text |
| `text-red-300` | `text-[color:var(--status-error-text)]` | Error message text |
| `text-red-600` | `text-[color:var(--status-error-text)]` | Dark error text |
| `text-red-800` | `text-[color:var(--status-error-text)]` | Dark error text (light bg) |
| `text-yellow-400` | `text-[color:var(--status-warning-text)]` | Warning state text |
| `text-orange-400` | `text-[color:var(--status-warning-text)]` | Warning/elevated state text |
| `text-amber-400` | `text-[color:var(--status-warning-text)]` | Warning state text (alias) |
| `text-purple-400` | `text-[color:var(--status-info-text)]` | Info / special state text |

### Status Colors — Background + Border Compound Patterns

These are compound badge/pill patterns that appear together. Replace as a unit:

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `bg-emerald-500/20 text-emerald-400 border-emerald-500/30` | `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]` |
| `bg-emerald-500/30 text-emerald-400 border border-emerald-500/30` | `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border border-[color:var(--status-success)]` |
| `bg-red-500/20 text-red-400 border-red-500/30` | `bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]` |
| `bg-red-500/20 text-red-300 border border-red-500/30` | `bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border border-[color:var(--status-error)]` |
| `bg-red-800/30 border-red-700/40` | `bg-[color:var(--status-error-soft)] border-[color:var(--status-error)]` |
| `bg-yellow-500/20 text-yellow-400 border-yellow-500/30` | `bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]` |
| `bg-orange-500/20 text-orange-400 border-orange-500/30` | `bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]` |
| `bg-green-500/20 text-green-400 border border-green-500/30` | `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border border-[color:var(--status-success)]` |
| `bg-purple-500/20 text-purple-400 border border-purple-500/30` | `bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border border-[color:var(--status-info)]` |
| `bg-purple-500/20 text-purple-400 border-purple-500/30` | `bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border-[color:var(--status-info)]` |
| `bg-red-100 text-red-800` | `bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)]` |
| `bg-green-100 text-green-800` | `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)]` |

### Status Colors — Action Buttons (Destructive)

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `bg-red-500/20 border border-red-500/30 text-red-400 ... hover:bg-red-500/30` | `bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] ... hover:opacity-80` |
| `bg-red-600/30 border border-red-500/50 text-red-300 ... hover:bg-red-600/40` | `bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] ... hover:opacity-80` |
| `bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30` | `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] hover:opacity-80` |

### Hardcoded Hex Color

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `text-[#8E44C8]` | `text-[color:var(--status-info-text)]` |

---

## 2. Change Categories (Q–V)

### Category Q: `text-white/` Opacity → CSS Variable Text Colors

Replace all `text-white/{opacity}` patterns using the Master Color Mapping Table above. Apply across 72 files. This is a **mechanical, rule-based substitution** — every instance has a clear mapping.

**Key contextual rules:**
- **Loading states** (`text-white/40` on "Loading...") → `text-[color:var(--text-secondary)]`
- **Form labels** (`text-sm font-medium text-white/60 mb-1`) → `text-sm font-medium text-[color:var(--text-secondary)] mb-1`
- **Label class constants** (`const labelCls = 'block text-sm font-medium text-white/60 mb-1'`) → `const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1'`
- **Table headers** (`text-xs font-medium text-white/40 uppercase`) → `text-xs font-medium text-[color:var(--text-tertiary)] uppercase`
- **Table cells / data values** (`text-white/70`) → `text-[color:var(--text-primary)]`
- **Hint / help text** (`text-xs text-white/30`) → `text-xs text-[color:var(--text-tertiary)]`
- **Section headers** (`text-sm font-medium text-white/60 mb-3`) → `section-label`
- **Description text below headings** (`text-sm text-white/40`) → `text-sm text-[color:var(--text-tertiary)]`
- **Close buttons** (`text-white/40 hover:text-white`) → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- **Inactive tab text** (`text-white/40 hover:text-white/60`) → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`
- **Pagination / footer text** (`text-white/40`) → `text-[color:var(--text-tertiary)]`
- **Sub-header detail label** (`text-sm font-semibold text-white/70`) → `text-sm font-semibold text-[color:var(--text-primary)]`
- **Detail panel label** (`text-white/40 block mb-1`) → `text-[color:var(--text-tertiary)] block mb-1`
- **Detail panel value** (`text-white/70`) → `text-[color:var(--text-primary)]`
- **Icon colors** (e.g. `MailOpen className="w-4 h-4 text-white/30"`) → `text-[color:var(--text-tertiary)]`
- **Read/unread contrast** (`text-white font-medium` vs `text-white/70`) → `text-[color:var(--text-primary)] font-medium` vs `text-[color:var(--text-primary)]`

### Category R: `bg-white/` → CSS Variable Backgrounds

Replace `bg-white/{opacity}` patterns:
- `bg-white/5` → `bg-[color:var(--bg-muted)]`
- `bg-white/10` → `bg-[color:var(--bg-muted)]`
- `bg-white/20` → `bg-[color:var(--bg-hover)]`

### Category S: `border-white/` → CSS Variable Borders

Replace `border-white/{opacity}` patterns:
- `border-white/10` → `border-[color:var(--border-subtle)]`
- `border-white/20` → `border-[color:var(--border-default)]`

### Category T: Hardcoded Tailwind Status Colors → CSS Variables

Replace all `text-emerald-`, `text-red-`, `text-yellow-`, `text-orange-`, `text-amber-`, `text-green-`, `text-purple-` and their `bg-*` counterparts using the Master Status Colors table. This covers 175 instances across status badges, error messages, success confirmations, risk indicators, and action buttons.

### Category U: Remaining `glass p-*` → `card p-*`

8 remaining `glass p-*` instances that were missed in the secondary pass. Replace with `card p-*`.

### Category V: `text-2xl font-semibold` → `kpi-value`

7 instances where KPI values use inline typography instead of the `kpi-value` class. Also 1 hardcoded hex color (`text-[#8E44C8]`).

---

## 3. Admin Portal Pages — Line-by-Line Changes

### 3.1 `apps/admin-portal/src/app/(portal)/customers/[id]/page.tsx`

**32 `text-white/` instances + 15 status color instances.**

**Status badge maps (lines 106–123):**
- Line 106: `'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'` → `'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]'`
- Line 107: `'bg-red-500/20 text-red-400 border-red-500/30'` → `'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]'`
- Line 120: `'text-emerald-400'` → `'text-[color:var(--status-success-text)]'`
- Line 122: `'text-orange-400'` → `'text-[color:var(--status-warning-text)]'`
- Line 123: `'text-red-400'` → `'text-[color:var(--status-error-text)]'`
- Line 125: fallback `'text-white/40'` → `'text-[color:var(--text-tertiary)]'`

**Loading/empty states:**
- Line 154: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 158: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 302: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 435: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 437: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 615: `text-white/40` → `text-[color:var(--text-secondary)]`

**Table headers (lines 166–171):**
- All 6 `th` elements: `text-xs font-medium text-white/40 uppercase` → `text-xs font-medium text-[color:var(--text-tertiary)] uppercase`

**Table cells (lines 177–182):**
- Lines 177, 178, 181: `text-white/70` → `text-[color:var(--text-primary)]`
- Line 182: `text-white/50` → `text-[color:var(--text-secondary)]`

**Match details (lines 208–217):**
- Line 208: `'bg-red-500/20 text-red-400'` → `'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)]'`
- Line 215: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 216, 217: `text-white/60` → `text-[color:var(--text-secondary)]`

**Eligibility dialog (lines 302–410):**
- Line 308: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 309: `text-white/60` → `text-[color:var(--text-secondary)]`
- Lines 314, 315: `text-red-300`, `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 330: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 331: `text-white/60` → `text-[color:var(--text-secondary)]`
- Lines 339, 371: `text-white/40 hover:text-white/60` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`
- Lines 349, 354, 381: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 360: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 380: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 401: `text-red-400` → `text-[color:var(--status-error-text)]`
- Lines 403, 406: `text-red-300` → `text-[color:var(--status-error-text)]`

**Anonymized display (lines 449, 465):**
- Line 449: `text-purple-400` → `text-[color:var(--status-info-text)]`
- Line 465: `bg-purple-500/20 text-purple-400 border border-purple-500/30` → `bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border border-[color:var(--status-info)]`

**Tabs (line 500):**
- Active: already uses `--accent-primary` (correct)
- Inactive: `text-white/40 hover:text-white/60` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`

**Blacklist display (lines 534–535):**
- Both: `text-red-400` → `text-[color:var(--status-error-text)]`

**Credit utilization (lines 576–577, 591, 595):**
- Line 576: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 577: `text-emerald-400` → `text-[color:var(--status-success-text)]`, `text-amber-400` → `text-[color:var(--status-warning-text)]`, `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 591: `text-white/70` → `text-[color:var(--text-primary)]`
- Line 595: `text-white/40` → `text-[color:var(--text-tertiary)]`

### 3.2 `apps/admin-portal/src/app/(portal)/lenders/[id]/page.tsx`

**13 `text-white/` + 5 status color instances.**

**Status badge map (lines 57–61):**
- Line 57: `'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'` → `'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border-[color:var(--status-success)]'`
- Line 58: `'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'` → `'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]'`
- Line 59: `'bg-red-500/20 text-red-400 border-red-500/30'` → `'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]'`
- Line 60: `'bg-white/10 text-white/60 border-white/10'` → `'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]'`
- Line 61: same as line 59
- Line 64: fallback `'bg-white/10 text-white/60 border-white/10'` → `'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]'`

**Loading (line 90):** `text-white/40` → `text-[color:var(--text-secondary)]`
**Not found (line 101):** `text-red-400` → `text-[color:var(--status-error-text)]`

**Detail rows (lines 173–215):**
- Lines 173, 192, 209: label `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 174, 193, 210: value `text-white/80` → `text-[color:var(--text-primary)]`
- Lines 198, 215: empty state `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 225: utilization `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 235: axis labels `text-white/40` → `text-[color:var(--text-tertiary)]`

### 3.3 `apps/admin-portal/src/app/(portal)/loans/applications/page.tsx`

**20 `text-white/` + 8 status color instances.**

**Status badges (lines 87–103):**
- Line 87: `bg-white/5 text-white/30 border-white/10` → `bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]`
- Line 93: `'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'` → success compound
- Line 95: `'bg-red-500/20 text-red-400 border-red-500/30'` → error compound
- Line 103: fallback same as line 87

**Screening indicator (lines 137–142):**
- Line 137: `'text-white/40'` → `'text-[color:var(--text-tertiary)]'`
- Line 139: `'text-emerald-400'` → `'text-[color:var(--status-success-text)]'`
- Line 142: `'text-red-400'` → `'text-[color:var(--status-error-text)]'`

**Detail drawer (lines 159–289):**
- Line 159: `text-white/40 hover:text-white/70` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- Lines 170–198: all `text-white/40 text-xs` label elements → `text-[color:var(--text-tertiary)] text-xs`
- Line 208: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 224: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 230: `bg-white/5 text-white/30 border-white/10` → `bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]`
- Line 233: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 242: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Lines 246, 252: `text-white/60` → `text-[color:var(--text-secondary)]`
- Lines 215, 217, 218: risk level colors `text-emerald-400`, `text-orange-400`, `text-red-400` → respective status vars
- Line 262: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 289: `text-white/30` → `text-[color:var(--text-tertiary)]`

### 3.4 `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx`

- Line 47: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 50: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 81: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 111: `text-white/60` → `text-[color:var(--text-secondary)]`

### 3.5 `apps/admin-portal/src/app/(portal)/messages/page.tsx`

**26 `text-white/` + 4 status color instances.**

**Priority badge (lines 109–112):**
- Line 109: `'bg-white/10 text-white/50 border-white/10'` → `'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]'`
- Line 111: `'bg-orange-500/20 text-orange-400 border-orange-500/30'` → warning compound
- Line 112: `'bg-red-500/20 text-red-400 border-red-500/30'` → error compound

**Status message (line 348):** `glass p-3` → `card p-3`. Also: `text-emerald-400` → `text-[color:var(--status-success-text)]`, `text-red-400` → `text-[color:var(--status-error-text)]`

**Subtitle (line 316):** `text-white/40` → `text-[color:var(--text-tertiary)]`
**Clear button (line 385):** `text-white/40 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
**Error (line 395):** `text-red-400` → `text-[color:var(--status-error-text)]`
**Unread badge (line 319):** `bg-red-500/20 text-red-400 ... border-red-500/30` → error compound

**Table wrapper (line 400):** `glass overflow-x-auto` → `card-flush overflow-hidden`
**Table header (line 403):** `border-white/10 text-white/50` → `border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]`
**Empty/loading (lines 416, 420):** `text-white/30` → `text-[color:var(--text-tertiary)]`
**Mail icon (line 436):** `text-white/30` → `text-[color:var(--text-tertiary)]`
**Read/unread (line 440):** `text-white/70` → `text-[color:var(--text-primary)]`
**Type icon (line 446):** `text-white/40` → `text-[color:var(--text-tertiary)]`
**Type label (line 447):** `text-white/60` → `text-[color:var(--text-secondary)]`
**Recipient (line 450):** `text-white/60` → `text-[color:var(--text-secondary)]`
**Date (line 458):** `text-white/50` → `text-[color:var(--text-secondary)]`
**Delete button (line 464):** `text-white/30 hover:text-white/60` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`
**Pagination (line 481):** `text-white/40` → `text-[color:var(--text-tertiary)]`

**Message detail panel (lines 518–546):**
- Line 518: `text-white/40 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- Line 529: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 535, 539, 545: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 540: `text-white/70` → `text-[color:var(--text-primary)]`
- Line 546: `text-white/80` → `text-[color:var(--text-primary)]`

**Compose modal (lines 576–611):**
- Line 576: `text-white/40 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- Line 581: `text-white/50` → `text-[color:var(--text-secondary)]`
- Lines 586, 600, 611: `text-white/40` → `text-[color:var(--text-tertiary)]`

### 3.6 `apps/admin-portal/src/app/(portal)/platform/feedback/page.tsx`

**29 `text-white/` + 4 status color instances.**

**Severity badges (lines 106–117):**
- Line 106: `'bg-red-500/20 text-red-400 border-red-500/30'` → error compound
- Line 107: `'bg-orange-500/20 text-orange-400 border-orange-500/30'` → warning compound
- Line 116: `'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'` → success compound
- Line 117: `'bg-white/10 text-white/40 border-white/10'` → `'bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border-[color:var(--border-subtle)]'`

**Error (line 290):** `text-red-400` → `text-[color:var(--status-error-text)]`

**Table wrapper (line 295):** `glass overflow-x-auto` → `card-flush overflow-hidden`
**Table header (line 298):** `border-white/10 text-white/50` → `border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]`
**Empty/loading (lines 311, 317):** `text-white/30` → `text-[color:var(--text-tertiary)]`
**Cell data (lines 328, 331):** `text-white/70` → `text-[color:var(--text-primary)]`
**Cell content (line 335):** `text-white/80` → `text-[color:var(--text-primary)]`
**Description cell (line 346):** `text-white/60` → `text-[color:var(--text-secondary)]`
**Date (line 356):** `text-white/50` → `text-[color:var(--text-secondary)]`
**Pagination (line 369):** `text-white/40` → `text-[color:var(--text-tertiary)]`

**Detail panel (lines 405–502):**
- Lines 405, 411, 419, 425, 431, 437, 446, 455, 470, 480, 489: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 420, 426, 432, 438: `text-white/70` → `text-[color:var(--text-primary)]`
- Line 447: `text-white/80 ... glass p-3` → `text-[color:var(--text-primary)] ... card p-3`
- Line 471: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 481: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 502: `text-white/30` → `text-[color:var(--text-tertiary)]`

### 3.7 `apps/admin-portal/src/app/(portal)/platform/layout.tsx`

- Line 11: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 21: `text-white/50` → `text-[color:var(--text-secondary)]`
- Line 23: `text-white/70` → `text-[color:var(--text-primary)]`

### 3.8 `apps/admin-portal/src/app/(portal)/platform/tenants/[id]/page.tsx`

- Line 166: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 174: `text-white/50 hover:text-white` → `text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]`
- Line 179: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 189: `text-white/40 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- Line 194: `text-white/40` → `text-[color:var(--text-tertiary)]`

### 3.9 `apps/admin-portal/src/app/(portal)/platform/tenants/page.tsx`

- Line 67: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 80: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 123: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 133: `text-white/40` → `text-[color:var(--text-tertiary)]`

### 3.10 `apps/admin-portal/src/app/(portal)/reports/[type]/page.tsx`

- Line 39: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 40: `text-white/30` → `text-[color:var(--text-tertiary)]`

### 3.11 `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx`

**26 `text-white/` + 6 status color instances.**

**Match type badge (lines 71–76):**
- Line 71: `'bg-red-500/20 text-red-400'` → `'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)]'`
- Line 72: `'bg-orange-500/20 text-orange-400'` → `'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)]'`
- Line 76: fallback `'bg-white/10 text-white/60'` → `'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)]'`

**Risk level badge (lines 81–86):**
- Line 81: `'bg-emerald-500/20 text-emerald-400'` → `'bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)]'`
- Line 83: `'bg-orange-500/20 text-orange-400'` → `'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)]'`
- Line 84: `'bg-red-500/20 text-red-400'` → `'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)]'`
- Line 86: fallback `'bg-white/10 text-white/60'` → `'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)]'`

**Loading/not found (lines 132, 141):** `text-white/40` → `text-[color:var(--text-secondary)]`
**Back button (line 138):** `text-white/50 hover:text-white` → `text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]`

**Customer info (lines 184–210):**
- Line 184: `text-white/90` → `text-[color:var(--text-primary)]`
- Lines 186, 191, 197, 203, 209: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 192, 198, 204: `text-white/70` → `text-[color:var(--text-primary)]`

**History/matches (lines 235–300):**
- Line 235: `text-white/70` → `text-[color:var(--text-primary)]`
- Line 236: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 257: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 268: `text-white/90` → `text-[color:var(--text-primary)]`
- Lines 285, 289, 299: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 286, 290, 300: `text-white/70` → `text-[color:var(--text-primary)]`

**Action buttons (lines 330, 337):**
- Line 330: `bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30` → `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] hover:opacity-80`
- Line 337: `bg-red-500/20 text-red-400 hover:bg-red-500/30` → `bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] hover:opacity-80`

**Review form (lines 316, 321):**
- Line 316: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 321: `bg-white/5 border border-white/10 ... text-white/90 placeholder:text-white/20` → `bg-[color:var(--bg-muted)] border border-[color:var(--border-subtle)] ... text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)]`

### 3.12 `apps/admin-portal/src/app/(portal)/screening/page.tsx`

**8 `text-white/` + 10 status color instances.**

Apply same pattern as screening/[id] for badge maps (lines 80–92, 94). Similar fallback patterns. Status buttons (lines 209, 219) same as screening/[id] (lines 330, 337).

- Lines 85, 94: fallback `'bg-white/10 text-white/60'` and `'bg-white/10 text-white/60 border-white/10'` → muted compound
- Lines 151, 155, 177, 180, 186: `text-white/` → apply text mapping
- Lines 80–92: Apply status compound mapping from Master table

### 3.13 `apps/admin-portal/src/app/(portal)/settings/audit-log/page.tsx`

**10 `text-white/` + 8 status color instances.**

**Filter reset (line 141):** `text-white/40 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
**Loading (line 146):** `text-white/40` → `text-[color:var(--text-secondary)]`
**Empty (line 148):** `text-white/40` → `text-[color:var(--text-secondary)]`

**Diff sections (lines 227, 228, 236, 237):**
- Lines 227, 236: `text-white/60` → `text-[color:var(--text-secondary)]`
- Lines 228, 237: `text-white/70` → `text-[color:var(--text-primary)]`

**Detail helper (lines 252, 253):**
- Line 252: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 253: `text-white/80` → `text-[color:var(--text-primary)]`

**Action type badges (lines 260–268):**
- Line 260: `'bg-green-500/20 text-green-400 border border-green-500/30'` → success compound
- Line 262: `'bg-red-500/20 text-red-400 border border-red-500/30'` → error compound
- Line 263: `'bg-purple-500/20 text-purple-400 border border-purple-500/30'` → info compound
- Line 264: `'bg-orange-500/20 text-orange-400 border border-orange-500/30'` → warning compound
- Line 266: `'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'` → success compound
- Line 267: `'bg-red-500/20 text-red-300 border border-red-500/30'` → error compound
- Line 268: `'bg-white/10 text-white/60 border border-white/20'` → `'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border border-[color:var(--border-default)]'`

### 3.14 `apps/admin-portal/src/app/(portal)/settings/profile/page.tsx`

**16 `text-white/` + 1 status color instance.**

**labelCls constant (line 115):** `'block text-sm font-medium text-white/50 mb-1.5'` → `'block text-sm font-medium text-[color:var(--text-secondary)] mb-1.5'`
**Role (line 139):** `text-white/40` → `text-[color:var(--text-tertiary)]`
**Disabled input (line 192):** `text-white/40` → `text-[color:var(--text-tertiary)]`
**Help text (lines 195, 257):** `text-white/30` → `text-[color:var(--text-tertiary)]`
**Icon (line 208):** `text-white/50` → `text-[color:var(--text-secondary)]`
**Section headers (lines 217, 275):** `text-white/80` → `text-[color:var(--text-primary)]`
**Account detail labels (lines 278, 282, 286, 290):** `text-white/30` → `text-[color:var(--text-tertiary)]`
**Account detail values (lines 279, 283, 287, 291):** `text-white/70` → `text-[color:var(--text-primary)]`

**Status message (line 117):** `text-emerald-400` → `text-[color:var(--status-success-text)]`, `text-red-400` → `text-[color:var(--status-error-text)]`

### 3.15 `apps/admin-portal/src/app/(portal)/settings/tenant/page.tsx`

**10 `text-white/` instances.**

**labelCls constant (line 51):** `'block text-sm font-medium text-white/60 mb-1'` → `'block text-sm font-medium text-[color:var(--text-secondary)] mb-1'`
**Loading (line 209):** `text-white/40` → `text-[color:var(--text-secondary)]`
**Help text (lines 240, 408, 423):** `text-white/30` → `text-[color:var(--text-tertiary)]`
**Checkbox labels (lines 327, 351, 374, 394):** `text-white/70` → `text-[color:var(--text-primary)]`
**Config help (line 383):** `text-white/40` → `text-[color:var(--text-tertiary)]`

### 3.16 `apps/admin-portal/src/app/(portal)/settings/users/page.tsx`

**16 `text-white/` + 4 status color instances.**

**Form labels (lines 212, 222, 234, 247):** `text-white/60` → `text-[color:var(--text-secondary)]`
**Section headers (lines 288, 363):** `text-white/60` → `text-[color:var(--text-secondary)]`
**Error message (line 263):** `text-red-400` → `text-[color:var(--status-error-text)]`

**Delete button (line 277):** `bg-red-500/20 border border-red-500/30 text-red-400 ... hover:bg-red-500/30` → destructive action compound
**Reset labels (lines 302, 313):** `text-white/40` → `text-[color:var(--text-tertiary)]`
**Reset status (lines 322, 323, 357):** `text-red-400` → error, `text-emerald-400` → success
**Cancel button (line 350):** `text-white/40 hover:text-white/60` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`
**Detail labels (lines 366, 370, 374, 378):** `text-white/30` → `text-[color:var(--text-tertiary)]`
**Detail values (lines 371, 375, 379):** `text-white/70` → `text-[color:var(--text-primary)]`

### 3.17 `apps/admin-portal/src/app/(portal)/debug/page.tsx`

**EXCEPTION: Do NOT change any color in this file.** Debug page uses conventional HTTP method coloring and technical visualization that should remain as-is.

---

## 4. Admin Portal Components — Line-by-Line Changes

### 4.1 Collections Components

**`components/collections/action-drawer.tsx` (15 instances):**
- Line 112: `text-white/40` → `text-[color:var(--text-secondary)]`
- Lines 120, 124, 128, 132, 138, 142: detail labels `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 133: `text-red-400` → `text-[color:var(--status-error-text)]`, `text-orange-400` → `text-[color:var(--status-warning-text)]`
- Line 161: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 163: `text-white/50` → `text-[color:var(--text-secondary)]`
- Line 169: `text-white/20` → `text-[color:var(--text-tertiary)]`
- Line 198: `bg-white/5 border-white/10 text-white/40 hover:text-white/60` → `bg-[color:var(--bg-muted)] border-[color:var(--border-subtle)] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`
- Lines 208, 228, 237, 250: label `text-white/40 uppercase` → `text-[color:var(--text-tertiary)] uppercase`

**`components/collections/aging-chart.tsx` (1 instance):**
- Line 14: `text-white/30` → `text-[color:var(--text-tertiary)]`

**`components/collections/collections-queue.tsx` (4 instances):**
- Line 97: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 104: `text-red-400` / `text-orange-400` / `text-amber-400` → error/warning/warning text vars
- Line 114: `text-white/20` → `text-[color:var(--text-tertiary)]`
- Line 117: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 119: `text-white/30` → `text-[color:var(--text-tertiary)]`

**`components/collections/ptp-tracker.tsx` (3 instances + 2 status):**
- Lines 65, 71, 77: `text-white/40 uppercase` → `text-[color:var(--text-tertiary)] uppercase`
- Line 72: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 78: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 95: `text-red-400` → `text-[color:var(--status-error-text)]`

### 4.2 Customer Tab Components

**`components/customers/tab-activity-log.tsx` (2 instances):**
- Line 75: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 79: `text-white/30` → `text-[color:var(--text-tertiary)]`

**`components/customers/tab-credit-summary.tsx` (13 instances + 4 status):**
- Line 45: `'text-emerald-400'` + `'bg-emerald-500/20 border-emerald-500/30'` → success compound
- Line 47: `'text-red-400'` + `'bg-red-500/20 border-red-500/30'` → error compound
- Line 48: `'text-red-600'` + `'bg-red-800/30 border-red-700/40'` → error compound
- Line 60: fallback `'text-white/60'` + `'bg-white/10 border-white/10'` → `'text-[color:var(--text-secondary)]'` + `'bg-[color:var(--bg-muted)] border-[color:var(--border-subtle)]'`
- Line 161: `'text-emerald-400'` → `'text-[color:var(--status-success-text)]'`
- Line 163: `'text-red-400'` → `'text-[color:var(--status-error-text)]'`
- Lines 179, 197, 206, 223: `text-white/40 uppercase` → `text-[color:var(--text-tertiary)] uppercase`
- Lines 199, 226: These are KPI values with `text-2xl font-semibold` → `kpi-value` (see Category V in Section 6)
- Lines 230, 249, 263, 276, 281: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 253, 267, 271: `text-white/30` → `text-[color:var(--text-tertiary)]`

**`components/customers/tab-financial-profile.tsx` (4 instances):**
- Line 16: `text-white/20` → `text-[color:var(--text-tertiary)]`
- Line 18: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 19: `text-white/20` → `text-[color:var(--text-tertiary)]`
- Line 26: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 27: `text-white/15` → `text-[color:var(--text-tertiary)]`

**`components/customers/tab-profile.tsx` (2 instances + 2 status):**
- Line 35: `text-white/30 hover:text-white/60` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`
- Line 68: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 75, 76: `text-red-400` → `text-[color:var(--status-error-text)]`

**`components/customers/tab-repayment-history.tsx` (1 instance):**
- Line 68: `text-white/40 uppercase` → `text-[color:var(--text-tertiary)] uppercase`

### 4.3 Dashboard Components

**`components/dashboard/alerts-panel.tsx` (5 instances + 1 status):**
- Line 22: `'bg-red-500/20 text-red-400 border-red-500/30'` → error compound
- Lines 41, 49: `text-white/60` → replace with `section-label` class
- Lines 42, 51: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 76: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 79: `text-white/80` → `text-[color:var(--text-primary)]`

**`components/dashboard/trend-chart.tsx` (1 instance):**
- Line 123: `text-white/60` → replace with `section-label` class

### 4.4 Feedback Component

**`components/feedback/feedback-button.tsx` (5 instances + 1 status):**
- Lines 107, 123, 139, 153: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 140: `text-red-400` → `text-[color:var(--status-error-text)]` (required asterisk)
- Line 164: `text-white/30` → `text-[color:var(--text-tertiary)]`

### 4.5 Lender Components

**`components/lenders/lender-form.tsx` (13 instances + 1 status):**
- Line 110: label `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 111: `text-red-400` → `text-[color:var(--status-error-text)]` (required asterisk)
- Lines 124, 133, 172, 183, 220, 231, 249, 258, 269, 278: `text-white/60` → `text-[color:var(--text-secondary)]`
- Lines 169, 245: `text-white/80` → `text-[color:var(--text-primary)]`

**`components/lenders/lender-list.tsx` (3 instances + 4 status):**
- Lines 134–136: `'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'`, yellow, red → compound mappings
- Line 139: fallback `'bg-white/10 text-white/60 border-white/10'` → muted compound
- Line 189: `text-red-400 hover:text-red-300` → `text-[color:var(--status-error-text)] hover:opacity-80`
- Line 203: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 242: `text-white/60` → `text-[color:var(--text-secondary)]`

### 4.6 Loan Components

**`components/loans/application-review-drawer.tsx` (20 instances + 2 status):**
- Line 101: `text-white/40` → `text-[color:var(--text-secondary)]`
- Lines 109, 113, 117, 121, 132, 136, 140, 144, 148, 152, 164, 168, 172, 178, 233, 243, 267: all `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 181: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 211: destructive button: `bg-red-500/20 border border-red-500/30 text-red-400 ... hover:bg-red-500/30` → destructive compound
- Line 231: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 283: destructive button: same as line 211

**`components/loans/tab-ledger.tsx` (2 status):**
- Line 67: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 76: `text-emerald-400` → `text-[color:var(--status-success-text)]`

**`components/loans/tab-timeline.tsx` (5 instances):**
- Line 81: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 82: `text-white/20` → `text-[color:var(--text-tertiary)]`
- Line 88: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 91: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 92: `text-white/20` → `text-[color:var(--text-tertiary)]`

### 4.7 Platform Components

**`components/platform/sp-management.tsx` (8 instances + 2 status):**
- Lines 25–27: status badge maps → compound mappings (active=success, suspended=error, inactive=muted)
- Line 29: fallback → muted compound
- Line 78: `text-white/70` → `text-[color:var(--text-primary)]`
- Lines 95, 130: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 163: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 178: `text-white/30 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`

**`components/platform/tenant-create-wizard.tsx` (11 instances + 2 status):**
- Line 108: labelCls `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 109: errCls `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 124: `'bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'` → success compound
- Line 125: `'bg-white/5 text-white/30 border border-white/10'` → `'bg-[color:var(--bg-muted)] text-[color:var(--text-tertiary)] border border-[color:var(--border-subtle)]'`
- Line 144: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 280, 284, 288, 292, 297, 303, 314, 318: `text-white/40` → `text-[color:var(--text-tertiary)]`

**`components/platform/tenant-detail-tabs.tsx` (15 instances):**
- Line 55: labelCls `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 69: inactive tab `text-white/40 ... hover:text-white/70` → `text-[color:var(--text-tertiary)] ... hover:text-[color:var(--text-primary)]`
- Lines 136, 187, 204, 217, 229: sub-headers `text-white/70` → `text-[color:var(--text-primary)]`
- Line 138: `text-white/50` → `text-[color:var(--text-secondary)]`
- Lines 177, 207, 232: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Lines 194: `text-white/60 bg-white/5` → `text-[color:var(--text-secondary)] bg-[color:var(--bg-muted)]`
- Lines 206, 371, 374, 231: `text-white/40` → `text-[color:var(--text-tertiary)]`

**`components/platform/tenant-list-table.tsx` (8 instances + 2 status):**
- Lines 29–32: status badge maps → compound mappings
- Line 34: fallback → muted compound
- Lines 78, 86: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 117: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Lines 129, 130: `text-white/70` → `text-[color:var(--text-primary)]`
- Line 131: `text-white/50` → `text-[color:var(--text-secondary)]`

### 4.8 Product Wizard Components

Apply to all 9 wizard files. Common pattern:

**All files with `labelCls` constant:** Replace `text-white/60` → `text-[color:var(--text-secondary)]` in the constant.

**All files with `text-white/40` descriptions:** → `text-[color:var(--text-tertiary)]`
**All files with `text-white/30` hint text:** → `text-[color:var(--text-tertiary)]`
**All files with `text-red-400` required asterisks:** → `text-[color:var(--status-error-text)]`

Specific files:

**`step-approval.tsx`:** labelCls (line 17), description (line 36), hint (lines 60, 83, 104), `text-white/40` → `text-[color:var(--text-tertiary)]`, `text-white/30` → `text-[color:var(--text-tertiary)]`, required star (line 22) `text-red-400` → `text-[color:var(--status-error-text)]`. Also: `glass p-4` (line 44) → `card p-4`.

**`step-basic-info.tsx`:** labelCls (line 31), readOnlyCls (line 32) `bg-white/5 text-white/50` → `bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)]`, hintCls (line 33) `text-white/30` → `text-[color:var(--text-tertiary)]`, description (line 42), required stars (lines 56, 84, 107) `text-red-400` → `text-[color:var(--status-error-text)]`.

**`step-eligibility.tsx`:** labelCls (line 19), required star (line 46), description (line 55), hints (lines 73, 98, 105), json error (line 116) `text-red-400` → `text-[color:var(--status-error-text)]`.

**`step-fees.tsx`:** labelCls (line 24), description (line 62) `text-white/30` → `text-[color:var(--text-tertiary)]`, description (line 121) `text-white/40` → `text-[color:var(--text-tertiary)]`, required stars (line 60) `text-red-400` → `text-[color:var(--status-error-text)]`.

**`step-financial-terms.tsx`:** labelCls (line 24), description (line 53), required star (line 40), hints (lines 176, 189) `text-white/30` → `text-[color:var(--text-tertiary)]`.

**`step-funding-source.tsx`:** labelCls (line 52), description (line 105), hints (lines 137, 244, 275) `text-white/30` → `text-[color:var(--text-tertiary)]`, selected lender info (line 154) `text-white/80` → `text-[color:var(--text-primary)]`, detail (lines 156, 161) `text-white/40` → `text-[color:var(--text-tertiary)]`, insurance toggle (line 182) `text-white/80` → `text-[color:var(--text-primary)]`, suffix icons (lines 211, 265) `text-white/30` → `text-[color:var(--text-tertiary)]`, read-only fields (lines 241, 272) `bg-white/5 text-white/60` → `bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)]`, revenue error (line 281) `text-red-400` → `text-[color:var(--status-error-text)]`. Also: `glass rounded-xl p-6` (line 289) → `card-elevated rounded-xl p-6`.

**`step-notifications.tsx`:** labelCls (line 90), description (line 218), no-add hint (line 226) `text-white/40` → `text-[color:var(--text-tertiary)]`, delete icon (line 245) `text-white/30 hover:text-red-400` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--status-error-text)]`, hint (line 286) `text-white/30` → `text-[color:var(--text-tertiary)]`, no-templates (lines 296, 297) `text-white/40`, `text-white/30` → `text-[color:var(--text-tertiary)]`. Also: `glass p-4` (line 236) → `card p-4`.

**`step-review.tsx`:** detail label (line 24) `text-white/40` → `text-[color:var(--text-tertiary)]`, description (line 72), custom rules label (line 131) `text-white/40` → `text-[color:var(--text-tertiary)]`, custom rules pre (line 132) `text-white/60 bg-white/5` → `text-[color:var(--text-secondary)] bg-[color:var(--bg-muted)]`, notif event (line 173) `text-white/60` → `text-[color:var(--text-secondary)]`, notif template (line 174) `text-white/40` → `text-[color:var(--text-tertiary)]`, validation errors (lines 76, 79) `text-red-400` → `text-[color:var(--status-error-text)]`.

**`wizard-progress.tsx`:** inactive step (line 52) `bg-white/5 border-white/10 text-white/30 group-hover:border-white/20 group-hover:text-white/50` → `bg-[color:var(--bg-muted)] border-[color:var(--border-subtle)] text-[color:var(--text-tertiary)] group-hover:border-[color:var(--border-default)] group-hover:text-[color:var(--text-secondary)]`, error indicator (lines 47, 56) `text-red-400` / `bg-red-500/20 border-red-400/50 text-red-400 shadow-lg shadow-red-500/20` → `text-[color:var(--status-error-text)]` / `bg-[color:var(--status-error-soft)] border-[color:var(--status-error)] text-[color:var(--status-error-text)] shadow-lg`, success step (line 51) `bg-emerald-500/20 border-emerald-400/50 text-emerald-400` → `bg-[color:var(--status-success-soft)] border-[color:var(--status-success)] text-[color:var(--status-success-text)]`, label colors (line 66) `text-red-400`, `text-white/60`, `text-white/30` → respective vars.

### 4.9 Report Components

**All 10 report files** — apply text-white/ mapping:
- All `if (loading) return <div className="text-white/40">` → `text-[color:var(--text-secondary)]`
- All `<Suspense fallback={<div className="text-white/40">` → `text-[color:var(--text-secondary)]`
- All `<p className="text-sm text-white/60">Label</p>` (KPI labels) → `text-[color:var(--text-secondary)]`
- All `<h3 className="text-sm font-medium text-white/60 mb-3">` → `section-label` class
- All `text-white/40` (chart placeholders, empty states) → `text-[color:var(--text-secondary)]`
- All `text-white/30` → `text-[color:var(--text-tertiary)]`

**`revenue-report.tsx` specific:**
- Lines 301, 307, 313: KPI labels `text-white/60` → `text-[color:var(--text-secondary)]`
- Lines 302, 308: already use CSS variables for values (correct)
- Line 314: `text-[#8E44C8]` → `text-[color:var(--status-info-text)]` (Category V)
- Lines 302, 308, 314: `text-2xl font-semibold` → `kpi-value` (Category V)
- Lines 322, 323, 332, 334, 342, 344, 356, 374, 438, 444, 448, 457, 464, 483: `text-white/` → apply mapping
- Line 87: `text-white font-medium` in product performance → `text-[color:var(--text-primary)] font-medium`

**`product-performance-report.tsx` specific:**
- Line 75: `text-white/80` → `text-[color:var(--text-primary)]`
- Lines 78, 82, 86, 92: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 83: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 87: `text-red-400` → `text-[color:var(--status-error-text)]`, `text-white` → `text-[color:var(--text-primary)]`

### 4.10 Other Components

**`components/survey/nps-widget.tsx`:**
- Line 50: `text-white/40 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- Line 57: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 73: `bg-white/10 text-white/70 hover:bg-white/20` → `bg-[color:var(--bg-muted)] text-[color:var(--text-primary)] hover:bg-[color:var(--bg-hover)]`
- Line 81: `text-white/30` → `text-[color:var(--text-tertiary)]`

**`components/products/wizard/field-error.tsx`:**
- Line 18: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 42: `text-red-400` → `text-[color:var(--status-error-text)]`

---

## 5. Platform Portal Pages — Line-by-Line Changes

### 5.1 `apps/platform-portal/src/app/(portal)/analytics/scoring/page.tsx`

**12 `text-white/` + 2 status color instances.**

- Lines 230, 241, 254, 266: section headers `text-white/60` → `section-label`
- Lines 232, 243, 256, 268, 285: loading/empty `text-white/40` → `text-[color:var(--text-secondary)]`
- Lines 236, 247, 260: no-data `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 276: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 279: `text-red-400` → `text-[color:var(--status-error-text)]`

### 5.2 `apps/platform-portal/src/app/(portal)/compliance/page.tsx`

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

### 5.3 `apps/platform-portal/src/app/(portal)/error.tsx`

- Line 26: `text-white/40` → `text-[color:var(--text-secondary)]`

### 5.4 `apps/platform-portal/src/app/(portal)/feedback/page.tsx`

**39 `text-white/` + 7 status color instances.**

Mirrors admin feedback page (section 3.6). Same badge maps, same table patterns, same detail panel patterns. Apply identical rules:

**Badges (lines 176–187):** same compound mappings as admin feedback
**NPS grid (lines 458–504):** text-white/ opacity tiers → respective CSS vars
**Table (lines 578–637):** same patterns as admin — header, cells, empty states
**Detail panel (lines 674–764):** same label/value pattern
**Description (line 715):** `glass p-3` → `card p-3`
**Status message (line 401):** `glass p-3` → `card p-3`
**Table wrapper (line 578):** `glass overflow-x-auto` → `card-flush overflow-hidden`
**SLA response (lines 488–491):** `text-emerald-400` / `text-yellow-400` / `text-red-400` → respective status vars
**Error (line 573):** `text-red-400` → `text-[color:var(--status-error-text)]`

### 5.5 `apps/platform-portal/src/app/(portal)/messages/page.tsx`

**34 `text-white/` + 4 status color instances.**

Mirrors admin messages page (section 3.5). Apply identical rules. Key additions:

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

### 5.6 `apps/platform-portal/src/app/(portal)/screening/page.tsx`

**18 `text-white/` + 12 status color instances.**

Apply same compound badge patterns as admin screening page. Tab switching (lines 369, 379): `text-white/40 hover:text-white/60` → tertiary/secondary. Form labels (lines 447, 454, 477): `text-white/40`, `text-white/60` → respective vars. Table cells (lines 160–251): `text-white/70`, `text-white/60` → primary/secondary. Action buttons (lines 209, 219, 263, 272): same emerald/red → status vars.

**Required asterisk (line 457):** `text-red-400` → `text-[color:var(--status-error-text)]`
**Badge fallbacks (lines 99, 107, 109):** bg-white/10 compounds → muted compounds

### 5.7 `apps/platform-portal/src/app/(portal)/settings/*` Pages

**audit-log/page.tsx** — mirrors admin audit-log (section 3.13). Apply identical rules to lines 180–331.

**defaults/page.tsx:**
- Line 79: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 82, 85: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 122: conditional `text-emerald-400` / `text-white/40` → `text-[color:var(--status-success-text)]` / `text-[color:var(--text-tertiary)]`
- Lines 147, 151: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 154: `text-white/40` → `text-[color:var(--text-tertiary)]`

**platform/page.tsx (lines 33–62):** All `text-white/60` → `text-[color:var(--text-secondary)]`

**profile/page.tsx** — mirrors admin profile (section 3.14). Apply identical rules.

**users/page.tsx** — mirrors admin users (section 3.16). Apply identical rules. Additional:
- Line 295: destructive button `bg-red-500/20 border border-red-500/30 text-red-400` → destructive compound
- Line 304: strong destructive `bg-red-600/30 border border-red-500/50 text-red-300` → destructive compound

**api-keys/page.tsx:**
- Line 21: `text-white/40` → `text-[color:var(--text-tertiary)]`

### 5.8 `apps/platform-portal/src/app/(portal)/system/page.tsx`

- Line 89: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 92: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 94: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 96: `text-red-400` → `text-[color:var(--status-error-text)]`

### 5.9 `apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx`

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
- Line 460: `text-2xl font-semibold` → `kpi-value` (Category V, see Section 6)
- Lines 490, 510, 516, 522, 528, 553: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Lines 560, 566: conditional `text-emerald-400` / `text-white/40` / `text-amber-400` → respective status/text vars

### 5.10 `apps/platform-portal/src/app/(portal)/tenants/[id]/contracts/page.tsx`

- Line 100: `text-white/50` → `text-[color:var(--text-secondary)]`, `text-amber-400` → `text-[color:var(--status-warning-text)]`, `text-red-400` → `text-[color:var(--status-error-text)]`

### 5.11 `apps/platform-portal/src/app/(portal)/tenants/create/page.tsx`

**19 `text-white/` + 3 status color instances.**

- Line 236: errCls `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 262: `'bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'` → success compound
- Line 643: `text-red-400` → `text-[color:var(--status-error-text)]`
- Apply all `text-white/` label/hint patterns using master mapping (same patterns as admin tenant-create-wizard)

---

## 6. Remaining glass and kpi-value Fixes

### Category U: glass → card (8 instances)

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

## 7. Verification Checklist

After completing ALL changes, run these commands:

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

### 7. No remaining `bg-emerald-\|bg-red-\|bg-yellow-\|bg-orange-\|bg-green-\|bg-purple-` (except debug page)
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

## 8. What NOT to Change

- **Do NOT modify `globals.css`** — the token layer is complete.
- **Do NOT modify `dashboard/page.tsx`** in either portal — already done.
- **Do NOT modify `sidebar.tsx`** — already overhauled.
- **Do NOT modify `metric-card.tsx`** — already overhauled.
- **Do NOT change `glass-input` or `glass-button` or `glass-button-primary`** — acceptable form element classes.
- **Do NOT change ANY colors in `debug/page.tsx`** — HTTP method color coding, audit trail display, and technical debugging visuals should all remain as-is with their hardcoded Tailwind classes. This is the ONE exception file.
- **Do NOT change colors in `settings/integrations/page.tsx`** — light-mode integration UI.
- **Do NOT introduce new npm dependencies.**
- **Do NOT change the font (SF Pro) or color palette (coral).**
- **Do NOT change GraphQL queries, data logic, or routing.**
- **`font-mono` on IDs/codes is correct** — do not replace with `tabular-nums`.
- **Do NOT change semantic `hover:opacity-80`** — this is the recommended way to handle hover on status-colored action buttons when using CSS variables (since you can't easily do `bg-emerald-500/30` with CSS variables).

---

## Summary of Actions for Dev

1. **Open each of the 72 files** listed in Sections 3–5 and apply the Master Color Mapping Table to every `text-white/`, `bg-white/`, and `border-white/` instance.
2. **Replace all hardcoded Tailwind status colors** (`text-emerald-400`, `text-red-400`, `bg-emerald-500/20`, etc.) with the CSS variable equivalents from the Status Colors table.
3. **Replace all compound badge patterns** (bg + text + border combos) as a unit — see the compound table in Section 1.
4. **Convert 14 remaining `glass` instances** to appropriate card variants (Section 6, Category U).
5. **Convert 7 `text-2xl font-semibold` instances** to `kpi-value` class (Section 6, Category V).
6. **Replace 1 hardcoded hex color** (`text-[#8E44C8]`) with `text-[color:var(--status-info-text)]`.
7. **Skip `debug/page.tsx` entirely** — it is the only exception file.
8. **Run all 12 verification commands** from Section 7 and confirm zero-or-expected results for each.
