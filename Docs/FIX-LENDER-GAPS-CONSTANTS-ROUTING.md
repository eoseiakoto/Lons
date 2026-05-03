# Fix: Lender Gaps — Shared Constants, i18n, and Route Promotion

**Priority: HIGH**
**Owner: Claude Code (DEV)**
**Date: 2026-04-16**

---

## Overview

Three gaps from the previous Lender UX implementation need closing:

1. **Shared constants are duplicated** — `countries.ts` and `currencies.ts` exist as identical copies in both `admin-portal` and `platform-portal`. They should live in `packages/shared-types` as the single source of truth.
2. **`nav.lenders` i18n key is missing from 6 of 7 locale files** — only `en.json` has it. Users on any other language see the raw key string.
3. **Lender pages still live under `/settings/lenders/`** — now that Lenders has its own sidebar nav entry, the pages should be promoted to `/lenders/` as a top-level route, and the Settings page should no longer list Lenders as a card.

---

## Fix 1: Move constants to `packages/shared-types`

### Current state (wrong)

Two identical copies:
- `apps/admin-portal/src/lib/constants/countries.ts` (264 lines)
- `apps/platform-portal/src/lib/constants/countries.ts` (264 lines, identical)
- `apps/admin-portal/src/lib/constants/currencies.ts` (166 lines)
- `apps/platform-portal/src/lib/constants/currencies.ts` (166 lines, identical)

### Target state

One copy in the shared package, re-exported by both portals.

**Step 1 — Move files to `packages/shared-types/src/constants/`**

```bash
# Move from admin-portal (the original)
cp apps/admin-portal/src/lib/constants/countries.ts packages/shared-types/src/constants/countries.ts
cp apps/admin-portal/src/lib/constants/currencies.ts packages/shared-types/src/constants/currencies.ts
```

**Step 2 — Update `packages/shared-types/src/constants/index.ts`**

Currently:
```typescript
export * from './permissions';
export * from './defaults';
```

Add:
```typescript
export * from './permissions';
export * from './defaults';
export * from './countries';
export * from './currencies';
```

This automatically re-exports via `packages/shared-types/src/index.ts` → `export * from './constants'`.

**Step 3 — Replace local copies in both portals**

For `apps/admin-portal/src/lib/constants/countries.ts`, replace entire file contents with:
```typescript
export {
  type Country,
  ALL_COUNTRIES,
  PRIMARY_COUNTRY_LIST,
  AFRICAN_COUNTRY_LIST,
  ALL_COUNTRY_CODES,
  PRIMARY_COUNTRY_CODES,
  COUNTRY_MAP,
  countryLabel,
  countryName,
} from '@lons/shared-types';
```

For `apps/admin-portal/src/lib/constants/currencies.ts`, replace entire file contents with:
```typescript
export {
  type Currency,
  ALL_CURRENCIES,
  PRIMARY_CURRENCY_LIST,
  AFRICAN_CURRENCY_LIST,
  ALL_CURRENCY_CODES,
  PRIMARY_CURRENCY_CODES,
  CURRENCY_MAP,
  currencyLabel,
  currencySymbol,
} from '@lons/shared-types';
```

Do the same for the platform-portal copies:
- `apps/platform-portal/src/lib/constants/countries.ts` → re-export from `@lons/shared-types`
- `apps/platform-portal/src/lib/constants/currencies.ts` → re-export from `@lons/shared-types`

This re-export pattern means all existing imports throughout both portals (`import { ... } from '@/lib/constants/countries'`) continue to work unchanged — zero refactoring across consumer files.

**Step 4 — Ensure `@lons/shared-types` is in both portals' `package.json` dependencies**

Check `apps/admin-portal/package.json` and `apps/platform-portal/package.json` — both should already have:
```json
"@lons/shared-types": "workspace:*"
```

If missing, add it and run `pnpm install`.

**Step 5 — Update `apps/admin-portal/src/lib/constants/index.ts`**

Currently:
```typescript
export { type Currency, ALL_CURRENCIES, ... } from './currencies';
export { type Country, ALL_COUNTRIES, ... } from './countries';
```

This stays the same — since the local files now re-export from `@lons/shared-types`, this barrel file continues to work.

---

## Fix 2: Add `nav.lenders` to all locale files

The `"lenders"` key needs to be added to the `"nav"` section of each locale file. Currently only `en.json` has it.

### Files to update

All files are at: `apps/admin-portal/src/lib/i18n/locales/`

**`fr.json`** — Add after `"products": "Produits",`:
```json
"nav": {
    "dashboard": "Tableau de bord",
    "products": "Produits",
    "lenders": "Prêteurs",
    ...
}
```

**`es.json`** — Add after `"products"`:
```json
"lenders": "Prestamistas",
```

**`pt.json`** — Add after `"products"`:
```json
"lenders": "Credores",
```

**`ar.json`** — Add after `"products"`:
```json
"lenders": "المقرضون",
```

**`ha.json`** — Add after `"products"`:
```json
"lenders": "Masu Bada Rance",
```

**`sw.json`** — Add after `"products"`:
```json
"lenders": "Wakopeshaji",
```

**Verification:** After adding, the `"nav"` section of every locale file should have the same keys as `en.json`:
`dashboard`, `products`, `lenders`, `customers`, `loans`, `collections`, `screening`, `reports`, `messages`, `platform`, `tenants`, `feedback`

---

## Fix 3: Promote Lender routes from `/settings/lenders/` to `/lenders/`

Now that Lenders has its own sidebar nav entry, the pages should live at a top-level route, not nested under Settings.

### Step 1 — Move the route directories

