import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { IKeyProvider } from './key-provider.interface';

interface VaultCacheEntry {
  key: Buffer;
  keyId: string;
  fetchedAt: number;
}

/**
 * VaultKeyProvider fetches encryption keys from HashiCorp Vault.
 *
 * On startup it attempts to load the key from the Vault KV v2 endpoint at
 * `{VAULT_ADDR}/v1/{VAULT_SECRET_PATH}`.  If Vault is not configured or
 * unreachable, it falls back to the `ENCRYPTION_KEY` environment variable
 * and logs a warning.
 *
 * Keys are cached in memory with a configurable TTL (default 1 hour).
 */
@Injectable()
export class VaultKeyProvider implements IKeyProvider, OnModuleInit {
  private readonly logger = new Logger(VaultKeyProvider.name);

  private cache: VaultCacheEntry | null = null;

  private readonly vaultAddr: string | undefined;
  private readonly vaultToken: string | undefined;
  private readonly secretPath: string;
  private readonly cacheTtlMs: number;

  constructor() {
    this.vaultAddr = process.env.VAULT_ADDR;
    this.vaultToken = process.env.VAULT_TOKEN;
    this.secretPath =
      process.env.VAULT_SECRET_PATH ?? 'secret/data/lons/encryption';
    this.cacheTtlMs = parseInt(
      process.env.VAULT_KEY_CACHE_TTL_MS ?? '3600000',
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.refreshKey();
  }

  async getKey(keyId?: string): Promise<Buffer> {
    // If a specific keyId is requested and we have a cached key with a
    // different id, force a refresh (Vault may have rotated).
    if (keyId && this.cache && this.cache.keyId !== keyId) {
      await this.refreshKey();
    }

    if (this.cache && !this.isCacheExpired()) {
      return this.cache.key;
    }

    await this.refreshKey();

    if (!this.cache) {
      throw new Error(
        'VaultKeyProvider: unable to obtain encryption key from Vault or environment.',
      );
    }

    return this.cache.key;
  }

  getCurrentKeyId(): string {
    return this.cache?.keyId ?? 'vault-unknown';
  }

  async rotateKey(): Promise<{ newKeyId: string }> {
    this.cache = null;
    await this.refreshKey();

    if (!this.cache) {
      throw new Error(
        'VaultKeyProvider: key rotation failed — could not fetch key from Vault or environment.',
      );
    }

    const cached = this.cache as VaultCacheEntry;
    return { newKeyId: cached.keyId };
  }

  // ---- internal ----

  /** Fetch the key from Vault, falling back to ENCRYPTION_KEY on any error. */
  async refreshKey(): Promise<void> {
    if (this.isVaultConfigured()) {
      try {
        await this.fetchFromVault();
        return;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to fetch key from Vault: ${message}. Falling back to ENCRYPTION_KEY env var.`,
        );
      }
    } else {
      this.logger.warn(
        'Vault is not configured (VAULT_ADDR/VAULT_TOKEN missing). ' +
          'Falling back to ENCRYPTION_KEY env var. ' +
          'Configure VAULT_ADDR and VAULT_TOKEN for production use.',
      );
    }

    this.loadFromEnv();
  }

  private isVaultConfigured(): boolean {
    return !!(this.vaultAddr && this.vaultToken);
  }

  private isCacheExpired(): boolean {
    if (!this.cache) return true;
    return Date.now() - this.cache.fetchedAt > this.cacheTtlMs;
  }

  private async fetchFromVault(): Promise<void> {
    const url = `${this.vaultAddr}/v1/${this.secretPath}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Vault-Token': this.vaultToken!,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Vault returned HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const body: any = await response.json();

    // KV v2 response shape: { data: { data: { key, key_id? }, metadata: { version } } }
    const secretData = body?.data?.data;
    if (!secretData || !secretData.key) {
      throw new Error(
        'Vault response missing expected data.data.key field.',
      );
    }

    const keyBuffer = Buffer.from(secretData.key, 'base64');
    if (keyBuffer.length !== 32) {
      throw new Error(
        `Vault key must decode to exactly 32 bytes, got ${keyBuffer.length}.`,
      );
    }

    const keyId: string =
      secretData.key_id ??
      `vault-v${body?.data?.metadata?.version ?? 'unknown'}`;

    this.cache = {
      key: keyBuffer,
      keyId,
      fetchedAt: Date.now(),
    };

    this.logger.log(`Encryption key loaded from Vault (keyId=${keyId}).`);
  }

  private loadFromEnv(): void {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'ENCRYPTION_KEY environment variable is not set and Vault is unavailable.',
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
      keyId: 'vault-env-fallback',
      fetchedAt: Date.now(),
    };
  }
}
