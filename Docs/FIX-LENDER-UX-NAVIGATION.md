# Fix: Lender UX — ISO Countries/Currencies, Sidebar Nav & Wizard Modal

**Priority: HIGH**
**Owner: Claude Code (DEV)**
**Date: 2026-04-16**

---

## Overview

Three related lender UX issues need fixing in a single pass:

1. **Countries and currencies are hardcoded and incomplete** — the Lender form uses a 6-item country list and 7-item currency list instead of the comprehensive ISO-compliant constants that already exist in the codebase.
2. **Lenders are buried under Settings** — no sidebar nav entry, SPs can't find lender management.
3. **No way to add a lender from the product wizard** — the Funding Source step has no inline creation flow.

---

## Fix 1: Replace hardcoded country/currency lists with shared ISO constants

### Root Cause

`apps/admin-portal/src/components/lenders/lender-form.tsx` (lines 25–34) defines its own hardcoded arrays:

```typescript
// ❌ CURRENT — hardcoded, incomplete, no ISO format
const COUNTRIES = [
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'UG', name: 'Uganda' },
  { code: 'ZA', name: 'South Africa' },
];

const CURRENCIES = ['GHS', 'KES', 'NGN', 'TZS', 'UGX', 'ZAR', 'USD'];
```

Meanwhile, the codebase already has comprehensive ISO-compliant constants at:
- `apps/admin-portal/src/lib/constants/countries.ts` — full ISO 3166-1 (190+ countries with alpha-2, alpha-3, numeric codes, dial codes, flags, primary/African grouping)
- `apps/admin-portal/src/lib/constants/currencies.ts` — full ISO 4217 (120+ currencies with numeric codes, symbols, decimal places, primary/African grouping)

Both files export grouped lists: `ALL_COUNTRIES`, `AFRICAN_COUNTRY_LIST`, `PRIMARY_COUNTRY_LIST` and the currency equivalents, plus helper functions `countryLabel()`, `currencyLabel()`, `countryName()`, `currencySymbol()`.

### Fix

**File:** `apps/admin-portal/src/components/lenders/lender-form.tsx`

**Step 1 — Remove the hardcoded arrays.** Delete lines 25–34 entirely (the local `COUNTRIES` and `CURRENCIES` constants).

**Step 2 — Import the shared constants.** Add at the top of the file:

```typescript
import {
  ALL_COUNTRIES,
  PRIMARY_COUNTRY_CODES,
  countryLabel,
} from '@/lib/constants/countries';
import {
  ALL_CURRENCIES,
  PRIMARY_CURRENCY_CODES,
  currencyLabel,
} from '@/lib/constants/currencies';
```

**Step 3 — Update the country dropdown** (currently lines 134–144). Replace:

```tsx
<select
  value={country}
  onChange={(e) => setCountry(e.target.value)}
  className="glass-input w-full text-sm"
>
  <option value="">—</option>
  {COUNTRIES.map((c) => (
    <option key={c.code} value={c.code}>{c.name}</option>
  ))}
</select>
```

With:

```tsx
<select
  value={country}
  onChange={(e) => setCountry(e.target.value)}
  className="glass-input w-full text-sm"
>
  <option value="">—</option>
  {/* Primary African markets first, then all countries */}
  <optgroup label="Primary Markets">
    {ALL_COUNTRIES.filter((c) => PRIMARY_COUNTRY_CODES.includes(c.code)).map((c) => (
      <option key={c.code} value={c.code}>
        {c.flag} {c.name} ({c.code})
      </option>
    ))}
  </optgroup>
  <optgroup label="All Countries">
    {ALL_COUNTRIES.filter((c) => !PRIMARY_COUNTRY_CODES.includes(c.code)).map((c) => (
      <option key={c.code} value={c.code}>
        {c.flag} {c.name} ({c.code})
      </option>
    ))}
  </optgroup>
</select>
```

**Step 4 — Update the currency dropdown** (currently lines 164–173). Replace:

