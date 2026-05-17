# DEV PROMPT — Sprint 17 BA Fix Cycle

**Date:** 2026-05-17
**Sprint:** 17 (BA-review fix cycle)
**Source:** `Docs/PM-RESPONSE-BA-SPRINT-17-2026-05-17.md` §6
**BA Review:** `Docs/BA-SPRINT-17-FINDINGS-FOR-PM-2026-05-17.md`
**PM Review (prior fix cycle):** `Docs/PM-SPRINT-17-REVIEW-2026-05-17.md`
**Branch base:** tip of `claude/hopeful-haibt-32d778` (post-PM fix cycle)
**Total SP:** ~5 (7 items)

---

## Context

The BA reviewed Sprint 17 delivery (including the PM fix cycle) and issued a CONDITIONAL SIGN-OFF with 5 new P2 findings and 2 carry-forward P2s from Sprint 16 that were never implemented. All 7 items are confirmed by PM and must be resolved before Sprint 18 kicks off. This is the final fix cycle for Sprint 17.

**CRITICAL:** The 2 carry-forward items (FIX-BA-5 and FIX-BA-6) have now slipped two sprints. They must not slip again.

---

## Scope — 7 Items

| # | ID | Finding | File(s) | SP |
|---|---|---------|---------|-----|
| 1 | FIX-BA-1 | Remove `Number()` on scoring input + persistence | `scoring.service.ts` | 1 |
| 2 | FIX-BA-2 | Skip null factors with non-zero weight | `scorecard-engine.ts` | 1 |
| 3 | FIX-BA-3 | Audit log for API key rotation + revocation | `api-key-rotation.service.ts` | 0.5 |
| 4 | FIX-BA-4 | Overdue reminders use product notification config | `payment-reminder.job.ts` | 1 |
| 5 | FIX-BA-5 | Floor early settlement total at zero | `early-settlement.service.ts` | 0.5 |
| 6 | FIX-BA-6 | Template lookup integration test | `notification.service.spec.ts` | 1 |
| | | **Total** | | **~5** |

---

## FIX-BA-1 — Remove `Number()` on scoring input and persistence (1 SP)

**Finding:** F-BA-S17-1 + F-BA-S17-2
**File:** `services/process-engine/src/scoring/scoring.service.ts`
**Rule violated:** CLAUDE.md — NEVER use float or number for monetary amounts. `recommendedLimit` is monetary. `averageBalance` is monetary. `score` and `confidence` are Decimal columns.

### 1a. Scoring input — `averageBalance` (line 204–206)

`averageBalance30d` comes from a `DECIMAL(19,4)` Prisma column but is cast with `Number()` before feeding into the scorecard engine.

**Current code (line 204–206):**
```typescript
averageBalance = latestEmi.averageBalance30d
  ? Number(latestEmi.averageBalance30d)
  : null;
```

**Replace with:**
```typescript
averageBalance = latestEmi.averageBalance30d
  ? latestEmi.averageBalance30d.toString()
  : null;
```

**Note:** The `averageBalance` variable is typed as `number | null` at line 196. Update the type to `string | null`. The scorecard engine already imports `compare` from `@lons/common` — band matching for this factor should use string comparison via `compare()`, not numeric `>=` / `<=`. However, since the band thresholds for `average_balance` are coarse integers (50/200/500), and the scorecard engine already uses `Number()` for all band matching at line 36 (which FIX-BA-2 addresses separately), it is acceptable to leave the band matching as-is for this fix and convert to string only at the persistence boundary. Add a comment acknowledging the precision trade-off:

```typescript
// averageBalance kept as string for Decimal precision.
// Band matching in scorecard-engine uses Number() — acceptable for coarse integer thresholds.
// Full string-based comparison deferred to Sprint 19 scoring hardening.
```

### 1b. Persistence — `scoringResult.create()` (lines 116, 121, 124)

Three values are converted from Decimal strings to `Number()` before being passed to Prisma. All three columns are `DECIMAL` — Prisma accepts strings directly.

**Current code (lines 116, 121, 124):**
```typescript
score: Number(result.score),
recommendedLimit: Number(result.recommendedLimit),
confidence: Number(result.confidence),
```

