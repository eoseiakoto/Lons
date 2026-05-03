# Fix: Product Code Sequence Not Auto-Incrementing

**Priority: HIGH**
**Owner: Claude Code (DEV)**
**Date: 2026-04-16**

---

## Problem

Product codes follow the format `PREFIX-CURRENCY-SEQ` (e.g., `OD-GHS-001`, `ML-GHS-002`). The sequence number is not incrementing correctly — new products keep getting `001` or collide with existing codes.

## Root Cause

The code generation lives entirely on the **frontend** (`product-wizard.tsx` lines 272–294). It fetches up to 500 products via a GraphQL query, scans for matching prefix-currency codes, finds the max sequence, and returns `max + 1`. This approach has multiple failure modes:

1. **The query fetches ALL product types but paginates at 500.** If the tenant has many products, the list is incomplete and `maxSeq` is wrong.
2. **No type/currency filter on the query.** The `PRODUCTS_FOR_CODE` query fetches all products for the tenant, wastes most of the 500-item budget on irrelevant product types, and may miss the actual highest sequence for the target prefix-currency.
3. **Race condition.** Two admins opening the wizard simultaneously both see the same `maxSeq` and generate the same code. The backend retry (+1 up to 5 times) can handle a small collision window, but not a stale query.
4. **Stale query.** The code is computed once via `useMemo` when the products query loads. If the user spends time filling out the wizard, new products created by others aren't reflected.
5. **Backend retry is fragile.** The collision retry in `ProductService.create()` (lines 47–98) increments +1 up to 5 times, but if the sequence gap is larger than 5, all retries fail.

## What to Fix

Move code generation to the **backend**. The server should atomically determine the next sequence number at creation time using a direct database query, eliminating all race conditions and pagination issues.

---

### Step 1: Add a `nextProductCode` query to the backend

**File:** `services/entity-service/src/product/product.service.ts`

Add a new method that queries the database for the highest existing sequence for a given prefix-currency combination:

```typescript
async getNextProductCode(tenantId: string, type: string, currency: string): Promise<string> {
  const prefix = this.getTypePrefix(type);
  const codePattern = `${prefix}-${currency}-%`;

  // Find the highest existing sequence for this prefix-currency in one query
  const result = await this.prisma.$queryRaw<{ max_seq: number }[]>`
    SELECT COALESCE(MAX(
      CAST(SPLIT_PART(code, '-', ${prefix === 'BNPL' ? 3 : 3}) AS INTEGER)
    ), 0) AS max_seq
    FROM "Product"
    WHERE "tenantId" = ${tenantId}
      AND code LIKE ${codePattern}
      AND code ~ ${`^${prefix}-${currency}-[0-9]+$`}
  `;

  const nextSeq = (result[0]?.max_seq ?? 0) + 1;
  return `${prefix}-${currency}-${String(nextSeq).padStart(3, '0')}`;
}

private getTypePrefix(type: string): string {
  const prefixes: Record<string, string> = {
    OVERDRAFT: 'OD',
    MICRO_LOAN: 'ML',
    BNPL: 'BNPL',
    INVOICE_FACTORING: 'IF',
  };
  return prefixes[type] || 'ML';
}
```

**Important:** The BNPL prefix is 4 characters (not 2), so the code has format `BNPL-GHS-001` — the sequence is always the last segment after splitting on `-`. Use `SPLIT_PART(code, '-', -1)` or parse from the right. Alternatively, use a regex approach:

```typescript
// Safer approach: extract trailing digits regardless of prefix length
const result = await this.prisma.$queryRaw<{ max_seq: number }[]>`
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
  ), 0) AS max_seq
  FROM "Product"
  WHERE "tenantId" = ${tenantId}
    AND code LIKE ${codePattern}
`;
```

---

### Step 2: Expose as a GraphQL query

**File:** `apps/graphql-server/src/graphql/resolvers/product.resolver.ts`

Add a new query:

```typescript
@Query(() => String, { description: 'Generate the next available product code for a type and currency' })
async nextProductCode(
  @CurrentTenant() tenantId: string,
  @Args('type') type: string,
  @Args('currency') currency: string,
): Promise<string> {
  return this.productService.getNextProductCode(tenantId, type, currency);
}
```

Add the corresponding GraphQL schema type if using code-first (the `@Query(() => String)` decorator should handle it).

---

