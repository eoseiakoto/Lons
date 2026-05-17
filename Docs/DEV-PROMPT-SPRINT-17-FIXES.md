# DEV-SPRINT-17-FIXES — PM Review Fix Cycle

**Date:** 2026-05-17
**In Response To:** `PM-SPRINT-17-REVIEW-2026-05-17.md`
**Scope:** 7 P2 fixes + 4 selected P3 items
**Estimated SP:** ~7.5
**Priority:** Must complete before Sprint 18 kickoff

---

## Prerequisites

Read these before starting:

| Document | Why |
|---|---|
| `CLAUDE.md` | Decimal math rules, multi-tenancy, soft-delete, `updated_at` requirement |
| `PM-SPRINT-17-REVIEW-2026-05-17.md` | Full context for each finding |
| `DEV-PROMPT-SPRINT-17.md` | Original requirements |

---

## Critical Rules (unchanged)

1. **Money:** `Decimal(19,4)` / `Prisma.Decimal` / string in API. NEVER `number`/`float`. Use `add()`, `subtract()`, `divide()`, `compare()`, `bankersRound()` from `@lons/common`.
2. **Multi-tenancy:** `tenant_id` + RLS on every table. `tenantId` passed explicitly.
3. **Timestamps:** All tables must have `created_at` AND `updated_at`.
4. **Soft delete:** Business data uses `deleted_at`, never hard deletes.
5. **Tests:** 80%+ coverage on new code. All existing tests must continue to pass.

---

## Fix Overview

| # | Finding | Severity | SP | Description |
|---|---------|----------|-----|-------------|
| FIX-1 | F-S17-1 + F-S17-2 | P2 | 1 | `findById()` decryption + `deactivate()` soft-delete logic |
| FIX-2 | F-S17-3 | P2 | 1.5 | Unit tests for `EmiIntegrationConfigService` |
| FIX-3 | F-S17-4 | P2 | 1 | Move API key creation inside onboarding transaction |
| FIX-4 | F-S17-5 + F-S17-16 | P2 | 0.5 | Decimal math in financial profile + credit summary |
| FIX-5 | F-S17-6 | P2 | 0.5 | Decimal math in BNPL credit-line restore idempotent path |
| FIX-6 | F-S17-7 + F-S17-17 | P2 | 1 | Schema: add `updated_at` to `customer_financial_data`, add `deleted_at` to `customer_matching_rules` |
| FIX-7 | F-S17-11 | P3 | 0.5 | Fix `credit_bureau_score` default bands to 0–100 scale |
| FIX-8 | F-S17-10 | P3 | 0.5 | Wire `recordSyncSuccess/Error` in EMI sync job |
| FIX-9 | F-S17-13 + F-S17-14 | P3 | 0.5 | Onboarding: idempotencyKey + audit log entry |
| FIX-10 | F-S17-5.7 | P3 | 0.5 | CustomerMatchingRule backfill migration for existing tenants |

**Total: ~7.5 SP**

---

## FIX-1 — `findById()` credential decryption + `deactivate()` logic (1 SP)

**Finding:** F-S17-1 + F-S17-2
**File:** `services/integration-service/src/emi-data/emi-integration-config.service.ts`

### Problem A: `findById()` never returns decrypted credentials

`findById()` at line 151 calls `this.toDecrypted(row)`, which calls `decryptCredentialsSync()` at line 326. That method **always returns null**:

```typescript
// CURRENT (broken):
private decryptCredentialsSync(encrypted: string | null): null {
  return encrypted === null ? null : null; // always null!
}
```

Meanwhile, the async `getDecryptedCredentials()` at line 336 works correctly but is never used by `findById()`.

### Fix A

Make `findById()` use the async decryption path:

```typescript
async findById(
  tenantId: string,
  configId: string,
): Promise<EmiIntegrationConfigDecrypted | null> {
  const row = await this.prisma.emiIntegrationConfig.findFirst({
    where: { id: configId, tenantId, deletedAt: null },
  });
  if (!row) return null;

  const decryptedCredentials = await this.decryptCredentials(row.credentials);

  return {
    ...row,
    credentials: decryptedCredentials,
  };
}
```

Remove the `decryptCredentialsSync()` method entirely — it is misleading and unused elsewhere. Update `toDecrypted()` to accept an optional `stripCredentials` flag only (used by `findAll` where credentials should NOT be returned).

