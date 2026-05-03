# Redesign: Lōns Platform — Full UI/UX Overhaul

**Priority: HIGH**
**Owner: Claude Code (DEV)**
**Date: 2026-04-23**

---

## Objective

Redesign the entire UI/UX of both the **Admin Portal** and **Platform Portal** from the current dark glass-morphism aesthetic to a premium, Apple-inspired design language. The new design must support both **light mode** (default) and **dark mode** (toggle), drawing from the reference dashboard image provided by the product owner.

---

## Skills to Use

Before writing any code, read and follow the instructions in the following skill files. These are mandatory — they contain battle-tested guidance for producing high-quality, professional UI:

### Core Design Skills (read first — these set the quality bar):

1. **`/mnt/.claude/skills/redesign-existing-projects/SKILL.md`** — Primary skill for this task. Covers auditing the current dark theme, identifying generic AI patterns, and applying premium standards systematically across an existing codebase.
2. **`/mnt/.claude/skills/high-end-visual-design/SKILL.md`** — Defines the exact fonts, spacing, shadows, card structures, and animations that separate expensive-feeling design from generic AI output. Blocks common defaults.
3. **`/mnt/.claude/skills/design-taste-frontend/SKILL.md`** — Senior UI/UX engineering principles. Overrides default LLM biases with metric-based rules, strict component architecture, and CSS hardware acceleration.
4. **`/mnt/.claude/skills/impeccable/SKILL.md`** — Production-grade frontend with high design quality. Use `craft` mode for shape-then-build, ensuring design decisions are made before code is written.
5. **`/mnt/.claude/skills/emil-design-eng/SKILL.md`** — Emil Kowalski's philosophy on the invisible details that make software feel right — transition easing, spacing rhythm, component polish, animation restraint.
6. **`/mnt/.claude/skills/minimalist-ui/SKILL.md`** — Clean editorial-style interfaces with warm monochrome palettes, typographic contrast, and flat bento grids. Directly aligned with the Apple-clean aesthetic in the reference image. No gradients, no heavy shadows.
7. **`/mnt/.claude/skills/distill/SKILL.md`** — Strip designs to their essence by removing unnecessary complexity. Apple's entire design language is about distillation — this skill enforces that principle.

### Specific Discipline Skills (apply during implementation):

8. **`/mnt/.claude/skills/layout/SKILL.md`** — Fixes monotonous grids and inconsistent spacing. Critical for the generous whitespace and asymmetric card compositions visible in the reference image.
9. **`/mnt/.claude/skills/typeset/SKILL.md`** — Typography hierarchy — font sizing, weight, tracking, line-height, and readability. Ensures SF Pro is applied with Apple's exact typographic conventions.
10. **`/mnt/.claude/skills/colorize/SKILL.md`** — Strategic color application. Guides how to deploy the coral/amber/gray palette without oversaturating or under-using the accent colors.
11. **`/mnt/.claude/skills/animate/SKILL.md`** — Purposeful animations and micro-interactions — hover states, page transitions, loading skeleton shimmer. Makes the UI feel alive without being distracting.
12. **`/mnt/.claude/skills/delight/SKILL.md`** — Moments of joy, personality, and unexpected touches — memorable empty states, subtle hover feedback, satisfying button presses. Elevates functional to premium.
13. **`/mnt/.claude/skills/adapt/SKILL.md`** — Responsive design: breakpoints, fluid layouts, and touch targets. A full redesign must work across desktop, tablet, and mobile viewports.

### Quality Assurance Skills (apply at the end):

14. **`/mnt/.claude/skills/polish/SKILL.md`** — Final quality pass for alignment, spacing, consistency, and micro-detail issues. Run this before declaring any page done.
15. **`/mnt/.claude/skills/critique/SKILL.md`** — UX evaluation with quantitative scoring, persona-based testing, and automated anti-pattern detection. Self-critique the redesign to catch issues before review.
16. **`/mnt/.claude/skills/audit/SKILL.md`** — Technical quality checks across accessibility (WCAG), performance, theming (light/dark), and responsive design. Generates a scored report with severity ratings. Run as the final verification step.

### Output Quality:

17. **`/mnt/.claude/skills/full-output-enforcement/SKILL.md`** — Enforces complete code generation with no placeholder patterns or truncation. With ~100 files to update, this ensures every file gets complete, unabridged output.

Read ALL 17 skills before starting. They collectively define the quality bar and the workflow: design skills first → discipline skills during implementation → QA skills at the end.

---

## Design Language — Extracted from Reference Image

### Color Palette

The reference image shows a sophisticated, data-rich dashboard aesthetic. Extract and apply the following palette:

#### Light Mode (Default)

| Role | Value | Usage |
|---|---|---|
| **Background — page** | `#F8F9FA` | Main page background — warm off-white, not pure white |
| **Background — card** | `#FFFFFF` | Card/panel surfaces |
| **Background — sidebar** | `#FAFBFC` | Sidebar background — barely distinguishable from page |
| **Background — elevated** | `#FFFFFF` | Modals, dropdowns, popovers |
| **Border — subtle** | `rgba(0, 0, 0, 0.06)` | Card borders, dividers — barely visible |
| **Border — default** | `rgba(0, 0, 0, 0.10)` | Input borders, table row separators |
| **Text — primary** | `#1D1D1F` | Apple's standard primary text — near-black |
| **Text — secondary** | `#6E6E73` | Labels, descriptions, metadata |
| **Text — tertiary** | `#AEAEB2` | Placeholders, disabled text |
| **Accent — primary (coral/orange-red)** | `#FF6B35` | Primary action buttons, active nav items, key metrics, chart accents — this is the hero color from the reference |
| **Accent — primary hover** | `#E55A2B` | Hover state for primary accent |
| **Accent — secondary (warm amber)** | `#FFB347` | Secondary charts, donut segments, warning states |
| **Accent — tertiary (soft red)** | `#E54D2E` | Critical alerts, overdue indicators |
| **Status — success** | `#34C759` | Apple green — approved, completed, healthy |
| **Status — warning** | `#FF9500` | Apple orange — attention, pending |
| **Status — error** | `#FF3B30` | Apple red — errors, critical, blocked |
| **Status — info** | `#007AFF` | Apple blue — informational, links |
| **Chart — line 1** | `#FF6B35` | Primary series (coral) |
| **Chart — line 2** | `#AEAEB2` | Secondary series (gray) |
| **Chart — line 3** | `#FFB347` | Tertiary series (amber) |
| **Chart — gradient fill** | `rgba(255, 107, 53, 0.08)` → `transparent` | Area chart gradient fills from reference |
| **Shadow — card** | `0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)` | Subtle depth on cards |
| **Shadow — elevated** | `0 4px 12px rgba(0, 0, 0, 0.08)` | Modals, dropdowns |

#### Dark Mode

| Role | Value | Usage |
|---|---|---|
| **Background — page** | `#0D1117` | GitHub-dark inspired — rich, deep |
| **Background — card** | `#161B22` | Card surfaces |
| **Background — sidebar** | `#0D1117` | Sidebar matches page |
| **Background — elevated** | `#1C2128` | Modals, dropdowns |
| **Border — subtle** | `rgba(255, 255, 255, 0.06)` | Card borders |
| **Border — default** | `rgba(255, 255, 255, 0.10)` | Input borders |
| **Text — primary** | `#F0F0F0` | Primary text |
| **Text — secondary** | `rgba(255, 255, 255, 0.55)` | Labels, descriptions |
| **Text — tertiary** | `rgba(255, 255, 255, 0.30)` | Placeholders |
| **Accent — primary** | `#FF7A4D` | Slightly lighter coral for dark backgrounds |
| **Shadow — card** | `0 1px 3px rgba(0, 0, 0, 0.3)` | Deeper shadows in dark mode |

### Typography — SF Pro (Apple System Font Stack)

The font stack is already set correctly in both portals' `globals.css`:
```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
```

Apply Apple's typographic hierarchy:

| Element | Weight | Size | Tracking | Line Height |
|---|---|---|---|---|
| Page title (h1) | 700 (Bold) | 28px / `text-[28px]` | `-0.02em` | 1.2 |
| Section header (h2) | 600 (Semibold) | 20px / `text-xl` | `-0.01em` | 1.3 |
| Card title (h3) | 600 (Semibold) | 15px / `text-[15px]` | `-0.01em` | 1.4 |
| Body text | 400 (Regular) | 14px / `text-sm` | `normal` | 1.5 |
| Caption / metadata | 400 (Regular) | 12px / `text-xs` | `0.01em` | 1.4 |
| KPI large number | 700 (Bold) | 36px / `text-4xl` | `-0.03em` | 1.1 |
| KPI small number | 600 (Semibold) | 24px / `text-2xl` | `-0.02em` | 1.2 |
| Nav item | 500 (Medium) | 14px / `text-sm` | `normal` | 1.5 |
| Button label | 500 (Medium) | 14px / `text-sm` | `0.01em` | 1 |
| Table header | 500 (Medium) | 12px / `text-xs` | `0.05em` (uppercase) | 1.4 |
| Table cell | 400 (Regular) | 14px / `text-sm` | `normal` | 1.5 |

### Visual Patterns from Reference Image

1. **Large KPI cards** — Big numbers (36px bold) with trend indicators (up/down arrows with % change in green/red). Cards are white with minimal borders and subtle shadows. The reference shows these prominently at the top of each dashboard view.

2. **Area charts with gradient fills** — Line charts with a coral/orange gradient fill that fades to transparent. Clean axis labels in gray. No heavy gridlines — use very faint dashed lines or none.

3. **Donut/ring charts** — Partial ring charts (not full pie) showing metrics with the large number in the center. Use coral as the filled portion, light gray for the remainder.

4. **Bar charts** — Vertical bars in dark gray/charcoal with coral accent for highlighted or current period. Clean, minimal axis labels.

5. **Abstract data mountain visualizations** — The reference shows flowing gradient shapes that look like mountain ridges or waveforms. These are decorative data visualizations using gradient fills (coral → transparent). Apply these as hero elements on dashboards, not on every page.

6. **Card-based layout** — Everything lives in white cards with 16–24px padding, subtle borders (`rgba(0,0,0,0.06)`), and barely-there shadows. Cards use `rounded-xl` (12px radius).

7. **Generous whitespace** — The reference is notably spacious. Use 24px gaps between cards, 20–24px internal padding, 16px+ between elements within cards.

8. **Sidebar** — Clean, light, with icon + text navigation. Active item highlighted with coral accent (left border or background tint). No heavy backgrounds.

---

## Implementation Plan

### Phase 1: Design System Foundation

Build the shared design tokens and base components first. Everything else depends on this.

#### 1.1 — CSS Custom Properties and Dark Mode Toggle

**Files to modify:**
- `apps/admin-portal/src/app/globals.css`
- `apps/platform-portal/src/app/globals.css`
- `apps/admin-portal/tailwind.config.ts`
- `apps/platform-portal/tailwind.config.ts`

Replace the current `globals.css` in BOTH portals. The new CSS should:

1. Define all colors as CSS custom properties under `:root` (light) and `.dark` / `[data-theme="dark"]` selectors
2. Replace all `.glass-*` utility classes with new semantic component classes that reference CSS variables
3. Add smooth `transition` on `background-color` and `color` for theme switching

Example structure:
```css
:root {
  --bg-page: #F8F9FA;
  --bg-card: #FFFFFF;
  --bg-sidebar: #FAFBFC;
  --bg-elevated: #FFFFFF;
  --border-subtle: rgba(0, 0, 0, 0.06);
  --border-default: rgba(0, 0, 0, 0.10);
  --text-primary: #1D1D1F;
  --text-secondary: #6E6E73;
  --text-tertiary: #AEAEB2;
  --accent-primary: #FF6B35;
  --accent-primary-hover: #E55A2B;
  --accent-secondary: #FFB347;
  --accent-tertiary: #E54D2E;
  --status-success: #34C759;
  --status-warning: #FF9500;
  --status-error: #FF3B30;
  --status-info: #007AFF;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] {
  --bg-page: #0D1117;
  --bg-card: #161B22;
  --bg-sidebar: #0D1117;
  --bg-elevated: #1C2128;
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.10);
  --text-primary: #F0F0F0;
  --text-secondary: rgba(255, 255, 255, 0.55);
  --text-tertiary: rgba(255, 255, 255, 0.30);
  --accent-primary: #FF7A4D;
  --accent-primary-hover: #FF6B35;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.4);
}
```

