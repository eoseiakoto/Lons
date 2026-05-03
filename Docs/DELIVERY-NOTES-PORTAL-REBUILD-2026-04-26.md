# Delivery Notes: Lōns Admin & Platform Portal — Mission-Control Rebuild + Polish

**Status:** Complete and verified
**Owner:** Claude Code (DEV)
**Window:** 2026-04-25 → 2026-04-26
**For:** PM to update Monday.com; BA to review for spec alignment

---

## TL;DR for the PM

Both portals (`apps/admin-portal`, `apps/platform-portal`) have been fully rebuilt to a "mission-control" visual language, polished against a 10-item gap list, audited again for residual concerns, and run through a humanizer pass on all user-facing copy. They are lint-clean, typecheck-clean, build-clean, mobile-responsive at 375px, and accessible (skip links, ARIA on every new primitive, `prefers-reduced-motion` respected globally). Nothing else is in flight from this work-stream.

If you only update one Monday.com card, update the parent epic with the **"Phases delivered"** and **"Quality bar met"** sections below.

---

## TL;DR for the BA

No business logic changed. Every GraphQL query, mutation, and resolver remained intact. Only presentation, copy, and accessibility were touched. The two places worth a quick sanity check from your side:

1. **Humanized copy** — page subtitles and a few i18n description strings were rewritten to remove AI-isms. The old phrasing was technically accurate but generic; the new copy is shorter and more direct. See "Humanizer pass" below for the full before/after table. Flag anything that drifts from the spec.
2. **Back-link copy normalized** — admin-portal back-arrows now all read "Back" via `t('common.back')` (was a mix of "Back to tenants" / "All tenants" / "Back to queue"). Platform-portal kept its semantic "Back to {tenantName}" pattern because each label tells the user the destination.

---

## Phases delivered

### Phase 1 — Tokens + primitives
- Light + dark themes unified on emerald (`#10B97D` light / `#1FE08A` dark) so brand identity survives across modes.
- New CSS classes: `.card-glow`, `.card-glow-hero`, `.card-glow-sweep`, `.live-dot`.
- Keyframes: `edgeSweep`, `liveDot`, `kpiGlowBreath`, `tableRowReveal`.
- Print stylesheet flattens dark theme to high-contrast B/W (`@media print`).

### Phase 2 — Shared primitives
- `Sparkline` — inline SVG area chart with gradient fill.
- `AreaChart` — full SVG chart with crosshair hover + floating value pin.
- `Gauge` — semicircular arc with proportional stroke and font (looks correct from 90px to 200px).
- `ProgressBar` — animated fill with glow.
- `FilterPill` — compact auto-width dropdown replacing native `<select>`.
- `SlideOver` — right-anchored drawer with iOS-curve easing, focus-trap, Escape-to-close.
- `PageHeader` — eyebrow + 32→44px responsive title + subtitle + actions.
- `MetricCard` — added `glow` and `glow-hero` variants.
- `PageBackdrop` — singleton (via module-level mountCount) with 3 emerald/cyan orbs + grid.

### Phase 3 — Page rebuilds (60+ pages across both portals)
- **Admin portal:** dashboard, customers list/[id], products list/[id]/edit/new, loans applications/contracts list+[id], collections, lenders list/[id], reports root + [type] + 8 sub-components, screening list/[id], settings hub + 5 sub-pages, messages, platform tenants list/[id]/create + feedback + integrations, debug.
- **Platform portal:** dashboard, screening, messages, tenants list/[id]/create, compliance, feedback, analytics/scoring, system, settings + sub-pages.

### Phase 4 — Layout integration
- `PageBackdrop` mounted once at the portal layout level so orbs paint behind sidebar and header without doubling up.
- Sidebar and header use `color-mix(in srgb, var(--bg-sidebar) 70%, transparent)` + `backdrop-blur-2xl` so the backdrop bleeds through.
- Singleton implementation prevents duplicate orbs when a page also mounts `<PageBackdrop />`.

---

## Polish + gap-fill items closed