**Replace with:**
```typescript
score: result.score,                    // Prisma Decimal accepts string
recommendedLimit: result.recommendedLimit, // monetary — must stay as string
confidence: result.confidence,           // Decimal — no Number() conversion
```

### 1c. Test

Add a precision roundtrip test to the scoring service spec:

```typescript
it('should preserve Decimal precision for recommendedLimit near JS Number boundary', async () => {
  // 9999999999999.9999 exceeds Number.MAX_SAFE_INTEGER's integer part
  // Number(9999999999999.9999) === 10000000000000 — precision loss!
  const precisionLimit = '9999999999999.9999';

  // Mock the scorecard engine to return this value
  mockScorecardEngine.calculateScore.mockReturnValue({
    score: '85.5000',
    recommendedLimit: precisionLimit,
    confidence: '0.9200',
    _metadata: { /* ... */ },
  });

  await service.scoreCustomer(tenantId, customerId, productId);

  // Verify Prisma receives the string, not Number(string)
  expect(mockPrisma.scoringResult.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        recommendedLimit: precisionLimit,  // string, not 10000000000000
        score: '85.5000',
        confidence: '0.9200',
      }),
    }),
  );
});
```

---

## FIX-BA-2 — Skip null factors with non-zero weight (1 SP)

**Finding:** F-BA-S17-3
**File:** `services/process-engine/src/scoring/scorecard/scorecard-engine.ts`
**Problem:** When a factor value is `null`/`undefined`, the engine treats it as `0` via `Number(value)`, which maps to the lowest band (typically 10 points). When tenants enable new factors (`average_balance`, `credit_bureau_score`) with non-zero weight, any customer without EMI or bureau data gets penalized — scored as if they have a zero balance.

**Current code (lines 34–44):**
```typescript
for (const factor of scorecard.factors) {
  const value = inputs[factor.name];
  const numericValue = value !== null && value !== undefined ? Number(value) : 0;

  let points = 0;
  for (const band of factor.bands) {
    const maxVal = band.max ?? Number.MAX_SAFE_INTEGER;
    if (numericValue >= band.min && numericValue <= maxVal) {
      points = band.points;
      break;
    }
  }
```

**Replace with:**
```typescript
const skippedFactors: string[] = [];

for (const factor of scorecard.factors) {
  const value = inputs[factor.name];

  // Skip factors with null/undefined values when weight > 0.
  // Rationale: null means "no data available" — not "zero".
  // A zero-weight factor contributes nothing regardless, so 0 is safe there.
  if ((value === null || value === undefined) && factor.weight > 0) {
    skippedFactors.push(factor.name);
    continue; // exclude from both score numerator and totalWeight denominator
  }

  const numericValue = value !== null && value !== undefined ? Number(value) : 0;

  let points = 0;
  for (const band of factor.bands) {
    const maxVal = band.max ?? Number.MAX_SAFE_INTEGER;
    if (numericValue >= band.min && numericValue <= maxVal) {
      points = band.points;
      break;
    }
  }
```

**Key change:** `totalWeight` must only accumulate weight for non-skipped factors. Locate where `totalWeight += factor.weight` is computed (inside the same loop) and ensure it is inside the non-skipped branch — i.e., after the `continue` guard.

**Return value:** Add `skippedFactors` to the return object and include in `_metadata`:
```typescript
_metadata: {
  ...existingMetadata,
  skippedFactors,
}
```

### Tests

Add to the scorecard engine spec:

```typescript
describe('null factor handling', () => {
  it('contributes 0 for null value when weight is 0 (backward compatible)', () => {
    const result = engine.calculateScore(scorecard, {
      repayment_history: '80',
      average_balance: null, // weight=0 in default scorecard
    });
    // average_balance with weight=0 doesn't affect score
    expect(result._metadata.skippedFactors).not.toContain('average_balance');
  });

  it('skips factor with null value when weight > 0', () => {
    const customScorecard = {
      ...scorecard,
      factors: scorecard.factors.map(f =>
        f.name === 'average_balance' ? { ...f, weight: 20 } : f,
      ),
    };
    const result = engine.calculateScore(customScorecard, {
      repayment_history: '80',
      average_balance: null, // weight=20 — should skip, not penalize
    });
    expect(result._metadata.skippedFactors).toContain('average_balance');
    // Score should be based only on repayment_history
  });

  it('scores factor normally when value is provided and weight > 0', () => {
    const customScorecard = {
      ...scorecard,
      factors: scorecard.factors.map(f =>
        f.name === 'average_balance' ? { ...f, weight: 20 } : f,
      ),
    };
    const result = engine.calculateScore(customScorecard, {
      repayment_history: '80',
      average_balance: '350', // provided — should score normally
    });
    expect(result._metadata.skippedFactors).not.toContain('average_balance');
  });

  it('lists all skipped factor names in _metadata.skippedFactors', () => {
    const customScorecard = {
      ...scorecard,
      factors: scorecard.factors.map(f =>
        ['average_balance', 'credit_bureau_score'].includes(f.name)
          ? { ...f, weight: 10 }
          : f,
      ),
    };
    const result = engine.calculateScore(customScorecard, {
      repayment_history: '80',
      average_balance: null,
      credit_bureau_score: null,
    });
    expect(result._metadata.skippedFactors).toEqual(
      expect.arrayContaining(['average_balance', 'credit_bureau_score']),
    );
  });
});
```

---

## FIX-BA-3 — Audit log for API key rotation + revocation (0.5 SP)

**Finding:** F-BA-S17-4
**File:** `services/entity-service/src/api-key/api-key-rotation.service.ts`
**Rule violated:** FR-SEC-002.3 — audit trail for credential lifecycle changes. Both `rotateWebhookSigningKey` and `onboard` have audit; `rotateApiKey` and `revokeApiKey` do not.

**Current constructor (line 9):**
```typescript
constructor(private prisma: PrismaService) {}
```

### Step 1 — Add AuditService DI

```typescript
import { AuditService } from '../audit/audit.service';

// In constructor:
constructor(
  private prisma: PrismaService,
  private auditService: AuditService,
) {}
```

Ensure `AuditService` is provided in the module that declares `ApiKeyRotationService`. Check the module file and add `AuditService` (or `AuditModule`) to `imports`/`providers` if not already present.

### Step 2 — Audit after successful rotation

After the `$transaction` block in `rotateApiKey()` completes successfully (after line ~59), add:

```typescript
await this.auditService.log({
  tenantId,
  action: 'API_KEY_ROTATED',
  actorId: null, // system-initiated; pass from caller if available
  resourceType: 'api_key',
  resourceId: apiKeyId,
  details: {
    previousKeyId: apiKeyId,
    newKeyId: newApiKey.id,
    gracePeriodHours,
  },
});
```

### Step 3 — Audit after successful revocation

After the `update` in `revokeApiKey()` completes successfully (after line ~75), add:

```typescript
await this.auditService.log({
  tenantId,
  action: 'API_KEY_REVOKED',
  actorId: null,
  resourceType: 'api_key',
  resourceId: apiKeyId,
  details: { revokedAt: new Date().toISOString() },
});
```

**IMPORTANT:** Do NOT log actual key values, hashes, or prefixes in audit entries. Log only IDs.

### Tests

Add to the rotation service spec:

```typescript
it('should write audit log entry on successful rotation', async () => {
  await service.rotateApiKey(tenantId, apiKeyId, { gracePeriodHours: 24 });
  expect(mockAuditService.log).toHaveBeenCalledWith(
    expect.objectContaining({
      tenantId,
      action: 'API_KEY_ROTATED',
      resourceType: 'api_key',
      resourceId: apiKeyId,
    }),
  );
});

it('should write audit log entry on successful revocation', async () => {
  await service.revokeApiKey(tenantId, apiKeyId);
  expect(mockAuditService.log).toHaveBeenCalledWith(
    expect.objectContaining({
      tenantId,
      action: 'API_KEY_REVOKED',
      resourceType: 'api_key',
      resourceId: apiKeyId,
    }),
  );
});
```

---

