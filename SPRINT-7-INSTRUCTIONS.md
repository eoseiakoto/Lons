# Sprint 7 — Claude Code Instructions

> **Sprint**: 7 of 7 (Final)
> **Phase**: 6 — Hardening & Production Readiness
> **Total scope**: ~65 story points (13 tasks)
> **Capacity contingency**: If M2/M3 hit friction, drop S3 first (5pts), then S5 (3pts)
> **Reference**: Read `SPRINT-7-BRIEF.md` for full rationale and context

---

## Execution Order

Execute tasks in this order. Tasks marked ⚡ can run in parallel where noted.

```
M7 → M1 → M5 ⚡ M6 ⚡ M8 → S5 → M2 → M3 → S2 ⚡ S3 → S4 → S1 → M4
```

---

## Task M7: Password Complexity Wiring (2 pts)

**File**: `services/entity-service/src/auth/auth.service.ts`

`PasswordService.validateStrength()` exists and enforces: 12+ chars, uppercase, lowercase, digit, special char. It throws `ValidationError` on failure. But it's never called in any auth flow.

### Changes

1. In `loginTenantUser()` — **no change needed** (login doesn't set passwords)

2. Find the user registration/creation flow. If `createUser()` or `register()` exists in AuthService or a UserService, add before the `passwordService.hash()` call:

```typescript
this.passwordService.validateStrength(password);
```

3. Find the password change/reset flow. If `changePassword()` or `resetPassword()` exists, add the same call before hashing the new password.

4. If no registration or password-change endpoints exist yet (only login flows exist), create them:

**In `auth.service.ts`**, add:
```typescript
async changePassword(
  tenantId: string,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await this.prisma.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null },
  });
  if (!user) throw new NotFoundException('User not found');

  const valid = await this.passwordService.verify(user.passwordHash, currentPassword);
  if (!valid) throw new UnauthorizedException('Current password is incorrect');

  this.passwordService.validateStrength(newPassword);
  const newHash = await this.passwordService.hash(newPassword);
  await this.prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, updatedAt: new Date() },
  });
}
```

5. Wire the mutation in the GraphQL auth resolver:
```typescript
@Mutation(() => Boolean)
@AuditAction(AuditActionType.UPDATE, AuditResourceType.USER)
async changePassword(
  @CurrentUser() user: IAuthUser,
  @Args('currentPassword') currentPassword: string,
  @Args('newPassword') newPassword: string,
): Promise<boolean> {
  await this.authService.changePassword(user.tenantId, user.id, currentPassword, newPassword);
  return true;
}
```

6. **Tests**: Unit test `changePassword()` — verify weak passwords are rejected, current password must match, hash is updated.

---

## Task M1: Dockerfiles for All Services (3 pts)

### File: `Dockerfile` (root)

The existing Dockerfile has stages for `graphql-server` (port 3000) and `rest-server` (port 3001). Add these additional final stages:

```dockerfile
# ── Scheduler ──
FROM node:20-alpine AS scheduler
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/scheduler/dist ./apps/scheduler/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./
USER nestjs
EXPOSE 3002
CMD ["node", "apps/scheduler/dist/main.js"]

# ── Notification Worker ──
FROM node:20-alpine AS notification-worker
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/services/notification-service/dist ./services/notification-service/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./
USER nestjs
EXPOSE 3003
CMD ["node", "services/notification-service/dist/main.js"]
```

### File: `services/scoring-service/Dockerfile`

Fix the base image (currently `python:3.14-slim`, should be `python:3.11-slim` per tech stack). Add health check and non-root user:

```dockerfile
FROM python:3.11-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### New file: `docker-compose.prod.yml`

Create a production-like compose file that runs all services:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: lons
      POSTGRES_USER: lons
      POSTGRES_PASSWORD: ${DB_PASSWORD:-lons_prod_password}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./infrastructure/docker/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lons"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  graphql-server:
    build:
      context: .
      target: graphql-server
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  rest-server:
    build:
      context: .
      target: rest-server
    ports:
      - "3001:3001"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  scheduler:
    build:
      context: .
      target: scheduler
    ports:
      - "3002:3002"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  notification-worker:
    build:
      context: .
      target: notification-worker
    ports:
      - "3003:3003"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  scoring-service:
    build:
      context: ./services/scoring-service
    ports:
      - "8000:8000"
    env_file: .env
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  pgdata:
  redisdata:
```

---

## Task M5: Redis-Backed Rate Limiting + Retry-After Header (5 pts)

### Current state
- `ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }])` in both app modules (in-memory storage)
- `TenantThrottlerGuard` from `@lons/common` applied as global guard
- `RateLimitHeadersInterceptor` from `@lons/common` adds `X-RateLimit-*` headers

### Changes needed

#### 1. Install Redis throttler storage

```bash
pnpm add @nestjs/throttler-storage-redis --filter graphql-server --filter rest-server
```

If `@nestjs/throttler-storage-redis` doesn't exist or is incompatible, use `nestjs-throttler-storage-redis` or implement a custom `ThrottlerStorage`:

```typescript
// packages/common/src/rate-limiting/redis-throttler-storage.ts
import { ThrottlerStorage } from '@nestjs/throttler';
import { Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleInit {
  private redis: Redis;

  async onModuleInit() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const totalHits = await this.redis.incr(key);
    if (totalHits === 1) {
      await this.redis.pexpire(key, ttl);
    }
    const ttlRemaining = await this.redis.pttl(key);
    return {
      totalHits,
      timeToExpire: ttlRemaining > 0 ? ttlRemaining : ttl,
      isBlocked: totalHits > limit,
      timeToBlockExpire: 0,
    };
  }
}
```

Check the exact `ThrottlerStorage` interface from the installed `@nestjs/throttler` version and implement accordingly. The interface may vary between versions.

#### 2. Wire into AppModule

**File**: `apps/graphql-server/src/app.module.ts`

Replace:
```typescript
ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }])
```

With:
```typescript
ThrottlerModule.forRootAsync({
  useFactory: () => ({
    throttlers: [{ ttl: 60000, limit: 200 }],
    storage: new RedisThrottlerStorage(),
  }),
})
```

Do the same for `apps/rest-server/src/app.module.ts`.

#### 3. Add Retry-After header

**File**: `packages/common/src/rate-limiting/tenant-throttler.guard.ts` (or wherever TenantThrottlerGuard is defined)

Override the `throwThrottlingException` method (or the method that handles 429 responses) to include the `Retry-After` header:

```typescript
protected throwThrottlingException(context: ExecutionContext, throttlerLimitDetail: ThrottlerLimitDetail): void {
  const response = this.getResponse(context);
  const retryAfterSeconds = Math.ceil(throttlerLimitDetail.timeToExpire / 1000);
  response.header('Retry-After', String(retryAfterSeconds));
  throw new ThrottlerException(`Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`);
}
```

Adapt to the actual method signature — check the `@nestjs/throttler` source for the exact override point in the version used.

#### 4. Tenant-specific rate limits

In `TenantThrottlerGuard`, look up the tenant's rate configuration. If none exists, use the default (200/60s). The tenant's service provider settings should include a `rateLimitTier` field:

```typescript
// In the guard's canActivate or handleRequest:
const tenant = await this.getTenantConfig(tenantId);
const limit = tenant?.rateLimitConfig?.requestsPerMinute ?? 200;
```

Define three tiers as constants:
```typescript
export const RATE_LIMIT_TIERS = {
  standard: { ttl: 60000, limit: 100 },
  premium: { ttl: 60000, limit: 500 },
  enterprise: { ttl: 60000, limit: 2000 },
} as const;
```

#### 5. Tests

- Unit test: Verify `RedisThrottlerStorage.increment()` calls Redis INCR + PEXPIRE
- Integration test: Verify 429 response includes `Retry-After` header with correct value
- Unit test: Verify tenant-specific limits are applied (mock tenant config)

---

## Task M6: VaultKeyProvider Implementation (3 pts)

### Current state
- `packages/common/src/encryption/vault-key.provider.ts` exists as a **stub** — logs a warning and falls back to `ENCRYPTION_KEY` env var
- `IKeyProvider` interface defined with `getKey()`, `rotateKey()`, `getCurrentKeyId()`
- Factory `createKeyProvider()` checks `KEY_PROVIDER` env var, returns `VaultKeyProvider` or `EnvKeyProvider`

### Changes needed

Replace the stub in `vault-key.provider.ts` with a real implementation:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IKeyProvider } from './key-provider.interface';

