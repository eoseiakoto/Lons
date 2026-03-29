# Sprint 7 — Fix Prompt for Claude Code

You are working on the Lōns platform, a B2B2C fintech lending platform built with NestJS, Prisma, PostgreSQL, Redis, Next.js, and Turborepo.

**Read `CLAUDE.md` at the repo root before starting any work.** It contains critical rules on money handling, multi-tenancy, naming conventions, and testing standards.

---

## Context

Sprint 7 implementation is complete but a review found **4 gaps** that must be fixed. Each gap is described below with the exact files to modify, what's wrong, and the expected result.

**IMPORTANT**: Do NOT refactor or change anything beyond what is specified here. The rest of Sprint 7 passed review.

---

## Gap 1 — CRITICAL: NotificationService Bypasses Resolver

### Problem

`services/notification-service/src/notification.service.ts` directly injects `ConsoleNotificationAdapter` and calls it on every notification send. This bypasses the per-tenant `NotificationAdapterResolver` that was built in DEV-04, meaning all tenants get the console adapter regardless of their `NotificationProviderConfig` setting.

### Current Code (broken)

```typescript
// services/notification-service/src/notification.service.ts
import { ConsoleNotificationAdapter } from './adapters/console-notification.adapter';

@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private adapter: ConsoleNotificationAdapter,  // <-- PROBLEM: hardcoded to console
  ) {}

  async sendNotification(tenantId: string, params: { ... }) {
    // ...
    return this.adapter.send(tenantId, { ... });  // <-- always goes to console
  }
}
```

### Required Fix

Replace the direct `ConsoleNotificationAdapter` injection with `NotificationAdapterResolver` and call `resolver.resolve(tenantId, channel)` to get the correct adapter per tenant.

### File to modify

`services/notification-service/src/notification.service.ts`

### Expected result

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { NotificationAdapterResolver } from './adapters/notification-adapter-resolver.service';
import { renderTemplate, NOTIFICATION_TEMPLATES } from './templates/template-renderer';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private resolver: NotificationAdapterResolver,
  ) {}

  async sendNotification(tenantId: string, params: {
    customerId: string;
    contractId?: string;
    eventType: string;
    channel?: string;
    variables: Record<string, string>;
  }) {
    const channel = params.channel || 'sms';
    const templates = NOTIFICATION_TEMPLATES[params.eventType];
    if (!templates || !templates[channel]) return null;

    const content = renderTemplate(templates[channel], params.variables);

    const customer = await this.prisma.customer.findFirst({
      where: { id: params.customerId, tenantId },
      select: { phonePrimary: true, email: true },
    });

    const recipient = channel === 'email' ? (customer?.email || '') : (customer?.phonePrimary || '');

    // Resolve the correct adapter for this tenant + channel
    const channelEnum = channel.toUpperCase() as 'SMS' | 'EMAIL' | 'PUSH';
    const adapter = await this.resolver.resolve(tenantId, channelEnum);

    return adapter.send(tenantId, {
      customerId: params.customerId,
      contractId: params.contractId,
      eventType: params.eventType,
      channel,
      recipient,
      content,
    });
  }
}
```

### Verification

1. The module file (`notification-service.module.ts`) already registers `NotificationAdapterResolver` as a provider — no module changes needed.
2. After the fix, sending a notification for a tenant with `NotificationProviderConfig.providerType = 'RECORDING_MOCK'` must route to `RecordingNotificationAdapter`, not `ConsoleNotificationAdapter`.
3. Tenants without any config must still fall back to the factory (which defaults to console). This is already handled by the resolver's fallback logic.

---

## Gap 2 — Unit Tests: WalletAdapterResolver

### Problem

`services/integration-service/src/adapters/wallet-adapter-resolver.service.ts` has zero unit tests. Only E2E coverage exists.

### File to create

`services/integration-service/src/adapters/wallet-adapter-resolver.service.spec.ts`

### What to test

The resolver at `services/integration-service/src/adapters/wallet-adapter-resolver.service.ts` has these behaviors to cover:

1. **Resolves MOCK provider** — When `WalletProviderConfig` has `providerType: 'MOCK'`, returns a `MockWalletAdapter` instance.
2. **Resolves MTN_MOMO provider** — Returns the injected `MtnMomoAdapter`.
3. **Resolves MPESA provider** — Returns the injected `MpesaAdapter`.
4. **Resolves GENERIC provider** — Returns a `GenericWalletAdapter` instance.
5. **Production guard blocks MOCK** — When `ALLOW_MOCK_ADAPTERS=false` and config is MOCK, throws `ForbiddenException`.
6. **Throws NotFoundException** — When no active default config exists for the tenant.
7. **Redis cache hit** — When Redis has a cached config, does NOT query Prisma.
8. **Redis cache miss → DB query → caches result** — When Redis has no cache, queries Prisma, then stores result in Redis with 60s TTL.
9. **Redis unavailable gracefully falls back to DB** — When Redis throws, still queries Prisma and returns correct adapter.
10. **Cache invalidation** — `invalidateCache(tenantId)` calls `redis.del()` with the correct key.
11. **Unknown provider type throws NotFoundException**.

### Mocking strategy

- Mock `PrismaService` with `{ walletProviderConfig: { findFirst: jest.fn() } }`.
- Mock `Redis` — use `jest.mock('ioredis')` to return a mock with `get`, `set`, `del` methods.
- Mock `ConfigService` with `{ get: jest.fn() }`.
- Mock `MtnMomoAdapter` and `MpesaAdapter` as simple objects.
- Use `process.env.ALLOW_MOCK_ADAPTERS` for the production guard test (set and restore in beforeEach/afterEach).

### Test structure

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WalletAdapterResolver } from './wallet-adapter-resolver.service';
import { PrismaService } from '@lons/database';
import { ConfigService } from '@nestjs/config';
import { MtnMomoAdapter } from './mtn-momo.adapter';
import { MpesaAdapter } from './mpesa.adapter';
import { MockWalletAdapter } from './mock/mock-wallet.adapter';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }));
});

describe('WalletAdapterResolver', () => {
  let resolver: WalletAdapterResolver;
  let prisma: { walletProviderConfig: { findFirst: jest.Mock } };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mtnAdapter: MtnMomoAdapter;
  let mpesaAdapter: MpesaAdapter;

  const TENANT_ID = 'tenant-001';
  const mockConfig = {
    id: 'config-001',
    providerType: 'MOCK',
    environmentMode: 'SANDBOX',
    configJson: { initial_balance: 100000 },
    credentialsSecretRef: null,
    apiBaseUrl: null,
  };

  beforeEach(async () => {
    // ... set up TestingModule with mocked providers
    // ... get references to redis mock from the ioredis constructor
  });

  afterEach(() => {
    delete process.env.ALLOW_MOCK_ADAPTERS;
  });

  // Write tests for each of the 11 scenarios listed above
});
```

