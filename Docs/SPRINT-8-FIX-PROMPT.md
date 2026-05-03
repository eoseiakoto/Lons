# Sprint 8 — Fix Prompt (Post-Review)

**Priority: HIGH — 3 blockers must be fixed before staging demo**
**Owner: Claude Code (DEV)**
**Date: 2026-04-10**

BA review found 6 issues in Sprint 8 implementation. 3 are HIGH severity (blockers), 3 are MEDIUM. Fix all 6 in order.

---

## Fix 1 (HIGH): platformFeePercent Authorization Bypass

### Problem

The `updateTenant` mutation in `apps/graphql-server/src/graphql/resolvers/tenant.resolver.ts` (line 81) uses `@Roles('tenant:update')`. This allows SP admin users — who have the `tenant:update` permission on their own tenant — to modify `platformFeePercent`. The business rule is: **only Platform Admins can set the platform fee. SP admins must NOT be able to edit it.**

### Current Code (lines 79-102)

```typescript
@Mutation(() => TenantType)
@AuditAction(AuditActionType.UPDATE, AuditResourceType.TENANT)
@Roles('tenant:update')
async updateTenant(
  @Args('id', { type: () => ID }) id: string,
  @Args('input') input: UpdateTenantInput,
): Promise<TenantType> {
  const updateData: Prisma.TenantUpdateInput = {};
  // ...
  if (input.platformFeePercent !== undefined) {
    updateData.platformFeePercent = new Prisma.Decimal(input.platformFeePercent);
  }
  return this.tenantService.update(id, updateData) as unknown as TenantType;
}
```

### Fix

Create a **separate mutation** `setPlatformFee` restricted to `platform_admin` role only, and **strip `platformFeePercent` from the `updateTenant` mutation**.

**Step 1**: In `apps/graphql-server/src/graphql/resolvers/tenant.resolver.ts`, remove the platformFeePercent block from `updateTenant` (delete lines 97-99), and add a new mutation:

```typescript
@Mutation(() => TenantType)
@AuditAction(AuditActionType.UPDATE, AuditResourceType.TENANT)
@Roles('platform_admin')
async setPlatformFee(
  @Args('id', { type: () => ID }) id: string,
  @Args('feePercent', { type: () => String }) feePercent: string,
): Promise<TenantType> {
  const fee = new Prisma.Decimal(feePercent);
  if (fee.lessThan(0) || fee.greaterThan(100)) {
    throw new Error('Platform fee must be between 0 and 100');
  }
  return this.tenantService.update(id, {
    platformFeePercent: fee,
  }) as unknown as TenantType;
}
```

**Step 2**: In `apps/graphql-server/src/graphql/inputs/update-tenant.input.ts`, remove the `platformFeePercent` field from `UpdateTenantInput` so it cannot be passed through `updateTenant` at all.

**Step 3**: Update the platform portal tenant detail page (`apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx`) to use the new `setPlatformFee` mutation instead of `updateTenant` when saving the platform fee. The inline edit should call:

```graphql
mutation SetPlatformFee($id: ID!, $feePercent: String!) {
  setPlatformFee(id: $id, feePercent: $feePercent) {
    id
    platformFeePercent
  }
}
```

**Step 4**: Update the platform portal tenant create page (`apps/platform-portal/src/app/(portal)/tenants/create/page.tsx`) — the `createTenant` mutation already runs under `tenant:create` which is platform-admin-only, so `platformFeePercent` in `CreateTenantInput` is fine. No change needed there.

---

## Fix 2 (HIGH): Missing Prisma Migration for Messaging Models

### Problem

`PlatformMessage` and `MessageRecipient` models exist in `packages/database/prisma/schema.prisma` but no migration was generated. The last migration is `20260409205442_add_platform_fee_to_tenant`. Without a migration, these tables won't exist in the database, and the entire messaging system (Tasks 7 + 9) will fail at runtime.

### Fix

Run the Prisma migration generator:

```bash
cd /path/to/lons
pnpm --filter database db:migrate --name add-messaging-models
```

This will generate a migration in `packages/database/prisma/migrations/` with the SQL to create:
- `platform_messages` table with all columns and indexes
- `message_recipients` table with all columns, unique constraint, and indexes
- `MessageType` and `MessagePriority` enums