@Injectable()
export class VaultKeyProvider implements IKeyProvider, OnModuleInit {
  private readonly logger = new Logger(VaultKeyProvider.name);
  private cachedKey: Buffer | null = null;
  private cachedKeyId: string | null = null;
  private cacheExpiresAt: number = 0;
  private readonly cacheTtlMs: number;

  constructor() {
    this.cacheTtlMs = parseInt(process.env.VAULT_KEY_CACHE_TTL_MS || '3600000', 10); // 1 hour default
  }

  async onModuleInit(): Promise<void> {
    await this.refreshKey();
    this.logger.log('VaultKeyProvider initialized successfully');
  }

  async getKey(keyId?: string): Promise<Buffer> {
    if (this.cachedKey && Date.now() < this.cacheExpiresAt && (!keyId || keyId === this.cachedKeyId)) {
      return this.cachedKey;
    }
    return this.refreshKey();
  }

  async getCurrentKeyId(): Promise<string> {
    if (this.cachedKeyId && Date.now() < this.cacheExpiresAt) {
      return this.cachedKeyId;
    }
    await this.refreshKey();
    return this.cachedKeyId!;
  }

  async rotateKey(): Promise<void> {
    this.cachedKey = null;
    this.cachedKeyId = null;
    this.cacheExpiresAt = 0;
    await this.refreshKey();
    this.logger.log('Encryption key rotated');
  }

