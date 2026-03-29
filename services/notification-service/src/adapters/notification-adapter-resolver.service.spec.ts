import { NotImplementedException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { NotificationAdapterResolver } from './notification-adapter-resolver.service';
import { ConsoleNotificationAdapter } from './console-notification.adapter';
import { SmsNotificationAdapter } from './sms-notification.adapter';
import { EmailNotificationAdapter } from './email-notification.adapter';
import { RecordingNotificationAdapter } from './recording-notification.adapter';
import { NotificationAdapterFactory } from './notification-adapter.factory';

jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
  return jest.fn(() => mockRedis);
});

import Redis from 'ioredis';

describe('NotificationAdapterResolver', () => {
  let resolver: NotificationAdapterResolver;
  let prisma: PrismaService;
  let consoleAdapter: ConsoleNotificationAdapter;
  let smsAdapter: SmsNotificationAdapter;
  let emailAdapter: EmailNotificationAdapter;
  let recordingAdapter: RecordingNotificationAdapter;
  let factory: NotificationAdapterFactory;
  let redisInstance: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const tenantId = 'tenant-001';

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      notificationProviderConfig: {
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;

    consoleAdapter = { send: jest.fn() } as unknown as ConsoleNotificationAdapter;
    smsAdapter = { send: jest.fn() } as unknown as SmsNotificationAdapter;
    emailAdapter = { send: jest.fn() } as unknown as EmailNotificationAdapter;
    recordingAdapter = { send: jest.fn() } as unknown as RecordingNotificationAdapter;
    factory = { getAdapter: jest.fn().mockReturnValue(consoleAdapter) } as unknown as NotificationAdapterFactory;

    resolver = new NotificationAdapterResolver(
      prisma,
      consoleAdapter,
      smsAdapter,
      emailAdapter,
      recordingAdapter,
      factory,
    );

    // Grab the mock Redis instance created during construction
    redisInstance = (Redis as unknown as jest.Mock).mock.results[
      (Redis as unknown as jest.Mock).mock.results.length - 1
    ].value;
  });

  describe('resolve', () => {
    it('should return consoleAdapter for providerType CONSOLE', async () => {
      redisInstance.get.mockResolvedValue('CONSOLE');

      const result = await resolver.resolve(tenantId, 'SMS');

      expect(result).toBe(consoleAdapter);
    });

    it('should return recordingAdapter for providerType RECORDING_MOCK', async () => {
      redisInstance.get.mockResolvedValue('RECORDING_MOCK');

      const result = await resolver.resolve(tenantId, 'SMS');

      expect(result).toBe(recordingAdapter);
    });

    it('should return smsAdapter for providerType AFRICAS_TALKING', async () => {
      redisInstance.get.mockResolvedValue('AFRICAS_TALKING');

      const result = await resolver.resolve(tenantId, 'SMS');

      expect(result).toBe(smsAdapter);
    });

    it('should return emailAdapter for providerType SMTP', async () => {
      redisInstance.get.mockResolvedValue('SMTP');

      const result = await resolver.resolve(tenantId, 'EMAIL');

      expect(result).toBe(emailAdapter);
    });

    it('should throw NotImplementedException for TWILIO', async () => {
      redisInstance.get.mockResolvedValue('TWILIO');

      await expect(resolver.resolve(tenantId, 'SMS')).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('should throw NotImplementedException for FCM', async () => {
      redisInstance.get.mockResolvedValue('FCM');

      await expect(resolver.resolve(tenantId, 'PUSH')).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('should fall back to factory when no config exists for tenant', async () => {
      redisInstance.get.mockResolvedValue(null);
      (prisma.notificationProviderConfig.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await resolver.resolve(tenantId, 'SMS');

      expect(factory.getAdapter).toHaveBeenCalledWith('sms');
      expect(result).toBe(consoleAdapter);
    });
  });

  describe('caching', () => {
    it('should return cached provider type without querying DB on cache hit', async () => {
      redisInstance.get.mockResolvedValue('CONSOLE');

      await resolver.resolve(tenantId, 'SMS');

      expect(redisInstance.get).toHaveBeenCalledWith(`notification-config:${tenantId}`);
      expect(prisma.notificationProviderConfig.findFirst).not.toHaveBeenCalled();
    });

    it('should query Prisma and cache result on cache miss', async () => {
      redisInstance.get.mockResolvedValue(null);
      redisInstance.set.mockResolvedValue('OK');
      (prisma.notificationProviderConfig.findFirst as jest.Mock).mockResolvedValue({
        providerType: 'SMTP',
      });

      const result = await resolver.resolve(tenantId, 'EMAIL');

      expect(prisma.notificationProviderConfig.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          isActive: true,
          isDefault: true,
          deletedAt: null,
        },
        select: { providerType: true },
      });
      expect(redisInstance.set).toHaveBeenCalledWith(
        `notification-config:${tenantId}`,
        'SMTP',
        'EX',
        60,
      );
      expect(result).toBe(emailAdapter);
    });

    it('should fall back to DB gracefully when Redis is unavailable', async () => {
      redisInstance.get.mockRejectedValue(new Error('Connection refused'));
      redisInstance.set.mockRejectedValue(new Error('Connection refused'));
      (prisma.notificationProviderConfig.findFirst as jest.Mock).mockResolvedValue({
        providerType: 'AFRICAS_TALKING',
      });

      const result = await resolver.resolve(tenantId, 'SMS');

      expect(prisma.notificationProviderConfig.findFirst).toHaveBeenCalled();
      expect(result).toBe(smsAdapter);
    });
  });

  describe('invalidateCache', () => {
    it('should delete the correct Redis key for the given tenantId', async () => {
      redisInstance.del.mockResolvedValue(1);

      await resolver.invalidateCache(tenantId);

      expect(redisInstance.del).toHaveBeenCalledWith(`notification-config:${tenantId}`);
    });
  });
});
