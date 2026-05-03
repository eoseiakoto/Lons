# FIX: Tertiary Overhaul — Phase 2: Admin Portal Components

**Context:** This is Phase 2 of 3 for the final CSS variable adoption pass. Phase 1 (admin pages) should be completed first. Phase 2 covers admin portal components. Phase 3 covers platform portal pages, remaining glass/kpi-value fixes, and verification.

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
| `bg-red-800/30 border-red-700/40` | `bg-[color:var(--status-error-soft)] border-[color:var(--status-error)]` |
| `bg-yellow-500/20 text-yellow-400 border-yellow-500/30` | `bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]` |
| `bg-orange-500/20 text-orange-400 border-orange-500/30` | `bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]` |
| `bg-green-500/20 text-green-400 border border-green-500/30` | `bg-[color:var(--status-success-soft)] text-[color:var(--status-success-text)] border border-[color:var(--status-success)]` |
| `bg-purple-500/20 text-purple-400 border border-purple-500/30` | `bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border border-[color:var(--status-info)]` |
| `bg-purple-500/20 text-purple-400 border-purple-500/30` | `bg-[color:var(--status-info-soft)] text-[color:var(--status-info-text)] border-[color:var(--status-info)]` |

### Destructive Action Buttons

| Tailwind Hardcoded | CSS Variable Replacement |
|---|---|
| `bg-red-500/20 border border-red-500/30 text-red-400 ... hover:bg-red-500/30` | `bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] ... hover:opacity-80` |

### Contextual Rules

- **Loading states** (`text-white/40` on "Loading...") → `text-[color:var(--text-secondary)]`
- **Form labels** / `labelCls` constants: `text-white/60` → `text-[color:var(--text-secondary)]`
- **Table headers** (`text-xs font-medium text-white/40 uppercase`) → `text-[color:var(--text-tertiary)] uppercase`
- **Section headers** (`text-sm font-medium text-white/60 mb-3`) → `section-label` class
- **Close buttons** (`text-white/40 hover:text-white`) → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- **Required asterisks** (`text-red-400`) → `text-[color:var(--status-error-text)]`

---

## Admin Portal Components — Line-by-Line Changes

### 1. Collections Components

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

### 2. Customer Tab Components

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
- Lines 199, 226: These are KPI values with `text-2xl font-semibold` → `kpi-value` (see Phase 3 for details)
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

### 3. Dashboard Components

**`components/dashboard/alerts-panel.tsx` (5 instances + 1 status):**
- Line 22: `'bg-red-500/20 text-red-400 border-red-500/30'` → error compound
- Lines 41, 49: `text-white/60` → replace with `section-label` class
- Lines 42, 51: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 76: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Line 79: `text-white/80` → `text-[color:var(--text-primary)]`

**`components/dashboard/trend-chart.tsx` (1 instance):**
- Line 123: `text-white/60` → replace with `section-label` class

### 4. Feedback Component

**`components/feedback/feedback-button.tsx` (5 instances + 1 status):**
- Lines 107, 123, 139, 153: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 140: `text-red-400` → `text-[color:var(--status-error-text)]` (required asterisk)
- Line 164: `text-white/30` → `text-[color:var(--text-tertiary)]`

### 5. Lender Components

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

### 6. Loan Components

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

### 7. Platform Components

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
- Line 194: `text-white/60 bg-white/5` → `text-[color:var(--text-secondary)] bg-[color:var(--bg-muted)]`
- Lines 206, 371, 374, 231: `text-white/40` → `text-[color:var(--text-tertiary)]`

**`components/platform/tenant-list-table.tsx` (8 instances + 2 status):**
- Lines 29–32: status badge maps → compound mappings
- Line 34: fallback → muted compound
- Lines 78, 86: `text-white/40` → `text-[color:var(--text-secondary)]`
- Line 117: `text-white/30` → `text-[color:var(--text-tertiary)]`
- Lines 129, 130: `text-white/70` → `text-[color:var(--text-primary)]`
- Line 131: `text-white/50` → `text-[color:var(--text-secondary)]`

### 8. Product Wizard Components

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

### 9. Report Components

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
- Line 314: `text-[#8E44C8]` → `text-[color:var(--status-info-text)]` (hardcoded hex fix)
- Lines 302, 308, 314: `text-2xl font-semibold` → `kpi-value` (see Phase 3 Category V for full list)
- Lines 322, 323, 332, 334, 342, 344, 356, 374, 438, 444, 448, 457, 464, 483: `text-white/` → apply mapping
- Line 87: `text-white font-medium` in product performance → `text-[color:var(--text-primary)] font-medium`

**`product-performance-report.tsx` specific:**
- Line 75: `text-white/80` → `text-[color:var(--text-primary)]`
- Lines 78, 82, 86, 92: `text-white/40` → `text-[color:var(--text-tertiary)]`
- Line 83: `text-emerald-400` → `text-[color:var(--status-success-text)]`
- Line 87: `text-red-400` → `text-[color:var(--status-error-text)]`, `text-white` → `text-[color:var(--text-primary)]`

### 10. Other Components

**`components/survey/nps-widget.tsx`:**
- Line 50: `text-white/40 hover:text-white` → `text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]`
- Line 57: `text-white/60` → `text-[color:var(--text-secondary)]`
- Line 73: `bg-white/10 text-white/70 hover:bg-white/20` → `bg-[color:var(--bg-muted)] text-[color:var(--text-primary)] hover:bg-[color:var(--bg-hover)]`
- Line 81: `text-white/30` → `text-[color:var(--text-tertiary)]`

**`components/products/wizard/field-error.tsx`:**
- Line 18: `text-red-400` → `text-[color:var(--status-error-text)]`
- Line 42: `text-red-400` → `text-[color:var(--status-error-text)]`

---

## What NOT to Change

- **Do NOT modify `globals.css`** — the token layer is complete.
- **Do NOT modify `dashboard/page.tsx`** — already done.
- **Do NOT modify `sidebar.tsx`** — already overhauled.
- **Do NOT modify `metric-card.tsx`** — already overhauled.
- **Do NOT change `glass-input` or `glass-button` or `glass-button-primary`** — acceptable form element classes.
- **Do NOT introduce new npm dependencies.**
- **Do NOT change GraphQL queries, data logic, or routing.**

---

## Summary of Actions for Dev (Phase 2)

1. Open each of the 42 admin component files listed in sections 1–10 above.
2. Apply the Master Color Mapping Table to every `text-white/`, `bg-white/`, and `border-white/` instance.
3. Replace all hardcoded Tailwind status colors with CSS variable equivalents.
4. Replace compound badge patterns as a unit.
5. Replace `glass` instances with appropriate card variants where noted (step-approval, step-notifications, step-funding-source).
6. Replace `text-2xl font-semibold` with `kpi-value` where noted (revenue-report, tab-credit-summary).
7. Replace hardcoded hex `text-[#8E44C8]` with `text-[color:var(--status-info-text)]` in revenue-report.
8. After completing Phase 2, proceed to Phase 3 (platform portal + verification).
