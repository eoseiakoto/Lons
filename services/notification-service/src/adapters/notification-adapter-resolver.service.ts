import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import Redis from 'ioredis';
import { ConsoleNotificationAdapter } from './console-notification.adapter';
import { SmsNotificationAdapter } from './sms-notification.adapter';
import { EmailNotificationAdapter } from './email-notification.adapter';
import { RecordingNotificationAdapter } from './recording-notification.adapter';
import { NotificationAdapterFactory } from './notification-adapter.factory';

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class NotificationAdapterResolver {
  private readonly logger = new Logger(NotificationAdapterResolver.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly consoleAdapter: ConsoleNotificationAdapter,
    private readonly smsAdapter: SmsNotificationAdapter,
    private readonly emailAdapter: EmailNotificationAdapter,
    private readonly recordingAdapter: RecordingNotificationAdapter,
    private readonly factory: NotificationAdapterFactory,
  ) {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async resolve(tenantId: string, channel: 'SMS' | 'EMAIL' | 'PUSH'): Promise<ConsoleNotificationAdapter | SmsNotificationAdapter | EmailNotificationAdapter | RecordingNotificationAdapter> {
    // Try to get tenant-specific notification config
    const providerType = await this.getProviderType(tenantId);

    if (!providerType) {
      // Fall back to existing factory behavior (env-var based channel switching)
      this.logger.debug(`No notification config for tenant ${tenantId}, falling back to factory`);
      return this.factory.getAdapter(channel.toLowerCase());
    }

    switch (providerType) {
      case 'CONSOLE':
        return this.consoleAdapter;
      case 'RECORDING_MOCK':
        return this.recordingAdapter;
      case 'AFRICAS_TALKING':
        return this.smsAdapter;
      case 'SMTP':
        return this.emailAdapter;
      case 'TWILIO':
        throw new NotImplementedException('Twilio adapter coming in Phase 5');
      case 'FCM':
        throw new NotImplementedException('FCM adapter coming in Phase 5');
      default:
        return this.factory.getAdapter(channel.toLowerCase());
    }
  }

  async invalidateCache(tenantId: string): Promise<void> {
    try {
      await this.redis.del(`notification-config:${tenantId}`);
    } catch {
      this.logger.warn(`Failed to invalidate notification config cache for tenant ${tenantId}`);
    }
  }

  private async getProviderType(tenantId: string): Promise<string | null> {
    // Check Redis cache
    try {
      const cached = await this.redis.get(`notification-config:${tenantId}`);
      if (cached) {
        return cached;
      }
    } catch {
      this.logger.warn('Redis cache unavailable for notification config');
    }

    // Query database
    const config = await this.prisma.notificationProviderConfig.findFirst({
      where: {
        tenantId,
        isActive: true,
        isDefault: true,
        deletedAt: null,
      },
      select: { providerType: true },
    });

    if (!config) {
      return null;
    }

    // Cache the result
    try {
      await this.redis.set(
        `notification-config:${tenantId}`,
        config.providerType,
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch {
      this.logger.warn('Failed to cache notification config in Redis');
    }

    return config.providerType;
  }
}