### Problem B: `deactivate()` sets `deletedAt`, breaking the resolver

`deactivate()` at line 161 sets both `isActive: false` AND `deletedAt: new Date()`. The resolver then re-fetches via `findById()` which filters `deletedAt: null` — always returning null and throwing.

### Fix B

`deactivate()` should only set `isActive: false`. Do NOT set `deletedAt`. Deactivation and deletion are separate operations — deactivation means "stop syncing", deletion means "remove from the system".

```typescript
async deactivate(tenantId: string, configId: string): Promise<EmiIntegrationConfig> {
  const existing = await this.prisma.emiIntegrationConfig.findFirst({
    where: { id: configId, tenantId, deletedAt: null },
  });
  if (!existing) {
    throw new NotFoundError('EMI integration config not found', configId);
  }

  return this.prisma.emiIntegrationConfig.update({
    where: { id: configId },
    data: { isActive: false },
  });
}
```

Return the updated record directly from the `update()` call, so the resolver doesn't need a separate `findById()`:

**File:** `apps/graphql-server/src/graphql/resolvers/emi-config.resolver.ts` (line 74–87)

```typescript
@Mutation(() => EmiIntegrationConfigType)
async deactivateEmiIntegrationConfig(
  @CurrentTenant() tenantId: string,
  @Args('id', { type: () => ID }) id: string,
): Promise<EmiIntegrationConfigType> {
  const result = await this.emiConfigService.deactivate(tenantId, id);
  return this.toGraphql(result);
}
```

---

## FIX-2 — Unit tests for `EmiIntegrationConfigService` (1.5 SP)

**Finding:** F-S17-3
**File:** `services/integration-service/src/emi-data/__tests__/emi-integration-config.service.spec.ts` (create)

The dev prompt explicitly required this test file. Write comprehensive tests covering:

**CRUD operations:**
- `create()` — valid input creates config, credentials are encrypted before storage
- `create()` — duplicate `(tenantId, name)` throws
- `create()` — idempotencyKey dedup returns existing record
- `findAll(tenantId)` — returns all active configs, credentials stripped (not decrypted)
- `findById(tenantId, configId)` — returns config with decrypted credentials (verify FIX-1A works)
- `findById()` — non-existent returns null
- `findById()` — wrong tenantId returns null (tenant isolation)
- `update()` — updates fields, re-encrypts credentials if changed
- `deactivate()` — sets `isActive: false`, does NOT set `deletedAt` (verify FIX-1B works)
- `deactivate()` — deactivated config is still returned by `findById()` (not soft-deleted)

**Credential security:**
- Credentials stored in DB are NOT plaintext (verify encryption)
- `findAll()` never returns decrypted credentials
- `findById()` returns decrypted credentials
- `getDecryptedCredentials()` returns decrypted credentials

**Sync status:**
- `recordSyncSuccess()` updates `lastSyncAt`, clears `lastSyncError`
- `recordSyncError()` updates `lastSyncError`

**Test approach:** Mock `PrismaService` and `IKeyProvider`. Use Jest. Follow the existing test patterns in the integration-service (see `services/integration-service/src/emi-data/__tests__/emi-data.service.spec.ts` for style reference).

---

## FIX-3 — Move API key creation inside onboarding transaction (1 SP)

**Finding:** F-S17-4
**File:** `services/entity-service/src/tenant/tenant-onboarding.service.ts`

### Problem

`createApiKey()` is called at line 212, AFTER the `$transaction()` block ends at line 206. If `createApiKey()` fails (DB error, encryption error, etc.), the tenant exists without API credentials and there is no recovery path.

### Fix

Move the API key creation inside the transaction. The concern about Redis quota enforcement can be addressed by moving only the DB-level key creation inside the transaction, and doing the Redis quota setup after the transaction commits (quota tracking is eventually consistent and can be retried):