## FIX-BA-4 — Post-overdue reminders use product notification config (1 SP)

**Finding:** F-BA-S17-5
**File:** `apps/scheduler/src/jobs/payment-reminder.job.ts`
**Problem:** The pre-due reminder pass (line ~221) correctly reads `channel` from the product's per-entry notification config via `reminder.channel`. The post-overdue pass (line ~312) hardcodes `channel: 'sms'` for every overdue reminder, regardless of product notification config. Products configured for email-only or push-only notifications still get SMS overdue reminders, silently costing tenants per-SMS fees on channels they didn't choose.

### Current overdue code (line ~308–313):

```typescript
await this.notificationService.sendNotification(tenantId, {
  customerId: entry.contract.customer.id,
  contractId: entry.contractId,
  eventType: dedupeEventType,
  channel: 'sms',              // ← HARDCODED — must resolve from product config
  variables: { /* ... */ },
});
```

### Fix

**Step 1:** Add a `resolveOverdueReminderConfig(product, daysPastDue)` helper (in the same file or a shared utility):

```typescript
/**
 * Resolves notification channel for overdue reminders from product config.
 * Fallback chain: overdue entry channel → product defaultChannel → 'sms'.
 */
function resolveOverdueChannel(product: any, daysPastDue: number): string {
  const overdueSchedule =
    product.notificationConfig?.paymentReminders?.overdueSchedule;

  if (Array.isArray(overdueSchedule)) {
    // Find the matching overdue entry for this daysPastDue
    const entry = overdueSchedule.find((e: any) => e.days === daysPastDue);
    if (entry?.channel) {
      return entry.channel;
    }
  }

  // Fall back to product default channel, then SMS as absolute last resort
  return product.notificationConfig?.defaultChannel ?? 'sms';
}
```

**Step 2:** Replace the hardcoded channel in the overdue pass:

```typescript
await this.notificationService.sendNotification(tenantId, {
  customerId: entry.contract.customer.id,
  contractId: entry.contractId,
  eventType: dedupeEventType,
  channel: resolveOverdueChannel(product, daysPastDue),
  variables: { /* ... */ },
});
```

**Step 3:** Ensure the `product` object is available in the overdue pass scope with its `notificationConfig` loaded. If the overdue loop iterates over entries without the product relationship, add the product include to the query (match the pre-due pass query pattern).

### Tests

```typescript
describe('overdue reminder channel resolution', () => {
  it('uses product defaultChannel when no overdue-specific channel configured', async () => {
    const product = buildProduct({
      notificationConfig: { defaultChannel: 'email' },
    });
    // ... trigger overdue reminders ...
    expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ channel: 'email' }),
    );
  });

  it('uses overdue entry channel when configured per daysPastDue', async () => {
    const product = buildProduct({
      notificationConfig: {
        defaultChannel: 'sms',
        paymentReminders: {
          overdueSchedule: [
            { days: 1, channel: 'push' },
            { days: 3, channel: 'email' },
            { days: 7, channel: 'sms' },
          ],
        },
      },
    });
    // ... trigger 3-day overdue reminder ...
    expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ channel: 'email' }),
    );
  });

  it('falls back to sms when no notificationConfig exists', async () => {
    const product = buildProduct({ notificationConfig: null });
    // ... trigger overdue reminders ...
    expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ channel: 'sms' }),
    );
  });
});
```

---

## FIX-BA-5 — Floor early settlement total at zero (0.5 SP) [CARRY-FORWARD from Sprint 16]

**Finding:** F-BA-S16-3 (originally flagged Sprint 16, fix prompt provided in PM-RESPONSE-BA-SPRINT-16, never implemented)
**File:** `services/repayment-service/src/early-settlement/early-settlement.service.ts`
**Problem:** `totalSettlementAmount` is computed as `bankersRound(subtract(subtotal, interestRebate), 4)` with no floor guard. A 100% rebate on a contract where `interestRebate > subtotal` produces a negative settlement quote — an obligation to pay the customer, which makes no commercial sense.

### Current code (lines 149–152):

```typescript
const totalSettlementAmount = bankersRound(
  subtract(subtotal, interestRebate),
  4,
);
```