New component classes to replace `.glass-*`:
```css
@layer components {
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    box-shadow: var(--shadow-card);
  }
  .card-elevated {
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    box-shadow: var(--shadow-elevated);
  }
  .input-field {
    background: var(--bg-card);
    border: 1px solid var(--border-default);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text-primary);
    font-size: 14px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .input-field:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.12);
  }
  .input-field::placeholder {
    color: var(--text-tertiary);
  }
  .btn-primary {
    background: var(--accent-primary);
    color: #FFFFFF;
    font-weight: 500;
    font-size: 14px;
    padding: 10px 20px;
    border-radius: 8px;
    transition: background 0.2s, transform 0.1s;
  }
  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }
  .btn-primary:active {
    transform: scale(0.98);
  }
  .btn-secondary {
    background: transparent;
    color: var(--text-primary);
    font-weight: 500;
    font-size: 14px;
    padding: 10px 20px;
    border: 1px solid var(--border-default);
    border-radius: 8px;
    transition: background 0.2s;
  }
  .btn-secondary:hover {
    background: rgba(0, 0, 0, 0.04);
  }
}
```

#### 1.2 — Update Tailwind Config

Extend both portals' `tailwind.config.ts` to reference the CSS variables so you can use Tailwind utility classes like `bg-page`, `text-primary`, `border-subtle`, etc.:

```typescript
theme: {
  extend: {
    colors: {
      page: 'var(--bg-page)',
      card: 'var(--bg-card)',
      sidebar: 'var(--bg-sidebar)',
      elevated: 'var(--bg-elevated)',
      'border-subtle': 'var(--border-subtle)',
      'border-default': 'var(--border-default)',
      'text-primary': 'var(--text-primary)',
      'text-secondary': 'var(--text-secondary)',
      'text-tertiary': 'var(--text-tertiary)',
      accent: {
        DEFAULT: 'var(--accent-primary)',
        hover: 'var(--accent-primary-hover)',
        secondary: 'var(--accent-secondary)',
        tertiary: 'var(--accent-tertiary)',
      },
      status: {
        success: 'var(--status-success)',
        warning: 'var(--status-warning)',
        error: 'var(--status-error)',
        info: 'var(--status-info)',
      },
    },
    boxShadow: {
      card: 'var(--shadow-card)',
      elevated: 'var(--shadow-elevated)',
    },
  },
},
```

#### 1.3 — Theme Toggle Provider

Create a theme context provider that persists the user's choice in localStorage and applies `data-theme="dark"` on the `<html>` element.

**New file:** `apps/admin-portal/src/lib/theme-context.tsx`
**New file:** `apps/platform-portal/src/lib/theme-context.tsx`

The provider should:
- Default to light mode
- Read saved preference from localStorage on mount
- Respect `prefers-color-scheme` if no saved preference exists
- Expose `theme` and `toggleTheme` via context
- Set `data-theme` attribute on `<html>`

#### 1.4 — Root Layout Updates

**File:** `apps/admin-portal/src/app/layout.tsx`

Change the body background from the dark gradient:
```tsx
// From:
<body className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">

// To:
<body className="min-h-screen bg-page text-text-primary transition-colors duration-200">
```

Do the same for the platform-portal root layout.

---

### Phase 2: Shared UI Components

Update ALL shared components in `src/components/ui/` for BOTH portals. Each component must:
- Use CSS variables (not hardcoded colors)
- Work in both light and dark modes
- Follow Apple's spacing and border-radius conventions

#### Components to update:

**Admin Portal** (`apps/admin-portal/src/components/ui/`):

