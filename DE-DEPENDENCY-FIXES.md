# DE Dependency Fixes — Claude Code Instructions

These fixes address 3 gaps identified during the Deployment Engineer's infrastructure review. They unblock Kubernetes health probes, the notification-worker container, and AWS Secrets Manager integration.

**Execution order:** Fix 1 → Fix 2 → Fix 3 (Fix 2 depends on Fix 1; Fix 3 is independent but logically last)

---

## Fix 1: Register HealthController in ObservabilityModule

**Problem:** A reusable `HealthController` exists in `packages/common/src/observability/health.controller.ts` with `/health` (liveness) and `/health/ready` (readiness) endpoints, but it's **not registered** in `ObservabilityModule`. Only rest-server has a working health endpoint (via its own custom controller). The graphql-server, scheduler, and notification-worker all import `ObservabilityModule` but get no health endpoints.

**Why it matters:** Kubernetes liveness and readiness probes (configured in Helm at `/health`) will fail for graphql-server, scheduler, and notification-worker, causing pods to be killed/restarted continuously.

### Steps

**Step 1a — Register HealthController in ObservabilityModule**

File: `packages/common/src/observability/observability.module.ts`

Current contents (lines 1–11):
```typescript
import { Module } from '@nestjs/common';

import { LoggerModule } from './logger.module';
import { MetricsModule } from './metrics.module';
import { TracingModule } from './tracing.module';

@Module({
  imports: [LoggerModule, MetricsModule, TracingModule],
  exports: [LoggerModule, MetricsModule, TracingModule],
})
export class ObservabilityModule {}
```

Replace the entire file with:
```typescript
import { Module } from '@nestjs/common';

import { LoggerModule } from './logger.module';
import { MetricsModule } from './metrics.module';
import { TracingModule } from './tracing.module';
import { HealthController } from './health.controller';

@Module({
  imports: [LoggerModule, MetricsModule, TracingModule],
  controllers: [HealthController],
  exports: [LoggerModule, MetricsModule, TracingModule],
})
export class ObservabilityModule {}
```

**Step 1b — Remove rest-server's custom HealthModule (now redundant)**

The rest-server has its own `HealthController` at `apps/rest-server/src/health/health.controller.ts` and `HealthModule` at `apps/rest-server/src/health/health.module.ts`. Now that `ObservabilityModule` provides health endpoints, this is redundant and creates a route collision.

1. Delete `apps/rest-server/src/health/health.controller.ts`
2. Delete `apps/rest-server/src/health/health.module.ts`
3. Delete the `apps/rest-server/src/health/` directory entirely.

4. In `apps/rest-server/src/app.module.ts`, remove the HealthModule import:

   Remove line 16:
   ```typescript
   import { HealthModule } from './health/health.module';
   ```

   Remove `HealthModule` from the imports array (line 35):
   ```typescript
       HealthModule,
   ```

   The imports array should go from:
   ```typescript
     imports: [
       ConfigModule.forRoot({ ... }),
       ThrottlerModule.forRoot({ ... }),
       ObservabilityModule,
       HealthModule,
       LoanRequestModule,
       ...
     ],
   ```
   To:
   ```typescript
     imports: [
       ConfigModule.forRoot({ ... }),
       ThrottlerModule.forRoot({ ... }),
       ObservabilityModule,
       LoanRequestModule,
       ...
     ],
   ```

**Step 1c — Add `/health/ready` to the scoring service (Python)**

File: `services/scoring-service/app/main.py`