```typescript
const txResult = await this.prisma.$transaction(async (tx) => {
  // 1. Create tenant
  const tenant = await tx.tenant.create({ ... });

  // 2. Create roles
  const roles = await this.createDefaultRoles(tx, tenant.id);

  // 3. Create admin user
  const adminUser = await this.createAdminUser(tx, tenant.id, input.adminEmail, roles);

  // 4. Generate API key (DB part only — inside transaction)
  const apiKeyPlaintext = crypto.randomBytes(32).toString('hex');
  const apiKeyHash = await hashApiKeySecret(apiKeyPlaintext);
  const apiKey = await tx.apiKey.create({
    data: {
      tenantId: tenant.id,
      name: 'Default API Key',
      keyHash: apiKeyHash,
      rateLimitPerMin: 60,
    },
  });

  // 5. Generate webhook signing secret
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  const encryptedWebhookSecret = encrypt(webhookSecret);
  await tx.tenant.update({
    where: { id: tenant.id },
    data: {
      settings: {
        ...(tenant.settings as Record<string, unknown>),
        webhookSigningKeyEncrypted: encryptedWebhookSecret,
      },
    },
  });

  return {
    tenant,
    roles,
    adminUser,
    apiKey: { id: apiKey.id, plaintext: apiKeyPlaintext },
    webhookSigningSecret: webhookSecret,
  };
});

// Redis quota setup (outside transaction — eventually consistent, can retry)
await this.quotaService.initializeTenantQuota(txResult.tenant.id).catch((err) => {
  this.logger.warn(`Quota initialization failed for tenant ${txResult.tenant.id}, will retry: ${err.message}`);
});

return {
  tenant: txResult.tenant,
  roles: txResult.roles,
  adminUser: txResult.adminUser,
  apiCredentials: {
    clientId: txResult.apiKey.id,
    clientSecret: txResult.apiKey.plaintext,
    rateLimitPerMin: 60,
  },
  webhookSigningSecret: txResult.webhookSigningSecret,
};
```

**Key change:** Use the transaction client `tx` for `apiKey.create()` and the tenant settings update. This way, if anything fails, the entire onboarding rolls back atomically — no orphaned tenants.

**Tests:**
- Verify all 5 entities (tenant, roles, admin user, API key, webhook secret) are created in one transaction
- Verify partial failure rolls back everything (mock a failure in step 4 or 5)
- Verify API key plaintext is returned exactly once
- Verify webhook secret is encrypted at rest

---

## FIX-4 — Decimal math in financial profile and credit summary (0.5 SP)

**Finding:** F-S17-5 + F-S17-16

### File A: `services/entity-service/src/customer/customer-financial-profile.service.ts`

**Line 278–281 (`repaymentScore`):**

Replace:
```typescript
const repaymentScore =
  totalScheduleEntries > 0
    ? Math.round((onTimeEntries / totalScheduleEntries) * 100)
    : null;
```

With:
```typescript
import { divide, bankersRound, multiply } from '@lons/common';

const repaymentScore =
  totalScheduleEntries > 0
    ? Number(bankersRound(multiply(divide(String(onTimeEntries), String(totalScheduleEntries)), '100'), 0))
    : null;
```

**Line 287–290 (`defaultRate`):**

Replace:
```typescript
const defaultRate =
  totalLoans > 0
    ? Math.round((defaultedContracts / totalLoans) * 100)
    : 0;
```

With:
```typescript
const defaultRate =
  totalLoans > 0
    ? Number(bankersRound(multiply(divide(String(defaultedContracts), String(totalLoans)), '100'), 0))
    : 0;
```

### File B: `services/entity-service/src/customer/customer-credit-summary.service.ts`

Check for any identical float division patterns in this file and apply the same fix. The `add()`/`subtract()` calls are already correct — just verify no `Number()` conversions on monetary amounts remain.

---

## FIX-5 — Decimal math in BNPL credit-line restore idempotent path (0.5 SP)

**Finding:** F-S17-6
**File:** `services/entity-service/src/bnpl-credit-line/bnpl-credit-line.service.ts`

**Line 365:**

Replace:
```typescript
const candidate = (Number(prev) + Number(amount)).toFixed(4);
```

With:
```typescript
import { add, compare } from '@lons/common';

const candidate = add(prev, amount);
```

Verify the subsequent cap logic also uses Decimal comparison. If the cap at `approvedLimit` uses `Number()` or `>`, replace with:

```typescript
const cappedValue = compare(candidate, line.approvedLimit.toString()) > 0
  ? line.approvedLimit.toString()
  : candidate;
```

**Test:** Add a case in the existing BNPL credit-line tests that verifies the idempotent path produces the correct result with large monetary values where float precision would diverge (e.g., `prev = '99999999999.9999'`, `amount = '0.0001'`).

