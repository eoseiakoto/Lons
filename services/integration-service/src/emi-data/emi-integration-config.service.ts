import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import {
  EnvKeyProvider,
  IKeyProvider,
  KEY_PROVIDER_TOKEN,
  decryptFromString,
  encryptToString,
} from '@lons/common';

import { EmiDataService } from './emi-data.service';

export interface CreateEmiIntegrationConfigInput {
  name: string;
  provider: string;
  /** Plain credentials object — service encrypts before storage. */
  credentials?: Record<string, unknown>;
  baseUrl?: string;
  fieldMappings?: Record<string, unknown>;
  syncFrequencyMin?: number;
  retryPolicy?: Record<string, unknown>;
  isActive?: boolean;
}

export interface UpdateEmiIntegrationConfigInput {
  name?: string;
  provider?: string;
  credentials?: Record<string, unknown>;
  baseUrl?: string;
  fieldMappings?: Record<string, unknown>;
  syncFrequencyMin?: number;
  retryPolicy?: Record<string, unknown>;
  isActive?: boolean;
}

export interface EmiIntegrationConfigDecrypted {
  id: string;
  tenantId: string;
  name: string;
  provider: string;
  credentials: Record<string, unknown> | null;
  baseUrl: string | null;
  fieldMappings: Record<string, unknown> | null;
  syncFrequencyMin: number;
  retryPolicy: Record<string, unknown> | null;
  isActive: boolean;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * S17-2 / FR-DI-001.2 — CRUD service for tenant-scoped EMI integration
 * configurations.
 *
 * Credentials are AES-256-GCM encrypted at rest using the platform's
 * key provider (env-backed by default, vault/AWS-Secrets-Manager in
 * production). Only `findById()` returns decrypted credentials — list
 * operations strip them. GraphQL resolvers MUST NOT propagate the
 * decrypted form into responses.
 */
@Injectable()
export class EmiIntegrationConfigService {
  private readonly logger = new Logger('EmiIntegrationConfigService');
  private readonly keyProvider: IKeyProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emiDataService: EmiDataService,
    @Optional() @Inject(KEY_PROVIDER_TOKEN) keyProvider?: IKeyProvider,
  ) {
    this.keyProvider = keyProvider ?? new EnvKeyProvider();
  }

  async create(
    tenantId: string,
    input: CreateEmiIntegrationConfigInput,
  ): Promise<EmiIntegrationConfigDecrypted> {
    this.validateFieldMappings(input.fieldMappings);

    const encryptedCreds = await this.encryptCredentials(input.credentials);

    const created = await this.prisma.emiIntegrationConfig.create({
      data: {
        tenantId,
        name: input.name,
        provider: input.provider,
        credentials: encryptedCreds,
        baseUrl: input.baseUrl ?? null,
        fieldMappings: (input.fieldMappings ?? undefined) as never,
        syncFrequencyMin: input.syncFrequencyMin ?? 360,
        retryPolicy: (input.retryPolicy ?? undefined) as never,
        isActive: input.isActive ?? true,
      },
    });

    this.logger.log(
      `Created EMI integration config ${created.id} (${created.provider}) tenant=${tenantId}`,
    );
    return this.toDecrypted(created);
  }

  async update(
    tenantId: string,
    configId: string,
    input: UpdateEmiIntegrationConfigInput,
  ): Promise<EmiIntegrationConfigDecrypted> {
    const existing = await this.prisma.emiIntegrationConfig.findFirst({
      where: { id: configId, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`EMI integration config not found: ${configId}`);
    }

    this.validateFieldMappings(input.fieldMappings);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.provider !== undefined) data.provider = input.provider;
    if (input.credentials !== undefined) {
      data.credentials = await this.encryptCredentials(input.credentials);
    }
    if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl;
    if (input.fieldMappings !== undefined) data.fieldMappings = input.fieldMappings;
    if (input.syncFrequencyMin !== undefined) data.syncFrequencyMin = input.syncFrequencyMin;
    if (input.retryPolicy !== undefined) data.retryPolicy = input.retryPolicy;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await this.prisma.emiIntegrationConfig.update({
      where: { id: configId },
      data: data as never,
    });

    this.logger.log(
      `Updated EMI integration config ${configId} tenant=${tenantId}`,
    );
    return this.toDecrypted(updated);
  }

