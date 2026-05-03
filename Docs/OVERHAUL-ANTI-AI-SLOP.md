# OVERHAUL: Kill the AI Slop — Full Visual Layer Rebuild

**Priority:** Critical — the current UI reads as "AI-generated template." The owner reviewed it and rejected it.
**Scope:** Both portals (admin-portal, platform-portal) — globals.css, all shared components, all page layouts.
**Approach:** Full visual overhaul. Keep the data layer and routing untouched; tear down and rebuild the visual layer.

---

## Mandatory Skills

**Before writing ANY code**, read the SKILL.md file for EVERY skill listed below. Do not skim — read line by line. These are not suggestions; they are engineering constraints. Each skill bans specific patterns that the current implementation uses heavily.

### Tier 1 — Read these FIRST (they define the anti-patterns to eliminate):
1. **`impeccable`** — The AI Slop Test: "If you showed this to someone and said AI made it, would they believe you?" Contains absolute bans (no side-stripe borders, no gradient text), font selection procedure, OKLCH color system.
2. **`redesign-existing-projects`** — The comprehensive audit checklist. Every item in this list must be checked against the current codebase. Fix priority order is defined here.
3. **`design-taste-frontend`** — The bias-correction engine. DESIGN_VARIANCE: 8, MOTION_INTENSITY: 6, VISUAL_DENSITY: 4. Bans Inter (already done), bans centered layouts, bans 3-column equal card grids, bans oversaturated accents.
4. **`high-end-visual-design`** — The "Double-Bezel" nested card architecture, custom cubic-bezier curves, macro-whitespace rules, staggered entry reveals.

### Tier 2 — Read these for execution quality:
5. **`emil-design-eng`** — Animation decision framework. When to animate, what easing to use, how fast. Button feedback (`scale(0.97)`), custom easing curves, stagger delays (30-80ms between items).
6. **`bolder`** — Amplify safe designs. The current UI is too safe.
7. **`typeset`** — Fix the flat typography hierarchy.
8. **`colorize`** — The coral accent is barely visible in the current UI.

### Tier 3 — Read these for polish:
9. **`layout`** — Break the monotonous grids.
10. **`distill`** — Strip unnecessary visual noise.
11. **`polish`** — Final quality pass.
12. **`delight`** — Moments of joy.

### Tier 4 — Read these for validation:
13. **`audit`** — Run quality checks after implementation.
14. **`critique`** — Evaluate the result.
15. **`adapt`** — Verify responsive behavior.
16. **`minimalist-ui`** — Reference for clean editorial style.
17. **`full-output-enforcement`** — No truncation, no placeholders, no `// ...rest of component`.

---

## What's Wrong Now — Specific Diagnosis

The current UI has been rebuilt with CSS custom properties and a coral accent palette, but it still reads as generic AI output. Here's exactly why, mapped to specific files:

### Problem 1: Monotonous Equal-Column Card Grids

**Where:** `dashboard/page.tsx` lines 96, 128; and equivalent pages across both portals.
**What:** `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4` — four identical MetricCards in a row. Then `grid-cols-3` — three identical cards. This is the #1 most common AI dashboard layout.
**The `redesign-existing-projects` skill says:** "Three equal card columns as feature row. This is the most generic AI layout."
**The `design-taste-frontend` skill says:** "The generic 'three equal cards horizontally' feature row is BANNED."

**Fix:** Break the grid. Use asymmetric layouts:
- Hero metric (the most important KPI) gets a larger card spanning 2 columns or taking 60% width
- Secondary metrics are smaller, potentially as a dense row without card wrappers (just text + value separated by spacing, using `border-t` or `divide-y` instead of cards)
- The "Total in Collections" call-out (line 148) is close to right but still boxed in a generic `card p-8`
- Use CSS Grid with fractional units: `grid-template-columns: 2fr 1fr 1fr` or similar asymmetric splits

### Problem 2: Every Card Looks Identical

**Where:** `.card` class in `globals.css` line 168; `MetricCard` component; every page that uses `card p-6`.
**What:** Every surface uses the exact same card class — same border, same radius (12px), same shadow, same padding. There's no hierarchy between a KPI card, a data table container, a form wrapper, and a detail panel.
**The `impeccable` skill says:** "DO NOT wrap everything in cards. Not everything needs a container."
**The `redesign-existing-projects` skill says:** "Generic card look (border + shadow + white background). Remove the border, or use only background color, or use only spacing."

