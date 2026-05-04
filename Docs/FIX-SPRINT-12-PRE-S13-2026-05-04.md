# Dev Prompt: Pre-Sprint 13 Mandatory Fixes

**Date:** 2026-05-04
**Priority:** High — must be applied before Sprint 13 work begins
**Findings:** F-IF-1 (P1), F-IF-6 (P2)
**Estimated Effort:** ~45 minutes total

---

## Global Rules (as always)

- All monetary amounts: `Decimal(19,4)`, `bankersRound()`, string serialization — never `float` or `Number()`.
- Every DB query scoped by `tenantId`.
- Every new event uses `emitAndBuild()` with `tenantId`.
- Tests for every change.
- No placeholder comments like `// TODO` without an accompanying implementation.

---

## FIX 1 — Offer Expiry for Invoice Factoring (F-IF-1)

**Problem:** `generateOffer()` computes a throwaway `expiresAt` variable (hardcoded 24h, line 362 of `factoring-origination.service.ts`) and returns it in the response, but it is **never persisted** to the database. The `Invoice` model has no `offerExpiresAt` field. `acceptOffer()` performs no expiry check. There is no scheduler to cancel stale offers.

**Business context:** Without offer expiry, a seller can accept a factoring offer days or weeks after market conditions and debtor risk have changed. In African markets with volatile FX rates, this exposes the platform to stale-rate risk. The loan-request flow already does this correctly (see `offer.service.ts` lines 38–74 and `LoanRequest.offerExpiresAt` in the schema).

### Step 1: Schema — Add `offerExpiresAt` to Invoice model

**File:** `packages/database/prisma/schema.prisma`

Add to the `Invoice` model, after `recourseType`:

```prisma
  offerExpiresAt     DateTime?          @map("offer_expires_at") @db.Timestamptz(6)
```

Generate a migration:

```bash
pnpm --filter database db:migrate --name add_invoice_offer_expires_at
```

### Step 2: Config — Add `offerValidityHours` to factoringConfig

**File:** `services/process-engine/src/factoring/factoring-origination.types.ts` (or wherever `readFactoringConfig` parses the JSONB config)

Add `offerValidityHours` with a default of `48`:

```typescript
offerValidityHours: Number(config.offerValidityHours ?? 48),
```

Also update the admin portal product wizard IF step to include this field (label: "Offer validity (hours)", default: 48, min: 1, max: 720).

### Step 3: Persist expiry in `generateOffer()`

**File:** `services/process-engine/src/factoring/factoring-origination.service.ts`

In `generateOffer()`, **replace** the throwaway `expiresAt` variable (line 362) and the `data` object in the `prisma.invoice.update` call (line 347–358):

```typescript
// Compute offer expiry from product config.
const offerValidityMs = config.offerValidityHours * 60 * 60 * 1000;
const offerExpiresAt = new Date(Date.now() + offerValidityMs);

const updated = await this.prisma.invoice.update({
  where: { id: invoiceId },
  data: {
    advanceRatePercent,
    advancedAmount,
    reserveAmount,
    discountFee,
    serviceFee,
    netDisbursement,
    recourseType,
    offerExpiresAt,                     // ← NEW: persisted
    status: InvoiceStatus.offer_generated,
  },
});
```

Update the return object to use `updated.offerExpiresAt` instead of the throwaway variable:

```typescript
return {
  invoiceId,
  faceValue,
  advanceRatePercent,
  advancedAmount,
  reserveAmount,
  discountFee,
  serviceFee,
  netDisbursement,
  recourseType,
  dueDate: updated.dueDate.toISOString().slice(0, 10),
  currency: invoice.currency,
  expiresAt: updated.offerExpiresAt!.toISOString(),
};
```

### Step 4: Validate expiry in `acceptOffer()`

**File:** `services/process-engine/src/factoring/factoring-origination.service.ts`

In `acceptOffer()`, after the status check (line 413–417), add an expiry check:

```typescript
if (invoice.offerExpiresAt && invoice.offerExpiresAt < new Date()) {
  // Auto-cancel the expired offer rather than silently accepting.
  await this.prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: InvoiceStatus.cancelled },
  });
  this.eventBus.emitAndBuild(EventType.INVOICE_CANCELLED, tenantId, {
    invoiceId,
    reason: 'offer_expired',
  });
  throw new ValidationError(
    `Offer for invoice ${invoiceId} expired at ${invoice.offerExpiresAt.toISOString()} — invoice has been cancelled`,
  );
}
```

### Step 5: Scheduler job for stale offer auto-cancellation

**File:** `apps/scheduler/src/jobs/invoice-offer-expiry.job.ts` (NEW)

Create a scheduler job that runs every hour (or every 15 minutes — match the cooling-off-expiry cadence) and cancels expired offers:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { InvoiceStatus } from '@prisma/client';

@Injectable()
export class InvoiceOfferExpiryJob {
  private readonly logger = new Logger('InvoiceOfferExpiryJob');

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  @Cron('0 * * * *') // Every hour, on the hour
  async handleCron() {
    this.logger.log('Starting invoice offer expiry scan…');

    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () => this.prisma.tenant.findMany({ where: { status: 'active', deletedAt: null } }),
    );