After generating, verify the migration SQL contains:
1. `CREATE TYPE "MessageType" AS ENUM ('announcement', 'direct', 'system');`
2. `CREATE TYPE "MessagePriority" AS ENUM ('low', 'normal', 'high', 'urgent');`
3. `CREATE TABLE "platform_messages"` with all columns from the schema
4. `CREATE TABLE "message_recipients"` with all columns from the schema
5. `CREATE UNIQUE INDEX` on `(message_id, recipient_id)`
6. Index on `(recipient_id, read_at)`
7. Index on `tenant_id` for both tables

Also update the seed script at `packages/database/prisma/seed.ts` to insert a few sample messages (e.g., a welcome announcement from platform to the demo SP tenant and a direct message).

---

## Fix 3 (HIGH): UpdateProductInput Missing lenderId and revenueSharing

### Problem

`apps/graphql-server/src/graphql/inputs/update-product.input.ts` does not include `lenderId` or `revenueSharing` fields. The `CreateProductInput` has both (lines 27-30 and 108-110 of `create-product.input.ts`), but UpdateProductInput does not. This means once a product is created, the edit wizard cannot change its funding source or revenue sharing configuration.

### Current File

`apps/graphql-server/src/graphql/inputs/update-product.input.ts` ends at line 72 with `approvalThresholds`.

### Fix

Add the two missing fields to `UpdateProductInput`. Insert before the closing brace of the class:

```typescript
  @Field({ nullable: true, description: 'Lender UUID — set to null to remove lender assignment' })
  @IsOptional()
  @IsString()
  lenderId?: string;

  @Field(() => GraphQLJSON, { nullable: true, description: 'Revenue sharing: { lenderSharePercent, insuranceEnabled, insuranceProvider, insuranceCoverageType }' })
  @IsOptional()
  revenueSharing?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  notificationConfig?: Record<string, unknown>;
```

Also add `notificationConfig` since that's another JSON field on Product that exists in CreateProductInput but is missing from UpdateProductInput (the wizard step 7 Notifications has the same problem).

Then verify the product update resolver in `apps/graphql-server/src/graphql/resolvers/product.resolver.ts` passes `lenderId` and `revenueSharing` through to the service when present in the input. If the resolver destructures specific fields, add these to the destructure.

---

## Fix 4 (MEDIUM): CSV Export Missing from Platform Audit Log

### Problem

The platform portal audit log page (`apps/platform-portal/src/app/(portal)/settings/audit-log/page.tsx`) has no CSV export functionality. The admin portal's audit log also doesn't have this feature, but it was explicitly required for the platform audit log.

### Fix

Add an "Export CSV" button to the audit log page. The admin portal already imports `downloadCSV` from `@/lib/utils` in some report components (e.g., `apps/admin-portal/src/components/reports/revenue-report.tsx`). Use the same pattern.

**Step 1**: Check if `downloadCSV` utility exists in the platform portal's `lib/utils`. If not, copy it from the admin portal or create it:

```typescript
export function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '');
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
```

**Step 2**: In the audit log page, add an "Export CSV" button in the toolbar/filter area. When clicked, export the currently displayed/filtered audit log entries:

```typescript
const handleExportCSV = () => {
  const rows = (data?.platformAuditLogs?.items || []).map((log: any) => ({
    Timestamp: log.createdAt,
    'SP Name': log.tenantName || '—',
    Action: log.action,
    'Resource Type': log.resourceType,
    'Resource ID': log.resourceId,
    'Actor Type': log.actorType,
    'Actor ID': log.actorId,
    'Actor IP': log.actorIp || '—',
    'Correlation ID': log.correlationId || '—',
  }));
  downloadCSV(rows, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
};
```

Place the button next to the filter controls with an icon (e.g., Download icon from lucide-react).

---

## Fix 5 (MEDIUM): Missing 90-Day Message Retention Scheduler

### Problem

No scheduled job exists to clean up messages older than 90 days. The messaging system will grow unbounded without retention enforcement.

### Fix