```tsx
<select
  value={fundingCurrency}
  onChange={(e) => setFundingCurrency(e.target.value)}
  className="glass-input w-full text-sm"
>
  {CURRENCIES.map((c) => (
    <option key={c} value={c}>{c}</option>
  ))}
</select>
```

With:

```tsx
<select
  value={fundingCurrency}
  onChange={(e) => setFundingCurrency(e.target.value)}
  className="glass-input w-full text-sm"
>
  <optgroup label="Primary Currencies">
    {ALL_CURRENCIES.filter((c) => PRIMARY_CURRENCY_CODES.includes(c.code)).map((c) => (
      <option key={c.code} value={c.code}>
        {c.code} — {c.name} ({c.symbol})
      </option>
    ))}
  </optgroup>
  <optgroup label="African Currencies">
    {ALL_CURRENCIES.filter((c) => !PRIMARY_CURRENCY_CODES.includes(c.code) && !c.primary).filter((_, i, arr) => {
      // Show only African currencies in this group (indices 0-38 in AFRICAN_CURRENCIES)
      return true;
    }).slice(0, 38).map((c) => (
      <option key={c.code} value={c.code}>
        {c.code} — {c.name} ({c.symbol})
      </option>
    ))}
  </optgroup>
  <optgroup label="Global Currencies">
    {ALL_CURRENCIES.filter((c) => !PRIMARY_CURRENCY_CODES.includes(c.code)).slice(38).map((c) => (
      <option key={c.code} value={c.code}>
        {c.code} — {c.name} ({c.symbol})
      </option>
    ))}
  </optgroup>
</select>
```

**Simpler alternative** — if `optgroup` slicing feels fragile, use the already-exported grouped lists instead:

```tsx
import {
  PRIMARY_CURRENCY_LIST,
  AFRICAN_CURRENCY_LIST,
  ALL_CURRENCIES,
} from '@/lib/constants/currencies';
import {
  PRIMARY_COUNTRY_LIST,
  AFRICAN_COUNTRY_LIST,
  ALL_COUNTRIES,
} from '@/lib/constants/countries';
```

Then for currencies:

```tsx
<select
  value={fundingCurrency}
  onChange={(e) => setFundingCurrency(e.target.value)}
  className="glass-input w-full text-sm"
>
  <optgroup label="Primary Currencies">
    {PRIMARY_CURRENCY_LIST.map((c) => (
      <option key={c.code} value={c.code}>
        {c.code} — {c.name} ({c.symbol})
      </option>
    ))}
  </optgroup>
  <optgroup label="Other African Currencies">
    {AFRICAN_CURRENCY_LIST.filter((c) => !c.primary).map((c) => (
      <option key={c.code} value={c.code}>
        {c.code} — {c.name} ({c.symbol})
      </option>
    ))}
  </optgroup>
  <optgroup label="Global Currencies">
    {ALL_CURRENCIES.filter((c) =>
      !AFRICAN_CURRENCY_LIST.some((ac) => ac.code === c.code)
    ).map((c) => (
      <option key={c.code} value={c.code}>
        {c.code} — {c.name} ({c.symbol})
      </option>
    ))}
  </optgroup>
</select>
```

And for countries:

```tsx
<select
  value={country}
  onChange={(e) => setCountry(e.target.value)}
  className="glass-input w-full text-sm"
>
  <option value="">—</option>
  <optgroup label="Primary Markets">
    {PRIMARY_COUNTRY_LIST.map((c) => (
      <option key={c.code} value={c.code}>
        {c.flag} {c.name} ({c.code})
      </option>
    ))}
  </optgroup>
  <optgroup label="Other African Countries">
    {AFRICAN_COUNTRY_LIST.filter((c) => !c.primary).map((c) => (
      <option key={c.code} value={c.code}>
        {c.flag} {c.name} ({c.code})
      </option>
    ))}
  </optgroup>
  <optgroup label="Global">
    {ALL_COUNTRIES.filter((c) =>
      !AFRICAN_COUNTRY_LIST.some((ac) => ac.code === c.code)
    ).map((c) => (
      <option key={c.code} value={c.code}>
        {c.flag} {c.name} ({c.code})
      </option>
    ))}
  </optgroup>
</select>
```

