# Follow-Up: Tertiary Overhaul — Non-Blocking Observations

**Context:** The tertiary CSS variable migration (Phases 1–3, see `FIX-TERTIARY-PHASE{1,2,3}-*.md`) is complete and verified. During the final review, the following observations were surfaced that fall **outside the plan's stated scope**. They are non-blocking for the migration itself, but worth tracking as separate tickets.

**Status date:** 2026-04-24
**Source:** Post-migration audit (3 independent review agents + direct inspection)

---

## 1. Document Saturated-Background `text-white` Exceptions

**Type:** Documentation / process
**Priority:** Low
**Effort:** S (15 min)

Several files use plain `text-white` (no opacity) as the foreground on saturated colored backgrounds (`bg-[color:var(--accent-primary)]`, `bg-[color:var(--status-success)]`, `bg-[color:var(--status-error)]`, etc.). This is correct — white is the accessible contrast foreground on these saturated fills. They are NOT migration gaps.

**However**, they are not currently enumerated in the plan's "What NOT to Change" lists, so future sweeps may re-flag them. Update the canonical exception list to include these patterns.

**Files with this pattern (for reference):**
- `apps/admin-portal/src/app/(portal)/products/[id]/page.tsx:92,101`
- `apps/admin-portal/src/app/login/page.tsx:53`
- `apps/admin-portal/src/components/layout/header.tsx:281,298`
- `apps/admin-portal/src/components/layout/sidebar.tsx:104,299`
- `apps/admin-portal/src/components/products/wizard/product-wizard.tsx:627`
- `apps/admin-portal/src/components/platform/tenant-create-wizard.tsx:122`
- `apps/admin-portal/src/components/platform/tenant-detail-tabs.tsx:161`
- `apps/platform-portal/src/app/(portal)/error.tsx:29`
- `apps/platform-portal/src/app/(portal)/tenants/create/page.tsx:260`

**Action:** Add a "Saturated-background foregrounds" section to the design system docs (or an `AGENTS.md` / CLAUDE.md color-exception block) listing these patterns as approved usage.

---

## 2. Accent-Primary Token Adoption Is Thin

**Type:** Design direction
**Priority:** Medium
**Effort:** M (design pass + selective adoption)

Only **25 references** to `--accent-primary*` tokens across 11 files (vs. 1163 `--text-*` and 342 `--status-*` references). Brand accent is underused as a visual affordance.

**Implication:** Primary CTAs, active tab indicators, and key interactive affordances currently read as neutral or status-colored. There's no "brand voice" in the UI.

**Action for PM/Design:**
- Decide where accent-primary should appear (primary buttons, active sidebar item, selected rows, active wizard step, link underlines).
- Produce a design spec that enumerates accent usage points.
- Migrate identified surfaces in a separate pass.

---

## 3. Introduce Semantic Button Utilities (`.button-primary`, `.button-secondary`)

**Type:** Refactor / design system
**Priority:** Medium
**Effort:** M–L (utility design + ~46 file migration)

The tertiary plan explicitly preserved `glass-button` and `glass-button-primary` utilities. They remain defined in `globals.css` and are used in ~46 `.tsx` files across both portals.

**Gap:** the rest of the design system now has semantic utilities (`.card`, `.card-flush`, `.pill-success`, `.input-field`, `.section-label`, `.kpi-value`), but button is still on a legacy class name.

**Action for PM/Design:**
- Define semantic button utilities: `.button-primary`, `.button-secondary`, `.button-ghost`, `.button-destructive`, `.button-link`.
- Spec sizing variants (`.button-sm`, `.button-md`, `.button-lg`).
- Migrate `glass-button*` usages and retire the legacy classes.

---

## 4. Extract Shared Status-Map Helper

**Type:** Refactor
**Priority:** Low
**Effort:** S–M

Three files define local `statusColors` / `severityColors` objects with duplicated logic:
- `apps/admin-portal/src/app/(portal)/platform/feedback/page.tsx`
- `apps/platform-portal/src/app/(portal)/feedback/page.tsx`
- `apps/platform-portal/src/app/(portal)/compliance/page.tsx`

Currently admin and platform match token-for-token, but nothing prevents drift. A shared helper (e.g., in `packages/common` or a shared design-system package) would provide a single source of truth for feedback status colors, severity colors, audit-log action colors, etc.

**Action:** Build a `statusTokens` utility in `packages/common/src/ui/` (or similar) that exports typed maps per domain.

---

## 5. Annotate `accent-primary-deep` Naming Convention

**Type:** Documentation inline
**Priority:** Very low
**Effort:** XS (1–2 lines of comment)

The accent family uses `-deep` (`--accent-primary-deep`) as the canonical high-contrast text variant, while the status families use `-text` (`--status-success-text`). This is intentional but reads as a typo to newcomers.