**Fix:**
- KPI metrics: Remove card wrapper entirely. Use negative space, a subtle background tint, or just typographic weight to separate them. Numbers themselves are the visual element — don't box them.
- Data tables: Use `border-t` or spacing to define the table area, not a card wrapper. Tables already have internal structure.
- Form sections: Use section spacing and typography, not card boxes.
- Reserve `.card` for genuinely elevated content — things the user should notice as "lifted" from the page (alerts, call-outs, featured items).
- When cards ARE used, vary the border-radius: tighter on smaller elements (6-8px), larger on feature containers (16-20px).

### Problem 3: Flat Typography Hierarchy

**Where:** All page headers, section labels, MetricCard values across both portals.
**What:** Every section header uses the same pattern: `text-[11px] font-semibold uppercase tracking-[0.05em] text-[color:var(--text-secondary)]`. Every metric value is `text-[32px] font-bold tracking-[-0.02em]`. Every page title is `text-[28px] font-bold tracking-[-0.02em]`. There's no real contrast — it's all one "voice."
**The `impeccable` skill says:** "Use fewer sizes with more contrast. A 5-step scale with at least a 1.25 ratio between steps creates clearer hierarchy than 8 sizes that are 1.1× apart."
**The `high-end-visual-design` skill says:** "Headlines should feel heavy and intentional."

**Fix:**
- Page titles: Increase to `text-3xl` or `text-4xl` (36-44px), use `font-semibold` not `font-bold` (less AI-generic), tighten tracking to `-0.03em`.
- Section labels: Drop the `uppercase tracking-[0.05em]` pattern — it's an AI cliché. Use sentence case with `font-medium text-[13px]` instead. ALL-CAPS subheaders everywhere is called out in `redesign-existing-projects` as a problem.
- Metric values: The primary KPI value should be significantly larger (48-56px) than secondary ones (28-32px). Not all numbers are equal — create hierarchy.
- Body text: Ensure `max-w-[65ch]` on any paragraph. Increase line-height for readability.
- Use `font-variant-numeric: tabular-nums` on all financial numbers so columns align.

### Problem 4: The Coral Accent is Invisible

**Where:** `globals.css` accent tokens; actual usage across pages.
**What:** The coral/orange-red palette (`#FF6B35`) was defined in the tokens but barely appears in the actual UI. It's on the primary button and the sidebar logo gradient — that's about it. The rest of the interface is neutral gray. The reference image the owner provided had warm, energetic coral tones throughout.
**The `colorize` skill** is specifically for this: "Add strategic color to features that are too monochromatic."