### Step 3: Update the backend `create()` to auto-generate codes

**File:** `services/entity-service/src/product/product.service.ts`

Replace the current collision-retry loop (lines 47–98) with server-side code generation:

```typescript
async create(tenantId: string, data: CreateProductInput, idempotencyKey?: string) {
  // ... existing idempotency check (lines 37-45) ...

  // Generate code server-side if not provided, or if provided code is a placeholder
  let code = data.code;
  if (!code || code.endsWith('-000') || code === '') {
    code = await this.getNextProductCode(tenantId, data.type, data.currency);
  }

  // Retry with increment on collision (handles rare race between getNextProductCode and insert)
  let result: any;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      result = await this.prisma.product.create({
        data: {
          tenantId,
          code,
          name: data.name,
          // ... rest of the fields (lines 56-78, unchanged) ...
        },
        include: { lender: true },
      });
      break;
    } catch (err: any) {
      const isCodeCollision = err?.code === 'P2002' &&
        Array.isArray(err?.meta?.target) && err.meta.target.includes('code');
      if (!isCodeCollision || attempt === 9) throw err;

      // Re-query for the actual next code instead of blindly incrementing +1
      code = await this.getNextProductCode(tenantId, data.type, data.currency);
    }
  }

  // ... existing idempotency caching (lines 100-104) ...
  return result;
}
```

**Key change:** On collision, re-query the database for the actual next code instead of blindly incrementing +1. This handles the case where many codes already exist past the collision point. Also increased retries from 5 to 10 for safety.

---

### Step 4: Simplify the frontend wizard

**File:** `apps/admin-portal/src/components/products/wizard/product-wizard.tsx`

Remove the client-side code generation logic and replace with a call to the new `nextProductCode` query:

```typescript
// Replace lines 43-49 (PRODUCTS_FOR_CODE query) with:
const NEXT_PRODUCT_CODE = gql`
  query NextProductCode($type: String!, $currency: String!) {
    nextProductCode(type: $type, currency: $currency)
  }
`;

// Replace lines 272-294 with:
const { data: codeData, loading: codeLoading, refetch: refetchCode } = useQuery(NEXT_PRODUCT_CODE, {
  variables: { type: form.type, currency: form.currency },
  skip: mode !== 'create' || !form.type || !form.currency,
  fetchPolicy: 'network-only',
});

const codeReady = mode !== 'create' || !codeLoading;

const generatedCode = useMemo(() => {
  if (mode !== 'create') return form.code;
  return codeData?.nextProductCode || '';
}, [mode, form.code, codeData]);
```

Also add a `refetchCode()` call when `form.type` or `form.currency` changes, so the code updates live as the user selects product type and currency:

```typescript
// Inside the existing useEffect or add a new one:
useEffect(() => {
  if (mode === 'create' && form.type && form.currency) {
    refetchCode({ type: form.type, currency: form.currency });
  }
}, [form.type, form.currency, mode, refetchCode]);
```

**Remove:** The `PRODUCTS_FOR_CODE` query, the `productsData` variable, and the old `generatedCode` useMemo block. Also remove the `TYPE_PREFIXES` map from the frontend (it now lives only on the backend).

---

### Step 5: Clean up

1. Remove the `PRODUCTS_FOR_CODE` GraphQL query definition (lines 43–49 in product-wizard.tsx)
2. Remove the `TYPE_PREFIXES` constant from the frontend (lines 51–56) — keep it only if used elsewhere in the UI for display purposes
3. Remove `productsLoading` from the `codeReady` calculation
4. Update the `buildMutationInput` function call to pass the `generatedCode` — this should already work since `generatedCode` is passed the same way

---

## Definition of Done

- [ ] `nextProductCode` query works and returns the correct next sequence (e.g., if `OD-GHS-003` exists, returns `OD-GHS-004`)
- [ ] Creating multiple products in rapid succession produces sequential codes (001, 002, 003...)
- [ ] Switching product type in the wizard updates the code preview immediately
- [ ] Switching currency in the wizard updates the code preview immediately
- [ ] Two simultaneous product creations never produce the same code
- [ ] BNPL products (4-char prefix) generate correct codes: `BNPL-GHS-001`
- [ ] Existing product codes are not affected
- [ ] Product edit mode still shows the existing code (read-only, unchanged)
- [ ] All existing product tests still pass
- [ ] `pnpm lint` passes