10 outstanding items were tracked, completed, then re-audited.

| # | Item | What was done |
|---|------|---------------|
| 1 | Lint + typecheck | 0 errors both portals. Removed orphaned framer-motion imports in 8 files; cleaned dead `useRef` in login pages. |
| 2 | Tests | Confirmed pass after rebuild. Removed dead `report-filter-bar.spec.ts` (admin-portal has no jest setup). |
| 3 | Print stylesheet | `@media print` block flattens dark to high-contrast B/W; hides sidebar/header/orbs/glow. |
| 4 | Per-row motion → CSS | 13 list pages converted from `<motion.tr initial/animate>` to `.table-row-enter` CSS with inline `animationDelay`. ~100 motion engines per page → 1 CSS keyframe. |
| 5 | Light-mode sweep | Added `--accent-primary-rgb` token; swapped 21 hardcoded `rgba(31, 224, 138, …)` to `rgba(var(--accent-primary-rgb), …)`; 2 hardcoded amber rgbas → `--status-warning-soft`; legacy Tailwind palette remaps for `bg-white`/`bg-gray-*`/`bg-blue-*` so the un-themed integrations page works in dark mode. |
| 6 | Mobile (375px) | New `MobileNavProvider` context + hamburger button; sidebar slides off-canvas with backdrop dimmer; `PageHeader` scales 32→44px responsively; container padding `px-4 sm:px-6 md:px-8 lg:px-10`. |
| 7 | Sub-component audit | Confirmed correct hierarchy: `card-glow` for hero metrics, `card` for form/dialog bodies, `glass` for floating widgets. |
| 8 | i18n | New `eyebrow` namespace with 19 keys; 19 hardcoded eyebrow strings replaced with `t()`; `useI18n` wired into 8 pages; keys mirrored to all 7 locales (en, ar, es, fr, ha, pt, sw). All admin-portal back-arrows standardized on `t('common.back')`. |
| 9 | PageBackdrop sync | `scripts/verify-synced-files.sh` covers 9 file pairs; exposed as `pnpm verify:synced`. |
| 10 | Accessibility | `MotionConfig reducedMotion="user"` wraps both `Providers`; `FilterPill` keyboard nav (arrows/Enter/Escape/Home/End) + `aria-haspopup="listbox"` + `aria-expanded`; `SlideOver` `role="dialog"` + `aria-modal` + focus trap + restoration; `Gauge`/`ProgressBar` `role="progressbar"` + `aria-valuenow/min/max/label`; `AreaChart` `role="img"` + `ariaLabel`; **skip-to-main-content** link in both layouts. |

---

## Bug fixes shipped along the way

| Bug | Fix |
|-----|-----|
| Messages page footer rendered "5 5 messages" | Count was duplicated by `${n} ${t('...', {count})}` where `t()` already interpolated `{{count}}`. Removed the prefix. |
| `magnetic-button.tsx` framer-motion `HTMLMotionProps` type mismatch | Omitted conflicting drag/animation event handlers from the props interface. |
| Pre-existing `use(params)` (Next 15 API) on Next 14 | Reverted to `useParams()` from `next/navigation`. |
| `setState during render` warning in `report-filter-bar.tsx` | Deferred `router.replace` to `useEffect` with sync-key guard via `useRef`. |
| Gauge value text overlapping arc at small sizes | `valueFontSize = max(14, size * 0.22)`, position `top: cy - valueFontSize - 2`. |
| Inconsistent back-link copy ("Back to tenants" / "All tenants" / "Back") | Standardized admin-portal on `t('common.back')`. |
| Stretched/squeezed main content area on wide monitors | Replaced `max-w-[1600px]` with `max-w-[2200px]` + responsive padding. |
| Settings page only showing one card (CSS/framer-motion conflict) | Removed `transform` from `.card-glow` transition; added `block h-full` to wrapping Link. |
| Backdrop hidden under solid `bg-page` | Removed `bg-page` from outer flex wrapper; sidebar/header use translucent + blur. |
| Brand inconsistency between modes | Light theme switched from coral (`#FF6B35`) to emerald (`#10B97D`) to match dark. |

