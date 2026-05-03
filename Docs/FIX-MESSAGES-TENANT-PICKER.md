# Fix: Platform Portal Messages — Replace Tenant UUID Input with Searchable SP Picker

**Priority: HIGH**
**Owner: Claude Code (DEV)**
**Date: 2026-04-17**

---

## Problem

When composing a direct message from the Platform Portal to a specific SP (tenant), the form displays a raw text input labeled "Tenant ID" with placeholder "Enter tenant UUID". Platform admins are expected to know and manually type the tenant's UUID — which is impractical. Nobody memorizes UUIDs.

**File:** `apps/platform-portal/src/app/(portal)/messages/page.tsx` (lines 566–576)

```typescript
{composeType === 'direct' && (
  <div>
    <label className="text-sm text-white/40 block mb-1">Tenant ID</label>
    <input
      type="text"
      className="glass-input text-sm w-full"
      placeholder="Enter tenant UUID"
      value={composeTenantId}
      onChange={(e) => setComposeTenantId(e.target.value)}
    />
  </div>
)}
```

The platform admin should be able to search for and select an SP by name, with the UUID resolved behind the scenes.

---

## Fix: Replace text input with a searchable tenant dropdown

### Step 1 — Add a tenant list query to the messages page

The `tenants` query already exists and is used on the Tenants page. Add it to the messages page:

**File:** `apps/platform-portal/src/app/(portal)/messages/page.tsx`

Add after the existing GraphQL queries:

```typescript
const TENANTS_FOR_PICKER = gql`
  query TenantsForPicker {
    tenants(pagination: { first: 200 }) {
      edges {
        node {
          id
          name
          slug
          country
          status
        }
      }
    }
  }
`;
```

Add the query hook inside the component:

```typescript
const { data: tenantsData } = useQuery(TENANTS_FOR_PICKER);
const tenantOptions: { id: string; name: string; slug: string; country: string; status: string }[] =
  tenantsData?.tenants?.edges?.map((e: any) => e.node) || [];
```

### Step 2 — Build a searchable tenant picker component

Replace the raw `<input>` block (lines 566–576) with a searchable dropdown. The component should:

1. Show a text input that filters the tenant list as the user types
2. Display matching tenants in a dropdown beneath the input
3. Show tenant name, slug, and country for easy identification
4. On selection, set the `composeTenantId` state to the tenant's UUID
5. Show the selected tenant's name in the input (not the UUID)

**File:** `apps/platform-portal/src/app/(portal)/messages/page.tsx`

Add state for the search term and selected tenant name:

```typescript
const [tenantSearch, setTenantSearch] = useState('');
const [selectedTenantName, setSelectedTenantName] = useState('');
const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
```

Update the `resetComposeForm` function to also reset tenant picker state:

```typescript
const resetComposeForm = () => {
  setComposeType('announcement');
  setComposePriority('normal');
  setComposeSubject('');
  setComposeBody('');
  setComposeTenantId('');
  setTenantSearch('');
  setSelectedTenantName('');
  setTenantPickerOpen(false);
};
```

Replace the Tenant ID input block (lines 566–576) with:

```tsx
{composeType === 'direct' && (
  <div className="relative">
    <label className="text-sm text-white/40 block mb-1">Recipient SP</label>
    <input
      type="text"
      className="glass-input text-sm w-full"
      placeholder="Search by SP name or slug..."
      value={selectedTenantName || tenantSearch}
      onChange={(e) => {
        setTenantSearch(e.target.value);
        setSelectedTenantName('');
        setComposeTenantId('');
        setTenantPickerOpen(true);
      }}
      onFocus={() => setTenantPickerOpen(true)}
    />

    {/* Dropdown */}
    {tenantPickerOpen && tenantSearch.trim() && (
      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-[#161b22] border border-white/10 rounded-lg shadow-xl">
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
      </div>
    )}

    {/* Show selected tenant confirmation */}
    {composeTenantId && selectedTenantName && (
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="text-emerald-400">✓</span>
        <span className="text-white/60">
          Sending to: <span className="text-white/80 font-medium">{selectedTenantName}</span>
        </span>
        <button
          type="button"
          className="text-white/30 hover:text-white/60 ml-auto"
          onClick={() => {
            setComposeTenantId('');
            setSelectedTenantName('');
            setTenantSearch('');
          }}
        >
          Clear
        </button>
      </div>
    )}
  </div>
)}
```

### Step 3 — Close dropdown on outside click

Add an effect to close the dropdown when clicking outside:

```typescript
import { useRef, useEffect } from 'react';

// Inside the component:
const tenantPickerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (tenantPickerRef.current && !tenantPickerRef.current.contains(e.target as Node)) {
      setTenantPickerOpen(false);
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);
```

Wrap the tenant picker `<div className="relative">` with `ref={tenantPickerRef}`.

### Step 4 — Validate before sending

Update the `handleSend` function to validate that a tenant is selected when type is `direct`:

```typescript
const handleSend = async () => {
  if (!composeSubject.trim() || !composeBody.trim()) {
    setStatusMsg({ type: 'error', text: 'Subject and body are required' });
    setTimeout(() => setStatusMsg(null), 3000);
    return;
  }

  if (composeType === 'direct' && !composeTenantId) {
    setStatusMsg({ type: 'error', text: 'Please select a recipient SP for direct messages' });
    setTimeout(() => setStatusMsg(null), 3000);
    return;
  }

  // ... rest unchanged
};
```

---

## Additional: Hardcoded English strings

This page has no i18n at all (the platform portal doesn't have i18n infrastructure yet). This is a known broader gap and out of scope for this fix. Note it for a future platform portal i18n pass.

---

## Summary of all changes

| # | File | Action | Priority |
|---|---|---|---|
| 1 | `apps/platform-portal/src/app/(portal)/messages/page.tsx` | **EDIT** — add `TENANTS_FOR_PICKER` query, replace raw Tenant ID input with searchable dropdown, add validation, add click-outside handler | HIGH |

---

## Definition of Done

- [ ] When compose type is "Direct", the form shows a searchable "Recipient SP" field (not a raw UUID input)
- [ ] Typing in the field filters the tenant list by name or slug
- [ ] Selecting a tenant from the dropdown populates the tenant ID behind the scenes
- [ ] The selected tenant's name is shown in the input with a confirmation line and a "Clear" button
- [ ] If no tenant is selected when clicking "Send Message" on a direct message, an error is shown
- [ ] The dropdown closes when clicking outside of it
- [ ] Announcements and system messages still work as before (no tenant picker shown)
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