  private async refreshKey(): Promise<Buffer> {
    const vaultAddr = process.env.VAULT_ADDR;
    const vaultToken = process.env.VAULT_TOKEN;
    const vaultPath = process.env.VAULT_SECRET_PATH || 'secret/data/lons/encryption';

    if (!vaultAddr || !vaultToken) {
      this.logger.warn('VAULT_ADDR or VAULT_TOKEN not set — falling back to ENCRYPTION_KEY env var');
      return this.fallbackToEnvKey();
    }

    try {
      const url = `${vaultAddr}/v1/${vaultPath}`;
      const response = await fetch(url, {
        headers: {
          'X-Vault-Token': vaultToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Vault responded with ${response.status}: ${response.statusText}`);
      }

      const body = await response.json();
      const keyBase64 = body.data?.data?.key;
      const keyId = body.data?.data?.key_id || body.data?.metadata?.version?.toString() || 'vault-1';

      if (!keyBase64) {
        throw new Error('No "key" field found in Vault secret');
      }

      this.cachedKey = Buffer.from(keyBase64, 'base64');
      this.cachedKeyId = keyId;
      this.cacheExpiresAt = Date.now() + this.cacheTtlMs;

      if (this.cachedKey.length !== 32) {
        throw new Error(`Expected 32-byte key, got ${this.cachedKey.length} bytes`);
      }

      return this.cachedKey;
    } catch (error) {
      this.logger.error(`Failed to fetch key from Vault: ${error.message}`);
      this.logger.warn('Falling back to ENCRYPTION_KEY env var');
      return this.fallbackToEnvKey();
    }
  }

  private fallbackToEnvKey(): Buffer {
    const envKey = process.env.ENCRYPTION_KEY;
    if (!envKey) {
      throw new Error('Neither Vault nor ENCRYPTION_KEY env var is available');
    }
    this.cachedKey = Buffer.from(envKey, 'base64');
    this.cachedKeyId = 'env-default';
    this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
    return this.cachedKey;
  }
}
```

### Environment variables to document in `.env.example`:

```bash
# Key Management
KEY_PROVIDER=env                  # 'env' or 'vault'
VAULT_ADDR=                       # e.g., http://vault:8200
VAULT_TOKEN=                      # Vault access token
VAULT_SECRET_PATH=secret/data/lons/encryption
VAULT_KEY_CACHE_TTL_MS=3600000    # 1 hour
```

### Tests

- Unit test: Mock `fetch` to return a valid Vault response → verify key is cached
- Unit test: Vault unreachable → verify fallback to env var
- Unit test: Cache expiry → verify re-fetch from Vault
- Unit test: Invalid key length → verify error thrown

---

## Task M8: BullMQ Persistent Webhook Queue (3 pts)

### Current state
- `WebhookDeliveryProcessor` uses `@Interval(30000)` to poll for retries
- `ScheduleModule.forRoot()` imported in `notification-service.module.ts`

### Changes needed

#### 1. Install BullMQ

```bash
pnpm add @nestjs/bullmq bullmq --filter notification-service
```

#### 2. Register the queue

**File**: `services/notification-service/src/notification-service.module.ts`

Add to imports:
```typescript
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullModule.registerQueue({ name: 'webhook-delivery' }),
    // ... existing imports
  ],
})
```

#### 3. Create the BullMQ consumer

**New file**: `services/notification-service/src/webhooks/webhook-delivery.consumer.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Processor('webhook-delivery')
export class WebhookDeliveryConsumer extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryConsumer.name);

  constructor(private readonly deliveryService: WebhookDeliveryService) {
    super();
  }

  async process(job: Job<{ deliveryLogId: string }>): Promise<void> {
    this.logger.log(`Processing webhook retry job ${job.id} for delivery ${job.data.deliveryLogId}`);
    await this.deliveryService.attemptDelivery(job.data.deliveryLogId);
  }
}
```

#### 4. Modify the delivery service to enqueue retries

**File**: `services/notification-service/src/webhooks/webhook-delivery.service.ts`

Inject the queue and replace the "schedule next retry" logic. When a delivery fails and retries remain, instead of just updating `nextRetryAt` in the database, also add a delayed job:

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

constructor(
  // ... existing deps
  @InjectQueue('webhook-delivery') private readonly webhookQueue: Queue,
) {}

// In the failure handling path (where retries remain):
const backoffMs = this.calculateBackoff(retryCount); // exponential: 2^retryCount * 1000, max 3600000
await this.webhookQueue.add(
  'retry',
  { deliveryLogId: log.id },
  { delay: backoffMs, attempts: 1, removeOnComplete: true, removeOnFail: 100 },
);
```

#### 5. Remove @Interval polling

**File**: `services/notification-service/src/webhooks/webhook-delivery.processor.ts`

Remove the `@Interval(30000)` decorator from `processRetries()`. Keep the class but repurpose it or remove it — the `WebhookDeliveryConsumer` now handles retries. If `processRetries()` is the only method, the class can be removed entirely.

**Keep a fallback sweep** (optional but recommended): Change the `@Interval` to run every 5 minutes instead of 30 seconds, as a fallback for any jobs that might have been missed. This catches edge cases where a job was added to the DB but not to BullMQ (e.g., during a deployment).

#### 6. Register consumer in module

Add `WebhookDeliveryConsumer` to providers in `notification-service.module.ts`.

#### 7. Tests

- Unit test: Failed delivery adds a delayed job to the queue
- Unit test: Consumer calls `attemptDelivery()` with correct deliveryLogId
- Integration test: Kill and restart service → verify pending retries resume

---

## Task S5: Redis PubSub for GraphQL Subscriptions (3 pts)

### Current state
- `pubsub.provider.ts` uses `new PubSub()` from `graphql-subscriptions` (in-memory)
- Comment in file already notes Redis needed for production

### Changes needed

#### 1. Install

```bash
pnpm add graphql-redis-subscriptions ioredis --filter graphql-server
```

#### 2. Replace PubSub provider

**File**: `apps/graphql-server/src/subscriptions/pubsub.provider.ts`

```typescript
import { Provider } from '@nestjs/common';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

export const PUB_SUB = 'PUB_SUB';

export const PubSubProvider: Provider = {
  provide: PUB_SUB,
  useFactory: () => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    if (process.env.NODE_ENV === 'test') {
      // Use in-memory PubSub for tests
      const { PubSub } = require('graphql-subscriptions');
      return new PubSub();
    }

    return new RedisPubSub({
      publisher: new Redis(redisUrl),
      subscriber: new Redis(redisUrl),
    });
  },
};
```

#### 3. Verify all subscription resolvers use `@Inject('PUB_SUB')` — no changes needed if they already do.

#### 4. Tests

- Verify subscriptions still work in test environment (in-memory fallback)
- Integration test: Two GraphQL server instances can share subscription events via Redis

---

## Task M2: Kubernetes Helm Charts (8 pts)

### New directory: `infrastructure/helm/lons/`

Create a standard Helm chart structure. This is a large task — here is the full specification.

#### `Chart.yaml`
```yaml
apiVersion: v2
name: lons
description: Lōns B2B2C Fintech Lending Platform
type: application
version: 0.1.0
appVersion: "1.0.0"
```

#### `values.yaml` (defaults)

```yaml
global:
  imageRegistry: ghcr.io
  imagePullPolicy: IfNotPresent
  environment: staging

graphqlServer:
  replicaCount: 2
  image:
    repository: ghcr.io/lons/graphql-server
    tag: latest
  port: 3000
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilization: 70

restServer:
  replicaCount: 2
  image:
    repository: ghcr.io/lons/rest-server
    tag: latest
  port: 3001
  resources:
    requests:
      cpu: 250m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilization: 70

scheduler:
  replicaCount: 1
  image:
    repository: ghcr.io/lons/scheduler
    tag: latest
  port: 3002
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

notificationWorker:
  replicaCount: 1
  image:
    repository: ghcr.io/lons/notification-worker
    tag: latest
  port: 3003
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

scoringService:
  replicaCount: 2
  image:
    repository: ghcr.io/lons/scoring-service
    tag: latest
  port: 8000
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 2Gi
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilization: 70

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: api.lons.io
      paths:
        - path: /graphql
          service: graphql-server
        - path: /v1
          service: rest-server
  tls:
    - secretName: lons-tls
      hosts:
        - api.lons.io

postgresql:
  external: true
  host: ""
  port: 5432
  database: lons
  existingSecret: lons-db-credentials

redis:
  external: true
  host: ""
  port: 6379
  existingSecret: lons-redis-credentials

metrics:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s
```

#### Templates to create

For **each service** (graphql-server, rest-server, scheduler, notification-worker, scoring-service), create under `templates/<service>/`:

**`deployment.yaml`**:
- Standard Kubernetes Deployment
- Labels: `app.kubernetes.io/name`, `app.kubernetes.io/instance`, `app.kubernetes.io/component`
- Container with image from values, resource requests/limits from values
- `envFrom` referencing ConfigMap and Secret
- Liveness probe: `httpGet /health` port, initialDelaySeconds: 30, periodSeconds: 10
- Readiness probe: `httpGet /health` port, initialDelaySeconds: 5, periodSeconds: 5
- Pod disruption budget: `minAvailable: 1`

**`service.yaml`**:
- ClusterIP service exposing the service port

**`hpa.yaml`** (only for services with `autoscaling.enabled: true`):
- HorizontalPodAutoscaler targeting the deployment
- Min/max replicas and CPU target from values

#### Shared templates

**`templates/configmap.yaml`**:
- Non-secret environment variables: LOG_LEVEL, NODE_ENV, ENABLE_TRACING, service URLs (internal K8s DNS names)

**`templates/secrets.yaml`**:
- Placeholder referencing ExternalSecrets or sealed-secrets
- Keys: DATABASE_URL, REDIS_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, ENCRYPTION_KEY, VAULT_TOKEN

**`templates/ingress.yaml`**:
- Ingress resource from values, routing /graphql → graphql-server, /v1 → rest-server
- TLS from cert-manager

**`templates/networkpolicy.yaml`**:
- Default deny all ingress
- Allow ingress to graphql-server and rest-server from ingress controller
- Allow inter-service communication only on required paths:
  - graphql-server → scoring-service (port 8000)
  - scheduler → postgres, redis
  - notification-worker → postgres, redis

**`templates/servicemonitor.yaml`** (if `metrics.enabled`):
- ServiceMonitor for Prometheus Operator, scraping `/metrics` on each service

**`templates/_helpers.tpl`**:
- Standard helper functions: fullname, labels, selectorLabels, chart name

#### `values-staging.yaml` and `values-production.yaml`

Staging: lower replicas, debug log level, staging domain
Production: higher replicas, info log level, production domain, stricter resource limits

#### Validation

Run `helm template lons infrastructure/helm/lons/` — must render without errors.
Run `helm lint infrastructure/helm/lons/` — must pass.

---

## Task M3: CI/CD Pipeline — Deployment Automation (8 pts)

### File to modify: `.github/workflows/ci.yml`

1. **Fix lint step**: Remove `|| true` so lint failures break the build
2. **Add Docker build + push** after the build step:

```yaml
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push GraphQL Server
        uses: docker/build-push-action@v5
        with:
          context: .
          target: graphql-server
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: |
            ghcr.io/${{ github.repository }}/graphql-server:${{ github.sha }}
            ghcr.io/${{ github.repository }}/graphql-server:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Repeat for rest-server, scheduler, notification-worker

      - name: Build and push Scoring Service
        uses: docker/build-push-action@v5
        with:
          context: ./services/scoring-service
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: |
            ghcr.io/${{ github.repository }}/scoring-service:${{ github.sha }}
            ghcr.io/${{ github.repository }}/scoring-service:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

3. **Add Trivy container scan** step after Docker push:

```yaml
      - name: Scan images with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}/graphql-server:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
```

### New file: `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  workflow_run:
    workflows: ["CI"]
    branches: [main]
    types: [completed]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

jobs:
  deploy-staging:
    if: ${{ github.event.workflow_run.conclusion == 'success' || github.event.inputs.environment == 'staging' }}
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Configure kubectl
        uses: azure/k8s-set-context@v4
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}

      - name: Install Helm
        uses: azure/setup-helm@v3

      - name: Deploy to staging
        run: |
          helm upgrade --install lons infrastructure/helm/lons/ \
            -f infrastructure/helm/lons/values-staging.yaml \
            --set global.imageTag=${{ github.sha }} \
            --namespace lons-staging \
            --create-namespace \
            --wait \
            --timeout 10m

      - name: Smoke tests
        run: |
          STAGING_URL="${{ vars.STAGING_URL }}"
          # Health checks
          curl -sf "$STAGING_URL/v1/health" || exit 1
          curl -sf "$STAGING_URL/graphql?query=%7B__typename%7D" || exit 1
          echo "Smoke tests passed"

      - name: Rollback on failure
        if: failure()
        run: |
          helm rollback lons --namespace lons-staging --wait --timeout 5m

  deploy-production:
    if: ${{ github.event.inputs.environment == 'production' }}
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Configure kubectl
        uses: azure/k8s-set-context@v4
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG_PRODUCTION }}

      - name: Install Helm
        uses: azure/setup-helm@v3

      - name: Deploy to production
        run: |
          helm upgrade --install lons infrastructure/helm/lons/ \
            -f infrastructure/helm/lons/values-production.yaml \
            --set global.imageTag=${{ github.sha }} \
            --namespace lons-production \
            --create-namespace \
            --wait \
            --timeout 10m

      - name: Post-deploy health check
        run: |
          PROD_URL="${{ vars.PRODUCTION_URL }}"
          for i in {1..10}; do
            curl -sf "$PROD_URL/v1/health" && break
            sleep 5
          done
          curl -sf "$PROD_URL/v1/health" || exit 1

      - name: Rollback on failure
        if: failure()
        run: |
          helm rollback lons --namespace lons-production --wait --timeout 5m
```

---

## Task S2: Monitoring Stack — Prometheus + Grafana (8 pts)

### New directory: `infrastructure/monitoring/`

#### `infrastructure/monitoring/prometheus/prometheus.yml`

Prometheus scrape config targeting all services at `/metrics`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - alerting-rules.yml

scrape_configs:
  - job_name: 'graphql-server'
    static_targets:
      - targets: ['graphql-server:3000']
    metrics_path: /metrics

  - job_name: 'rest-server'
    static_targets:
      - targets: ['rest-server:3001']
    metrics_path: /metrics

  - job_name: 'scheduler'
    static_targets:
      - targets: ['scheduler:3002']
    metrics_path: /metrics

  - job_name: 'notification-worker'
    static_targets:
      - targets: ['notification-worker:3003']
    metrics_path: /metrics

  - job_name: 'scoring-service'
    static_targets:
      - targets: ['scoring-service:8000']
    metrics_path: /metrics
```

#### `infrastructure/monitoring/prometheus/alerting-rules.yml`

```yaml
groups:
  - name: lons-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.job }}"
          description: "Error rate is {{ $value | humanizePercentage }} for 5 minutes"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High p99 latency on {{ $labels.job }}"

      - alert: PodRestarts
        expr: increase(kube_pod_container_status_restarts_total[15m]) > 3
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.pod }} restarted {{ $value }} times in 15 minutes"

      - alert: WebhookDeliveryFailures
        expr: rate(webhook_delivery_failures_total[5m]) / rate(webhook_deliveries_total[5m]) > 0.2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Webhook delivery failure rate above 20%"

      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Redis memory usage above 80%"
```

#### Grafana dashboards

Create JSON dashboard files under `infrastructure/monitoring/grafana/dashboards/`:

1. **`api-overview.json`** — Panels: Request rate (by service), Error rate (by status code), p50/p95/p99 latency, Active connections
2. **`loan-pipeline.json`** — Panels: Loan applications/minute, Approval rate, Avg scoring time, Disbursement rate, Pipeline funnel
3. **`repayments.json`** — Panels: Payment volume, Success/failure rate, Avg processing time, Outstanding balances
4. **`infrastructure.json`** — Panels: CPU/memory per pod, Pod count, Redis memory, PostgreSQL connections, Queue depth

Each dashboard should use Prometheus as the datasource and include appropriate variables for time range and service filtering.

#### `infrastructure/monitoring/grafana/datasources.yaml`

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

#### `infrastructure/monitoring/docker-compose.monitoring.yml`

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:v2.51.0
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/alerting-rules.yml:/etc/prometheus/alerting-rules.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'

  grafana:
    image: grafana/grafana:10.4.0
    ports:
      - "3100:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - ./grafana/datasources.yaml:/etc/grafana/provisioning/datasources/datasources.yaml
      - ./grafana/dashboards:/var/lib/grafana/dashboards
      - grafana-data:/var/lib/grafana

volumes:
  prometheus-data:
  grafana-data:
```

### Metrics endpoint

Ensure each NestJS service exposes a `/metrics` endpoint. The `MetricsInterceptor` already collects data. Verify that a Prometheus client (e.g., `prom-client`) is installed and a `/metrics` route is registered in each app's `main.ts`. If not, add:

```typescript
import { collectDefaultMetrics, register } from 'prom-client';
collectDefaultMetrics();

// In bootstrap(), after app.listen():
app.getHttpAdapter().get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## Task S3: OpenTelemetry Instrumentation (5 pts)

> **NOTE**: This is the first item to DROP if capacity gets tight.

### Install

```bash
pnpm add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions --filter common
```

### New file: `packages/common/src/observability/tracing.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export function initTracing(options: { serviceName: string }): void {
  if (process.env.ENABLE_TRACING !== 'true') {
    return;
  }

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: options.serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => sdk.shutdown());
}
```

### Wire into each service's `main.ts`

At the very top of each `main.ts` (before any other imports):

```typescript
import { initTracing } from '@lons/common';
initTracing({ serviceName: 'graphql-server' }); // adjust name per service
```

### Export from `packages/common/src/index.ts`

```typescript
export { initTracing } from './observability/tracing';
```

---

## Task S4: Audit Log Partitioning + Retention (3 pts)

### New migration

**File**: `packages/database/prisma/migrations/20260328200000_audit_log_partitioning/migration.sql`

```sql
-- Step 1: Rename existing table
ALTER TABLE audit_logs RENAME TO audit_logs_legacy;