### Also fix: Platform Portal tenant creation

**File:** `apps/platform-portal/src/app/(portal)/tenants/create/page.tsx`

Same pattern — lines 111 and 124 define hardcoded `CURRENCIES` and `COUNTRIES` arrays. The shared constants currently live in `admin-portal`. Either:

**Option A (preferred):** Move `countries.ts` and `currencies.ts` from `apps/admin-portal/src/lib/constants/` to `packages/shared-types/src/constants/` so both portals can import them. Update the admin-portal imports to point to the shared package.

**Option B:** Copy the constants into `apps/platform-portal/src/lib/constants/` (less DRY, but avoids cross-app dependency for now).

Regardless of approach, replace the platform-portal's hardcoded arrays with the same grouped dropdown pattern shown above.

---

## Fix 2: Add "Lenders" to the sidebar navigation

**File:** `apps/admin-portal/src/components/layout/sidebar.tsx`

The sidebar navigation items are defined at lines 30–38:

```typescript
const navigationKeys = [
  { key: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'nav.products', href: '/products', icon: Package },
  { key: 'nav.customers', href: '/customers', icon: Users },
  { key: 'nav.loans', href: '/loans/contracts', icon: FileText },
  { key: 'nav.collections', href: '/collections', icon: AlertTriangle },
  { key: 'nav.screening', href: '/screening', icon: Shield },
  { key: 'nav.reports', href: '/reports', icon: BarChart3 },
];
```

**Add Lenders between Products and Customers.** Lenders are closely related to products (they fund them), so placing it right after Products makes contextual sense:

```typescript
const navigationKeys = [
  { key: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'nav.products', href: '/products', icon: Package },
  { key: 'nav.lenders', href: '/settings/lenders', icon: Landmark },
  { key: 'nav.customers', href: '/customers', icon: Users },
  { key: 'nav.loans', href: '/loans/contracts', icon: FileText },
  { key: 'nav.collections', href: '/collections', icon: AlertTriangle },
  { key: 'nav.screening', href: '/screening', icon: Shield },
  { key: 'nav.reports', href: '/reports', icon: BarChart3 },
];
```

**Import the icon** — add `Landmark` to the lucide-react import at the top of the file (line ~15). `Landmark` is a bank/institution icon from lucide-react. Alternatives: `Building`, `Banknote`, or `Wallet`.

**Add the i18n key.** In the translation files (check `lib/i18n/` for locale JSON files), add:

```json
"nav.lenders": "Lenders"
```

**Note on routing:** The lender pages currently live under `/settings/lenders/`. The sidebar link can point to `/settings/lenders` directly — no route restructuring needed. If you prefer a cleaner URL, you could also create a redirect from `/lenders` → `/settings/lenders`, but that's optional polish.

---

## Fix 3: Add "Add New Lender" modal in the product wizard Funding Source step

**File:** `apps/admin-portal/src/components/products/wizard/step-funding-source.tsx`

After the lender dropdown (line 123, after `</select>`), add an inline link to create a new lender via modal. The SP never leaves the wizard.

**Step 1 — Add imports at top:**

```tsx
import { LenderForm } from '@/components/lenders/lender-form';
import { useState } from 'react'; // if not already imported
import { Plus } from 'lucide-react'; // if not already imported
```

**Step 2 — Add state and mutation in the component:**

```tsx
const [showAddLender, setShowAddLender] = useState(false);

const CREATE_LENDER = gql`
  mutation CreateLender($input: CreateLenderInput!) {
    createLender(input: $input) {
      id name country status
    }
  }
`;
const [createLender, { loading: creatingLender }] = useMutation(CREATE_LENDER);
```

**Step 3 — Expose refetch from the lenders query:**

