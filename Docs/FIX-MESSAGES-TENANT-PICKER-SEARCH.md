# Fix: Platform Portal Messages — Tenant Picker Search Not Working

**Priority: HIGH**
**Owner: Claude Code (DEV)**
**Date: 2026-04-17**

---

## Problem

The searchable SP dropdown added in FIX-MESSAGES-TENANT-PICKER.md does not work at runtime. When a platform admin types into the "Recipient SP" field, either no dropdown appears or it shows "No matching SPs found" for every query.

Two root causes were identified:

1. **CSS overflow clipping** — The dropdown is absolutely positioned inside the compose slide-over, which has `overflow-y-auto`. This creates a clipping boundary that hides the dropdown when it extends beyond the visible container area.
2. **Silent query failure** — The `useQuery(TENANTS_FOR_PICKER)` hook destructures only `data`, discarding `error` and `loading`. If the GraphQL query fails for any reason (auth, network, schema mismatch), `tenantOptions` silently becomes an empty array and the dropdown always shows "No matching SPs found".

---

## Fix 1: Move the dropdown to a portal to escape overflow clipping

### Problem

**File:** `apps/platform-portal/src/app/(portal)/messages/page.tsx`

Line 588 — the compose slide-over container:
```html
<div className="fixed inset-y-0 right-0 w-[560px] ... overflow-y-auto">
```

Lines 627–659 — the dropdown:
```html
<div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto ...">
```

The dropdown uses `position: absolute` with `z-index: 10`, but it lives inside a container with `overflow-y-auto`. CSS overflow clipping applies regardless of z-index when the positioned element is a descendant of the overflow container. The dropdown is rendered but hidden.

### Fix

Use a React portal to render the dropdown outside the overflow container, then position it relative to the input using a ref and `getBoundingClientRect()`.

**File:** `apps/platform-portal/src/app/(portal)/messages/page.tsx`

**Step 1** — Add the portal import and a ref for the input:

```typescript
import { createPortal } from 'react-dom';

// Inside the component, alongside existing refs:
const tenantInputRef = useRef<HTMLInputElement>(null);
```

**Step 2** — Add state to track dropdown position:

```typescript
const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
```

**Step 3** — Update position when dropdown opens. Add this effect:

```typescript
useEffect(() => {
  if (tenantPickerOpen && tenantInputRef.current) {
    const rect = tenantInputRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4, // 4px gap below input
      left: rect.left,
      width: rect.width,
    });
  }
}, [tenantPickerOpen, tenantSearch]);
```

**Step 4** — Attach the ref to the search input. Change line 612:

```tsx
// From:
<input
  type="text"
  className="glass-input text-sm w-full"
  placeholder="Search by SP name or slug..."

// To:
<input
  ref={tenantInputRef}
  type="text"
  className="glass-input text-sm w-full"
  placeholder="Search by SP name or slug..."
```

**Step 5** — Replace the dropdown block (lines 626–660) with a portal version:

```tsx
{tenantPickerOpen && tenantSearch.trim() && dropdownPos && createPortal(
  <div
    className="fixed max-h-48 overflow-y-auto bg-[#161b22] border border-white/10 rounded-lg shadow-xl"
    style={{
      top: dropdownPos.top,
      left: dropdownPos.left,
      width: dropdownPos.width,
      zIndex: 9999,
    }}
  >
    {tenantOptions
      .filter(
        (t) =>
          t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
          t.slug.toLowerCase().includes(tenantSearch.toLowerCase()),
      )
      .map((t) => (
        <button
          key={t.id}
          type="button"
          className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors"
          onClick={() => {
            setComposeTenantId(t.id);
            setSelectedTenantName(t.name);
            setTenantSearch('');
            setTenantPickerOpen(false);
          }}
        >
          <div className="text-sm text-white/90 font-medium">{t.name}</div>
          <div className="text-xs text-white/40">
            {t.slug} · {t.country} · {t.status}
          </div>
        </button>
      ))}
    {tenantOptions.filter(
      (t) =>
        t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
        t.slug.toLowerCase().includes(tenantSearch.toLowerCase()),
    ).length === 0 && (
      <div className="px-3 py-2 text-sm text-white/30">No matching SPs found</div>
    )}
  </div>,
  document.body,
)}
```

**Step 6** — Update the click-outside handler to also close the portal dropdown. The existing `tenantPickerRef` handler should work as-is because clicks on the portal dropdown are outside the ref. Update it to also check the dropdown:

Replace the existing click-outside `useEffect` with:

```typescript
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Node;
    // Close if click is outside both the input wrapper and the portal dropdown
    if (
      tenantPickerRef.current &&
      !tenantPickerRef.current.contains(target) &&
      !(target as HTMLElement).closest?.('[data-tenant-dropdown]')
    ) {
      setTenantPickerOpen(false);
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);
```

And add `data-tenant-dropdown` to the portal dropdown's root div:

```tsx
<div
  data-tenant-dropdown
  className="fixed max-h-48 overflow-y-auto ..."
```

---

## Fix 2: Add error and loading handling to the tenants query

### Problem

**File:** `apps/platform-portal/src/app/(portal)/messages/page.tsx` (line 231)

```typescript
const { data: tenantsData } = useQuery(TENANTS_FOR_PICKER);
```

No `error` or `loading` state is captured. If the query fails (network error, auth issue, schema mismatch), the failure is completely silent — `tenantsData` is `undefined`, `tenantOptions` becomes `[]`, and the user sees "No matching SPs found" with no indication of the real problem.

### Fix

**File:** `apps/platform-portal/src/app/(portal)/messages/page.tsx`

Change line 231:

```typescript
// From:
const { data: tenantsData } = useQuery(TENANTS_FOR_PICKER);

// To:
const { data: tenantsData, error: tenantsError, loading: tenantsLoading } = useQuery(TENANTS_FOR_PICKER);
```

Then update the "No matching SPs found" fallback inside the dropdown to show appropriate states. Replace the existing no-results block at the bottom of the dropdown:

```tsx
// From:
{tenantOptions.filter(
  (t) =>
    t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
    t.slug.toLowerCase().includes(tenantSearch.toLowerCase()),
).length === 0 && (
  <div className="px-3 py-2 text-sm text-white/30">No matching SPs found</div>
)}

// To:
{tenantsLoading && (
  <div className="px-3 py-2 text-sm text-white/30">Loading SPs...</div>
)}
{tenantsError && (
  <div className="px-3 py-2 text-sm text-red-400/70">
    Failed to load SPs: {tenantsError.message}
  </div>
)}
{!tenantsLoading && !tenantsError && tenantOptions.filter(
  (t) =>
    t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
    t.slug.toLowerCase().includes(tenantSearch.toLowerCase()),
).length === 0 && (
  <div className="px-3 py-2 text-sm text-white/30">No matching SPs found</div>
)}
```

This makes query failures visible to the platform admin, which also helps diagnose whether the real issue is auth, network, or something else.

---

## Fix 3: Add `console.error` for tenants query failure

### Problem

Even with the UI error message, it's useful to have query failures logged for developer debugging.

### Fix

**File:** `apps/platform-portal/src/app/(portal)/messages/page.tsx`

Add an effect to log tenants query errors:

```typescript
useEffect(() => {
  if (tenantsError) {
    console.error('[Messages] Failed to load tenants for picker:', tenantsError);
  }
}, [tenantsError]);
```

---

## Summary of all changes

| # | File | Action | Priority |
|---|---|---|---|
| 1 | `apps/platform-portal/src/app/(portal)/messages/page.tsx` | **EDIT** — import `createPortal` from `react-dom`; add `tenantInputRef` and `dropdownPos` state; add position-tracking effect; attach ref to search input; render dropdown as portal with `position: fixed` and inline positioning; update click-outside handler to account for portal | HIGH |
| 2 | `apps/platform-portal/src/app/(portal)/messages/page.tsx` | **EDIT** — destructure `error` and `loading` from `useQuery(TENANTS_FOR_PICKER)`; show loading/error/no-results states in dropdown | HIGH |
| 3 | `apps/platform-portal/src/app/(portal)/messages/page.tsx` | **EDIT** — add `console.error` effect for tenants query failure | LOW |

---

## Definition of Done

- [ ] When compose type is "Direct", typing into the Recipient SP field shows a dropdown with matching tenants
- [ ] The dropdown is not clipped by the compose slide-over's overflow boundary
- [ ] If the tenants query fails, an error message is shown in the dropdown (not silent "No matching SPs found")
- [ ] If the tenants query is loading, a "Loading SPs..." message is shown
- [ ] Selecting a tenant from the dropdown still sets the tenant ID correctly
- [ ] Click-outside still closes the dropdown (including the portal version)
- [ ] The "Clear" button still works to deselect
- [ ] Console logs the error if the tenants query fails
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
