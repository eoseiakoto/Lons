import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AfricasTalkingSmsAdapter } from './at-sms.adapter';
import { ATDeliveryReportHandler } from './at-delivery-report.handler';
import { PrismaService, NotificationStatus, NotificationChannel } from '@lons/database';
import { ATDeliveryReport } from './at-sms.types';

// Mock PrismaService
const mockPrismaService = {
  notification: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
};

// Mock ConfigService
const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const config: Record<string, string> = {
      AFRICAS_TALKING_API_KEY: '',
      AFRICAS_TALKING_USERNAME: 'sandbox',
      AFRICAS_TALKING_SENDER_ID: 'LONS',
    };
    return config[key] ?? defaultValue;
  }),
};

describe('AfricasTalkingSmsAdapter', () => {
  let adapter: AfricasTalkingSmsAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AfricasTalkingSmsAdapter,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    adapter = module.get<AfricasTalkingSmsAdapter>(AfricasTalkingSmsAdapter);
  });

  describe('send()', () => {
    it('should create a DB notification record with message ID', async () => {
      const mockNotification = {
        id: 'notif-123',
        tenantId: 'tenant-1',
        customerId: 'cust-1',
        status: NotificationStatus.sent,
        externalRef: 'ATXid_abc123',
      };
      mockPrismaService.notification.create.mockResolvedValue(mockNotification);

      const result = await adapter.send('tenant-1', {
        customerId: 'cust-1',
        eventType: 'loan_approved',
        recipient: '+233245678901',
        content: 'Your loan has been approved',
      });

      expect(result).toEqual(mockNotification);
      expect(mockPrismaService.notification.create).toHaveBeenCalledTimes(1);

      const createCall = mockPrismaService.notification.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('tenant-1');
      expect(createCall.data.channel).toBe(NotificationChannel.sms);
      expect(createCall.data.recipient).toBe('+233245678901');
      expect(createCall.data.content).toBe('Your loan has been approved');
      expect(createCall.data.externalRef).toMatch(/^ATXid_/);
      expect(createCall.data.customer).toEqual({ connect: { id: 'cust-1' } });
    });

    it('should include contractId when provided', async () => {
      mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

      await adapter.send('tenant-1', {
        customerId: 'cust-1',
        contractId: 'contract-1',
        eventType: 'repayment_received',
        recipient: '+233245678901',
        content: 'Payment received',
      });

      const createCall = mockPrismaService.notification.create.mock.calls[0][0];
      expect(createCall.data.contract).toEqual({ connect: { id: 'contract-1' } });
    });

    it('should generate unique message IDs', () => {
      const id1 = adapter.generateMessageId();
      const id2 = adapter.generateMessageId();

      expect(id1).toMatch(/^ATXid_/);
      expect(id2).toMatch(/^ATXid_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('calculateCost()', () => {
    it('should return GHS cost for Ghana numbers', () => {
      const cost = adapter.calculateCost('+233245678901');
      expect(cost).toEqual({ cost: '0.05', currency: 'GHS' });
    });

    it('should return KES cost for Kenya numbers', () => {
      const cost = adapter.calculateCost('+254712345678');
      expect(cost).toEqual({ cost: '1.00', currency: 'KES' });
    });

    it('should return default cost for unknown country codes', () => {
      const cost = adapter.calculateCost('+1234567890');
      expect(cost).toEqual({ cost: '0.10', currency: 'USD' });
    });
  });

  describe('PII masking', () => {
    it('should not log phone numbers in plain text', async () => {
      const logSpy = jest.spyOn((adapter as any).logger, 'log');
      mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

      await adapter.send('tenant-1', {
        customerId: 'cust-1',
        eventType: 'test',
        recipient: '+233245678901',
        content: 'Test message',
      });

      // Verify log calls do not contain the full phone number
      for (const call of logSpy.mock.calls) {
        const logMessage = String(call[0]);
        expect(logMessage).not.toContain('+233245678901');
      }
    });
  });

  describe('sendBulk()', () => {
    it('should send to multiple recipients', async () => {
      mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

      const results = await adapter.sendBulk('tenant-1', {
        customerId: 'cust-1',
        eventType: 'reminder',
        recipients: ['+233245678901', '+254712345678'],
        content: 'Reminder: payment due',
      });

      expect(results).toHaveLength(2);
      expect(mockPrismaService.notification.create).toHaveBeenCalledTimes(2);
    });

    it('should continue sending if one recipient fails', async () => {
      mockPrismaService.notification.create
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ id: 'notif-2' });

      const results = await adapter.sendBulk('tenant-1', {
        customerId: 'cust-1',
        eventType: 'reminder',
        recipients: ['+233245678901', '+254712345678'],
        content: 'Reminder',
      });

      // First fails, second succeeds
      expect(results).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should handle DB errors gracefully', async () => {
      mockPrismaService.notification.create.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(
        adapter.send('tenant-1', {
          customerId: 'cust-1',
          eventType: 'test',
          recipient: '+233245678901',
          content: 'Test',
        }),
      ).rejects.toThrow('Connection refused');
    });
  });
});

describe('ATDeliveryReportHandler', () => {
  let handler: ATDeliveryReportHandler;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ATDeliveryReportHandler,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    handler = module.get<ATDeliveryReportHandler>(ATDeliveryReportHandler);
  });

  describe('processDeliveryReport()', () => {
    it('should update notification to delivered on Success', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        externalRef: 'ATXid_abc',
        status: NotificationStatus.sent,
        retryCount: 0,
      });
      mockPrismaService.notification.update.mockResolvedValue({});

      const report: ATDeliveryReport = {
        id: 'ATXid_abc',
        status: 'Success',
        phoneNumber: '+233245678901',
      };

      await handler.processDeliveryReport(report);

      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: NotificationStatus.delivered,
          deliveredAt: expect.any(Date),
        }),
      });
    });

    it('should queue retry on failure when under max retries', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        externalRef: 'ATXid_abc',
        status: NotificationStatus.sent,
        retryCount: 1,
      });
      mockPrismaService.notification.update.mockResolvedValue({});

      const report: ATDeliveryReport = {
        id: 'ATXid_abc',
        status: 'Failed',
        phoneNumber: '+233245678901',
        failureReason: 'Network error',
      };

      await handler.processDeliveryReport(report);

      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: NotificationStatus.pending, // Queued for retry
          retryCount: 2,
        }),
      });
    });

    it('should mark as failed when max retries reached', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        externalRef: 'ATXid_abc',
        status: NotificationStatus.sent,
        retryCount: 3,
      });
      mockPrismaService.notification.update.mockResolvedValue({});

      const report: ATDeliveryReport = {
        id: 'ATXid_abc',
        status: 'Failed',
        phoneNumber: '+233245678901',
      };

      await handler.processDeliveryReport(report);

      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: NotificationStatus.failed,
          failedAt: expect.any(Date),
        }),
      });
    });

    it('should be idempotent for already-delivered notifications', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        externalRef: 'ATXid_abc',
        status: NotificationStatus.delivered,
        retryCount: 0,
      });

      const report: ATDeliveryReport = {
        id: 'ATXid_abc',
        status: 'Success',
        phoneNumber: '+233245678901',
      };

      await handler.processDeliveryReport(report);

      // Should not update since it's already delivered
      expect(mockPrismaService.notification.update).not.toHaveBeenCalled();
    });

    it('should handle missing notification gracefully', async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue(null);

      const report: ATDeliveryReport = {
        id: 'ATXid_nonexistent',
        status: 'Success',
        phoneNumber: '+233245678901',
      };

      // Should not throw
      await handler.processDeliveryReport(report);
      expect(mockPrismaService.notification.update).not.toHaveBeenCalled();
    });

    it('should mask phone numbers in log output', async () => {
      const logSpy = jest.spyOn((handler as any).logger, 'log');
      mockPrismaService.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        externalRef: 'ATXid_abc',
        status: NotificationStatus.sent,
        retryCount: 0,
      });
      mockPrismaService.notification.update.mockResolvedValue({});

      await handler.processDeliveryReport({
        id: 'ATXid_abc',
        status: 'Success',
        phoneNumber: '+233245678901',
      });

      for (const call of logSpy.mock.calls) {
        const logMessage = String(call[0]);
        expect(logMessage).not.toContain('+233245678901');
      }
    });
  });
});