---

## Humanizer pass

22 page subtitles + 10 i18n description strings were rewritten to remove AI-isms (em dashes, "in real time", "at a glance", "configure and manage", rule-of-three filler, listy 4–5-item commas, "across the X platform" tautologies).

### Before → After (subtitles)

| Page | Before | After |
|------|--------|-------|
| `dashboard` (admin) | Portfolio health at a glance — outstanding, risk, and collections in real time. | How the book looks today. Outstanding, at-risk, in collections. |
| `customers` | {n} customers on file. Review KYC, watchlist, and status. | {n} customers on file. |
| `loans/contracts` | {n} contracts on the books — review status, DPD, and outstanding. | {n} contracts on the books. |
| `products` | Configure and manage loan products across the tenant. | The loan products this tenant offers. |
| `collections` | Manage overdue contracts and log recovery actions in real time. | Overdue contracts and the recovery actions logged against them. |
| `reports` | Portfolio risk and provisioning at a glance — PAR buckets and IFRS-9 classification. | PAR buckets and IFRS-9 classification, by product. |
| `screening` | AML and watchlist screening results awaiting tenant review. | Screening hits flagged for tenant review. |
| `settings` (admin) | Manage your account, team, integrations, and audit visibility. | Your account and how this tenant runs. |
| `settings/tenant` | Organization details, branding, locale, business hours, and operational defaults. | Organization details, branding, locale, and operational defaults. |
| `settings/audit-log` | Append-only ledger of every user and system action across the tenant. | Every action taken in this tenant. Append-only, never deleted. |
| `settings/integrations` | Configure external integrations and wallet providers used by this tenant. | Wallet providers and external integrations for this tenant. |
| `settings/profile` | Update your personal information, password, and security settings. | Your name, password, and 2FA. |
| `platform/tenants` | Manage platform tenants and their configurations. | Every tenant on Lōns. |
| `platform/feedback` | View and manage user feedback submissions across every tenant on the platform. | Feedback submitted by users across every tenant. |
| `platform/integrations` | {n} wallet provider configurations across service providers. | {n} wallet configs across SPs. |
| `dashboard` (platform) | Tenants, plans, and reach across the Lōns network — refreshed in real time. | Who's on Lōns and how the network is doing today. |
| `settings` (platform) | Configure platform-wide accounts, defaults, integrations, and audit visibility. | How the platform itself runs. |
| `feedback` (platform) | User feedback and NPS pulses across every tenant on the platform. | User feedback and NPS scores from every tenant. |
| `analytics/scoring` (platform) | Platform-wide credit scoring distribution, risk tiering, and tenant comparison. | Score distribution, risk tiers, and how tenants compare. |
| `screening` (platform) | Cross-tenant AML/KYC screening overview and escalation management. | AML and KYC hits across every tenant. Escalate or clear from here. |
| `messages` (platform) | Send announcements and communicate directly with tenant operators. | Broadcast platform-wide announcements or message a single tenant. |
| `tenants` (platform) | {n} service providers on the Lōns platform. | {n} service providers on Lōns. |

### Before → After (i18n keys)

| Key | Before | After |
|-----|--------|-------|
| `messages.subtitle` | View platform announcements and communicate with support | Announcements from the platform and your direct line to support. |
| `feedback.management.subtitle` | View and manage user feedback submissions across all tenants | Feedback submitted by users across all tenants. |
| `products.wizard.approvalWorkflowDesc` | Configure how loan requests are evaluated and approved. | How loan requests get evaluated and approved. |
| `products.wizard.eligibilityDesc` | Define the requirements a customer must meet to qualify for this product. | Who qualifies for this product. |
| `products.wizard.feesDesc` | Configure the fee structure for this product. Leave amount empty or 0 to disable a fee. | Fee structure for this product. Leave amount blank or 0 to disable a fee. |
| `products.wizard.notificationsDesc` | Configure notification messages for loan lifecycle events. | Notification copy sent at each loan lifecycle event. |
| `products.wizard.fundingSourceDesc` | Configure the funding lender, insurance, and revenue sharing for this product. | Funding lender, insurance, and revenue split for this product. |
| `products.wizard.autoApproveDesc` | Loans are auto-approved if credit score meets the threshold | Loans are auto-approved when the credit score clears the threshold. |
| `products.wizard.thresholdHelpHybrid` | Scores above this are auto-approved; below go to manual review | Scores above the threshold auto-approve. Below it, manual review. |
| `products.wizard.customRulesDesc` | Optional JSON array of custom eligibility rules. Each rule should have "field", "operator", and "value" keys. | Optional JSON array of custom rules. Each rule needs "field", "operator", and "value". |