```typescript
// Find the existing useQuery (around line 50-55):
const { data: lendersData, loading: lendersLoading } = useQuery(ACTIVE_LENDERS, { ... });

// Change to:
const { data: lendersData, loading: lendersLoading, refetch: refetchLenders } = useQuery(ACTIVE_LENDERS, { ... });
```

**Step 4 — Add the "Add New Lender" button** after line 128 (after the hint text):

```tsx
<button
  type="button"
  onClick={() => setShowAddLender(true)}
  className="text-sm text-blue-400 hover:text-blue-300 mt-1 flex items-center gap-1"
>
  <Plus className="w-3 h-3" />
  {t('products.wizard.addNewLender', 'Add New Lender')}
</button>
```

**Step 5 — Add the modal** (at the bottom of the component, before the closing fragment/div):

```tsx
{showAddLender && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div className="glass rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
      <h3 className="text-lg font-semibold text-white mb-4">
        {t('products.wizard.addNewLender', 'Add New Lender')}
      </h3>
      <LenderForm
        saving={creatingLender}
        onCancel={() => setShowAddLender(false)}
        onSave={async (formData) => {
          const { data } = await createLender({ variables: { input: formData } });
          if (data?.createLender) {
            // Select the newly created lender in the dropdown
            onChange({
              lenderId: data.createLender.id,
              lenderName: data.createLender.name,
            } as Partial<StepFundingSourceProps['data']>);
            setShowAddLender(false);
            // Refetch lenders list so dropdown updates
            refetchLenders();
          }
        }}
      />
    </div>
  </div>
)}
```

**Important:** Since the LenderForm is being updated in Fix 1 to use the shared ISO constants, the modal will automatically get the full country/currency lists — no extra work needed here.

---

## Fix 4: Ensure sidebar "active" state works for lenders

**File:** `apps/admin-portal/src/components/layout/sidebar.tsx`

The sidebar highlights the active item by checking `pathname.startsWith(href)`. Since the lender href is `/settings/lenders`, verify that:

1. Clicking the Lenders nav item highlights it correctly
2. When on `/settings/lenders/[id]` (lender detail), the Lenders item stays highlighted
3. The Settings page link (if it exists elsewhere) does NOT also highlight when on `/settings/lenders`

If the active check is `pathname.startsWith(item.href)`, this should work since `/settings/lenders` is more specific. But verify after implementation.

---

## Display Format Reference

### Countries — show as:
```
🇬🇭 Ghana (GH)
🇰🇪 Kenya (KE)
🇳🇬 Nigeria (NG)
```

### Currencies — show as:
```
GHS — Ghanaian Cedi (GH₵)
KES — Kenyan Shilling (KSh)
NGN — Nigerian Naira (₦)
USD — US Dollar ($)
```

This gives users all the information they need: recognizable name, ISO code for cross-referencing, and symbol for the currency.

---

## Definition of Done

- [ ] Lender form uses shared ISO constants — no hardcoded country/currency arrays
- [ ] Country dropdown shows flag emoji + name + ISO code, grouped by Primary / African / Global
- [ ] Currency dropdown shows ISO code + name + symbol, grouped by Primary / African / Global
- [ ] Platform portal tenant creation page also uses shared constants (or at minimum imports them)
- [ ] "Lenders" appears in the sidebar navigation between Products and Customers
- [ ] Clicking "Lenders" in sidebar navigates to the lender list page
- [ ] Lenders sidebar item highlights correctly when on any lender page
- [ ] Product wizard Funding Source step shows "Add New Lender" button
- [ ] Clicking "Add New Lender" opens a modal with the lender creation form (no page navigation)
- [ ] After creating a lender via the modal, the dropdown auto-selects the new lender
- [ ] The lender dropdown refreshes to include the newly created lender
- [ ] Lenders are still accessible via Settings page (don't remove, just add the sidebar shortcut)
- [ ] All existing tests pass
- [ ] `pnpm lint` passes