---

## Gap 3 — Unit Tests: NotificationAdapterResolver and RecordingNotificationAdapter

### Problem

`services/notification-service/src/adapters/` has zero `*.spec.ts` files. Both the resolver and the recording adapter need unit tests.

### Files to create

1. `services/notification-service/src/adapters/notification-adapter-resolver.service.spec.ts`
2. `services/notification-service/src/adapters/recording-notification.adapter.spec.ts`

### NotificationAdapterResolver tests

The resolver at `services/notification-service/src/adapters/notification-adapter-resolver.service.ts` has these behaviors:

1. **Returns consoleAdapter for providerType CONSOLE**.
2. **Returns recordingAdapter for providerType RECORDING_MOCK**.
3. **Returns smsAdapter for providerType AFRICAS_TALKING**.
4. **Returns emailAdapter for providerType SMTP**.
5. **Throws NotImplementedException for TWILIO**.
6. **Throws NotImplementedException for FCM**.
7. **Falls back to factory when no config exists for tenant** — calls `factory.getAdapter(channel.toLowerCase())`.
8. **Redis cache hit** — Cached provider type returned without DB query.
9. **Redis cache miss** — Queries Prisma `notificationProviderConfig.findFirst`, caches result.
10. **Redis unavailable** — Falls back to DB gracefully.
11. **Cache invalidation** — `invalidateCache(tenantId)` deletes the correct Redis key.

Mocking strategy:

- Mock `PrismaService` with `{ notificationProviderConfig: { findFirst: jest.fn() } }`.
- Mock `Redis` via `jest.mock('ioredis')`.
- Mock all 4 adapter classes and the factory as simple objects.

### RecordingNotificationAdapter tests

The adapter at `services/notification-service/src/adapters/recording-notification.adapter.ts`:

1. **Creates a record in notificationMockLog** — Verify Prisma `notificationMockLog.create` is called with correct data shape (`tenantId`, `channel`, `recipient`, `templateId`, `renderedContent`, `status: 'SENT'`, `correlationId`).
2. **Returns success with messageId** — Returns `{ success: true, messageId: <created record id> }`.
3. **Logs the send** — Verify `Logger.log` is called with expected format.

Mocking strategy:

- Mock `PrismaService` with `{ notificationMockLog: { create: jest.fn() } }`.

---

## Gap 4 — NPS Widget Not Integrated Into Any Page

### Problem

`apps/admin-portal/src/components/survey/nps-widget.tsx` exists and works as a standalone component, but it is not imported or rendered on any page. It should appear on the SP Admin dashboard for logged-in SP admin users, and platform admins should see NPS survey results on the feedback management page.

### Part A: Add NPS Widget to SP Admin Dashboard

#### File to modify

`apps/admin-portal/src/app/(portal)/dashboard/page.tsx`

#### What to do

1. Import `NpsWidget` from `@/components/survey/nps-widget`.
2. Import `useAuth` from `@/lib/auth-context` to get `user.id` and `user.tenantId`.
3. Render `<NpsWidget tenantId={user.tenantId} userId={user.id} />` at the bottom of the dashboard page, outside the metrics grid.
4. Only render it when `user` is available (which it will be since the parent layout already gates on auth).