| Component | Key Changes |
|---|---|
| `metric-card.tsx` | White card, large KPI number (36px bold, `--text-primary`), trend arrow (green up / red down), subtitle in `--text-secondary`. Subtle shadow. No more `glass` or `bg-white/5`. |
| `status-badge.tsx` | Use Apple status colors. Light pill backgrounds (`bg-green-50 text-green-700` in light, `bg-green-500/20 text-green-400` in dark). Rounded-full, small text. |
| `data-table.tsx` | White card container. Header row with uppercase `text-xs font-medium tracking-wider` in `--text-secondary`. Row hover with `rgba(0,0,0,0.02)` (light) / `rgba(255,255,255,0.04)` (dark). Subtle row borders. |
| `filter-bar.tsx` | Clean select inputs and search box using `input-field` class. No backdrop blur. |
| `pagination-controls.tsx` | Rounded buttons, `--accent-primary` for active page. |
| `modal.tsx` | White card with `--shadow-elevated`, rounded-xl, smooth scale-in animation. |
| `drawer.tsx` | Slide-in from right, white background, subtle left border. |
| `skeleton.tsx` | Use `bg-gray-100` (light) / `bg-white/5` (dark) with subtle pulse. |
| `tabs.tsx` | Underline style — active tab has a 2px `--accent-primary` bottom border. Text toggles between `--text-secondary` (inactive) and `--text-primary` (active). |
| `breadcrumb.tsx` | Simple text path with `/` separators in `--text-tertiary`. |
| `search-input.tsx` | Clean input with search icon, rounded-lg, `input-field` styling. |
| `empty-state.tsx` | Centered icon + message in `--text-tertiary`. |
| `toast.tsx` | Floating card with left colored border (success=green, error=red, info=blue). |
| `date-range-picker.tsx` | Clean dropdown calendar, `input-field` styling. |
| `error-boundary.tsx` | Clean error card with `--status-error` accent. |

**Platform Portal** (`apps/platform-portal/src/components/ui/`):

Same treatment for: `metric-card.tsx`, `status-badge.tsx`, `data-table.tsx`, `drawer.tsx`.

#### Layout Components

**Both portals** — `src/components/layout/`:

| Component | Key Changes |
|---|---|
| `sidebar.tsx` | Light background (`--bg-sidebar`). Clean nav items with icons. Active item: coral left border or coral background tint. Logo at top. Theme toggle button at bottom. User avatar + dropdown at bottom. Remove glass/blur effects. |
| `header.tsx` | Minimal top bar — page title on left, quick actions (notifications bell, theme toggle, user avatar) on right. White/light background. Subtle bottom border. |

---

### Phase 3: All Pages — Admin Portal

Apply the new design to every page. For EACH page, replace all `glass`, `bg-white/5`, `text-white`, `text-white/xx`, `border-white/xx` classes with the new semantic classes and CSS variable utilities.

#### Admin Portal Pages (34 total):

**Login & Root:**
1. `src/app/page.tsx` — Landing/redirect
2. `src/app/login/page.tsx` — Clean login card centered on light background. Coral primary button. Lōns logo above form.

**Dashboard:**
3. `src/app/(portal)/dashboard/page.tsx` — THE flagship page. Apply the reference image pattern:
   - Top row: 4 KPI metric cards with large numbers, trend indicators
   - Middle: Area chart with coral gradient fill (portfolio value over time)
   - Bottom: Collection stats, recent activity
   - Use the abstract mountain/waveform gradient as a decorative header element

**Products:**
4. `src/app/(portal)/products/page.tsx` — Product listing as cards or table
5. `src/app/(portal)/products/[id]/page.tsx` — Product detail view
6. `src/app/(portal)/products/[id]/edit/page.tsx` — Product edit form
7. `src/app/(portal)/products/new/page.tsx` — Product creation wizard

**Product Wizard components** (`src/components/products/wizard/`):
8. `product-wizard.tsx` — Step indicator with coral active step
9. `wizard-progress.tsx` — Progress bar using `--accent-primary`
10. `step-basic-info.tsx` through `step-review.tsx` (8 step components) — Clean form fields with `input-field` styling

**Lenders:**
11. `src/app/(portal)/lenders/page.tsx` — Lender list
12. `src/app/(portal)/lenders/[id]/page.tsx` — Lender detail
13. `src/components/lenders/lender-form.tsx` — Lender form
14. `src/components/lenders/lender-list.tsx` — Lender list component

**Customers:**
15. `src/app/(portal)/customers/page.tsx` — Customer search & list
16. `src/app/(portal)/customers/[id]/page.tsx` — Customer detail with tabs
17. Customer tab components (`src/components/customers/tab-*.tsx` — 6 components) — Tabbed detail view

