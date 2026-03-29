import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@lons/database';
import Redis from 'ioredis';
import { IWalletAdapter } from '@lons/process-engine';
import { MockWalletAdapter } from './mock/mock-wallet.adapter';
import { MtnMomoAdapter } from './mtn-momo.adapter';
import { MpesaAdapter } from './mpesa.adapter';
import { GenericWalletAdapter } from './generic-wallet';

const CACHE_TTL_SECONDS = 60;

interface CachedWalletConfig {
  id: string;
  providerType: string;
  environmentMode: string;
  configJson: Record<string, unknown> | null;
  credentialsSecretRef: string | null;
  apiBaseUrl: string | null;
}

@Injectable()
export class WalletAdapterResolver {
  private readonly logger = new Logger(WalletAdapterResolver.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mtnMomoAdapter: MtnMomoAdapter,
    private readonly mpesaAdapter: MpesaAdapter,
  ) {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async resolve(tenantId: string): Promise<IWalletAdapter> {
    const config = await this.getConfig(tenantId);

    // Production guard: block mock adapters in production
    if (
      process.env.ALLOW_MOCK_ADAPTERS === 'false' &&
      config.providerType === 'MOCK'
    ) {
      this.logger.warn(
        `Blocked MOCK adapter usage for tenant ${tenantId} in production environment`,
      );
      throw new ForbiddenException(
        'Mock adapters are not permitted in this environment',
      );
    }

    return this.instantiateAdapter(config);
  }

  async invalidateCache(tenantId: string): Promise<void> {
    try {
      await this.redis.del(`wallet-config:${tenantId}`);
    } catch {
      this.logger.warn(`Failed to invalidate Redis cache for tenant ${tenantId}`);
    }
  }

  private async getConfig(tenantId: string): Promise<CachedWalletConfig> {
    // Check Redis cache
    try {
      const cached = await this.redis.get(`wallet-config:${tenantId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      this.logger.warn('Redis cache unavailable, querying database directly');
    }

    // Query database
    const config = await this.prisma.walletProviderConfig.findFirst({
      where: {
        tenantId,
        isActive: true,
        isDefault: true,
        deletedAt: null,
      },
    });

    if (!config) {
      throw new NotFoundException(
        `No active default wallet provider config found for tenant ${tenantId}`,
      );
    }

    const cachedConfig: CachedWalletConfig = {
      id: config.id,
      providerType: config.providerType,
      environmentMode: config.environmentMode,
      configJson: config.configJson as Record<string, unknown> | null,
      credentialsSecretRef: config.credentialsSecretRef,
      apiBaseUrl: config.apiBaseUrl,
    };

    // Store in Redis
    try {
      await this.redis.set(
        `wallet-config:${tenantId}`,
        JSON.stringify(cachedConfig),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch {
      this.logger.warn('Failed to cache wallet config in Redis');
    }

    return cachedConfig;
  }

  private instantiateAdapter(config: CachedWalletConfig): IWalletAdapter {
    switch (config.providerType) {
      case 'MOCK':
        return new MockWalletAdapter(config.configJson ?? undefined);
      case 'MTN_MOMO':
        return this.mtnMomoAdapter;
      case 'MPESA':
        return this.mpesaAdapter;
      case 'AIRTEL_MONEY':
        throw new NotImplementedException(
          'Airtel Money adapter coming in Phase 5',
        );
      case 'GENERIC':
        return new GenericWalletAdapter(this.configService);
      default:
        throw new NotFoundException(
          `Unknown wallet provider type: ${config.providerType}`,
        );
    }
  }
}