---

## FIX-6 — Schema: add `updated_at` and `deleted_at` columns (1 SP)

**Finding:** F-S17-7 + F-S17-17

### Migration

Create migration `20260517200000_sprint17_fixes`:

```sql
-- FIX-6a: Add updated_at to customer_financial_data
ALTER TABLE customer_financial_data
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- FIX-6b: Add deleted_at to customer_matching_rules
ALTER TABLE customer_matching_rules
  ADD COLUMN deleted_at TIMESTAMPTZ;
```

### Prisma Schema

**File:** `packages/database/prisma/schema.prisma`

Add to `CustomerFinancialData` model:
```prisma
updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
```

Add to `CustomerMatchingRule` model:
```prisma
deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)
```

### Service Updates

**File:** `services/entity-service/src/customer/customer-dedup.service.ts`

Add `deletedAt: null` to the `findMany` query for matching rules:

```typescript
const rules = await this.prisma.customerMatchingRule.findMany({
  where: { tenantId, isActive: true, deletedAt: null },
  orderBy: { priority: 'asc' },
});
```

If this filter is already present, confirm. If not, add it.

---

## FIX-7 — Fix `credit_bureau_score` default bands to 0–100 scale (0.5 SP)

**Finding:** F-S17-11
**File:** `services/process-engine/src/scoring/scorecard/default-scorecard.ts`

The `normalizeBureauScore()` function normalises raw bureau scores to a 0–100 range. But the default scorecard bands for `credit_bureau_score` use 0–1000 thresholds (700+, 500–699, 300–499, 0–299). This means once tenants enable the factor with non-zero weight, all normalised scores (0–100) would fall into the lowest band.

Replace:
```typescript
{
  name: 'credit_bureau_score',
  weight: 0,
  bands: [
    { min: 700, max: null, points: 100 },
    { min: 500, max: 699, points: 70 },
    { min: 300, max: 499, points: 40 },
    { min: 0, max: 299, points: 10 },
  ],
},
```

With:
```typescript
{
  name: 'credit_bureau_score',
  weight: 0,
  bands: [
    { min: 70, max: null, points: 100 },
    { min: 50, max: 69, points: 70 },
    { min: 30, max: 49, points: 40 },
    { min: 0, max: 29, points: 10 },
  ],
},
```

Also update the seed script if it inserts the default scorecard into `scorecard_configs` — ensure the seeded bands match.

**Test:** Update any existing default-scorecard test to verify the bands use 0–100 thresholds.

---

## FIX-8 — Wire `recordSyncSuccess/Error` in EMI sync job (0.5 SP)

**Finding:** F-S17-10
**File:** `services/integration-service/src/emi-data/emi-data-sync.job.ts`

### Problem

The sync job iterates customers and syncs data, but never calls `recordSyncSuccess()` or `recordSyncError()` on `EmiIntegrationConfigService`. The `lastSyncAt` and `lastSyncError` columns on `emi_integration_configs` are always null.

### Fix

1. Inject `EmiIntegrationConfigService` into the sync job constructor.

2. After the customer loop completes, call the appropriate status recorder:

```typescript
async runForTenant(tenantId: string, configId: string): Promise<SyncResult> {
  const result: SyncResult = { succeeded: 0, failed: 0, skipped: 0 };

  try {
    // ... existing customer iteration loop ...

    // Record success after all customers processed
    await this.emiConfigService.recordSyncSuccess(tenantId, configId);
  } catch (error) {
    // Record error if the entire sync batch fails
    await this.emiConfigService.recordSyncError(
      tenantId,
      configId,
      error instanceof Error ? error.message : String(error),
    );
    throw error; // re-throw so the job runner marks it failed
  }

  return result;
}
```

3. If `recordSyncSuccess` / `recordSyncError` don't accept `tenantId` as a parameter, add it (they must enforce tenant isolation).

**Test:** Update `emi-data-sync.job.spec.ts`:
- After successful sync: verify `recordSyncSuccess` was called with the correct `configId`
- After failed sync: verify `recordSyncError` was called with the error message

---

## FIX-9 — Onboarding: idempotencyKey + audit log (0.5 SP)

**Finding:** F-S17-13 + F-S17-14

### File: `services/entity-service/src/tenant/tenant-onboarding.service.ts`