### Fix

`compare` is already imported from `@lons/common`. Change `const` to `let` and add a floor guard immediately after line 152:

```typescript
let totalSettlementAmount = bankersRound(
  subtract(subtotal, interestRebate),
  4,
);

// Floor at zero — a 100% rebate should never produce a negative obligation.
if (compare(totalSettlementAmount, '0') < 0) {
  totalSettlementAmount = '0.0000';
}
```

### Tests

Add to `early-settlement.service.spec.ts`:

```typescript
describe('settlement total floor', () => {
  it('floors totalSettlementAmount at zero when rebate exceeds subtotal', () => {
    // Setup: 100% interest rebate, large unearned interest exceeding principal
    const result = service.calculateEarlySettlement({
      contractId,
      tenantId,
      // ... contract with interestRebatePercent: 100
      // ... where unearnedInterest > remainingPrincipal
    });

    expect(result.totalSettlementAmount).toBe('0.0000');
    // Breakdown should still show the rebate line for transparency
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'interest_rebate' }),
      ]),
    );
  });

  it('does not floor when settlement total is positive', () => {
    // Setup: partial rebate, normal case
    const result = service.calculateEarlySettlement({
      contractId,
      tenantId,
      // ... contract with interestRebatePercent: 50
    });

    expect(compare(result.totalSettlementAmount, '0')).toBeGreaterThan(0);
  });
});
```

---

## FIX-BA-6 — Template lookup integration test (1 SP) [CARRY-FORWARD from Sprint 16]

**Finding:** F-BA-S16-4 (originally flagged Sprint 16, test spec provided in PM-RESPONSE-BA-SPRINT-16, never created)
**File:** Create `services/notification-service/src/__tests__/notification.service.integration.spec.ts`
**Problem:** The `split(':')[0]` mechanism at `notification.service.ts:28` strips the installment UUID discriminator from event types (e.g., `payment_reminder.3:entry-uuid` → `payment_reminder.3`) before template lookup. It works, but has zero test coverage. A future refactor of the template registry could silently break all per-installment reminders (both pre-due and overdue) without any test catching it.

### Create the test file

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from '../notification.service';
// ... import required dependencies, mocks, template registry ...

