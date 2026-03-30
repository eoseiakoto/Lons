import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { IWalletAdapterConfig } from './generic-wallet.types';
import { GenericWalletAdapter } from './generic-wallet.adapter';

export interface CreateWalletProviderConfigDto {
  providerName: string;
  authType: 'oauth2' | 'api_key' | 'basic' | 'bearer';
  baseUrl: string;
  configJson: Record<string, unknown>;
  requestMapping: Record<string, unknown>;
  responseMapping: Record<string, unknown>;
  webhookConfig?: Record<string, unknown>;
  resilience?: Record<string, unknown>;
}

export interface UpdateWalletProviderConfigDto {
  providerName?: string;
  authType?: 'oauth2' | 'api_key' | 'basic' | 'bearer';
  baseUrl?: string;
  configJson?: Record<string, unknown>;
  requestMapping?: Record<string, unknown>;
  responseMapping?: Record<string, unknown>;
  webhookConfig?: Record<string, unknown>;
  resilience?: Record<string, unknown>;
  isActive?: boolean;
}

@Injectable()
export class GenericWalletService {
  private readonly logger = new Logger('GenericWalletService');

  /**
   * In-memory idempotency key cache: maps `${tenantId}:${idempotencyKey}` to created config id.
   * In production, this would be backed by Redis or a dedicated DB table.
   */
  private readonly idempotencyCache = new Map<string, string>();

  constructor(
    private prisma: PrismaService,
    private genericWalletAdapter: GenericWalletAdapter,
  ) {}

