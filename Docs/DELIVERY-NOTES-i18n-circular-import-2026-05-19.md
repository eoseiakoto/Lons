# Delivery — i18n Circular Import Fix — 2026-05-19

**Branch:** `claude/hopeful-haibt-32d778`
**Source:** `Docs/DE-NOTE-i18n-circular-import.md` (DE bug note)
**Severity:** Runtime blocker — admin portal crashed on full-page refresh.

## Root cause (recap)

`apps/admin-portal/src/lib/i18n/index.ts` declared `DEFAULT_LOCALE` (a `const`) and re-exported `I18nProvider` / `useI18n` from `./i18n-context`. `i18n-context.tsx` imported `DEFAULT_LOCALE` from `./index` and read it during module initialization inside `createContext({ locale: DEFAULT_LOCALE, ... })`.

Bundler resolution evaluated `i18n-context.tsx` first when the cycle was traversed, so `DEFAULT_LOCALE` was still in its temporal dead zone — boom:

> `ReferenceError: Cannot access 'DEFAULT_LOCALE' before initialization`

HMR masked it (cached module state); cold full-page reload reliably triggered it.

## Fix

Followed the DE note's suggested approach.

- **New file** `apps/admin-portal/src/lib/i18n/constants.ts` — owns `SUPPORTED_LOCALES`, `LocaleCode`, `DEFAULT_LOCALE`. Leaf module, zero imports.
- **`i18n-context.tsx`** — imports those three from `./constants` (the line that hit TDZ on module-init). The runtime helpers `loadTranslations` and `getNestedValue` still come from `./index`; those are `function` declarations and so are hoisted, safe across the remaining one-way edge.
- **`index.ts`** — re-exports the three from `./constants` so the public API (`@/lib/i18n`) is unchanged. External callers (`components/layout/sidebar.tsx`) needed no edits.

Net graph: `i18n-context.tsx → constants.ts` (leaf, no cycle); `index.ts → i18n-context.tsx` (one-way); `i18n-context.tsx → index.ts` for hoisted functions only (no init-time read).

## Verification

Started `admin-portal-preview` on port 3101 (a new entry added to `.claude/launch.json` so it doesn't collide with the user's own dev server on 3100).

- Cold cache-busted reload of `/login`: renders cleanly. Screenshot captured during session shows the full login form.
- `preview_console_logs` filtered to `error` returns **no console errors** after both an initial load and a `window.location.reload()`.
- `pnpm exec tsc --noEmit` in `apps/admin-portal` is clean.

`apps/platform-portal` has no i18n module of its own (DE's scope check confirmed) — nothing to mirror.