First, add the `datetime` import at the top of the file (it's not currently imported):

```python
from datetime import datetime
```

Then find the existing `/health` endpoint (around line 19) and add a `/ready` endpoint immediately after it:

```python
@app.get("/health/ready")
async def readiness():
    """Readiness probe — confirms the service is ready to handle traffic."""
    return {"status": "ok", "service": "scoring-service", "timestamp": datetime.utcnow().isoformat()}
```

---

## Fix 2: Create Notification-Worker Entry Point

**Problem:** The `notification-worker` Dockerfile stage (line 77 of `Dockerfile`) expects `services/notification-service/dist/main.js`, but `notification-service` is a library module — it has no `main.ts` bootstrap file. The container will crash immediately on startup.

**Why it matters:** The notification-worker is a standalone deployment in Kubernetes. Without a bootstrap entry point, the pod cannot start. The Helm deployment, service, HPA, and PDB all reference this container.

### Steps

**Step 2a — Create the notification-worker main.ts**

Create new file: `services/notification-service/src/main.ts`

```typescript
import { initTracing } from '@lons/common';
initTracing({ serviceName: 'notification-worker' });

import { NestFactory } from '@nestjs/core';

import { NotificationServiceModule } from './notification-service.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule);

  const port = process.env.NOTIFICATION_WORKER_PORT ?? 3003;
  await app.listen(port);
  console.log(`Notification worker running on port ${port}`);
}
bootstrap();
```

**Why this works:** `NotificationServiceModule` already imports `ObservabilityModule` (line 6 and 23 of `notification-service.module.ts`), which now includes `HealthController` from Fix 1. So the notification-worker will automatically expose `/health` and `/health/ready` — exactly what the Helm readiness/liveness probes expect.

**Step 2b — Ensure tsconfig includes main.ts for compilation**

Check `services/notification-service/tsconfig.json` (or `tsconfig.build.json`). Ensure the `include` pattern covers `src/**/*` so that `main.ts` is compiled to `dist/main.js`. If the service uses the standard NestJS monorepo pattern, this should already be the case. Verify by running:

```bash
pnpm --filter notification-service build
```

Confirm `services/notification-service/dist/main.js` exists after build.

**Step 2c — Resolve port conflict with scheduler**

The scheduler (`apps/scheduler/src/main.ts` line 10) also listens on port 3003. Since notification-worker and scheduler are **separate containers**, this is fine in Kubernetes (each pod has its own network namespace). However, for local development via `docker-compose.prod.yml`, they need different host port mappings. Verify `docker-compose.prod.yml` maps them to different host ports (it currently maps notification-worker to 3003:3003 and scheduler is not mapped to 3003 externally — confirm this is correct).

---

## Fix 3: AWS Secrets Manager Key Provider

**Problem:** The `IKeyProvider` interface only has `env` and `vault` implementations. The DE is using AWS Secrets Manager (not HashiCorp Vault) for production. A new provider is needed.

**Why it matters:** Without this, production encryption keys would fall back to the `ENCRYPTION_KEY` env var, which is less secure than centralized key management via Secrets Manager and doesn't support automated rotation.

### Steps

**Step 3a — Install AWS SDK**

```bash
pnpm --filter @lons/common add @aws-sdk/client-secrets-manager
```

**Step 3b — Create AwsSecretsManagerKeyProvider**

Create new file: `packages/common/src/encryption/aws-secrets-manager-key.provider.ts`

```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  RotateSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { IKeyProvider } from './key-provider.interface';

interface SmCacheEntry {
  key: Buffer;
  keyId: string;
  fetchedAt: number;
}

/**
 * AwsSecretsManagerKeyProvider fetches encryption keys from AWS Secrets Manager.
 *
 * Configuration via environment variables:
 * - AWS_SM_SECRET_ID   — ARN or name of the secret (required when KEY_PROVIDER=aws)
 * - AWS_SM_REGION      — AWS region (defaults to AWS_REGION or 'eu-west-1')
 * - AWS_SM_CACHE_TTL_MS — Cache TTL in ms (default 3600000 = 1 hour)
 *
 * The secret value must be a JSON object: { "key": "<base64-encoded-32-byte-key>", "key_id": "<optional-key-id>" }
 *
 * Falls back to ENCRYPTION_KEY env var if Secrets Manager is unreachable.
 */
@Injectable()
export class AwsSecretsManagerKeyProvider implements IKeyProvider, OnModuleInit {
  private readonly logger = new Logger(AwsSecretsManagerKeyProvider.name);

  private cache: SmCacheEntry | null = null;

  private readonly client: SecretsManagerClient;
  private readonly secretId: string;
  private readonly cacheTtlMs: number;

  constructor() {
    const region =
      process.env.AWS_SM_REGION ?? process.env.AWS_REGION ?? 'eu-west-1';
    this.client = new SecretsManagerClient({ region });
    this.secretId = process.env.AWS_SM_SECRET_ID ?? 'lons/encryption-key';
    this.cacheTtlMs = parseInt(
      process.env.AWS_SM_CACHE_TTL_MS ?? '3600000',
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.refreshKey();
  }

  async getKey(keyId?: string): Promise<Buffer> {
    if (keyId && this.cache && this.cache.keyId !== keyId) {
      await this.refreshKey();
    }

    if (this.cache && !this.isCacheExpired()) {
      return this.cache.key;
    }

    await this.refreshKey();

    if (!this.cache) {
      throw new Error(
        'AwsSecretsManagerKeyProvider: unable to obtain encryption key from Secrets Manager or environment.',
      );
    }

    return this.cache.key;
  }

  getCurrentKeyId(): string {
    return this.cache?.keyId ?? 'aws-unknown';
  }

  async rotateKey(): Promise<{ newKeyId: string }> {
    // Trigger rotation in Secrets Manager
    try {
      await this.client.send(
        new RotateSecretCommand({ SecretId: this.secretId }),
      );
      this.logger.log(
        `Rotation initiated for secret ${this.secretId}. Refreshing cache...`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to initiate rotation in Secrets Manager: ${message}. Refreshing cache only.`,
      );
    }

    this.cache = null;
    await this.refreshKey();

    if (!this.cache) {
      throw new Error(
        'AwsSecretsManagerKeyProvider: key rotation failed — could not fetch key.',
      );
    }

    return { newKeyId: this.cache.keyId };
  }

  // ---- internal ----

  private async refreshKey(): Promise<void> {
    try {
      await this.fetchFromSecretsManager();
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to fetch key from Secrets Manager: ${message}. Falling back to ENCRYPTION_KEY env var.`,
      );
    }

    this.loadFromEnv();
  }

  private isCacheExpired(): boolean {
    if (!this.cache) return true;
    return Date.now() - this.cache.fetchedAt > this.cacheTtlMs;
  }

  private async fetchFromSecretsManager(): Promise<void> {
    const command = new GetSecretValueCommand({ SecretId: this.secretId });
    const response = await this.client.send(command);

    if (!response.SecretString) {
      throw new Error('Secret value is empty or binary (expected JSON string).');
    }

    const secretData = JSON.parse(response.SecretString);

    if (!secretData.key) {
      throw new Error(
        'Secret JSON missing "key" field. Expected: { "key": "<base64>", "key_id": "<optional>" }',
      );
    }

    const keyBuffer = Buffer.from(secretData.key, 'base64');
    if (keyBuffer.length !== 32) {
      throw new Error(
        `Encryption key must decode to exactly 32 bytes, got ${keyBuffer.length}.`,
      );
    }

    const keyId: string =
      secretData.key_id ??
      `aws-${response.VersionId ?? 'unknown'}`;

    this.cache = {
      key: keyBuffer,
      keyId,
      fetchedAt: Date.now(),
    };

    this.logger.log(
      `Encryption key loaded from Secrets Manager (keyId=${keyId}).`,
    );
  }

  private loadFromEnv(): void {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'ENCRYPTION_KEY environment variable is not set and Secrets Manager is unavailable.',
      );
    }

    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}.`,
      );
    }

    this.cache = {
      key,
      keyId: 'aws-env-fallback',
      fetchedAt: Date.now(),
    };
  }
}
```

**Step 3c — Update the key provider factory**

File: `packages/common/src/encryption/key-provider.factory.ts`

Replace the entire file with:
```typescript
import { EnvKeyProvider } from './env-key.provider';
import { IKeyProvider } from './key-provider.interface';
import { VaultKeyProvider } from './vault-key.provider';
import { AwsSecretsManagerKeyProvider } from './aws-secrets-manager-key.provider';

