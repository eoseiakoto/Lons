# PM Briefing for BA: Portal Rebuild Delivery Review

**From:** PM
**To:** BA
**Date:** 2026-04-30 (updated with Emmanuel's decisions from 2026-04-27)
**Re:** Dev delivery `DELIVERY-NOTES-PORTAL-REBUILD-2026-04-26.md` — resolved decisions + remaining items requiring BA action

---

## Context

Dev delivered a "mission-control rebuild + polish" across both portals (`apps/admin-portal`, `apps/platform-portal`). The delivery covers:

- 60+ page visual rebuilds across both portals
- 7 new shared UI primitives (Sparkline, AreaChart, Gauge, ProgressBar, FilterPill, SlideOver, PageHeader)
- Mobile responsive layout (375px) with MobileNavProvider + hamburger nav
- Accessibility additions (MotionConfig reducedMotion, ARIA roles, FilterPill keyboard nav, SlideOver focus-trap)
- Performance: motion.tr → CSS keyframe migration (13 list pages)
- i18n: eyebrow namespace with 19 keys across 7 locales
- Humanizer pass: 22 page subtitles + 10 i18n description strings rewritten
- 9 bug fixes
- Quality bar: lint-clean, typecheck-clean, build-clean

**Key constraint from the delivery:** "No business logic changed. Every GraphQL query, mutation, and resolver remained intact. Only presentation, copy, and accessibility were touched."

The full delivery document is at `Docs/DELIVERY-NOTES-PORTAL-REBUILD-2026-04-26.md`. Read it in full before proceeding.

---

## RESOLVED — Emmanuel's Decisions (2026-04-27)

### 1. Brand Color: Emerald Approved, Coral Retired

Emmanuel reviewed and approved the emerald accent (`#10B97D` light / `#1FE08A` dark). Coral (`#FF6B35`) is retired.

**BA action required:**
- Update any BA design system documentation or specs that reference coral to reflect emerald.
- Update CLAUDE.md color references if they mention coral.
- Verify Dev's implementation is consistent: the `--accent-primary` and `--accent-primary-rgb` tokens should be emerald in both `globals.css` files (admin + platform portals, light + dark modes).
- The 5 stale coral references in CSS comments (globals.css lines 361, 645, 664, 741, 950) need a cleanup ticket — write a brief fix doc for Dev or include in the next fix round.

**Monday.com:** Item 11853861151 — PM to update status from "To Do" to reflect decision. Item 11853871130 (CSS comment cleanup) is now unblocked.

---

### 2. Mission-Control Visual Language: Approved

Emmanuel reviewed the animated orb backdrop, glow card variants, translucent sidebar/header, and edge-sweep animations in-browser and approved them for production.

**BA action required:**
- Do NOT flag the mission-control aesthetic as a gap going forward — it is the approved visual direction.
- Document the new visual primitives in any design system docs the BA maintains:
  - `PageBackdrop` — 3 emerald/cyan orbs + grid, singleton pattern, mounted at layout level
  - `.card-glow`, `.card-glow-hero`, `.card-glow-sweep` — card variants with animated edges
  - `edgeSweep`, `liveDot`, `kpiGlowBreath`, `tableRowReveal` — keyframe animations
  - Translucent sidebar/header via `color-mix()` + `backdrop-blur-2xl`
  - `MotionConfig reducedMotion="user"` wraps both portals (accessibility preserved)
  - Print stylesheet flattens to high-contrast B/W (no orbs, no glow, no sidebar)
- Future specs should reference these primitives rather than specifying new visual patterns.

**Monday.com:** Item 11853861290 — PM to mark as Done.

---

## OPEN — Items Requiring BA Analysis

### 3. HIGH — Skip-to-Main-Content Accessibility Link Missing

**What happened:** Delivery notes (item #10, Accessibility) claim "skip-to-main-content link in both layouts." PM verification found **no evidence** of this in either portal.

**PM verification method:** Grep across all layout files in both portals:
- `apps/{admin,platform}-portal/src/app/(portal)/layout.tsx`
- `apps/{admin,platform}-portal/src/components/layout/{sidebar,header}.tsx`
- `apps/{admin,platform}-portal/src/app/layout.tsx`

None contain `skip`, `main-content`, or any visually-hidden bypass link pattern.

**Why this matters:** WCAG 2.1 AA requirement — Success Criterion 2.4.1 (Bypass Blocks). Required for accessibility compliance, especially for a fintech platform that will face regulatory scrutiny.

**BA action:** Write a fix doc (`Docs/FIX-SKIP-LINK.md`) for Dev specifying:
- Visually-hidden link as first focusable element in both portal root layouts
- Targets `#main-content` (or equivalent `id` on the `<main>` element)
- Becomes visible on `:focus` for keyboard users
- Suggested implementation pattern: `<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 ...">Skip to main content</a>`
- Corresponding `id="main-content"` on the `<main>` element in both portal layouts
- Must work with the existing sidebar + header layout (link should appear above both)

**Monday.com:** Item 11853861568 (Sprint 9, High priority)

---

### 4. MEDIUM — Stale Non-English Translations (10 i18n keys)

**What happened:** The humanizer pass rewrote 10 i18n keys in English (mostly `products.wizard.*` namespace). The translations for ar/es/fr/ha/pt/sw were deliberately left stale.

**Dev's judgment was correct** — copying English into non-English locale files would degrade UX worse than stale translations. But the translations are now out of sync.

**Affected keys (from delivery notes):**
- `messages.subtitle`
- `feedback.management.subtitle`
- `products.wizard.approvalWorkflowDesc`
- `products.wizard.eligibilityDesc`
- `products.wizard.feesDesc`
- `products.wizard.notificationsDesc`
- `products.wizard.fundingSourceDesc`
- `products.wizard.autoApproveDesc`
- `products.wizard.thresholdHelpHybrid`
- `products.wizard.customRulesDesc`

**BA action:** Assess the translation workflow:
- Confirm whether the project has an established translation process or vendor.
- If yes: flag these 60 translations (6 languages × 10 keys) for the next translation batch.
- If no: recommend whether to defer to a dedicated translation sprint or handle incrementally. Consider that the 22 humanized *subtitles* are hardcoded English (not i18n), so they only affect English users — the 10 i18n keys are the ones that create cross-locale inconsistency.

**Monday.com:** Item 11853859761 (Sprint 9, Medium priority)

---

### 5. MEDIUM — Platform Portal Has No i18n Infrastructure

**What happened:** Dev explicitly left this out, noting: "No infrastructure exists; would be a separate ~100-key initiative. Eyebrow strings stay literal."

**Context:** Admin portal has full i18n with `useI18n` hook, locale files for 7 languages (en, ar, es, fr, ha, pt, sw), and the new eyebrow namespace (19 keys). Platform portal has zero i18n — all strings are hardcoded English.

**BA action:** Size the initiative:
- Audit the platform portal to count hardcoded strings (Dev estimates ~100 keys).
- Determine which locales are required for platform-level operators — these are Lōns's own staff, not tenant users, so the locale set may be smaller (e.g., English + French for West Africa coverage).
- Recommend phasing: navigation/layout/sidebar first, then page by page.
- Produce a scope estimate for PM to slot into the sprint plan.

**Monday.com:** Item 11853861856 (Sprint 13, Medium priority)

---

## Sprint 8 Functional Items — All 9 Remain Open

The delivery explicitly states no business logic changed. None of the 9 Sprint 8 "In Review" items were addressed by the portal rebuild. PM has added review comments to each on Monday.com confirming they remain open and need functional implementation:

| Item ID | Name | Status |
|---------|------|--------|
| 11708084110 | Add Funding Source step to product wizard | In Review — functional work not started |
| 11708162407 | BUG: Audit Lender configuration in admin portal | In Review — functional work not started |
| 11708149659 | BUG: Fix Lender and stakeholder detail views | In Review — functional work not started |
| 11708159812 | Add credit scoring visibility | In Review — functional work not started |
| 11708142179 | Platform Portal: Add user management | In Review — functional work not started |
| 11708150027 | Platform Portal: Add audit log viewer | In Review — functional work not started |
| 11708162464 | Platform Portal: SP detail view with analytics | In Review — functional work not started |
| 11708150512 | SP Portal: Settlement report and revenue insights | In Review — functional work not started |
| 11708149685 | SP Portal: Send messages and notifications | In Review — functional work not started |

**BA action:** No action needed now. These items will need functional review against their specs when Dev implements them. The visual infrastructure (pages exist, primitives available) is in place from the rebuild — the gap is business logic, data integration, and GraphQL mutations.

---

## Cross-Reference: Platform Audit (2026-04-28)

The BA completed a full codebase audit on 2026-04-28 that found 48 findings including 3 P0 go-live blockers (float-for-money at service boundaries, RLS not implemented on core tables, no global AuthGuard on GraphQL server). The full audit is at `Docs/BA-PLATFORM-AUDIT-2026-04-28.md` with a PM briefing at `Docs/BA-BRIEF-P0-BLOCKERS-2026-04-28.md`.

The portal rebuild delivery does NOT address any of these findings — it was strictly presentation-layer work. The P0 blockers remain in flight for Sprint 10. BA should be aware that the portal's visual polish is ahead of its security and data integrity posture — the pretty UI is sitting on top of unauthenticated resolvers, float-based money, and no row-level security. This context matters when the BA reviews Sprint 10+ deliveries.

---

## What Dev Did Well (for BA's context)

These are not gaps — they're positive precedent the BA should reference in future specs:

- **motion.tr → CSS migration:** 13 list pages converted from framer-motion per-row animation (~100 motion engines per page) to a single CSS keyframe `.table-row-enter` with inline `animationDelay`. Sets the pattern for any future list animations.
- **FilterPill keyboard navigation:** Full arrow keys/Enter/Escape/Home/End support with `aria-haspopup="listbox"` and `aria-expanded`. Reference implementation for custom dropdown accessibility.
- **SlideOver focus-trap:** Right-anchored drawer with focus-trap, Escape-to-close, and focus restoration on unmount. Reference implementation for modal/drawer dialogs.
- **Gauge/ProgressBar ARIA:** `role="progressbar"` with `aria-valuenow/min/max/label`. Correct semantic usage for data visualization components.
- **pnpm verify:synced:** Script tracking 9 file pairs between portals, preventing drift. BA should reference this when specifying shared components.
- **Humanized copy:** Subtitle rewrites are notably better. "How the book looks today" vs. "Portfolio health at a glance — outstanding, risk, and collections in real time." The patterns removed (em dashes, "in real time", "configure and manage" verb-first AI patterns) should inform BA's future copy guidelines.
- **Singleton PageBackdrop:** Module-level mount count prevents duplicate animated backgrounds when components are nested. Good pattern for any layout-level visual component.

---

## Summary of BA Deliverables from This Brief

| # | Deliverable | Priority | Type |
|---|---|---|---|
| 1 | Update design docs: coral → emerald | High | Documentation update |
| 2 | Document mission-control primitives in design system docs | Medium | Documentation update |
| 3 | Write `FIX-SKIP-LINK.md` for Dev | High | Fix doc |
| 4 | Assess translation workflow for 10 stale i18n keys | Medium | Gap analysis |
| 5 | Size platform portal i18n initiative (~100 keys) | Medium | Scope estimate |

---

## Related Documents

- `Docs/DELIVERY-NOTES-PORTAL-REBUILD-2026-04-26.md` — Dev's full delivery notes
- `Docs/FOLLOWUP-TERTIARY-OVERHAUL-OBSERVATIONS.md` — 8 post-migration observations (already tracked on Monday.com as Sprint 9/13/14 items)
- `Docs/BA-PLATFORM-AUDIT-2026-04-28.md` — Full codebase audit (48 findings)
- `Docs/BA-BRIEF-P0-BLOCKERS-2026-04-28.md` — PM briefing on P0 blockers + P1 items
- `Docs/FIX-TERTIARY-PHASE1-ADMIN-PAGES.md` — Phase 1 of tertiary overhaul spec
- `Docs/FIX-TERTIARY-PHASE2-ADMIN-COMPONENTS.md` — Phase 2 of tertiary overhaul spec
- `Docs/FIX-TERTIARY-PHASE3-PLATFORM-VERIFY.md` — Phase 3 of tertiary overhaul spec
