# FIX: Hardcoded Dark-Theme Slide-Over Panels

**Priority:** High
**Scope:** 7 elements across 5 files (admin-portal + platform-portal)
**Estimated effort:** Small — mechanical find-and-replace on each element

---

## Problem

The UI/UX redesign converted the design system to CSS custom properties with light/dark theme support. However, 7 slide-over panel containers and 1 dropdown still use **Tailwind arbitrary-value syntax** (`bg-[#0d1117]`, `bg-[#161b22]`) for their background colors. These hardcoded hex values bypass the legacy CSS class remaps in `globals.css` because the remaps only target named Tailwind classes (e.g., `.bg-white\/10`), not arbitrary-value classes.

**Result:** In light mode, these panels render as dark-background overlays on a light page — visually broken. In dark mode they happen to look correct since the hardcoded colors match the dark palette, which is why this wasn't caught during implementation.

---

## Root Cause

The legacy CSS remaps in `globals.css` (lines 489–540) intercept classes like `.text-white`, `.bg-white\/10`, `.border-white\/10`, `.glass`, `.glass-input`, etc. and redirect them to CSS variables. But Tailwind arbitrary values like `bg-[#0d1117]` generate unique class names that aren't covered by these remaps.

The inner elements of these slide-overs (text, borders, inputs, buttons) are fine — they use named Tailwind classes (`.text-white/40`, `.border-white/10`) or legacy classes (`.glass`, `.glass-input`, `.glass-button`) that are already remapped. Only the outermost container `<div>` of each slide-over needs fixing.

---

## Fixes

### Pattern A — Slide-Over Containers (6 instances)

**Current (broken):**
```tsx
<div className="fixed inset-y-0 right-0 w-[560px] max-w-full bg-[#0d1117]/95 backdrop-blur-2xl border-l border-white/10 z-50 overflow-y-auto">
```

**Replace with:**
```tsx
<div
  className="fixed inset-y-0 right-0 w-[560px] max-w-full backdrop-blur-2xl z-50 overflow-y-auto"
  style={{
    backgroundColor: 'var(--bg-elevated)',
    borderLeft: '1px solid var(--border-subtle)',
  }}
>
```

**Why `style` instead of Tailwind:** The `--bg-elevated` and `--border-subtle` tokens aren't exposed as Tailwind utilities in the arbitrary-value format (and shouldn't be — the rest of the redesigned components use the same `style={{ backgroundColor: 'var(--bg-elevated)' }}` pattern, as seen in `drawer.tsx`, `sidebar.tsx`, etc.). This keeps the approach consistent.

**Note:** Removing `bg-[#0d1117]/95` also removes the 95% opacity. This is intentional — the `--bg-elevated` token is fully opaque in both themes, and the `backdrop-blur-2xl` remains for the frosted effect on the scrim behind. If translucency is desired, Dev can use `rgba` in the dark-mode value of `--bg-elevated` in `globals.css`, but the default opaque behavior matches the rest of the redesigned drawers.

---

### Pattern B — Tenant Picker Dropdown (1 instance)

**Current (broken):**
```tsx
<div
  data-tenant-dropdown
  className="fixed max-h-48 overflow-y-auto bg-[#161b22] border border-white/10 rounded-lg shadow-xl"
  style={{
    top: dropdownPos.top,
    left: dropdownPos.left,
    width: dropdownPos.width,
    zIndex: 9999,
  }}
>
```

**Replace with:**
```tsx
<div
  data-tenant-dropdown
  className="fixed max-h-48 overflow-y-auto card-elevated rounded-lg shadow-xl"
  style={{
    top: dropdownPos.top,
    left: dropdownPos.left,
    width: dropdownPos.width,
    zIndex: 9999,
  }}
>
```

**Why `card-elevated`:** This semantic class is already defined in `globals.css` and provides themed background, border, and shadow. It's used for floating elements like dropdowns throughout the redesigned UI.

---

## File-by-File Changes

### 1. `apps/admin-portal/src/app/(portal)/messages/page.tsx`

**Line 509** — Message detail slide-over container:
Apply Pattern A.

**Line 561** — Compose slide-over container:
Apply Pattern A.

---

### 2. `apps/platform-portal/src/app/(portal)/messages/page.tsx`

**Line 562** — Message detail slide-over container:
Apply Pattern A.

**Line 614** — Compose slide-over container:
Apply Pattern A.

**Line 656** — Tenant picker portal dropdown:
Apply Pattern B.

---

### 3. `apps/platform-portal/src/app/(portal)/feedback/page.tsx`

**Line 662** — Feedback detail slide-over container:
Apply Pattern A.

---

### 4. `apps/platform-portal/src/app/(portal)/compliance/page.tsx`

**Line 407** — Compliance notice slide-over container:
Apply Pattern A.

---

## Verification

After applying the fixes, verify both themes:

1. **Light mode** — Each slide-over should render with a light elevated background (`#FFFFFF` / `--bg-elevated`) and subtle border. It should NOT appear as a dark panel against the light page.
2. **Dark mode** — Each slide-over should render with the dark elevated background (`#161B22` / `--bg-elevated`) and dark-appropriate border. Visual appearance should be similar to before.
3. **Tenant picker dropdown** (platform-portal messages page) — Should match the `card-elevated` style in both themes.
4. **Inner content** — Text, borders, inputs, and buttons inside each slide-over should continue to work correctly (they use remapped legacy classes).

---

## Out of Scope (Future Task)

While investigating these 7 elements, a broader observation: there are ~960 instances of `text-white/XX`, `border-white/10`, and `bg-white/XX` across 83 files. These are currently handled by the legacy CSS remaps in `globals.css`, which is functional but fragile — it relies on `!important` overrides and could break if the remap rules are removed or if Tailwind's class-name generation changes between versions. A future cleanup pass should migrate these to semantic CSS variable equivalents (e.g., `text-[color:var(--text-tertiary)]` instead of `text-white/40`), but that's a much larger effort and not blocking for this fix.
