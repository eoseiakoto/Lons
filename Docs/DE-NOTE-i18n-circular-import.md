# DE Note: Admin Portal i18n — Circular Import Crash

**Date:** 2026-05-19
**Reported by:** DE (Deployment Engineer)
**Severity:** Runtime blocker (portal unusable on refresh)
**App:** `apps/admin-portal`

---

## Symptom

Refreshing either portal in the browser produces:

> **ReferenceError: Cannot access 'DEFAULT_LOCALE' before initialization**
>
> Source: `src/lib/i18n/i18n-context.tsx` (line 17)

The entire page crashes — no fallback, no login screen.

---

## Root Cause

There is a **circular import** between two files in `apps/admin-portal/src/lib/i18n/`:

| File | Imports from | Exports to |
|---|---|---|
| `index.ts` | `./i18n-context` (line 46: re-exports `I18nProvider`, `useI18n`) | Everything — barrel file |
| `i18n-context.tsx` | `./index` (line 4: imports `DEFAULT_LOCALE`, `loadTranslations`, etc.) | `I18nProvider`, `useI18n` |

When the bundler resolves this cycle, `i18n-context.tsx` executes first. At that point `index.ts` has not finished initializing, so `DEFAULT_LOCALE` (declared with `const` on line 14 of `index.ts`) is still in its **JavaScript temporal dead zone**. Accessing it on line 17 of `i18n-context.tsx` throws the `ReferenceError`.

This surfaces on full-page refresh because the module graph is re-evaluated from scratch. It may not appear during hot-reload (HMR) because the bundler keeps cached module state.

---

## Files Involved

- `apps/admin-portal/src/lib/i18n/index.ts` — barrel file; declares `DEFAULT_LOCALE` on line 14, re-exports from `i18n-context.tsx` on line 46
- `apps/admin-portal/src/lib/i18n/i18n-context.tsx` — imports `DEFAULT_LOCALE` from `./index` on line 4, uses it on lines 17 and 28

---

## Suggested Fix

Break the circular dependency. The simplest approach:

1. **Create `apps/admin-portal/src/lib/i18n/constants.ts`** — move `SUPPORTED_LOCALES`, `LocaleCode`, and `DEFAULT_LOCALE` into this new file.

2. **Update `i18n-context.tsx`** — import from `./constants` instead of `./index`:
   ```diff
   - import { type LocaleCode, DEFAULT_LOCALE, loadTranslations, getNestedValue, SUPPORTED_LOCALES } from './index';
   + import { type LocaleCode, DEFAULT_LOCALE, SUPPORTED_LOCALES } from './constants';
   + import { loadTranslations, getNestedValue } from './index';
   ```

3. **Update `index.ts`** — re-export from `./constants` instead of declaring inline:
   ```diff
   - export const SUPPORTED_LOCALES = [ ... ] as const;
   - export type LocaleCode = ...;
   - export const DEFAULT_LOCALE: LocaleCode = 'en';
   + export { SUPPORTED_LOCALES, type LocaleCode, DEFAULT_LOCALE } from './constants';
   ```

This ensures `i18n-context.tsx` → `constants.ts` (no cycle) and `index.ts` → `i18n-context.tsx` (one-way).

---

## Scope Check

Dev should also verify whether `apps/platform-portal` has or will get an i18n module. Currently it has none — the error appeared when accessing the platform portal URL but originated from the admin-portal's module graph. If i18n is planned for the platform portal, apply the same non-circular pattern from the start.

---

## No Fix Applied

This note is for Dev awareness only. The DE has not modified any i18n files.
