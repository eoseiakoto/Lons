# Fix: Allow Self-Funded Products (No External Lender Required)

**Priority: HIGH**
**Owner: Claude Code (DEV)**
**Date: 2026-04-16**

---

## Problem

The product creation wizard offers "No lender (self-funded)" as a valid funding option, but product activation then fails with: **"Product must have a lender before activation"**. SPs that fund from their own balance sheet cannot activate any products.

## Business Decision

Self-funded products are allowed. The fix is to auto-create a "Self-Funded" lender record per tenant so the data model stays clean — every product still has a `lenderId`, revenue sharing works (0% lender share, 100% SP share), and settlement/reconciliation pipelines don't need null-checks.

---

## What to Fix

### Step 1: Auto-create a "Self-Funded" lender per tenant

**File:** `services/entity-service/src/product/product.service.ts`

Add a helper method that finds or creates the tenant's self-funded lender:

```typescript
private async getOrCreateSelfFundedLender(tenantId: string): Promise<string> {
  // Check if a self-funded lender already exists for this tenant
  const existing = await this.prisma.lender.findFirst({
    where: {
      tenantId,
      name: 'Self-Funded',
      deletedAt: null,
    },
  });

  if (existing) return existing.id;

  // Create one
  const lender = await this.prisma.lender.create({
    data: {
      tenantId,
      name: 'Self-Funded',
      status: 'active',
    },
  });

  return lender.id;
}
```

This uses `findFirst` + `create` rather than `upsert` because the Lender model doesn't have a unique constraint on `(tenantId, name)`. If you prefer atomic safety, add a try/catch around the create for duplicate race conditions.

### Step 2: Wire it into product creation

**File:** `services/entity-service/src/product/product.service.ts`

In the `create()` method, before the product insert (around line 47), add:

```typescript
// If no lender provided, use the tenant's self-funded lender
let lenderId = data.lenderId;
if (!lenderId) {
  lenderId = await this.getOrCreateSelfFundedLender(tenantId);
}
```

Then in the `prisma.product.create()` call (line 52–81), replace the conditional lender connect:

```typescript
// Replace this (line 77):
...(data.lenderId ? { lender: { connect: { id: data.lenderId } } } : {}),

// With:
lender: { connect: { id: lenderId } },
```

This ensures every product always has a lender — either the user's selection or the auto-created "Self-Funded" one.

### Step 3: Keep the activation check (no change needed)

**File:** `services/entity-service/src/product/product.service.ts` (lines 242–256)

The `if (!product.lenderId)` check in `activate()` can stay. Since every product now gets a lender at creation time, this becomes a safety net rather than a user-facing error. No code change needed here.

### Step 4: Update the Funding Source wizard UI

**File:** `apps/admin-portal/src/components/products/wizard/step-funding-source.tsx`

The "No lender (self-funded)" option (line 110) should stay — it's a valid choice. But update the label and help text to make the behavior clear:

```tsx
// Replace the option label (line 110):
<option value="">{t('products.wizard.selfFunded', 'Self-Funded (SP balance sheet)')}</option>

// Update the helper text below the dropdown to explain:
// "Self-funded products use the SP's own balance sheet. A system lender record will be 
//  created automatically. Revenue sharing: 0% lender, 100% SP."
```

When "Self-Funded" is selected, the Revenue Sharing Preview section already shows the correct values (Platform Fee from tenant config, 0% Lender Share, remainder to SP). No change needed there.

### Step 5: Seed a "Self-Funded" lender for existing tenants

**File:** `packages/database/prisma/seed.ts`

In the seed file, after tenants are created, add a self-funded lender for each tenant:

```typescript
// After tenant creation, for each tenant:
await prisma.lender.upsert({
  where: { id: 'some-deterministic-uuid-for-self-funded' }, // Use a stable UUID
  update: {},
  create: {
    tenantId: tenant.id,
    name: 'Self-Funded',
    status: 'active',
  },
});
```

Since there's no unique constraint on `(tenantId, name)`, use a deterministic UUID based on the tenant ID, or use `findFirst` + conditional create like the service method.

### Step 6: Filter "Self-Funded" from the lender dropdown

**File:** `apps/admin-portal/src/components/products/wizard/step-funding-source.tsx`

The lender dropdown should NOT show the "Self-Funded" lender as a selectable option (it would be confusing to have both "Self-Funded" in the dropdown and "Self-Funded (SP balance sheet)" as the empty option). Filter it out:

```tsx
// Where lenders are mapped to options (around line 112-120):
const selectableLenders = lenders.filter(
  (l: { name: string }) => l.name !== 'Self-Funded'
);
```

### Step 7: Mark "Self-Funded" lender as system-managed in the Lender list

**File:** `apps/admin-portal/src/app/(portal)/lenders/page.tsx` (or wherever lenders are listed)

Add a visual indicator (badge or tag) for the Self-Funded lender so admins know it's system-created and shouldn't be deleted. Optionally, prevent deletion of lenders named "Self-Funded" or add a `isSystem` flag to the Lender model.

A lightweight approach without schema changes: just check `name === 'Self-Funded'` in the UI and show a "System" badge and disable the delete button.

---

## Definition of Done

- [ ] Products created with "Self-Funded" option activate successfully (no lender error)
- [ ] A "Self-Funded" lender record is auto-created per tenant on first use
- [ ] Revenue sharing for self-funded products shows 0% lender / 100% SP
- [ ] The lender dropdown doesn't show "Self-Funded" as a selectable external lender
- [ ] Existing products with a lender are unaffected
- [ ] Editing a self-funded product and switching to an external lender works
- [ ] Editing a lender-backed product and switching to self-funded works
- [ ] The lender list page shows "Self-Funded" with a "System" indicator
- [ ] Self-funded lender cannot be deleted
- [ ] Seed data includes self-funded lenders for test tenants
- [ ] All existing tests pass
- [ ] `pnpm lint` passes