Create a new scheduler job at `apps/scheduler/src/jobs/message-retention.job.ts`. Follow the exact pattern of `aging.job.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';

@Injectable()
export class MessageRetentionJob {
  private readonly logger = new Logger('MessageRetentionJob');

  constructor(private prisma: PrismaService) {}

  @Cron('0 3 * * *') // Daily at 3:00 AM
  async handleCron() {
    this.logger.log('Starting message retention cleanup...');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    try {
      // Step 1: Delete MessageRecipient records for old archived messages
      const archivedDeleted = await this.prisma.messageRecipient.deleteMany({
        where: {
          archivedAt: { not: null },
          message: { createdAt: { lt: cutoffDate } },
        },
      });
      this.logger.log(`Deleted ${archivedDeleted.count} archived recipient records older than 90 days`);

      // Step 2: Delete PlatformMessage records that have no remaining recipients
      // (all recipients either deleted above or never had any)
      const orphanedMessages = await this.prisma.platformMessage.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          recipients: { none: {} },
        },
      });
      this.logger.log(`Deleted ${orphanedMessages.count} orphaned messages older than 90 days`);

      // Step 3: Delete expired messages regardless of read status
      const expiredRecipients = await this.prisma.messageRecipient.deleteMany({
        where: {
          message: {
            expiresAt: { not: null, lt: new Date() },
          },
        },
      });

      const expiredMessages = await this.prisma.platformMessage.deleteMany({
        where: {
          expiresAt: { not: null, lt: new Date() },
          recipients: { none: {} },
        },
      });
      this.logger.log(`Deleted ${expiredRecipients.count} expired recipient records and ${expiredMessages.count} expired messages`);

    } catch (error) {
      this.logger.error(`Message retention cleanup failed: ${error}`);
    }
  }
}
```

Then register the job in the scheduler module. Check the main scheduler module file (likely `apps/scheduler/src/scheduler.module.ts` or `apps/scheduler/src/app.module.ts`) and add `MessageRetentionJob` to the `providers` array, following the same pattern as the other jobs.

---

## Fix 6 (MEDIUM): Product Wizard Review Step Shows Raw UUID for Lender

### Problem

In `apps/admin-portal/src/components/products/wizard/step-review.tsx` line 140:
```tsx
<Field label={t('products.wizard.lenderSelection')} value={data.lenderId || notConfigured} />
```

This displays the raw UUID string (e.g., `a1b2c3d4-...`) instead of the lender's human-readable name. Users cannot identify which lender was selected.

### Fix

The review step needs access to the lender name. Two approaches — choose the simpler one:

**Approach A (Preferred — No extra query):** Pass the selected lender's name from `step-funding-source.tsx` through the form state. Add a `lenderName` display field to `ProductFormState`:

1. In `product-wizard.tsx`, add `lenderName: string` to `ProductFormState` and `lenderName: ''` to `DEFAULT_STATE`. This is a display-only field, not sent to the backend.

2. In `step-funding-source.tsx`, when the user selects a lender from the dropdown, also set `lenderName`:
```typescript
const handleLenderChange = (lenderId: string) => {
  const selectedLender = lendersData?.lenders?.edges?.find(
    (e: any) => e.node.id === lenderId
  )?.node;
  onChange({
    ...data,
    lenderId,
    lenderName: selectedLender?.name || '',
  });
};
```

3. In `step-review.tsx` line 140, replace:
```tsx
<Field label={t('products.wizard.lenderSelection')} value={data.lenderId || notConfigured} />
```
with:
```tsx
<Field label={t('products.wizard.lenderSelection')} value={data.lenderName || (data.lenderId ? data.lenderId : notConfigured)} />
```

4. In `buildMutationInput()`, do NOT include `lenderName` in the mutation payload — it's purely for display.

---

## Verification After All Fixes

Run these checks after completing all 6 fixes:

```bash
# 1. Migration generates and applies cleanly
pnpm --filter database db:migrate --name add-messaging-models

# 2. All tests pass
pnpm test

# 3. Lint clean
pnpm lint

# 4. Build succeeds
pnpm build
```

Manual verification:
- [ ] Platform admin can call `setPlatformFee` — confirm mutation works
- [ ] SP admin calling `updateTenant` with `platformFeePercent` — confirm field is ignored / mutation rejects it
- [ ] `platform_messages` and `message_recipients` tables exist after migration
- [ ] Product edit wizard can update `lenderId` and `revenueSharing`
- [ ] Platform audit log has "Export CSV" button that downloads properly formatted file
- [ ] Review step in product wizard shows lender name (not UUID)
- [ ] After 90+ days (simulate by adjusting cutoff in test), retention job cleans up archived messages