**Loans:**
18. `src/app/(portal)/loans/applications/page.tsx` — Application queue
19. `src/app/(portal)/loans/contracts/page.tsx` — Contract listing
20. `src/app/(portal)/loans/contracts/[id]/page.tsx` — Contract detail with tabs
21. `src/components/loans/application-review-drawer.tsx` — Review drawer
22. `src/components/loans/tab-*.tsx` (3 components) — Contract detail tabs

**Collections:**
23. `src/app/(portal)/collections/page.tsx` — Collections dashboard + queue
24. `src/components/collections/*.tsx` (5 components) — Dashboard widgets, aging chart, action drawer, PTP tracker

**Screening:**
25. `src/app/(portal)/screening/page.tsx` — Screening queue
26. `src/app/(portal)/screening/[id]/page.tsx` — Screening detail & review

**Reports:**
27. `src/app/(portal)/reports/page.tsx` — Reports index
28. `src/app/(portal)/reports/[type]/page.tsx` — Report viewer
29. `src/components/reports/*.tsx` (10 components) — All report types + layout + filter bar

**Messages:**
30. `src/app/(portal)/messages/page.tsx` — Messages inbox + compose

**Settings:**
31. `src/app/(portal)/settings/page.tsx` — Settings hub
32. `src/app/(portal)/settings/profile/page.tsx` — User profile
33. `src/app/(portal)/settings/tenant/page.tsx` — Tenant settings
34. `src/app/(portal)/settings/users/page.tsx` — User management
35. `src/app/(portal)/settings/audit-log/page.tsx` — Audit log
36. `src/app/(portal)/settings/integrations/page.tsx` — Integrations
37. `src/app/(portal)/settings/lenders/page.tsx` — Lender management
38. `src/app/(portal)/settings/lenders/[id]/page.tsx` — Lender detail

**Platform Section (admin-portal serves platform admins too):**
39. `src/app/(portal)/platform/tenants/page.tsx` — Tenant management
40. `src/app/(portal)/platform/tenants/[id]/page.tsx` — Tenant detail
41. `src/app/(portal)/platform/tenants/create/page.tsx` — Tenant creation wizard
42. `src/app/(portal)/platform/feedback/page.tsx` — Feedback management
43. `src/app/(portal)/platform/integrations/page.tsx` — Platform integrations
44. `src/components/platform/*.tsx` (4 components) — SP management, wizard, tabs, table

**Other:**
45. `src/app/(portal)/debug/page.tsx` — Debug page

---

### Phase 4: All Pages — Platform Portal

#### Platform Portal Pages (22 total):

**Login & Root:**
1. `src/app/page.tsx`
2. `src/app/login/page.tsx`

**Dashboard:**
3. `src/app/(portal)/dashboard/page.tsx` — Platform-level KPIs, tenant overview charts

**Tenants:**
4. `src/app/(portal)/tenants/page.tsx` — All tenants list
5. `src/app/(portal)/tenants/[id]/page.tsx` — Tenant detail
6. `src/app/(portal)/tenants/[id]/contracts/page.tsx` — Tenant contracts
7. `src/app/(portal)/tenants/[id]/customers/page.tsx` — Tenant customers
8. `src/app/(portal)/tenants/[id]/products/page.tsx` — Tenant products
9. `src/app/(portal)/tenants/create/page.tsx` — Create tenant

**Screening:**
10. `src/app/(portal)/screening/page.tsx` — Platform screening (escalated)

**Compliance:**
11. `src/app/(portal)/compliance/page.tsx`

**Analytics:**
12. `src/app/(portal)/analytics/scoring/page.tsx`

**Messages:**
13. `src/app/(portal)/messages/page.tsx` — Messages + compose with tenant picker

**Feedback:**
14. `src/app/(portal)/feedback/page.tsx`

**System:**
15. `src/app/(portal)/system/page.tsx`

**Settings:**
16. `src/app/(portal)/settings/page.tsx`
17. `src/app/(portal)/settings/profile/page.tsx`
18. `src/app/(portal)/settings/users/page.tsx`
19. `src/app/(portal)/settings/platform/page.tsx`
20. `src/app/(portal)/settings/defaults/page.tsx`
21. `src/app/(portal)/settings/api-keys/page.tsx`
22. `src/app/(portal)/settings/audit-log/page.tsx`

