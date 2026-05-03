# FIX: Tertiary Overhaul — Phase 1: Admin Portal Pages

**Context:** This is Phase 1 of 3 for the final CSS variable adoption pass. Phase 1 covers the 17 admin portal pages. Phase 2 covers admin components. Phase 3 covers platform portal pages, remaining glass/kpi-value fixes, and verification.

**Scope:** Visual layer only. Do NOT change GraphQL queries, data logic, routing, or business logic.

**Rule:** Do NOT truncate, skip, or use placeholders like `// ...rest of component`. Every file listed must be modified completely.

---

## Master Color Mapping Table

Use this table for **all** replacements in this document.

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

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `bg-white/5` | `bg-[color:var(--bg-muted)]` |
| `bg-white/10` | `bg-[color:var(--bg-muted)]` |
| `bg-white/20` | `bg-[color:var(--bg-hover)]` |

### Border Colors

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `border-white/10` | `border-[color:var(--border-subtle)]` |
| `border-white/20` | `border-[color:var(--border-default)]` |

### Status Colors — Text

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `text-emerald-400` | `text-[color:var(--status-success-text)]` |
| `text-green-400` / `text-green-500` / `text-green-800` | `text-[color:var(--status-success-text)]` |
| `text-red-400` / `text-red-300` / `text-red-600` / `text-red-800` | `text-[color:var(--status-error-text)]` |
| `text-yellow-400` / `text-orange-400` / `text-amber-400` | `text-[color:var(--status-warning-text)]` |
| `text-purple-400` | `text-[color:var(--status-info-text)]` |

### Status Colors — Compound Badge Patterns (replace as a unit)

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

### Contextual Rules

- **Loading states** (`text-white/40` on "Loading...") → `text-[color:var(--text-secondary)]`
- **Form labels** (`text-sm font-medium text-white/60 mb-1`) → `text-sm font-medium text-[color:var(--text-secondary)] mb-1`
- **Label class constants** (`const labelCls = 'block text-sm font-medium text-white/60 mb-1'`) → replace `text-white/60` → `text-[color:var(--text-secondary)]`
- **Table headers** (`text-xs font-medium text-white/40 uppercase`) → `text-xs font-medium text-[color:var(--text-tertiary)] uppercase`
- **Table cells / data values** (`text-white/70`) → `text-[color:var(--text-primary)]`
- **Hint / help text** (`text-xs text-white/30`) → `text-xs text-[color:var(--text-tertiary)]`
- **Section headers** (`text-sm font-medium text-white/60 mb-3`) → `section-label`
- **Close buttons** (`text-white/40 hover:text-white`) → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- **Inactive tab text** (`text-white/40 hover:text-white/60`) → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`
- **Pagination / footer text** (`text-white/40`) → `text-[color:var(--text-tertiary)]`
- **Detail panel label** (`text-white/40 block mb-1`) → `text-[color:var(--text-tertiary)] block mb-1`
- **Detail panel value** (`text-white/70`) → `text-[color:var(--text-primary)]`

---

## Admin Portal Pages — Line-by-Line Changes

### 1. `apps/admin-portal/src/app/(portal)/customers/[id]/page.tsx`

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
- Inactive: `text-white/40 hover:text-white/60` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)]`

**Blacklist display (lines 534–535):**
- Both: `text-red-400` → `text-[color:var(--status-error-text)]`