**Files where this convention appears:**
- `apps/admin-portal/src/app/(portal)/settings/audit-log/page.tsx:261` (`update` action)
- `apps/admin-portal/src/app/(portal)/platform/feedback/page.tsx:109,114` (SUGGESTION severity, ACKNOWLEDGED status)

**Action:** Either (a) rename the token to `--accent-primary-text` for family symmetry, or (b) add a brief comment in `globals.css` explaining the naming distinction.

---

## 6. NPS Promoter/Detractor Threshold Logic

**Type:** Product / business logic
**Priority:** Medium
**Effort:** S (logic change + test)

In `apps/platform-portal/src/app/(portal)/feedback/page.tsx:429`, the NPS numeral is rendered in `--status-success-text` when `nps.npsScore >= 0`, else `--status-error-text`.

**Pre-existing issue (not migration-related):** Standard NPS conventions classify:
- **Promoters**: score 9–10 (green)
- **Passives**: score 7–8 (yellow/neutral)
- **Detractors**: score 0–6 (red)

The current `>= 0` threshold makes any non-negative NPS appear as "success," including scores that would conventionally be read as neutral or negative.

The in-row score circles at `feedback/page.tsx:488–491` already use the correct 9+ / 7+ / <7 bands — so the page is internally inconsistent.

**Action for PM:**
- Confirm the desired NPS color thresholds.
- Update line 429 to match the score-circle logic (or whatever the product standard is).

---

## 7. Prune Unused CSS Tokens

**Type:** Cleanup
**Priority:** Very low
**Effort:** XS

The following tokens are defined in both `apps/admin-portal/src/app/globals.css` and `apps/platform-portal/src/app/globals.css` but are **not referenced** by any `.tsx` file:
- `--accent-primary-ring`
- `--border-strong`
- `--bg-tinted`
- `--text-on-accent`
- `--chart-grid`
- Some `--radius-*` variants
- Several `--ease-*` and `--shadow-*` tokens

They may be used inside CSS utility rules (`@layer components` blocks) or reserved for future features. Before pruning, audit CSS-side usage.

**Action:** Follow-up ticket — audit `.css` / `@layer` rule usage, then prune any tokens not referenced from either `.tsx` or `.css`.

---

## 8. Platform-Portal Feedback NPS Score Circles Use 2-Token Pattern

**Type:** Design confirmation (likely intentional)
**Priority:** Very low — close as "working as designed" unless Design disagrees
**Effort:** XS (confirmation only)

At `apps/platform-portal/src/app/(portal)/feedback/page.tsx:488-491`, the round NPS score badges use `bg-[color:var(--status-*-soft)] text-[color:var(--status-*-text)]` (2-token pattern) while other status badges in the codebase use the full 3-token trio including a border.

**Assessment:** Likely intentional — these are tight `w-8 h-8 rounded-full` score circles where adding a visible border would compete with the soft-fill visual. The 2-token form reads correctly.

**Action:** Design to confirm this is the intended pattern for circular score badges, then document as an approved pattern variant in the design system.

---

## Ticket Suggestion Summary

| # | Item | Priority | Effort | Owner |
|---|---|---|---|---|
| 1 | Document saturated-bg `text-white` exceptions | Low | S | Eng docs |
| 2 | Accent-primary adoption design pass | Medium | M | Design + Eng |
| 3 | Semantic button utilities | Medium | M–L | Design + Eng |
| 4 | Shared status-map helper | Low | S–M | Eng |
| 5 | Accent token naming annotation | Very low | XS | Eng |
| 6 | NPS threshold logic fix | Medium | S | Product + Eng |
| 7 | Prune unused CSS tokens | Very low | XS | Eng |
| 8 | Confirm NPS circle 2-token pattern | Very low | XS | Design |

---

## Out of Scope (Explicit Plan Exemptions — Do Not Touch)

These are intentional and should remain as-is unless the entire design system direction changes:

- `apps/admin-portal/src/app/(portal)/debug/page.tsx` — HTTP method coloring.
- `apps/admin-portal/src/app/(portal)/settings/integrations/page.tsx` — light-mode integration UI.
- `apps/admin-portal/src/app/(portal)/platform/integrations/page.tsx` — light-mode integration UI.
- `apps/admin-portal/src/components/survey/nps-widget.tsx` L69–72 — saturated-bg selection states.
- `apps/admin-portal/src/components/feedback/feedback-button.tsx` L91 — indigo brand floating widget.
- `ring-red-500/50` input-error rings — codebase `errorInputCls` convention.
- Chart color props (recharts `color=`, `Cell fill=`, tick fill strings) — data visualization, not UI styling.