describe('NotificationService — Template lookup integration', () => {
  let service: NotificationService;
  // ... setup with mock adapter, real template registry ...

  const TENANT = 'test-tenant-id';
  const CUSTOMER = 'test-customer-id';
  const CONTRACT = 'test-contract-id';

  const baseVariables = {
    customerName: 'Jane',
    amount: '500.00',
    currency: 'GHS',
    dueDate: '2026-05-20',
    installmentNumber: '3',
  };

  describe('Template lookup with installment-scoped eventType', () => {
    it('resolves template via prefix when eventType contains :discriminator', async () => {
      const result = await service.sendNotification(TENANT, {
        customerId: CUSTOMER,
        contractId: CONTRACT,
        eventType: 'payment_reminder.3:some-installment-uuid',
        channel: 'sms',
        variables: baseVariables,
      });

      // Should resolve to 'payment_reminder.3' template, not return null
      expect(result).not.toBeNull();
      expect(result.body).toContain('Jane');
      expect(result.body).toContain('500.00');
    });

    it('still resolves plain eventType without discriminator', async () => {
      const result = await service.sendNotification(TENANT, {
        customerId: CUSTOMER,
        contractId: CONTRACT,
        eventType: 'payment_reminder.3',
        channel: 'sms',
        variables: baseVariables,
      });

      expect(result).not.toBeNull();
    });

    it('returns null for completely unknown eventType', async () => {
      const result = await service.sendNotification(TENANT, {
        customerId: CUSTOMER,
        contractId: CONTRACT,
        eventType: 'nonexistent_event_type:some-uuid',
        channel: 'sms',
        variables: baseVariables,
      });

      expect(result).toBeNull();
    });

    it('handles eventType with multiple colons (only splits on first)', async () => {
      const result = await service.sendNotification(TENANT, {
        customerId: CUSTOMER,
        contractId: CONTRACT,
        eventType: 'payment_reminder.3:uuid-with:colons',
        channel: 'sms',
        variables: baseVariables,
      });

      // split(':')[0] takes everything before the first colon
      expect(result).not.toBeNull();
    });
  });
});
```

This test suite confirms the `split(':')[0]` mechanism works end-to-end and catches any future refactor that breaks the template resolution contract.

---

## Constraints

1. **Decimal math everywhere.** No `Number()` on any value that touches a `DECIMAL` column or represents money. Use Prisma's native string-to-Decimal coercion. Refer to CLAUDE.md §Critical Development Rules → Money & Financial Calculations.

2. **Audit trail for credential lifecycle.** FR-SEC-002.3 mandates audit logging for all credential creation, rotation, and revocation. Do not log actual key values or hashes — only IDs and metadata.

3. **No PII in logs.** Mask customer identifiers per CLAUDE.md. Audit log `details` must not contain plaintext secrets.

4. **Test coverage.** Every fix must include tests that would have caught the original bug. The BA will verify test presence and correctness in the next review cycle.

5. **Backward compatibility.** FIX-BA-2 (null factor skip) must not change scoring results for the current default scorecard where all new factors have `weight: 0`. The weight-0 path must remain unchanged.

---

## Exit Criteria

| # | Criterion |
|---|-----------|
| 1 | `scoring.service.ts` — no `Number()` on `averageBalance`, `score`, `recommendedLimit`, or `confidence`. All four pass as strings to Prisma. |
| 2 | Precision roundtrip test passes for `recommendedLimit` near JS Number boundary. |
| 3 | `scorecard-engine.ts` — null factor with weight > 0 is skipped (not scored as 0). `_metadata.skippedFactors` populated. |
| 4 | Null factor with weight = 0 still contributes 0 (backward compatible). |
| 5 | `api-key-rotation.service.ts` — `AuditService` injected. `API_KEY_ROTATED` audit entry written after rotation. `API_KEY_REVOKED` audit entry written after revocation. No key values in audit details. |
| 6 | `payment-reminder.job.ts` — overdue pass resolves channel from product notification config. Fallback chain: overdue entry channel → product defaultChannel → `'sms'`. |
| 7 | Product with `defaultChannel: 'email'` sends overdue reminders via email, not SMS. |
| 8 | `early-settlement.service.ts` — `totalSettlementAmount` floored at `'0.0000'` when rebate exceeds subtotal. |
| 9 | Settlement breakdown still shows the rebate line even when total is floored. |
| 10 | `notification.service.integration.spec.ts` exists with ≥3 tests covering colon-discriminated eventType lookup. |
| 11 | All existing tests pass (1,265 baseline; 1 pre-existing screening failure acceptable). |
| 12 | `tsc --noEmit` clean across all packages. |

---

## Commit Convention

Single commit with per-fix attribution in the body:

```
fix(sprint-17-ba-fixes): BA-review fix cycle — 7 items (~5 SP)

FIX-BA-1: Remove Number() on scoring input/persistence — scoring.service.ts
FIX-BA-2: Skip null factors with non-zero weight — scorecard-engine.ts
FIX-BA-3: Audit log for API key rotation + revocation — api-key-rotation.service.ts
FIX-BA-4: Overdue reminders use product notification config — payment-reminder.job.ts
FIX-BA-5: Floor early settlement total at zero — early-settlement.service.ts [S16 carry-forward]
FIX-BA-6: Template lookup integration test — notification.service [S16 carry-forward]
```

---

## Delivery

Produce `Docs/DELIVERY-NOTES-SPRINT-17-BA-FIXES-2026-05-17.md` with:
- Per-fix status table
- Files touched (created / modified)
- Test results (total pass/fail, new tests added)
- Typecheck / lint status
- Any behavioural changes worth highlighting

---

*References: PM-RESPONSE-BA-SPRINT-17-2026-05-17.md, BA-SPRINT-17-FINDINGS-FOR-PM-2026-05-17.md, PM-SPRINT-17-REVIEW-2026-05-17.md, DEV-PROMPT-SPRINT-17-FIXES.md*