#### Expected result

```tsx
'use client';

import { gql, useQuery } from '@apollo/client';
import { MetricCard } from '@/components/ui/metric-card';
import { formatMoney } from '@/lib/utils';
import { NpsWidget } from '@/components/survey/nps-widget';
import { useAuth } from '@/lib/auth-context';

// ... existing PORTFOLIO_METRICS query stays the same ...

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error } = useQuery(PORTFOLIO_METRICS);

  // ... existing loading and error states stay the same ...

  const metrics = data?.portfolioMetrics;
  const collections = data?.collectionsMetrics;

  return (
    <div>
      {/* ... all existing dashboard content stays exactly the same ... */}

      {/* NPS Survey Widget */}
      {user && (
        <NpsWidget tenantId={user.tenantId} userId={user.id} />
      )}
    </div>
  );
}
```

### Part B: Add NPS Summary to Platform Feedback Page

#### File to modify

`apps/admin-portal/src/app/(portal)/platform/feedback/page.tsx`

#### What to do

1. Add a GraphQL query to fetch NPS survey response aggregates (average score, response count, score distribution). Use this query:

```graphql
query NpsSummary {
  surveyResponses(first: 1000) {
    edges {
      node {
        id
        score
        comment
        createdAt
      }
    }
    totalCount
  }
}
```

2. Add an NPS Summary section at the top of the feedback page (above the filters), showing:
   - **Total NPS responses** (count)
   - **Average NPS score** (calculated from responses)
   - **NPS Score** (% promoters − % detractors, where 0–6 = detractors, 7–8 = passives, 9–10 = promoters)
   - **Score distribution bar** (visual breakdown of detractors/passives/promoters)

3. The section should use the existing glass card styling to match the rest of the page.

#### Expected structure

Add above the `{/* Filters */}` comment in the returned JSX:

```tsx
{/* NPS Summary */}
{npsData && (
  <div className="glass p-6">
    <h2 className="text-lg font-semibold text-white mb-4">NPS Summary</h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div>
        <span className="text-white/40 text-sm block mb-1">Total Responses</span>
        <span className="text-2xl font-bold text-white">{totalResponses}</span>
      </div>
      <div>
        <span className="text-white/40 text-sm block mb-1">Average Score</span>
        <span className="text-2xl font-bold text-white">{avgScore.toFixed(1)}</span>
        <span className="text-white/40 text-sm"> / 10</span>
      </div>
      <div>
        <span className="text-white/40 text-sm block mb-1">NPS Score</span>
        <span className={`text-2xl font-bold ${npsScore >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {npsScore > 0 ? '+' : ''}{npsScore}
        </span>
      </div>
    </div>
    {/* Distribution bar: red (detractors) | yellow (passives) | green (promoters) */}
    <div className="flex h-3 rounded-full overflow-hidden">
      <div className="bg-red-500" style={{ width: `${detractorPct}%` }} />
      <div className="bg-yellow-500" style={{ width: `${passivePct}%` }} />
      <div className="bg-emerald-500" style={{ width: `${promoterPct}%` }} />
    </div>
    <div className="flex justify-between text-xs text-white/40 mt-1">
      <span>Detractors ({detractorPct.toFixed(0)}%)</span>
      <span>Passives ({passivePct.toFixed(0)}%)</span>
      <span>Promoters ({promoterPct.toFixed(0)}%)</span>
    </div>
  </div>
)}
```

Compute the NPS values from the query results:
- `detractors` = responses with score 0–6
- `passives` = responses with score 7–8
- `promoters` = responses with score 9–10
- `npsScore` = Math.round((promoters / total - detractors / total) * 100)
- `avgScore` = sum of all scores / total count

Use `useMemo` to compute these from the query data.

---

## Execution Order

1. **Gap 1 first** (critical wiring fix — 1 file change)
2. **Gap 4 Part A** (dashboard NPS widget — 1 file change)
3. **Gap 4 Part B** (feedback page NPS summary — 1 file change)
4. **Gap 2** (WalletAdapterResolver tests — 1 new file)
5. **Gap 3** (NotificationAdapterResolver + RecordingAdapter tests — 2 new files)

## Verification Checklist

After all changes:

- [ ] `pnpm --filter notification-service build` succeeds (Gap 1)
- [ ] `pnpm --filter admin-portal build` succeeds (Gap 4)
- [ ] `pnpm --filter integration-service test` runs and all new tests pass (Gap 2)
- [ ] `pnpm --filter notification-service test` runs and all new tests pass (Gap 3)
- [ ] In the notification service, calling `sendNotification()` for a tenant with `RECORDING_MOCK` config routes to `RecordingNotificationAdapter`
- [ ] The SP Admin dashboard page renders the NPS widget at the bottom
- [ ] The platform feedback page shows an NPS Summary section above the filters