```bash
# Move the lender list page
mv apps/admin-portal/src/app/(portal)/settings/lenders/page.tsx \
   apps/admin-portal/src/app/(portal)/lenders/page.tsx

# Move the lender detail page
mkdir -p apps/admin-portal/src/app/(portal)/lenders/[id]
mv apps/admin-portal/src/app/(portal)/settings/lenders/[id]/page.tsx \
   apps/admin-portal/src/app/(portal)/lenders/[id]/page.tsx

# Clean up the old directory
rm -rf apps/admin-portal/src/app/(portal)/settings/lenders/
```

### Step 2 — Update the sidebar nav href

**File:** `apps/admin-portal/src/components/layout/sidebar.tsx` (line 34)

Change:
```typescript
{ key: 'nav.lenders', href: '/settings/lenders', icon: Landmark },
```
To:
```typescript
{ key: 'nav.lenders', href: '/lenders', icon: Landmark },
```

### Step 3 — Remove Lenders from the Settings page

**File:** `apps/admin-portal/src/app/(portal)/settings/page.tsx` (line 14)

Remove this entry from the `settingsLinks` array:
```typescript
{ name: t('lenders.settingsCard.title'), description: t('lenders.settingsCard.description'), href: '/settings/lenders', icon: Landmark },
```

Also remove the `Landmark` icon from the import on line 4 (since it's no longer needed in this file):
```typescript
// Change:
import { Users, FileText, UserCircle, Landmark } from 'lucide-react';
// To:
import { Users, FileText, UserCircle } from 'lucide-react';
```

### Step 4 — Update lender detail page links (if any hardcoded)

The lender detail page (`[id]/page.tsx`) uses `router.back()` for its back button, which is navigation-agnostic and will continue to work correctly. No changes needed there.

### Step 5 — Update the product wizard's Add New Lender modal link (if applicable)

Check `step-funding-source.tsx` — it currently doesn't link to the lender page (it uses an inline modal), so no update needed.

### Step 6 — Add a redirect for old URLs (optional but recommended)

To avoid broken bookmarks, create a simple redirect:

**File:** `apps/admin-portal/src/app/(portal)/settings/lenders/page.tsx` (recreate as redirect)

```typescript
import { redirect } from 'next/navigation';

export default function LendersRedirect() {
  redirect('/lenders');
}
```

And for the detail page:

**File:** `apps/admin-portal/src/app/(portal)/settings/lenders/[id]/page.tsx` (recreate as redirect)

```typescript
import { redirect } from 'next/navigation';

export default function LenderDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/lenders/${params.id}`);
}
```

---

## Summary of all changes

| File | Action |
|---|---|
| `packages/shared-types/src/constants/countries.ts` | **NEW** — move from admin-portal |
| `packages/shared-types/src/constants/currencies.ts` | **NEW** — move from admin-portal |
| `packages/shared-types/src/constants/index.ts` | **EDIT** — add exports |
| `apps/admin-portal/src/lib/constants/countries.ts` | **EDIT** — replace with re-export from `@lons/shared-types` |
| `apps/admin-portal/src/lib/constants/currencies.ts` | **EDIT** — replace with re-export from `@lons/shared-types` |
| `apps/platform-portal/src/lib/constants/countries.ts` | **EDIT** — replace with re-export from `@lons/shared-types` |
| `apps/platform-portal/src/lib/constants/currencies.ts` | **EDIT** — replace with re-export from `@lons/shared-types` |
| `apps/admin-portal/src/lib/i18n/locales/fr.json` | **EDIT** — add `"lenders"` to `"nav"` |
| `apps/admin-portal/src/lib/i18n/locales/es.json` | **EDIT** — add `"lenders"` to `"nav"` |
| `apps/admin-portal/src/lib/i18n/locales/pt.json` | **EDIT** — add `"lenders"` to `"nav"` |
| `apps/admin-portal/src/lib/i18n/locales/ar.json` | **EDIT** — add `"lenders"` to `"nav"` |
| `apps/admin-portal/src/lib/i18n/locales/ha.json` | **EDIT** — add `"lenders"` to `"nav"` |
| `apps/admin-portal/src/lib/i18n/locales/sw.json` | **EDIT** — add `"lenders"` to `"nav"` |
| `apps/admin-portal/src/app/(portal)/lenders/page.tsx` | **NEW** — moved from settings |
| `apps/admin-portal/src/app/(portal)/lenders/[id]/page.tsx` | **NEW** — moved from settings |
| `apps/admin-portal/src/app/(portal)/settings/lenders/page.tsx` | **EDIT** — replace with redirect |
| `apps/admin-portal/src/app/(portal)/settings/lenders/[id]/page.tsx` | **EDIT** — replace with redirect |
| `apps/admin-portal/src/components/layout/sidebar.tsx` | **EDIT** — change href to `/lenders` |
| `apps/admin-portal/src/app/(portal)/settings/page.tsx` | **EDIT** — remove Lenders card |

---

## Definition of Done

- [ ] `countries.ts` and `currencies.ts` live in `packages/shared-types/src/constants/` as single source of truth
- [ ] Both portals re-export from `@lons/shared-types` — no duplicate constant definitions
- [ ] All 7 locale files have the `"lenders"` key in their `"nav"` section
- [ ] Switching language shows the translated "Lenders" label in the sidebar (not the raw key)
- [ ] Lender pages are accessible at `/lenders` and `/lenders/[id]`
- [ ] Sidebar nav points to `/lenders` (not `/settings/lenders`)
- [ ] Settings page no longer shows a Lenders card
- [ ] Old URLs `/settings/lenders` and `/settings/lenders/[id]` redirect to the new paths
- [ ] `pnpm build` succeeds across all packages (shared-types builds before portals)
- [ ] `pnpm lint` passes
- [ ] All existing tests pass