1. Add `idempotencyKey?: string` to the `onboard()` input type. Before the transaction, check for an existing tenant with the same `slug` — if found and `idempotencyKey` matches the stored metadata, return the existing onboarding result instead of re-creating.

2. After the transaction commits, emit an audit log entry:

```typescript
await this.auditService.log({
  tenantId: txResult.tenant.id,
  action: 'TENANT_ONBOARDED',
  actorId: txResult.adminUser.id,
  resourceType: 'tenant',
  resourceId: txResult.tenant.id,
  details: {
    slug: input.slug,
    adminEmail: maskEmail(input.adminEmail),
    apiKeyId: txResult.apiKey.id,
    webhookKeyGenerated: true,
  },
});
```

### File: `apps/graphql-server/src/graphql/resolvers/tenant.resolver.ts`

Add `idempotencyKey: String` to the `onboardTenant` mutation input.

---

## FIX-10 — CustomerMatchingRule backfill migration (0.5 SP)

**Finding:** Dev delivery notes §5.7

### Problem

Sprint 17's seed script inserts default matching rules for new tenants, but existing tenants seeded before Sprint 17 have no rules. Without rules, `CustomerDedupService` falls back to the legacy `externalId`-only check.

### Fix

Add a data-fix step to migration `20260517200000_sprint17_fixes`:

```sql
-- Backfill default matching rules for tenants that don't have any
INSERT INTO customer_matching_rules (id, tenant_id, name, match_fields, priority, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  t.id,
  rule.name,
  rule.match_fields::jsonb,
  rule.priority,
  true,
  now(),
  now()
FROM tenants t
CROSS JOIN (VALUES
  ('National ID', '["nationalId"]', 1),
  ('Phone + DOB', '["phonePrimary", "dateOfBirth"]', 2),
  ('Email + Name', '["email", "fullName"]', 3)
) AS rule(name, match_fields, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM customer_matching_rules cmr
  WHERE cmr.tenant_id = t.id
);
```

This is idempotent — the `WHERE NOT EXISTS` clause prevents duplicates if run multiple times.

**Important:** This migration must run AFTER the `deleted_at` column addition from FIX-6, since both are in the same migration file.

---

## Execution Order

1. **FIX-6** (schema) — migration first, adds `updated_at` + `deleted_at` columns + backfill
2. **FIX-10** (backfill) — data-fix in same migration, requires FIX-6's `deleted_at` to exist
3. **FIX-1** (EMI config service fixes) — credential decryption + deactivation logic
4. **FIX-2** (EMI config tests) — depends on FIX-1 being correct
5. **FIX-3** through **FIX-5** (parallel) — independent fixes
6. **FIX-7** through **FIX-9** (parallel) — independent P3 fixes

---

## Exit Criteria

1. `findById()` returns decrypted credentials when called with valid `tenantId` and `configId`
2. `deactivateEmiIntegrationConfig` mutation succeeds without throwing (returns the deactivated config with `isActive: false`)
3. `EmiIntegrationConfigService` has unit tests covering CRUD, encryption, deactivation, and sync status recording
4. Tenant onboarding creates tenant + roles + admin user + API key + webhook secret in a single atomic transaction
5. `repaymentScore` and `defaultRate` use `divide()` + `bankersRound()` — no `Math.round()` or JS `/` on counts
6. BNPL credit-line restore idempotent path uses `add()` — no `Number()` on monetary values
7. `customer_financial_data` has `updated_at TIMESTAMPTZ` column
8. `customer_matching_rules` has `deleted_at TIMESTAMPTZ` column and dedup service filters `deletedAt: null`
9. `credit_bureau_score` default bands use 0–100 thresholds (70/50/30/0)
10. EMI sync job calls `recordSyncSuccess/Error` after processing, updating `lastSyncAt` / `lastSyncError`
11. Onboarding mutation accepts `idempotencyKey` and emits `TENANT_ONBOARDED` audit log
12. Existing tenants without matching rules receive the 3 default rules via backfill migration
13. All existing tests pass (1,235 baseline — the 1 pre-existing screening test failure is acceptable)
14. `tsc` clean across all packages

---

*References: PM-SPRINT-17-REVIEW-2026-05-17.md, DELIVERY-NOTES-SPRINT-17-2026-05-17.md*