-- Step 2: Create partitioned table with same structure
CREATE TABLE audit_logs (
  LIKE audit_logs_legacy INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
) PARTITION BY RANGE (created_at);

-- Step 3: Create monthly partitions for the next 24 months
-- (Generate these programmatically or list explicitly)
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_logs_2026_08 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_logs_2026_09 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_logs_2026_10 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_logs_2026_11 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_logs_2026_12 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE audit_logs_2027_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE audit_logs_2027_02 PARTITION OF audit_logs
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

-- Step 4: Migrate existing data
INSERT INTO audit_logs SELECT * FROM audit_logs_legacy;

-- Step 5: Drop legacy table
DROP TABLE audit_logs_legacy;

-- Step 6: Re-apply audit_writer grants
GRANT INSERT, SELECT ON audit_logs TO audit_writer;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM audit_writer;
```

### Partition management in scheduler

**File**: `apps/scheduler/src/tasks/audit-partition-manager.ts` (new)

Add a monthly cron job that:
1. Creates the next month's partition if it doesn't exist
2. Drops partitions older than `AUDIT_LOG_RETENTION_MONTHS` (default: 24, configurable via env var)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';

@Injectable()
export class AuditPartitionManager {
  private readonly logger = new Logger(AuditPartitionManager.name);
  private readonly retentionMonths: number;

  constructor(private readonly prisma: PrismaService) {
    this.retentionMonths = parseInt(process.env.AUDIT_LOG_RETENTION_MONTHS || '24', 10);
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async managePartitions(): Promise<void> {
    await this.createFuturePartitions();
    await this.dropExpiredPartitions();
  }

  private async createFuturePartitions(): Promise<void> {
    // Create partitions for the next 3 months
    const now = new Date();
    for (let i = 1; i <= 3; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      const partitionName = `audit_logs_${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}`;

      try {
        await this.prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS ${partitionName}
          PARTITION OF audit_logs
          FOR VALUES FROM ('${date.toISOString().split('T')[0]}')
          TO ('${nextMonth.toISOString().split('T')[0]}')
        `);
        this.logger.log(`Created partition ${partitionName}`);
      } catch (error) {
        if (!error.message?.includes('already exists')) {
          this.logger.error(`Failed to create partition ${partitionName}`, error);
        }
      }
    }
  }

  private async dropExpiredPartitions(): Promise<void> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - this.retentionMonths);
    const cutoffStr = `audit_logs_${cutoff.getFullYear()}_${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

    // Query pg_catalog for partition names older than cutoff
    const partitions = await this.prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE tablename LIKE 'audit_logs_%'
      AND tablename < ${cutoffStr}
      AND schemaname = 'public'
    `;

    for (const partition of partitions) {
      try {
        await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${partition.tablename}`);
        this.logger.log(`Dropped expired partition ${partition.tablename}`);
      } catch (error) {
        this.logger.error(`Failed to drop partition ${partition.tablename}`, error);
      }
    }
  }
}
```

Register `AuditPartitionManager` in the scheduler module providers.

---

## Task S1: Performance Optimization & Load Testing (8 pts)

### New directory: `scripts/load-tests/`

Create scenario-specific k6 scripts:

#### `scripts/load-tests/loan-application.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration{scenario:loan_apply}': ['p(95)<10000'],  // 10s p95
    'http_req_failed': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';

export default function () {
  // Step 1: Authenticate
  const loginRes = http.post(BASE_URL, JSON.stringify({
    query: `mutation { loginTenantUser(input: { tenantId: "${__ENV.TENANT_ID}", email: "${__ENV.TEST_EMAIL}", password: "${__ENV.TEST_PASSWORD}" }) { accessToken } }`,
  }), { headers: { 'Content-Type': 'application/json' }, tags: { scenario: 'auth' } });

  const token = JSON.parse(loginRes.body)?.data?.loginTenantUser?.accessToken;
  if (!token) return;

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Step 2: Create loan request
  const loanRes = http.post(BASE_URL, JSON.stringify({
    query: `mutation { createLoanRequest(input: { customerId: "${__ENV.CUSTOMER_ID}", productId: "${__ENV.PRODUCT_ID}", requestedAmount: "5000.00", requestedTenure: 30, idempotencyKey: "${Date.now()}-${__VU}" }) { id status } }`,
  }), { headers: authHeaders, tags: { scenario: 'loan_apply' } });

  check(loanRes, { 'loan request created': (r) => r.status === 200 });
  sleep(1);
}
```

#### `scripts/load-tests/repayment-processing.js`

Test repayment throughput (target: 500 txn/min):

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    repayments: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1m',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'http_req_failed': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';

export default function () {
  // Authenticate and submit payment
  // Similar structure to loan-application.js but targeting processPayment mutation
  const res = http.post(BASE_URL, JSON.stringify({
    query: `mutation { processPayment(input: { contractId: "${__ENV.CONTRACT_ID}", amount: "100.00", channel: "WALLET", reference: "LOAD-TEST-${Date.now()}-${__VU}", idempotencyKey: "${Date.now()}-${__VU}" }) { id status } }`,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
    },
  });

  check(res, { 'payment processed': (r) => r.status === 200 });
}
```

#### `scripts/load-tests/graphql-queries.js`

Test read query performance (target: < 200ms p95):

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200', 'p(99)<500'],
    'http_req_failed': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';

export default function () {
  const queries = [
    `{ customers(first: 20) { edges { node { id fullName } } } }`,
    `{ contracts(first: 10, filter: { status: ACTIVE }) { edges { node { id status totalOutstanding } } } }`,
    `{ loanRequests(first: 10) { edges { node { id status requestedAmount } } } }`,
    `{ products(first: 10) { edges { node { id name productType } } } }`,
  ];

  const query = queries[Math.floor(Math.random() * queries.length)];
  const res = http.post(BASE_URL, JSON.stringify({ query }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
    },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
    'no errors': (r) => !JSON.parse(r.body).errors,
  });

  sleep(0.5);
}
```

#### `scripts/load-tests/tenant-isolation.js`

Concurrent multi-tenant test — verify no cross-contamination:

```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    tenant_a: {
      executor: 'constant-vus',
      vus: 25,
      duration: '2m',
      env: { TENANT_TOKEN: __ENV.TENANT_A_TOKEN, TENANT_ID: __ENV.TENANT_A_ID },
    },
    tenant_b: {
      executor: 'constant-vus',
      vus: 25,
      duration: '2m',
      env: { TENANT_TOKEN: __ENV.TENANT_B_TOKEN, TENANT_ID: __ENV.TENANT_B_ID },
    },
  },
};