**Fix:**
- Use `--accent-primary-soft` (the 10% coral tint) as background for the hero metric card or the active section
- Coral accent line or dot on the active sidebar item (NOT a side-stripe border — that's banned by `impeccable`. Use a dot indicator, bold text color, or background tint)
- Status badges should incorporate the brand palette more — the success/warning/error colors are fine, but neutral badges should use a coral-tinted gray rather than pure gray
- Chart colors: `--chart-1` is already coral, but make it the dominant chart color, not just one of four
- Interactive elements: Links and interactive text should use a coral-derived color, not blue
- Tint the neutral grays toward the coral hue: even a slight warmth (`oklch(0.97 0.005 50)` instead of pure `#F8F9FA`) creates subconscious brand cohesion. The `impeccable` skill specifically calls this out: "Tint your neutrals toward your brand hue."

### Problem 5: Generic Shadows — No Hue Tinting

**Where:** `globals.css` `--shadow-card`, `--shadow-elevated`, `--shadow-floating`.
**What:** All shadows use `rgba(0, 0, 0, ...)` — pure black at various opacities. This is the default AI approach.
**The `redesign-existing-projects` skill says:** "Tint shadows to match the background hue. Use colored shadows."
**The `high-end-visual-design` skill says:** Use "colored, tinted shadows" instead of "generic black at low opacity."

**Fix:**
- Light mode: Tint shadows warm — use `rgba(180, 120, 80, 0.06)` or similar warm brown instead of pure black
- Dark mode: Tint shadows toward the page background hue
- The shadow values should feel like natural light, not a CSS generator output

### Problem 6: No Entry Motion — Everything Appears Instantly

**Where:** Every page — dashboard, customers, loans, collections, etc.
**What:** Page content mounts with zero animation. All elements appear at once. The only motion is `hover:-translate-y-0.5` on metric cards.
**The `emil-design-eng` skill says:** "When multiple elements enter together, stagger their appearance... Keep stagger delays short (30-80ms between items)."
**The `high-end-visual-design` skill says:** "Elements never appear statically on load."

**Fix:**
- Add a subtle fade-up entry animation to page content: `translate-y-[8px] opacity-0` → `translate-y-0 opacity-1` over 300ms with custom `ease-out`
- Stagger metric cards with 50ms delay between each
- Use CSS `@starting-style` or `animation-delay: calc(var(--index) * 60ms)` pattern — no need for framer-motion in a Next.js admin portal
- Keep animations under 300ms. This is a work tool, not a marketing site.
- Do NOT animate keyboard-initiated actions (tab switches, form submissions)

### Problem 7: Safe, Default Easing Curves

**Where:** `globals.css` `--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)` and `--ease-emphasized: cubic-bezier(0.2, 0, 0, 1)`.
**What:** `cubic-bezier(0.4, 0, 0.2, 1)` is Material Design's standard easing. It's the CSS equivalent of using Inter — technically fine, completely generic.
**The `emil-design-eng` skill** provides exact replacement curves:
```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* Strong ease-out for UI interactions */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);   /* Strong ease-in-out for movement */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);    /* iOS-like drawer curve */
```

**Fix:** Replace the easing tokens with these stronger curves. The difference is subtle but perceptible — they give interactions a "snap" that Material Design easing doesn't.

### Problem 8: Scrollbar, Focus Rings, and Micro-Details

**Where:** Various component classes in globals.css.
**What:** The scrollbar is styled (good) but the rest of the micro-details are missing:
- No focus ring on interactive elements other than inputs
- No `active:scale(0.97)` on clickable cards or list rows (MetricCard has it via `hover:-translate-y-0.5` but no active press state)
- No skeleton shimmer that matches layout shapes
- Buttons have `active:scale(0.98)` (good) but the timing uses `--ease-standard` which is the generic Material curve

**Fix:**
- Add visible focus rings using `--accent-primary-ring` on all interactive elements
- Add `active:scale(0.97)` with 100ms `ease-out` to all clickable surfaces (cards that link somewhere, table rows, etc.)
- Ensure skeleton loaders match the actual layout shape, not just generic rectangles

---

## Implementation Sequence

Follow this exact order. Each step builds on the previous:

### Step 1: Design Tokens (globals.css)
1. Warm-tint the neutral palette: shift `--bg-page`, `--bg-card`, `--bg-muted` slightly warm (toward the coral hue). Use OKLCH if possible.
2. Replace easing curves with the stronger variants from `emil-design-eng`.
3. Tint all shadows warm in light mode.
4. Vary border-radius: add `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 16px`, `--radius-xl: 20px`. The current 12px everywhere is monotonous.
5. Add entry animation keyframes:
   ```css
   @keyframes fadeUp {
     from { opacity: 0; transform: translateY(8px); }
     to   { opacity: 1; transform: translateY(0); }
   }
   .animate-enter {
     animation: fadeUp 0.3s var(--ease-out) both;
   }
   ```

### Step 2: Component Classes (globals.css)
1. Differentiate card variants: `.card` for standard, `.card-flush` for borderless (just background + spacing), `.card-feature` for hero/elevated content with larger radius and stronger shadow.
2. Drop the `uppercase tracking-[0.05em]` from section labels. Add a `.section-label` class that uses sentence case, `font-medium`, `text-[13px]`.
3. Add stagger utility: `.stagger-children > * { animation: fadeUp 0.3s var(--ease-out) both; }` with `:nth-child` delays.
4. Buttons: swap easing to the strong `--ease-out`. Keep `active:scale(0.97)`.

### Step 3: Layout Patterns (Page files)
1. Dashboard: Break the 4-column equal grid. Make the primary KPI significantly larger (hero treatment). Use asymmetric grid or a mix of card sizes.
2. List pages (customers, loans, products): Remove card wrappers around tables. Use spacing and `border-t` for section separation.
3. Detail pages: Use a 2-column layout with generous whitespace, not everything stacked in a single column of cards.
4. Section headers: Replace `uppercase tracking-[0.05em]` with sentence case throughout.

### Step 4: Motion
1. Apply `.animate-enter` to page-level content containers.
2. Add stagger delays to grid children (metric cards, table rows on first load).
3. Ensure all transitions use the new easing curves, not the old Material ones.
4. Add `active:scale(0.97)` to interactive table rows and clickable cards.

### Step 5: Color Injection
1. Warm-tint the active sidebar item background.
2. Use `--accent-primary-soft` as subtle background tint for the primary dashboard section or hero metric.
3. Interactive text (links, clickable labels) uses coral-derived color instead of default blue.
4. Neutral badges get a warm tint rather than pure gray.

### Step 6: Both Portals
Apply all changes to BOTH `admin-portal` and `platform-portal`. The design tokens, component classes, and patterns must be identical across both.

---

## The AI Slop Checklist — Run Before Declaring Done

After implementation, evaluate against every item below. If ANY item fails, the work is not done.

- [ ] No page has more than one row of equal-width, equal-height cards side by side
- [ ] At least one metric on the dashboard has a "hero" treatment (larger, different visual weight)
- [ ] Section labels are NOT all-caps uppercase with wide tracking
- [ ] The coral accent appears in at least 5 distinct places beyond the primary button
- [ ] Shadows are warm-tinted, not pure `rgba(0,0,0,...)`
- [ ] Page content has a subtle entry animation — it does NOT mount instantly
- [ ] Grid children stagger in with 40-60ms delay between items
- [ ] All transitions use the strong easing curves, not Material Design defaults
- [ ] Not everything is wrapped in a `.card` — tables, metrics, and forms use spacing/typography instead where appropriate
- [ ] Border-radius varies across component sizes (6px for small elements, 10-12px for standard, 16-20px for feature containers)
- [ ] Interactive elements have visible focus rings
- [ ] Clickable cards/rows have `active:scale(0.97)` press feedback
- [ ] Neutral colors have a warm tint — they are NOT pure gray
- [ ] The page title (H1) is significantly larger than section headers, with real typographic contrast
- [ ] Financial numbers use `tabular-nums`
- [ ] If you showed this to someone and said "AI made this," they would NOT immediately believe you

---

## Files to Modify

### Core (shared across pages):
- `apps/admin-portal/src/app/globals.css` — design tokens, component classes, animation keyframes
- `apps/platform-portal/src/app/globals.css` — identical changes
- `apps/admin-portal/tailwind.config.ts` — radius, shadow, easing token references
- `apps/platform-portal/tailwind.config.ts` — identical

### Components:
- `apps/admin-portal/src/components/ui/metric-card.tsx` — break the generic card pattern
- `apps/admin-portal/src/components/ui/skeleton.tsx` — ensure shapes match real layout
- `apps/admin-portal/src/components/ui/status-badge.tsx` — warm-tint neutral badges
- `apps/admin-portal/src/components/layout/sidebar.tsx` — coral accent on active item
- `apps/admin-portal/src/components/layout/header.tsx` — any header refinements
- Plus platform-portal equivalents

### Pages (both portals):
- All `dashboard/page.tsx` — hero metric, asymmetric grid, stagger entry
- All list/table pages — remove card wrappers, use spacing
- All detail pages — 2-column layout, better whitespace
- All section labels across every page — drop uppercase pattern

---

## What NOT to Do

- Do NOT add parallax, scroll hijacking, 3D tilt cards, particle effects, or magnetic buttons. This is a B2B fintech work tool, not a marketing site. Keep motion subtle and purposeful.
- Do NOT change the font from SF Pro. The owner specifically chose it.
- Do NOT change the color palette (coral/orange-red). The issue is that it's not being USED enough, not that the colors are wrong.
- Do NOT rewrite the data layer, GraphQL queries, or routing. Only the visual layer changes.
- Do NOT introduce new npm dependencies (no framer-motion, no GSAP). Use CSS animations and transitions only — they're sufficient for this scope and don't add bundle weight.
- Do NOT use gradient text. It's explicitly banned by the `impeccable` skill.
- Do NOT use colored side-stripe borders (`border-left: 3px solid ...`). Explicitly banned.