**Credit utilization (lines 576–577, 591, 595):**
- Line 576: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 577: `text-emerald-400` → `text-[color:var(--status-success-text)]`, `text-amber-400` → `text-[color:var(--status-warning-text)]`, `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 591: `text-white/70` → `text-[color:var(--text-primary)]`
- Line 595: `text-white/40` → `text-[color:var(--text-tertiary)]`

### 2. `apps/admin-portal/src/app/(portal)/lenders/[id]/page.tsx`

**13 `text-white/` + 5 status color instances.**

**Status badge map (lines 57–61):**
- Line 57: `'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'` → success compound
- Line 58: `'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'` → warning compound
- Line 59: `'bg-red-500/20 text-red-400 border-red-500/30'` → error compound
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

### 3. `apps/admin-portal/src/app/(portal)/loans/applications/page.tsx`

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

### 4. `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx`

- Line 47: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 50: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 81: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 111: `text-white/60` → `text-[color:var(--text-secondary)]`

### 5. `apps/admin-portal/src/app/(portal)/messages/page.tsx`

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

### 6. `apps/admin-portal/src/app/(portal)/platform/feedback/page.tsx`

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

### 7. `apps/admin-portal/src/app/(portal)/platform/layout.tsx`

- Line 11: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 21: `text-white/50` → `text-[color:var(--text-secondary)]`
- Line 23: `text-white/70` → `text-[color:var(--text-primary)]`

### 8. `apps/admin-portal/src/app/(portal)/platform/tenants/[id]/page.tsx`

- Line 166: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 174: `text-white/50 hover:text-white` → `text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]`
- Line 179: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 189: `text-white/40 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- Line 194: `text-white/40` → `text-[color:var(--text-tertiary)]`

### 9. `apps/admin-portal/src/app/(portal)/platform/tenants/page.tsx`

- Line 67: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 80: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 123: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 133: `text-white/40` → `text-[color:var(--text-tertiary)]`

### 10. `apps/admin-portal/src/app/(portal)/reports/[type]/page.tsx`

- Line 39: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 40: `text-white/30` → `text-[color:var(--text-tertiary)]`

### 11. `apps/admin-portal/src/app/(portal)/screening/[id]/page.tsx`

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

### 12. `apps/admin-portal/src/app/(portal)/screening/page.tsx`

**8 `text-white/` + 10 status color instances.**

Apply same pattern as screening/[id] for badge maps (lines 80–92, 94). Similar fallback patterns. Status buttons (lines 209, 219) same as screening/[id] (lines 330, 337).

- Lines 85, 94: fallback `'bg-white/10 text-white/60'` and `'bg-white/10 text-white/60 border-white/10'` → muted compound
- Lines 151, 155, 177, 180, 186: `text-white/` → apply text mapping
- Lines 80–92: Apply status compound mapping from Master table

### 13. `apps/admin-portal/src/app/(portal)/settings/audit-log/page.tsx`

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

### 14. `apps/admin-portal/src/app/(portal)/settings/profile/page.tsx`

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

### 15. `apps/admin-portal/src/app/(portal)/settings/tenant/page.tsx`

**10 `text-white/` instances.**

**labelCls constant (line 51):** `'block text-sm font-medium text-white/60 mb-1'` → `'block text-sm font-medium text-[color:var(--text-secondary)] mb-1'`
**Loading (line 209):** `text-white/40` → `text-[color:var(--text-secondary)]`
**Help text (lines 240, 408, 423):** `text-white/30` → `text-[color:var(--text-tertiary)]`
**Checkbox labels (lines 327, 351, 374, 394):** `text-white/70` → `text-[color:var(--text-primary)]`
**Config help (line 383):** `text-white/40` → `text-[color:var(--text-tertiary)]`

### 16. `apps/admin-portal/src/app/(portal)/settings/users/page.tsx`

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

### 17. `apps/admin-portal/src/app/(portal)/debug/page.tsx`

**EXCEPTION: Do NOT change any color in this file.** Debug page uses conventional HTTP method coloring and technical visualization that should remain as-is.

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
- **Do NOT change GraphQL queries, data logic, or routing.**

---

## Summary of Actions for Dev (Phase 1)

1. Open each of the 16 admin page files listed above (skip debug/page.tsx).
2. Apply the Master Color Mapping Table to every `text-white/`, `bg-white/`, and `border-white/` instance.
3. Replace all hardcoded Tailwind status colors with CSS variable equivalents.
4. Replace compound badge patterns as a unit.
5. Replace `glass` instances with appropriate card variants where noted.
6. After completing Phase 1, proceed to Phase 2 (admin components).