    let totalCancelled = 0;

    for (const tenant of tenants) {
      try {
        const count = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          async () => {
            const expired = await this.prisma.invoice.findMany({
              where: {
                tenantId: tenant.id,
                status: InvoiceStatus.offer_generated,
                offerExpiresAt: { lt: new Date() },
              },
            });

            for (const inv of expired) {
              await this.prisma.invoice.update({
                where: { id: inv.id },
                data: { status: InvoiceStatus.cancelled },
              });
              this.eventBus.emitAndBuild(EventType.INVOICE_CANCELLED, tenant.id, {
                invoiceId: inv.id,
                reason: 'offer_expired',
              });
            }

            return expired.length;
          },
        );

        if (count > 0) {
          this.logger.log(`Tenant ${tenant.name}: ${count} expired offers cancelled`);
        }
        totalCancelled += count;
      } catch (error) {
        this.logger.error(
          `Offer expiry scan failed for tenant ${tenant.name}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    this.logger.log(`Offer expiry scan complete. ${totalCancelled} invoices cancelled.`);
  }
}
```

Register it in the scheduler module alongside the existing jobs.

### Step 6: Update GraphQL InvoiceType

**File:** `apps/graphql-server/src/graphql/types/invoice.type.ts` (or wherever the Invoice GraphQL type is defined)

Add `offerExpiresAt` as an optional `DateTime` field so the admin portal and seller API can display it.

### Step 7: Tests

**File:** `services/process-engine/src/factoring/factoring-origination.service.spec.ts`

Add tests:

1. **`generateOffer should persist offerExpiresAt based on config.offerValidityHours`** — mock config with `offerValidityHours: 72`, verify the persisted `offerExpiresAt` is ~72 hours from now.
2. **`acceptOffer should reject expired offers`** — create an invoice with `offerExpiresAt` in the past, call `acceptOffer`, expect `ValidationError` with message containing "expired".
3. **`acceptOffer should accept non-expired offers`** — create an invoice with `offerExpiresAt` in the future, call `acceptOffer`, expect success.

**File:** `apps/scheduler/src/jobs/invoice-offer-expiry.job.spec.ts`

Follow the pattern of `cooling-off-expiry.job.spec.ts` (with the corrected `enterTenantContext` mock):

1. `should be defined`
2. `should cancel expired offers for each active tenant`
3. `should continue processing other tenants if one fails`
4. `should handle no expired offers gracefully`

---

## FIX 2 — Add `funded` to Invoice Aging Active Statuses (F-IF-6)

**Problem:** `invoice-aging.service.ts` line 34 defines `ACTIVE_INVOICE_STATUSES` as `[debtor_notified, payment_received]`. The `funded` status is excluded, meaning invoices between funding and debtor notification are invisible to the aging scan. They could silently age past due without any system awareness.

**Note:** The `concentration-limit.service.ts` correctly includes `funded` in its own `ACTIVE_INVOICE_STATUSES` (line 54–57). This fix brings the aging service into consistency.

### The Fix

**File:** `services/process-engine/src/factoring/invoice-aging.service.ts`

**Line 34** — change:

```typescript
const ACTIVE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.debtor_notified,
  InvoiceStatus.payment_received,
];
```

to:

```typescript
const ACTIVE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.funded,
  InvoiceStatus.debtor_notified,
  InvoiceStatus.payment_received,
];
```

That's it. The aging classification logic already handles pre-due invoices correctly — a funded invoice before its due date lands in `Current` or `Approaching`, which is exactly right.

### Test Update

**File:** `services/process-engine/src/factoring/invoice-aging.service.spec.ts`

Add one test:

**`should include funded invoices in aging scan`** — create a mock invoice with `status: funded` and a future `dueDate`, run the aging scan, verify it appears in the `Current` bucket.

Update any existing test that asserts on the count of statuses in `ACTIVE_INVOICE_STATUSES` to expect 3 instead of 2.

---

## Verification

After both fixes, run:

```bash
# Factoring origination tests (FIX 1 — new offer expiry tests)
pnpm --filter process-engine test -- factoring-origination

# Invoice aging tests (FIX 2 — funded status)
pnpm --filter process-engine test -- invoice-aging

# Scheduler tests (FIX 1 — new offer expiry job)
pnpm --filter scheduler test -- invoice-offer-expiry

# Full factoring lifecycle integration (regression)
pnpm --filter process-engine test -- factoring-lifecycle

# Cooling-off-expiry tests (must still pass — unrelated)
pnpm --filter scheduler test -- cooling-off-expiry
```

All tests must pass. No changes to existing production logic beyond the two targeted fixes.

---

## Summary

| Fix | Finding | Files Changed | New Files | Tests Added |
|-----|---------|--------------|-----------|-------------|
| FIX 1 | F-IF-1 (P1) | schema.prisma, factoring-origination.service.ts, factoring-origination.types.ts, invoice.type.ts, product wizard IF step | invoice-offer-expiry.job.ts, invoice-offer-expiry.job.spec.ts | 7 |
| FIX 2 | F-IF-6 (P2) | invoice-aging.service.ts | — | 1–2 |
