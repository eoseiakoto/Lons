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

    const cached = this.cache as SmCacheEntry;
    return { newKeyId: cached.keyId };
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