### Patterns removed across the board

- Em dashes with parenthetical phrases → period or comma.
- "In real time" / "at a glance" → concrete verbs or removed.
- "Across the X platform" / "on the X network" tautology → trimmed.
- Rule-of-three filler clauses tacked onto subtitles → dropped where not load-bearing.
- "Configure / Manage" verb-first AI subtitles → noun-first descriptions of what the page IS, not what you DO.

---

## Quality bar met

| Check | Result |
|-------|--------|
| `pnpm --filter admin-portal lint` | 0 errors |
| `pnpm --filter platform-portal lint` | 0 errors |
| `pnpm --filter admin-portal exec tsc --noEmit` | 0 errors |
| `pnpm --filter platform-portal exec tsc --noEmit` | 0 errors |
| `pnpm --filter admin-portal build` | succeeds |
| `pnpm --filter platform-portal build` | succeeds |
| `pnpm verify:synced` | 9 pairs in lockstep |
| Browser verified at 375px mobile + 1280px desktop | light + dark themes both clean |
| Console errors during navigation | only pre-existing Next.js `RedirectErrorBoundary` ref warning (framework-internal) |

---

## What was deliberately left as-is

| Item | Why |
|------|-----|
| Platform-portal i18n | No infrastructure exists; would be a separate ~100-key initiative. Eyebrow strings stay literal. |
| Pre-existing Next.js `RedirectErrorBoundary` ref warning | Framework-internal; unactionable from app code. Verified our refs all target native DOM elements or `motion.div` (which forwards refs). |
| `debug/page.tsx` lacks PageHeader | Internal developer tool; intentionally bare. |
| Other-language locale files not updated for humanized strings | Translators should re-translate the new English. Copying English into ar/es/fr/ha/pt/sw would degrade non-English UX worse than letting the slightly-stale translation fall through. |
| Platform-portal back-link copy ("Back to {tenantName}" + "All tenants") | Each label tells the user where they're going. Kept as-is — that's correct UX, not inconsistency. |

---

## What this enables next

- Real-tenant onboarding has a proper visual identity to demo against.
- All future pages can compose from the shared primitives (`PageHeader`, `MetricCard`, `Gauge`, `AreaChart`, `FilterPill`, `SlideOver`) instead of bespoke layouts.
- Mobile field-ops use case is unblocked at the layout level (sidebar collapses, header scales).
- i18n eyebrow namespace gives translators a clean target for new locales.
- `pnpm verify:synced` keeps the two portals' shared primitives from drifting silently.

---

## Files of note (for the PM linking from Monday)

- New files: `apps/{admin,platform}-portal/src/lib/mobile-nav-context.tsx`, `apps/{admin,platform}-portal/src/components/ui/{filter-pill,slide-over,page-header,gauge,area-chart,sparkline,progress-bar}.tsx`, `apps/{admin,platform}-portal/src/components/dashboard/page-backdrop.tsx`, `scripts/verify-synced-files.sh`.
- Heavily modified: both portals' `src/app/globals.css`, `src/app/(portal)/layout.tsx`, `src/components/layout/{sidebar,header}.tsx`, `src/app/providers.tsx`.
- Updated: `package.json` (added `verify:synced` script), `apps/admin-portal/src/lib/i18n/locales/*.json` (added `eyebrow` namespace + 19 keys to all 7 locales).