type KeyProviderType = 'env' | 'vault' | 'aws';

/**
 * Returns the appropriate IKeyProvider implementation based on the
 * KEY_PROVIDER environment variable ('env' | 'vault' | 'aws').  Defaults to 'env'.
 */
export function createKeyProvider(): IKeyProvider {
  const providerType = (process.env.KEY_PROVIDER ?? 'env') as KeyProviderType;

  switch (providerType) {
    case 'vault':
      return new VaultKeyProvider();
    case 'aws':
      return new AwsSecretsManagerKeyProvider();
    case 'env':
    default:
      return new EnvKeyProvider();
  }
}
```

**Step 3d — Export the new provider from the barrel**

File: `packages/common/src/encryption/index.ts`

Add after line 5 (`export * from './vault-key.provider';`):
```typescript
export * from './aws-secrets-manager-key.provider';
```

The file should become:
```typescript
export * from './aes-gcm.util';
export * from './masking.util';
export * from './key-provider.interface';
export * from './env-key.provider';
export * from './vault-key.provider';
export * from './aws-secrets-manager-key.provider';
export * from './key-provider.factory';
export * from './encrypted-fields.config';
export * from './field-encryption.middleware';
export * from './key-rotation.service';
export * from './encryption-startup.validator';
```

**Step 3e — Update .env.example**

Add these variables to `.env.example` under the Encryption section:
```bash
# Encryption — AWS Secrets Manager (when KEY_PROVIDER=aws)
AWS_SM_SECRET_ID=lons/encryption-key
AWS_SM_REGION=eu-west-1
AWS_SM_CACHE_TTL_MS=3600000
```

Also update the existing `ENCRYPTION_KEY_PROVIDER` comment to show the new option:
```bash
# KEY_PROVIDER=env|vault|aws
```

**Step 3f — Write unit tests**

Create: `packages/common/src/encryption/__tests__/aws-secrets-manager-key.provider.spec.ts`

Test cases:
1. `getKey()` returns cached key when cache is valid
2. `getKey()` refreshes from Secrets Manager when cache is expired
3. `getKey()` falls back to ENCRYPTION_KEY when Secrets Manager is unavailable
4. `getKey()` throws when both Secrets Manager and env var are unavailable
5. `getKey(keyId)` forces refresh when requested keyId doesn't match cache
6. `getCurrentKeyId()` returns correct key ID
7. `rotateKey()` sends RotateSecretCommand and refreshes cache
8. Rejects keys that are not exactly 32 bytes
9. Rejects secrets with missing `key` field

Mock `@aws-sdk/client-secrets-manager` using Jest's module mocking.

---

## Verification

After all fixes are applied:

1. **Build**: `pnpm build` — must succeed with no errors.
2. **Health endpoint smoke test**: Start graphql-server, rest-server, scheduler locally. Verify `curl http://localhost:3000/health` and `curl http://localhost:3000/health/ready` return `{"status":"ok","timestamp":"..."}` for each service on its respective port.
3. **Notification-worker**: Verify `services/notification-service/dist/main.js` exists after build. Start the worker and confirm `/health` responds.
4. **Unit tests**: `pnpm test` — all existing tests plus new AWS provider tests must pass.
5. **Docker build**: `docker build --target notification-worker -t lons-nw-test .` — must succeed and the container must start without crashing.