const BASE_URL = __ENV.GQL_URL || 'http://localhost:3000/graphql';

export default function () {
  const res = http.post(BASE_URL, JSON.stringify({
    query: `{ customers(first: 50) { edges { node { id tenantId } } } }`,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.TENANT_TOKEN}`,
    },
  });

  const body = JSON.parse(res.body);
  const customers = body?.data?.customers?.edges || [];

  check(null, {
    'all customers belong to tenant': () =>
      customers.every(c => c.node.tenantId === __ENV.TENANT_ID),
  });
}
```

### Update existing `scripts/load-test.js`

Add a note pointing to the new scenario-specific scripts. Keep the existing basic test as a smoke test.

---

## Task M4: Full Regression Test Suite & Launch Readiness (8 pts)

### New directory: `tests/regression/`

Create comprehensive end-to-end regression tests. These should be executable in CI with a test database.

#### `tests/regression/setup.ts`

Shared test setup: database connection, seed data, authentication helpers.

```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function seedTestData() {
  // Create test tenant (Service Provider)
  // Create test product (Micro-Loan, 30-day, 5% flat fee)
  // Create test customer with KYC data
  // Create test users (admin, operator)
  // Return IDs for use in tests
}

export async function authenticateAs(role: 'admin' | 'operator', tenantId: string): Promise<string> {
  // Login and return JWT token
}

export async function cleanup() {
  // Truncate test data (preserve schema)
  await prisma.$disconnect();
}
```

#### Test suites to create:

1. **`tests/regression/loan-lifecycle.spec.ts`** — Full loan origination: create customer → pre-qualify → create loan request → score → approve → generate offer → accept → create contract → disburse. Verify each state transition and event emission.

2. **`tests/regression/repayment-lifecycle.spec.ts`** — Generate schedule → process payment → verify waterfall allocation → process remaining payments → verify payoff. Test partial payments, overpayments.

3. **`tests/regression/overdue-recovery.spec.ts`** — Miss payment → verify aging classification → verify penalty calculation → verify collection queue entry → verify recovery notification.

4. **`tests/regression/settlement-reconciliation.spec.ts`** — Revenue calculation → settlement generation → reconciliation batch.

5. **`tests/regression/admin-operations.spec.ts`** — Product CRUD → customer search → contract view → audit log query (verify entries exist for all mutations).

6. **`tests/regression/webhook-delivery.spec.ts`** — Register endpoint → trigger event → verify delivery attempt → exhaust retries → verify exhaustion notification.

7. **`tests/regression/tenant-isolation.spec.ts`** — Create two tenants, verify tenant A cannot access tenant B's customers, contracts, loan requests via API, subscription, or direct DB query.

8. **`tests/regression/auth-flows.spec.ts`** — Login → JWT validation → token refresh → API key auth → WebSocket auth → rate limiting (trigger 429) → password change (weak password rejection).

Each test file should:
- Use `beforeAll` to seed data and authenticate
- Use `afterAll` to clean up
- Be runnable independently
- Output JUnit XML for CI integration

#### `tests/regression/jest.config.ts`

```typescript
export default {
  testMatch: ['<rootDir>/**/*.spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testTimeout: 60000,
  reporters: ['default', ['jest-junit', { outputDirectory: 'test-results', outputName: 'regression.xml' }]],
};
```

Add a script to `package.json`:
```json
"test:regression": "jest --config tests/regression/jest.config.ts --runInBand"
```

---

## DO NOT Modify

- Sprint 1-5 business logic (entity CRUD, loan processing, repayments, settlements, reconciliation, admin portal, integrations, AI/ML scoring)
- Sprint 6 completed work — only extend, do not rewrite
- Prisma schema models (no model changes — only the partitioning migration for audit_logs)
- Scoring service Python code

---

## After All Tasks Complete — Run Verification

```bash
# Docker images build
docker build --target graphql-server -t lons-graphql .
docker build --target rest-server -t lons-rest .
docker build --target scheduler -t lons-scheduler .
docker build --target notification-worker -t lons-notification .
docker build -t lons-scoring ./services/scoring-service

# Helm chart validates
helm template lons infrastructure/helm/lons/
helm lint infrastructure/helm/lons/

# All tests pass
pnpm test
pnpm test:regression

# Load tests run (basic smoke)
k6 run scripts/load-test.js

# Monitoring stack starts
docker compose -f infrastructure/monitoring/docker-compose.monitoring.yml up -d
```
