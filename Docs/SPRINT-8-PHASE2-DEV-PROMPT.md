# Sprint 8 Phase 2 — Claude Code Development Prompt

**Priority: HIGH — Staging polish + commercial model foundation**
**Owner: Claude Code (DEV)**
**Date: 2026-04-10**

This prompt covers 3 items: product wizard validation hardening, tenant settings structured form, and settlement engine refactor to align with the Lōns commercial model.

---

## Table of Contents

1. [Product Wizard Form Validations](#task-1)
2. [Tenant Settings Structured Form](#task-2)
3. [Settlement Engine Commercial Model Refactor](#task-3)

---

<a id="task-1"></a>
## Task 1: Product Wizard Form Validations

**Monday.com ID:** 11708150530

### Problem

The product wizard (`apps/admin-portal/src/components/products/wizard/validation.ts`, 372 lines) has solid per-step validation but is missing two UX features: notification template warnings and scroll-to-error. The BA also flagged a need for consistent error messaging and activation gating.

### Current State

Validation already covers: min < max for amounts and tenors, interest rate 0-100, fee percentages 0-100 for PERCENTAGE type, eligibility bounds (credit score 0-1000, maxActiveLoans 1-50), funding source insurance rate 0-100, approval SLA 1-720 hours. Pre-activation validation (`validateForActivation`) runs all steps.

### What to Build

**1. Notification Template Warnings (Step 7)**

In `validation.ts`, enhance `validateNotifications()` (lines 272-292). Currently only checks for duplicate event+channel combos. Add warnings (not blocking errors) for missing templates on key events:

```typescript
const RECOMMENDED_EVENTS = ['APPROVED', 'DISBURSED', 'REPAYMENT_DUE', 'OVERDUE'];

// After duplicate check, add warnings:
const configuredEvents = data.notifications.map(n => n.event);
const missingEvents = RECOMMENDED_EVENTS.filter(e => !configuredEvents.includes(e));
if (missingEvents.length > 0) {
  warnings.push({
    field: 'notifications',
    message: `Recommended notification templates missing for: ${missingEvents.join(', ')}. These help ensure customers are informed about key loan events.`,
    severity: 'warning',  // not 'error' — doesn't block save/activate
  });
}
```

Update the `StepValidationResult` type to include an optional `warnings` array alongside `errors`. Warnings are displayed with an amber/yellow indicator (not red), and do NOT block step navigation or activation.

In `step-notifications.tsx`, render warnings below the notifications table using a yellow-bordered banner (similar to `StepErrorBanner` but amber-styled).

**2. Scroll-to-Error UX**

In `product-wizard.tsx`, when `handleNext()` detects validation errors (around line 315-320), add scroll-to-first-error:

```typescript
// After setStepErrors and setShowErrors:
requestAnimationFrame(() => {
  const firstError = document.querySelector('[data-field-error]');
  if (firstError) {
    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus the input if it's focusable
    const input = firstError.querySelector('input, select, textarea');
    if (input) (input as HTMLElement).focus();
  }
});
```

In each `FieldErrorMessage` component (`field-error.tsx`), add a `data-field-error` attribute to the error container div so the querySelector finds it:

```tsx
<div data-field-error className="flex items-center gap-1 mt-1 text-red-400 text-xs">
```

Also add scroll-to-error on the `handleSave()` and `handleActivate()` paths — not just `handleNext()`.

**3. Grace Period vs Tenor Cross-Validation**

In `validateFinancialTerms()`, add validation that grace period doesn't exceed the minimum tenor:

```typescript
if (gracePeriodDays > 0 && minTenorDays > 0 && gracePeriodDays >= minTenorDays) {
  errors.push({
    field: 'gracePeriodDays',
    message: 'Grace period must be shorter than the minimum loan tenor',
  });
}
```

**4. Interest Rate vs Lender Bounds Cross-Validation**

When a lender is selected in the Funding Source step (step 5), the lender's minInterestRate and maxInterestRate constrain the product. Add cross-step validation in `validateForActivation()`:

```typescript
// After all per-step validations pass:
if (data.lenderId && data.interestRate) {
  // This requires lender data — pass lender constraints as optional param
  // or validate at the wizard level with access to the lenders query cache
}
```

Since cross-step validation requires lender data that's fetched in the funding source step, the cleanest approach is: in `product-wizard.tsx`, after `validateForActivation()` passes, run an additional check if `lenderId` is set. Query the lender's rate bounds from the Apollo cache (already fetched by the funding source step's ACTIVE_LENDERS query) and validate.

If the product's interest rate falls outside the lender's min/max bounds, add a blocking error:
```
"Interest rate {rate}% is outside the selected lender's bounds ({min}% – {max}%)"
```

### Files to Modify

- `apps/admin-portal/src/components/products/wizard/validation.ts` — warnings type, notification warnings, grace period check
- `apps/admin-portal/src/components/products/wizard/product-wizard.tsx` — scroll-to-error in handleNext/handleSave/handleActivate, lender rate cross-validation
- `apps/admin-portal/src/components/products/wizard/field-error.tsx` — add data-field-error attribute
- `apps/admin-portal/src/components/products/wizard/step-notifications.tsx` — render warnings banner

---

<a id="task-2"></a>
## Task 2: Tenant Settings Structured Form

**Monday.com ID:** 11694502734

### Problem

The tenant `settings` field is a raw `Json?` column (schema.prisma line 316). On the platform portal's Create Tenant page (step 3: Configuration), it's a freeform JSON textarea with no validation. The admin portal's Tenant Settings page doesn't display the settings field at all. Only `settlementFrequency` is read from settings (by the settlement scheduler job).

### What to Build

Replace the raw JSON textarea with a structured form, backed by a Zod schema for server-side validation.

### Implementation Details

**1. Define Canonical Settings Schema**

Create `packages/common/src/schemas/tenant-settings.schema.ts`:

```typescript
import { z } from 'zod';

export const TenantSettingsSchema = z.object({
  // Regional & Locale
  defaultCurrency: z.string().length(3).default('GHS'),
  timezone: z.string().default('Africa/Accra'),
  locale: z.string().default('en'),
  dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('DD/MM/YYYY'),

  // Business Operations
  businessHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
    end: z.string().regex(/^\d{2}:\d{2}$/).default('17:00'),
    workDays: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),  // 0=Sun, 1=Mon...
  }).default({}),

  // Settlement
  settlementFrequency: z.enum(['daily', 'weekly', 'monthly']).default('daily'),

  // Notification Channels
  notificationChannels: z.object({
    sms: z.boolean().default(true),
    email: z.boolean().default(true),
    push: z.boolean().default(false),
    inApp: z.boolean().default(true),
  }).default({}),

  // Product Type Flags (which loan types this SP is licensed for)
  enabledProductTypes: z.object({
    overdraft: z.boolean().default(true),
    microLoan: z.boolean().default(true),
    bnpl: z.boolean().default(false),
    invoiceFactoring: z.boolean().default(false),
  }).default({}),

  // Branding
  branding: z.object({
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
    logoUrl: z.string().url().optional().or(z.literal('')),
    portalTitle: z.string().max(100).optional(),
  }).default({}),

  // Regulatory
  regulatoryJurisdiction: z.string().max(100).optional(),
  dataResidencyRegion: z.string().max(50).optional(),

  // Advanced overrides (escape hatch for anything not covered above)
  customOverrides: z.record(z.unknown()).optional(),
}).strict();

export type TenantSettings = z.infer<typeof TenantSettingsSchema>;

export const DEFAULT_TENANT_SETTINGS: TenantSettings = TenantSettingsSchema.parse({});
```

Install Zod if not already present: `pnpm --filter common add zod`

**2. Server-Side Validation**

In the tenant creation resolver (`apps/graphql-server/src/graphql/resolvers/tenant.resolver.ts`), validate the settings JSON against the schema before passing to the onboarding service:

```typescript
import { TenantSettingsSchema } from '@lons/common';

// In createTenant:
const parsedSettings = input.settings
  ? TenantSettingsSchema.parse(input.settings)
  : TenantSettingsSchema.parse({});
```

This will throw a ZodError if invalid — catch it and return a structured GraphQL error with field-level details.

Also validate in `updateTenant` if settings are being updated (currently settings aren't in UpdateTenantInput — add an optional `settings` field of type GraphQLJSON).

**3. Platform Portal — Create Tenant Step 3 (Structured Form)**

Replace the raw textarea in `apps/platform-portal/src/app/(portal)/tenants/create/page.tsx` (lines 460-490) with a structured form:

**Section A: Regional & Locale**
- Default Currency: dropdown (ISO 4217 — reuse the existing currency dropdown from product wizard)
- Timezone: dropdown (Africa/Accra, Africa/Lagos, Africa/Nairobi, Africa/Johannesburg, UTC, etc.)
- Locale: dropdown (en, fr, es, pt, ar, ha, sw — matching i18n locales)
- Date Format: dropdown (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)

**Section B: Business Operations**
- Business Hours: Start time + End time (time pickers or HH:MM inputs)
- Work Days: Checkbox group (Mon-Sun)
- Settlement Frequency: dropdown (Daily, Weekly, Monthly)

**Section C: Notification Channels**
- SMS: toggle
- Email: toggle
- Push: toggle
- In-App: toggle

**Section D: Enabled Product Types**
- Overdraft: toggle
- Micro Loan: toggle
- BNPL: toggle
- Invoice Factoring: toggle

**Section E: Branding**
- Primary Color: color picker input (hex)
- Logo URL: text input (optional)
- Portal Title: text input (optional)

**Section F: Regulatory**
- Regulatory Jurisdiction: text input (optional)
- Data Residency Region: text input (optional)

**Section G: Advanced (collapsible)**
- "Advanced JSON Overrides" — collapsible section with a small JSON textarea for power users. Merged with the structured fields (structured fields take precedence).

The form state should be a `TenantSettings` object. On submit, serialize to JSON for the mutation. Pre-populate all fields with defaults from `DEFAULT_TENANT_SETTINGS`.

**4. Admin Portal — Tenant Settings Page**

Update `apps/admin-portal/src/app/(portal)/settings/tenant/page.tsx` to display and edit the settings fields. Currently shows name, logo, color, timezone, currency, support contact, address. Add sections for settlement frequency, notification channels, enabled product types, and business hours. Use the same structured form layout.

The GraphQL query on this page needs to include the `settings` field from the Tenant type. Add `settings` to the TENANT_QUERY and parse it with `TenantSettingsSchema.safeParse()` on the client side to populate form fields.

### Files to Create/Modify

- **CREATE:** `packages/common/src/schemas/tenant-settings.schema.ts`
- **MODIFY:** `apps/graphql-server/src/graphql/resolvers/tenant.resolver.ts` — Zod validation on create/update
- **MODIFY:** `apps/graphql-server/src/graphql/inputs/update-tenant.input.ts` — add optional `settings` field
- **MODIFY:** `apps/platform-portal/src/app/(portal)/tenants/create/page.tsx` — replace JSON textarea with structured form
- **MODIFY:** `apps/admin-portal/src/app/(portal)/settings/tenant/page.tsx` — add settings fields to edit UI

---

<a id="task-3"></a>
## Task 3: Settlement Engine Commercial Model Refactor

**Monday.com ID:** 11715640649

### Problem

The current settlement engine (`services/settlement-service/src/settlement.service.ts`) calculates a 4-party revenue split (lender: 60%, sp: 25%, emi: 10%, platform: 5%) using hardcoded defaults at line 69. Per the Project Owner's direction:

> "The commercial model should be configurable with mixed options and flexible. The commercials should be based on what will be agreed with the SP, always with an add-on as a percentage of interest that will be charged on each loan."

This means Lōns's revenue from each SP comes from **a percentage add-on on the interest charged on each loan**, configured per SP agreement. The SP internally manages how they split revenue with their lenders/EMIs using the product-level `revenueSharing` JSON.

### Architecture Decision

Refactor into two layers:

**Layer 1: Lōns-to-SP Billing** (platform-level)
- Lōns charges each SP a configurable fee, stored on the Tenant model
- The `platformFeePercent` field already exists on Tenant (added in Sprint 8 Phase 1) — this represents the **percentage of interest income** that Lōns takes from each loan
- Example: If platformFeePercent = 5% and a loan generates GHS 100 in interest, Lōns takes GHS 5
- This is NOT a flat revenue share — it's specifically a percentage of interest, applied per-loan at settlement time
- The commercial terms are agreed between Lōns and the SP and set by Platform Admin via `setPlatformFee` mutation

**Layer 2: SP Internal Splits** (tenant-level, value-add tooling)
- The SP configures per-product revenue sharing via `Product.revenueSharing` JSON
- This defines how the SP splits their remaining revenue with lenders and EMI partners
- Lōns calculates and generates reports for the SP's benefit, but these are internal to the SP
- The SP can opt out of this feature (leave revenueSharing null) and manage splits externally

### Implementation Details

**1. Refactor SettlementService.calculateSettlement()**

File: `services/settlement-service/src/settlement.service.ts`

Replace the current 4-party fixed split (lines 54-109) with the two-layer approach:

```typescript
async calculateSettlement(tenantId: string, periodStart: Date, periodEnd: Date) {
  // Step 1: Query completed repayments in period (unchanged)
  const repayments = await this.getCompletedRepayments(tenantId, periodStart, periodEnd);

  // Step 2: Aggregate revenue by category
  const { totalInterestRevenue, totalFeeRevenue, totalPenaltyRevenue } = this.aggregateRevenue(repayments);
  const totalRevenue = totalInterestRevenue.add(totalFeeRevenue).add(totalPenaltyRevenue);

  // Step 3: Get tenant's platform fee configuration
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { platformFeePercent: true },
  });
  const platformFeePercent = tenant?.platformFeePercent ?? new Decimal(0);

  // Step 4: Calculate Lōns platform fee (% of interest income ONLY)
  const platformFeeAmount = bankersRound(
    totalInterestRevenue.mul(platformFeePercent).div(100)
  );

  // Step 5: Create SettlementRun
  const settlementRun = await this.prisma.settlementRun.create({
    data: {
      tenantId,
      periodStart,
      periodEnd,
      totalRevenue,
      status: 'calculated',
    },
  });

  // Step 6: Create settlement lines

  // Line 1: Platform fee (Lōns revenue)
  const lines = [];
  lines.push({
    tenantId,
    settlementRunId: settlementRun.id,
    partyType: 'platform',
    partyId: 'lons-platform',  // fixed identifier for Lōns
    grossRevenue: totalInterestRevenue,
    sharePercentage: platformFeePercent,
    shareAmount: platformFeeAmount,
    deductions: new Decimal(0),
    netAmount: platformFeeAmount,
  });

  // Line 2: SP net revenue (everything minus platform fee)
  const spNetRevenue = totalRevenue.sub(platformFeeAmount);
  lines.push({
    tenantId,
    settlementRunId: settlementRun.id,
    partyType: 'sp',
    partyId: tenantId,
    grossRevenue: totalRevenue,
    sharePercentage: new Decimal(100).sub(platformFeePercent),
    shareAmount: spNetRevenue,
    deductions: new Decimal(0),
    netAmount: spNetRevenue,
  });

  // Step 7: SP internal splits (optional, per-product)
  // Group repayments by product to apply per-product revenueSharing
  const productGroups = this.groupByProduct(repayments);

  for (const [productId, productRepayments] of Object.entries(productGroups)) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { revenueSharing: true, lenderId: true },
    });

    if (!product?.revenueSharing || !product.lenderId) continue;

    const sharing = product.revenueSharing as {
      lenderSharePercent?: number;
      insuranceEnabled?: boolean;
      insuranceProvider?: string;
    };

    if (!sharing.lenderSharePercent) continue;

    const productRevenue = this.aggregateRevenue(productRepayments);
    const productTotal = productRevenue.totalInterestRevenue
      .add(productRevenue.totalFeeRevenue)
      .add(productRevenue.totalPenaltyRevenue);

    // Deduct platform fee from this product's interest first
    const productPlatformFee = bankersRound(
      productRevenue.totalInterestRevenue.mul(platformFeePercent).div(100)
    );
    const productNetAfterPlatform = productTotal.sub(productPlatformFee);

    // Lender share (% of product net revenue after platform fee)
    const lenderShare = bankersRound(
      productNetAfterPlatform.mul(sharing.lenderSharePercent).div(100)
    );

    lines.push({
      tenantId,
      settlementRunId: settlementRun.id,
      partyType: 'lender',
      partyId: product.lenderId,
      grossRevenue: productNetAfterPlatform,
      sharePercentage: new Decimal(sharing.lenderSharePercent),
      shareAmount: lenderShare,
      deductions: new Decimal(0),
      netAmount: lenderShare,
    });

    // SP remainder for this product (after platform + lender)
    const spProductRemainder = productNetAfterPlatform.sub(lenderShare);
    lines.push({
      tenantId,
      settlementRunId: settlementRun.id,
      partyType: 'sp_product',
      partyId: tenantId,
      grossRevenue: productNetAfterPlatform,
      sharePercentage: new Decimal(100 - sharing.lenderSharePercent),
      shareAmount: spProductRemainder,
      deductions: new Decimal(0),
      netAmount: spProductRemainder,
    });
  }

  // Step 8: Persist all lines
  await this.prisma.settlementLine.createMany({ data: lines });

  // Step 9: Emit event
  this.eventEmitter.emit('settlement.calculated', {
    tenantId, settlementRunId: settlementRun.id,
  });

  return this.prisma.settlementRun.findUnique({
    where: { id: settlementRun.id },
    include: { lines: true },
  });
}
```

**2. Update Revenue Report UI**

The admin portal revenue report (`apps/admin-portal/src/components/reports/revenue-report.tsx`) currently queries settlements with `platformFee` and `lenderShare` fields. Update:

- The SETTLEMENTS_QUERY to match the new line structure
- Settlement table to show: Period, Total Revenue, Platform Fee (Lōns), SP Net Revenue, Status
- Settlement detail drawer: group lines by type — "Platform Billing" section (Lōns fee), "SP Internal Splits" section (lender shares per product)
- Revenue summary KPI cards: Total Revenue, Platform Fee, SP Net Revenue (unchanged labels, but data source is now the two-layer model)

**3. Platform Portal — Tenant Insights Revenue Section**

The tenant detail page (`apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx`) already shows a revenue summary. Update the `tenantInsights` resolver to calculate:
- Total Revenue across all settlements
- Platform Share = sum of lines where `partyType = 'platform'`
- SP Net = sum of lines where `partyType = 'sp'`
- Lender allocations = sum of lines where `partyType = 'lender'` (for the SP's benefit)

**4. Remove EMI Party Type**

The current hardcoded default includes `emi: 10`. Per the refactor, EMI (Electronic Money Institution / wallet provider) is no longer a settlement party — the SP pays the EMI separately as an operational cost. Remove `emi` from the default revenue sharing and from any seed data. The `partyType` values going forward are: `platform`, `sp`, `lender`, `sp_product`.

**5. Update Settlement Tests**

Update settlement service tests to verify:
- Platform fee is calculated as % of interest income only (not total revenue)
- SP net revenue = total revenue minus platform fee
- Per-product lender splits apply only when revenueSharing is configured
- Products without revenueSharing or without lenderId produce no lender lines
- Platform fee of 0% produces zero platform line amount
- All amounts use banker's rounding
- Settlement lines sum correctly (no money lost or created)

**6. Update Seed Data**

In `packages/database/prisma/seed.ts`, update any settlement seed data to match the new model. Update product revenueSharing seed values to use the new structure (lenderSharePercent only, no emi/platform keys — those are handled at the engine level).

### Files to Modify

- **MODIFY:** `services/settlement-service/src/settlement.service.ts` — core refactor
- **MODIFY:** `apps/admin-portal/src/components/reports/revenue-report.tsx` — updated queries and display
- **MODIFY:** `apps/graphql-server/src/graphql/resolvers/tenant-insights.resolver.ts` — updated revenue aggregation
- **MODIFY:** `apps/graphql-server/src/graphql/resolvers/settlement.resolver.ts` — updated types if needed
- **MODIFY:** `packages/database/prisma/seed.ts` — updated seed data
- **MODIFY:** Settlement service tests (check `services/settlement-service/src/*.spec.ts`)

---

## Execution Order

1. **Task 2** (Tenant Settings) — can start immediately, independent
2. **Task 1** (Wizard Validations) — can start immediately, independent
3. **Task 3** (Settlement Refactor) — depends on Task 2 being done first (settlementFrequency moves from raw JSON to structured schema, need alignment)

Tasks 1 and 2 can run in parallel. Task 3 starts after Task 2.

---

## Cross-Cutting Requirements

- Install Zod in packages/common if not present: `pnpm --filter common add zod`
- All money as Decimal (Prisma) / string (API) — never float
- Banker's rounding for all financial calculations
- Audit log entries for all mutations
- Tests must pass: `pnpm test`
- Lint must pass: `pnpm lint`
- Build must succeed: `pnpm build`

---

## Verification Checklist

- [ ] Product wizard shows warning banner for missing notification templates (amber, non-blocking)
- [ ] Validation errors scroll to first error field smoothly
- [ ] Grace period >= min tenor triggers validation error
- [ ] Interest rate outside lender bounds triggers error on activation
- [ ] Tenant creation form has structured settings (dropdowns, toggles, color picker) instead of JSON textarea
- [ ] Advanced JSON override section is collapsible and merges with structured fields
- [ ] Server-side Zod validation rejects invalid settings with field-level errors
- [ ] Admin portal Tenant Settings page shows and edits settings fields
- [ ] Settlement engine calculates platform fee as % of interest income only
- [ ] SP net revenue = total revenue minus platform fee
- [ ] Per-product lender splits only appear when revenueSharing is configured
- [ ] EMI party type removed from settlement calculations and seed data
- [ ] Settlement report UI shows two-layer model (platform billing + SP internal splits)
- [ ] All settlement amounts sum correctly (no rounding leakage)
- [ ] `pnpm test && pnpm lint && pnpm build` all pass
