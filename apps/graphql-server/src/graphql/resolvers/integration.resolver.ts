import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { CurrentTenant, CurrentUser, Roles } from '@lons/entity-service';
import { encodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import { PrismaService } from '@lons/database';
import { WalletAdapterResolver } from '@lons/integration-service';

import {
  WalletProviderConfigType,
  WalletProviderConfigConnection,
  ConnectionTestResult,
} from '../types/wallet-provider-config.type';
import { PaginationInput } from '../inputs/pagination.input';
import {
  CreateWalletProviderConfigInput,
  UpdateWalletProviderConfigInput,
} from '../inputs/wallet-provider-config.input';

/** Fields in configJson that contain sensitive values and should be masked */
const SENSITIVE_CONFIG_KEYS = [
  'credentials',
  'secret',
  'secrets',
  'apiKey',
  'api_key',
  'apiSecret',
  'api_secret',
  'password',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'clientSecret',
  'client_secret',
  'privateKey',
  'private_key',
];

function maskSensitiveConfigFields(
  configJson: Record<string, unknown>,
): Record<string, unknown> {
  if (!configJson || typeof configJson !== 'object') return configJson;

  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(configJson)) {
    const isKeywordSensitive = SENSITIVE_CONFIG_KEYS.some(
      (sk) => key.toLowerCase().includes(sk.toLowerCase()),
    );

    if (isKeywordSensitive) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const innerMasked: Record<string, unknown> = {};
        for (const innerKey of Object.keys(value as Record<string, unknown>)) {
          innerMasked[innerKey] = '***REDACTED***';
        }
        masked[key] = innerMasked;
      } else {
        masked[key] = '***REDACTED***';
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      masked[key] = maskSensitiveConfigFields(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

@Resolver(() => WalletProviderConfigType)
export class IntegrationResolver {
  private readonly logger = new Logger('IntegrationResolver');

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletAdapterResolver: WalletAdapterResolver,
  ) {}

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  @Query(() => WalletProviderConfigConnection)
  @Roles('integration:read')
  async walletProviderConfigs(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: { scopes?: string[] },
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<WalletProviderConfigConnection> {
    const configs = await this.prisma.walletProviderConfig.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const hasSensitiveScope =
      user?.scopes?.includes('integration:read:sensitive') ?? false;

    // Cursor-based pagination
    const take = pagination?.first || 20;
    let startIndex = 0;

    if (pagination?.after) {
      const afterId = Buffer.from(pagination.after, 'base64').toString('utf-8');
      const afterIndex = configs.findIndex((c) => c.id === afterId);
      if (afterIndex >= 0) {
        startIndex = afterIndex + 1;
      }
    }

    const paginatedItems = configs.slice(startIndex, startIndex + take);
    const hasNextPage = startIndex + take < configs.length;

    return {
      edges: paginatedItems.map((config) => {
        const node = config as unknown as WalletProviderConfigType;
        if (!hasSensitiveScope && node.configJson) {
          node.configJson = maskSensitiveConfigFields(
            node.configJson as Record<string, unknown>,
          );
        }
        return {
          node,
          cursor: encodeCursor(config.id),
        };
      }),
      pageInfo: {
        hasNextPage,
        hasPreviousPage: startIndex > 0,
        startCursor:
          paginatedItems.length > 0
            ? encodeCursor(paginatedItems[0].id)
            : undefined,
        endCursor:
          paginatedItems.length > 0
            ? encodeCursor(paginatedItems[paginatedItems.length - 1].id)
            : undefined,
      },
      totalCount: configs.length,
    };
  }

  @Query(() => WalletProviderConfigType)
  @Roles('integration:read')
  async walletProviderConfig(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: { scopes?: string[] },
    @Args('id', { type: () => ID }) id: string,
  ): Promise<WalletProviderConfigType> {
    const config = await this.prisma.walletProviderConfig.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!config) {
      throw new Error(`Wallet provider config not found: ${id}`);
    }

    const hasSensitiveScope =
      user?.scopes?.includes('integration:read:sensitive') ?? false;

    const result = config as unknown as WalletProviderConfigType;
    if (!hasSensitiveScope && result.configJson) {
      result.configJson = maskSensitiveConfigFields(
        result.configJson as Record<string, unknown>,
      );
    }

    return result;
  }

  @Query(() => [WalletProviderConfigType], { name: 'allWalletProviderConfigs' })
  @Roles('platform_admin')
  async allWalletProviderConfigs(
    @CurrentUser() user: any,
  ): Promise<WalletProviderConfigType[]> {
    this.logger.log(`Platform admin ${user.userId} fetching all wallet provider configs`);

    const configs = await this.prisma.walletProviderConfig.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return configs.map((config) => ({
      ...config,
      configJson: config.configJson
        ? maskSensitiveConfigFields(config.configJson as Record<string, unknown>)
        : null,
    })) as unknown as WalletProviderConfigType[];
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  @Mutation(() => WalletProviderConfigType)
  @AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.TENANT)
  @Roles('sp_admin')
  async createWalletProviderConfig(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateWalletProviderConfigInput,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ): Promise<WalletProviderConfigType> {
    this.logger.log(
      `Creating wallet provider config: ${input.displayName} (${input.providerType}) for tenant ${tenantId}`,
    );

    const created = await this.prisma.walletProviderConfig.create({
      data: {
        tenantId,
        providerType: input.providerType,
        environmentMode: input.environmentMode,
        displayName: input.displayName,
        apiBaseUrl: input.apiBaseUrl,
        credentialsSecretRef: input.credentialsSecretRef,
        webhookSigningKeyRef: input.webhookSigningKeyRef,
        configJson: (input.configJson ?? undefined) as any,
        isDefault: input.isDefault ?? false,
      },
    });

    return created as unknown as WalletProviderConfigType;
  }

  @Mutation(() => WalletProviderConfigType)
  @AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.TENANT)
  @Roles('sp_admin')
  async updateWalletProviderConfig(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateWalletProviderConfigInput,
  ): Promise<WalletProviderConfigType> {
    // Ensure the config belongs to this tenant and is not soft-deleted
    const existing = await this.prisma.walletProviderConfig.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new Error(`Wallet provider config not found: ${id}`);
    }

    this.logger.log(
      `Updating wallet provider config: ${id} for tenant ${tenantId}`,
    );

    const updated = await this.prisma.walletProviderConfig.update({
      where: { id },
      data: {
        ...(input.providerType !== undefined && { providerType: input.providerType }),
        ...(input.environmentMode !== undefined && { environmentMode: input.environmentMode }),
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.apiBaseUrl !== undefined && { apiBaseUrl: input.apiBaseUrl }),
        ...(input.credentialsSecretRef !== undefined && { credentialsSecretRef: input.credentialsSecretRef }),
        ...(input.webhookSigningKeyRef !== undefined && { webhookSigningKeyRef: input.webhookSigningKeyRef }),
        ...(input.configJson !== undefined && { configJson: input.configJson as any }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      },
    });

    // Invalidate adapter cache so next resolution picks up new config
    await this.walletAdapterResolver.invalidateCache(tenantId);

    return updated as unknown as WalletProviderConfigType;
  }

  @Mutation(() => WalletProviderConfigType)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.TENANT)
  @Roles('sp_admin')
  async deactivateWalletProviderConfig(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<WalletProviderConfigType> {
    const existing = await this.prisma.walletProviderConfig.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new Error(`Wallet provider config not found: ${id}`);
    }

    this.logger.log(
      `Deactivating wallet provider config: ${id} for tenant ${tenantId}`,
    );

    const deactivated = await this.prisma.walletProviderConfig.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    await this.walletAdapterResolver.invalidateCache(tenantId);

    return deactivated as unknown as WalletProviderConfigType;
  }

  @Mutation(() => WalletProviderConfigType)
  @AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.TENANT)
  @Roles('sp_admin')
  async setDefaultWalletProvider(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<WalletProviderConfigType> {
    const existing = await this.prisma.walletProviderConfig.findFirst({
      where: { id, tenantId, deletedAt: null, isActive: true },
    });

    if (!existing) {
      throw new Error(
        `Active wallet provider config not found: ${id}`,
      );
    }

    this.logger.log(
      `Setting default wallet provider to ${id} for tenant ${tenantId}`,
    );

    // Unset isDefault on all other configs for this tenant in a transaction
    await this.prisma.$transaction([
      this.prisma.walletProviderConfig.updateMany({
        where: {
          tenantId,
          isDefault: true,
          deletedAt: null,
          id: { not: id },
        },
        data: { isDefault: false },
      }),
      this.prisma.walletProviderConfig.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    await this.walletAdapterResolver.invalidateCache(tenantId);

    // Re-fetch to return the updated record
    const updated = await this.prisma.walletProviderConfig.findUniqueOrThrow({
      where: { id },
    });

    return updated as unknown as WalletProviderConfigType;
  }

  @Mutation(() => ConnectionTestResult)
  @AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.TENANT)
  @Roles('sp_admin')
  async testWalletConnection(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ConnectionTestResult> {
    const config = await this.prisma.walletProviderConfig.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!config) {
      return {
        success: false,
        latencyMs: 0,
        errorMessage: `Wallet provider config not found: ${id}`,
      };
    }

    this.logger.log(
      `Testing wallet connection for config ${id} (${config.providerType}) tenant ${tenantId}`,
    );

    const startTime = Date.now();

    try {
      // Resolve the adapter for this tenant (uses the default config)
      // We temporarily need the adapter — resolve will use the tenant's default.
      // For a more targeted test we instantiate based on the specific config's provider type.
      const adapter = await this.walletAdapterResolver.resolve(tenantId);

      if (!adapter.getBalance) {
        return {
          success: false,
          latencyMs: Date.now() - startTime,
          errorMessage: `Adapter for ${config.providerType} does not support getBalance`,
        };
      }

      // Use a test wallet ID for the balance check
      await adapter.getBalance('test-wallet-health-check');

      return {
        success: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : 'Unknown error during connection test';
      this.logger.warn(
        `Wallet connection test failed for config ${id}: ${errMsg}`,
      );
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        errorMessage: errMsg,
      };
    }
  }
}