---

## Critical Implementation Rules

### DO:
- Use CSS custom properties for ALL colors — no hardcoded hex values in component JSX
- Replace every `glass`, `glass-sm`, `glass-hover`, `glass-input`, `glass-button`, `glass-button-primary` class with the new semantic equivalents (`card`, `input-field`, `btn-primary`, `btn-secondary`)
- Replace every `text-white`, `text-white/xx` with the appropriate semantic color (`text-text-primary`, `text-text-secondary`, `text-text-tertiary` or the CSS variable equivalents)
- Replace every `bg-white/xx` and `border-white/xx` with semantic equivalents
- Replace the dark gradient background in root layouts with `bg-page`
- Ensure ALL pages work in both light and dark mode — test by toggling the theme
- Use the Apple status colors consistently (success=green, warning=orange, error=red, info=blue)
- Add subtle transitions on interactive elements (hover, focus, active states)
- Use `rounded-xl` (12px) for cards, `rounded-lg` (8px) for inputs/buttons, `rounded-full` for badges/avatars
- Apply the KPI card pattern from the reference image on both dashboard pages

### DO NOT:
- Do NOT use backdrop-blur or glass-morphism effects in light mode. Reserve subtle blur only for dark mode modals/overlays if needed.
- Do NOT use pure white (`#FFFFFF`) as the page background — use the warm off-white (`#F8F9FA`)
- Do NOT use heavy shadows — keep them subtle and barely visible
- Do NOT leave any hardcoded `text-white`, `bg-slate-950`, `from-slate-950`, or glass classes anywhere
- Do NOT break existing functionality — this is a visual-only change. All GraphQL queries, mutations, state management, event handlers, and business logic must remain unchanged.
- Do NOT modify any i18n keys or translations
- Do NOT change component file names or locations
- Do NOT add new dependencies unless strictly necessary (e.g., a chart library you need for the gradient area charts — Recharts is already available)

### Additional Note on the Messages Tenant Picker:
While redesigning `apps/platform-portal/src/app/(portal)/messages/page.tsx`, also fix the `TENANTS_FOR_PICKER` query — change `first: 200` to `first: 100` (the backend's `PaginationInput` enforces `@Max(100)`). This is a one-line fix on line 84.

---

## Summary of All Changes

| Phase | Scope | Files |
|---|---|---|
| 1 — Design System | CSS variables, Tailwind config, theme provider, root layouts | 8 files (both portals) |
| 2 — Shared Components | All `ui/` and `layout/` components in both portals | ~25 components |
| 3 — Admin Portal Pages | All 45 page and component files | 45 files |
| 4 — Platform Portal Pages | All 22 page files + layout components | 22 files |
| **Total** | | **~100 files** |

---

## Definition of Done

- [ ] Both portals default to light mode with the new Apple-inspired color palette
- [ ] Dark mode toggle exists (in sidebar or header) and persists the user's choice
- [ ] Dark mode applies correct dark palette via CSS custom properties — no broken colors or invisible text
- [ ] ALL `.glass-*` classes are removed — zero occurrences in the codebase
- [ ] ALL hardcoded `text-white`, `bg-white/xx`, `border-white/xx`, dark gradient backgrounds are replaced
- [ ] KPI metric cards match the reference image pattern: large numbers, trend indicators, clean cards
- [ ] Dashboard pages have area charts with coral gradient fills (matching the reference)
- [ ] Donut/ring charts use the coral + gray palette from the reference
- [ ] Typography follows the SF Pro hierarchy defined above
- [ ] Sidebar navigation uses the new light/dark design with coral active indicator
- [ ] All forms use the new `input-field` styling with coral focus rings
- [ ] All buttons use `btn-primary` (coral) or `btn-secondary` (outlined) styling
- [ ] Status badges use Apple's color system consistently
- [ ] Platform portal tenant picker uses `first: 100` (not 200)
- [ ] No functionality regression — all pages work as before, just look different
- [ ] `pnpm build` succeeds for both portals
- [ ] `pnpm lint` passes for both portals