  async create(tenantId: string, dto: CreateWalletProviderConfigDto, idempotencyKey?: string) {
    this.logger.log(`Creating wallet provider config: ${dto.providerName} for tenant ${tenantId}`);

    const result = await (this.prisma as any).walletProviderConfig.create({
      data: {
        tenantId,
        providerName: dto.providerName,
        authType: dto.authType,
        baseUrl: dto.baseUrl,
        configJson: dto.configJson as Prisma.InputJsonValue,
        requestMapping: dto.requestMapping as Prisma.InputJsonValue,
        responseMapping: dto.responseMapping as Prisma.InputJsonValue,
        webhookConfig: (dto.webhookConfig ?? undefined) as Prisma.InputJsonValue | undefined,
        resilience: (dto.resilience ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    if (idempotencyKey) {
      this.idempotencyCache.set(`${tenantId}:${idempotencyKey}`, result.id);
    }

    return result;
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    const cacheKey = `${tenantId}:${idempotencyKey}`;
    const cachedId = this.idempotencyCache.get(cacheKey);
    if (!cachedId) return null;

    try {
      return await this.findById(tenantId, cachedId);
    } catch {
      // If the cached record no longer exists, clear the cache entry
      this.idempotencyCache.delete(cacheKey);
      return null;
    }
  }

  async findById(tenantId: string, id: string) {
    const config = await (this.prisma as any).walletProviderConfig.findFirst({
      where: { id, tenantId },
    });

    if (!config) {
      throw new NotFoundException(`Wallet provider config ${id} not found`);
    }

    return config;
  }

  async findByTenant(tenantId: string) {
    return (this.prisma as any).walletProviderConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateWalletProviderConfigDto) {
    // Verify it exists and belongs to tenant
    await this.findById(tenantId, id);

    this.logger.log(`Updating wallet provider config: ${id}`);

    return (this.prisma as any).walletProviderConfig.update({
      where: { id },
      data: {
        ...(dto.providerName !== undefined && { providerName: dto.providerName }),
        ...(dto.authType !== undefined && { authType: dto.authType }),
        ...(dto.baseUrl !== undefined && { baseUrl: dto.baseUrl }),
        ...(dto.configJson !== undefined && { configJson: dto.configJson as Prisma.InputJsonValue }),
        ...(dto.requestMapping !== undefined && { requestMapping: dto.requestMapping as Prisma.InputJsonValue }),
        ...(dto.responseMapping !== undefined && { responseMapping: dto.responseMapping as Prisma.InputJsonValue }),
        ...(dto.webhookConfig !== undefined && { webhookConfig: dto.webhookConfig as Prisma.InputJsonValue }),
        ...(dto.resilience !== undefined && { resilience: dto.resilience as Prisma.InputJsonValue }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async delete(tenantId: string, id: string) {
    await this.findById(tenantId, id);

    this.logger.log(`Deleting wallet provider config: ${id}`);

    return (this.prisma as any).walletProviderConfig.delete({
      where: { id },
    });
  }

  async testConnection(tenantId: string, id: string): Promise<{ success: boolean; message: string }> {
    const record = await this.findById(tenantId, id);

    this.logger.log(`Testing connection for wallet provider: ${record.providerName}`);

    try {
      const config = this.buildAdapterConfig(record);
      const balance = await this.genericWalletAdapter.getBalanceWithConfig('test-wallet', config);

      return {
        success: true,
        message: `Connection successful. Test balance: ${balance.available} ${balance.currency}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Connection test failed for ${record.providerName}: ${message}`);
      return {
        success: false,
        message: `Connection failed: ${message}`,
      };
    }
  }

  buildAdapterConfig(record: {
    id: string;
    providerName: string;
    authType: string;
    baseUrl: string;
    configJson: unknown;
    requestMapping: unknown;
    responseMapping: unknown;
    webhookConfig?: unknown;
    resilience?: unknown;
  }): IWalletAdapterConfig {
    const configJson = record.configJson as Record<string, unknown>;
    const requestMapping = record.requestMapping as Record<string, unknown>;
    const responseMapping = record.responseMapping as Record<string, unknown>;
    const webhookConfig = record.webhookConfig as Record<string, unknown> | undefined;
    const resilience = record.resilience as Record<string, unknown> | undefined;

    return {
      providerId: record.id,
      name: record.providerName,
      baseUrl: record.baseUrl,
      auth: {
        type: record.authType as 'oauth2' | 'api_key' | 'basic' | 'bearer',
        tokenUrl: configJson?.tokenUrl as string | undefined,
        credentials: (configJson?.credentials as Record<string, string>) || {},
        apiKeyHeader: configJson?.apiKeyHeader as string | undefined,
      },
      endpoints: {
        disburse: (requestMapping?.disburse as { method: string; path: string; bodyMapping: Record<string, string> }) || {
          method: 'POST',
          path: '/disburse',
          bodyMapping: {},
        },
        collect: (requestMapping?.collect as { method: string; path: string; bodyMapping: Record<string, string> }) || {
          method: 'POST',
          path: '/collect',
          bodyMapping: {},
        },
        balance: (requestMapping?.balance as { method: string; path: string }) || {
          method: 'GET',
          path: '/balance',
        },
        status: (requestMapping?.status as { method: string; path: string }) || {
          method: 'GET',
          path: '/status',
        },
      },
      responseMapping: {
        referenceField: (responseMapping?.referenceField as string) || 'reference',
        statusField: (responseMapping?.statusField as string) || 'status',
        statusValues: {
          success: (responseMapping?.statusValues as Record<string, string>)?.success || 'SUCCESS',
          pending: (responseMapping?.statusValues as Record<string, string>)?.pending || 'PENDING',
          failed: (responseMapping?.statusValues as Record<string, string>)?.failed || 'FAILED',
        },
      },
      webhook: webhookConfig
        ? {
            signatureHeader: (webhookConfig.signatureHeader as string) || 'X-Signature',
            signatureAlgorithm:
              (webhookConfig.signatureAlgorithm as 'hmac-sha256' | 'hmac-sha512') || 'hmac-sha256',
          }
        : undefined,
      resilience: {
        timeoutMs: (resilience?.timeoutMs as number) || 30000,
        maxRetries: (resilience?.maxRetries as number) || 3,
        circuitBreakerThreshold: (resilience?.circuitBreakerThreshold as number) || 5,
      },
    };
  }
}