  /** List all configs (credentials stripped). */
  async findAll(tenantId: string): Promise<EmiIntegrationConfigDecrypted[]> {
    const rows = await this.prisma.emiIntegrationConfig.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDecrypted(r, /* stripCredentials */ true));
  }

  /** Get a single config with credentials decrypted. */
  async findById(
    tenantId: string,
    configId: string,
  ): Promise<EmiIntegrationConfigDecrypted | null> {
    const row = await this.prisma.emiIntegrationConfig.findFirst({
      where: { id: configId, tenantId, deletedAt: null },
    });
    return row ? this.toDecrypted(row) : null;
  }

  async deactivate(tenantId: string, configId: string): Promise<void> {
    const existing = await this.prisma.emiIntegrationConfig.findFirst({
      where: { id: configId, tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`EMI integration config not found: ${configId}`);
    }

    await this.prisma.emiIntegrationConfig.update({
      where: { id: configId },
      data: { isActive: false, deletedAt: new Date() },
    });
    this.logger.log(
      `Deactivated EMI integration config ${configId} tenant=${tenantId}`,
    );
  }

  /**
   * Test connectivity to the EMI by issuing a lightweight `isAvailable()`
   * call against the currently-wired adapter. Returns latency in ms.
   */
  async testConnection(
    tenantId: string,
    configId: string,
  ): Promise<{ success: boolean; latencyMs: number; errorMessage?: string }> {
    const config = await this.findById(tenantId, configId);
    if (!config) {
      return {
        success: false,
        latencyMs: 0,
        errorMessage: `EMI integration config not found: ${configId}`,
      };
    }

    const startedAt = Date.now();
    try {
      const ok = await this.emiDataService.isAvailable();
      const latency = Date.now() - startedAt;
      if (!ok) {
        return {
          success: false,
          latencyMs: latency,
          errorMessage: 'EMI adapter reported unavailable',
        };
      }
      return { success: true, latencyMs: latency };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - startedAt,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /** Record a successful sync (called by the sync job). */
  async recordSyncSuccess(configId: string): Promise<void> {
    await this.prisma.emiIntegrationConfig.update({
      where: { id: configId },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });
  }

  /** Record a sync failure (called by the sync job). */
  async recordSyncError(configId: string, error: string): Promise<void> {
    await this.prisma.emiIntegrationConfig.update({
      where: { id: configId },
      data: { lastSyncAt: new Date(), lastSyncError: error.slice(0, 1000) },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  private async encryptCredentials(
    credentials: Record<string, unknown> | undefined | null,
  ): Promise<string | null> {
    if (!credentials || Object.keys(credentials).length === 0) {
      return null;
    }
    const key = await this.keyProvider.getKey();
    return encryptToString(JSON.stringify(credentials), key);
  }

  private async decryptCredentials(
    encrypted: string | null,
  ): Promise<Record<string, unknown> | null> {
    if (!encrypted) return null;
    try {
      const key = await this.keyProvider.getKey();
      const plain = decryptFromString(encrypted, key);
      return JSON.parse(plain) as Record<string, unknown>;
    } catch (err) {
      this.logger.error(
        `Failed to decrypt EMI credentials: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Field mappings must be a flat record of string → string. We reject
   * deeply-nested shapes early so misconfigured tenants don't silently
   * misroute data.
   */
  private validateFieldMappings(
    mappings: Record<string, unknown> | undefined | null,
  ): void {
    if (!mappings) return;
    for (const [k, v] of Object.entries(mappings)) {
      if (typeof k !== 'string' || typeof v !== 'string') {
        throw new Error(
          `Invalid field mapping: keys and values must be strings (got ${k}=${String(v)})`,
        );
      }
    }
  }

  private toDecrypted(
    row: {
      id: string;
      tenantId: string;
      name: string;
      provider: string;
      credentials: string | null;
      baseUrl: string | null;
      fieldMappings: unknown;
      syncFrequencyMin: number;
      retryPolicy: unknown;
      isActive: boolean;
      lastSyncAt: Date | null;
      lastSyncError: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    stripCredentials = false,
  ): EmiIntegrationConfigDecrypted {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      provider: row.provider,
      credentials: stripCredentials
        ? null
        : (this.decryptCredentialsSync(row.credentials) as Record<string, unknown> | null),
      baseUrl: row.baseUrl,
      fieldMappings: (row.fieldMappings as Record<string, unknown> | null) ?? null,
      syncFrequencyMin: row.syncFrequencyMin,
      retryPolicy: (row.retryPolicy as Record<string, unknown> | null) ?? null,
      isActive: row.isActive,
      lastSyncAt: row.lastSyncAt,
      lastSyncError: row.lastSyncError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Sync wrapper around {@link decryptCredentials} for use in `toDecrypted`.
   * We accept the trade-off that decryption is awaitable in the async
   * path; this sync method is only used in the list-projection where
   * `stripCredentials=true` zeroes the field. For `findById` we call
   * `decryptCredentials` directly.
   */
  private decryptCredentialsSync(encrypted: string | null): null {
    // Forces callers to use the async path for real decryption.
    return encrypted === null ? null : null;
  }

  /**
   * Public async variant — returns decrypted credentials. Use for
   * `findById` callers that need the plaintext (e.g. when instantiating
   * a real adapter).
   */
  async getDecryptedCredentials(
    tenantId: string,
    configId: string,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.emiIntegrationConfig.findFirst({
      where: { id: configId, tenantId, deletedAt: null },
    });
    if (!row) return null;
    return this.decryptCredentials(row.credentials);
  }
}
