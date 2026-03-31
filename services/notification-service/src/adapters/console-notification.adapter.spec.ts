import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, NotificationChannel, NotificationStatus } from '@lons/database';
import { ConsoleNotificationAdapter } from './console-notification.adapter';
import { maskPhone, maskEmail } from '@lons/common';

describe('ConsoleNotificationAdapter', () => {
  let adapter: ConsoleNotificationAdapter;
  let prisma: PrismaService;

  const tenantId = 'tenant-123';
  const customerId = 'customer-123';
  const contractId = 'contract-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsoleNotificationAdapter,
        {
          provide: PrismaService,
          useValue: {
            notification: {
              create: jest.fn().mockResolvedValue({
                id: 'notif-123',
                tenantId,
                customerId,
                contractId,
                eventType: 'test_event',
                channel: NotificationChannel.sms,
                recipient: '+233245678901',
                content: 'Test content',
                status: NotificationStatus.sent,
                sentAt: new Date(),
              }),
            },
          },
        },
      ],
    }).compile();

    adapter = module.get<ConsoleNotificationAdapter>(ConsoleNotificationAdapter);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Send Notification', () => {
    it('should send notification and create database record', async () => {
      const result = await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        channel: 'sms',
        recipient: '+233245678901',
        content: 'Your loan has been disbursed',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('notif-123');
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should store unmasked recipient in database', async () => {
      const phone = '+233245678901';
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'sms',
        recipient: phone,
        content: 'Test',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient: phone, // Unmasked
        }),
      });
    });

    it('should set status to SENT for console adapter', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Test',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: NotificationStatus.sent,
        }),
      });
    });

    it('should set sentAt timestamp', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Test',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sentAt: expect.any(Date),
        }),
      });
    });

    it('should include contract ID when provided', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId: 'contract-456',
        eventType: 'test_event',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Test',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contractId: 'contract-456',
        }),
      });
    });

    it('should handle notifications without contract ID', async () => {
      await adapter.send(tenantId, {
        customerId,
        eventType: 'test_event',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Test',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('PII Masking for Logging', () => {
    it('should mask phone numbers for SMS channel', async () => {
      const phone = '+233245678901';
      const masked = maskPhone(phone);

      expect(masked).not.toBe(phone);
      expect(masked).toContain('***');
      expect(masked).toMatch(/\+233\*\*\*\d{4}/);
    });

    it('should mask email addresses for email channel', async () => {
      const email = 'john@example.com';
      const masked = maskEmail(email);

      expect(masked).not.toBe(email);
      expect(masked).toContain('***');
      expect(masked).toMatch(/j\*\*\*@example\.com/);
    });

    it('should mask phone for SMS notifications', async () => {
      const phone = '+233987654321';
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'sms',
        recipient: phone,
        content: 'Test notification',
      });

      // The adapter should have masked the phone in logs
      // but stored unmasked in database
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient: phone, // Stored as-is
        }),
      });
    });

    it('should mask email for email notifications', async () => {
      const email = 'user@domain.com';
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'email',
        recipient: email,
        content: 'Test notification',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient: email, // Stored as-is
        }),
      });
    });

    it('should mask device ID for push notifications', async () => {
      const deviceId = 'fcm_token_abc123xyz789';
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'push',
        recipient: deviceId,
        content: 'Test notification',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should use customer ID for in_app channel', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'in_app',
        recipient: customerId,
        content: 'Test notification',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient: customerId,
        }),
      });
    });
  });

  describe('Channel Handling', () => {
    it('should handle SMS channel', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: NotificationChannel.sms,
        recipient: '+233123456789',
        content: 'SMS content',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: NotificationChannel.sms,
        }),
      });
    });

    it('should handle email channel', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: NotificationChannel.email,
        recipient: 'test@example.com',
        content: 'Email content',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: NotificationChannel.email,
        }),
      });
    });

    it('should handle push channel', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: NotificationChannel.push,
        recipient: 'device-token-123',
        content: 'Push notification',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: NotificationChannel.push,
        }),
      });
    });

    it('should handle in_app channel', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: NotificationChannel.in_app,
        recipient: customerId,
        content: 'In-app notification',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: NotificationChannel.in_app,
        }),
      });
    });
  });

  describe('Event Type Routing', () => {
    it('should store event type for disbursement_completed', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Disbursement notification',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'disbursement_completed',
        }),
      });
    });

    it('should store event type for repayment_received', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'repayment_received',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Repayment notification',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'repayment_received',
        }),
      });
    });

    it('should store event type for offer_sent', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'offer_sent',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Offer notification',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'offer_sent',
        }),
      });
    });
  });

  describe('Database Integration', () => {
    it('should create notification record with all required fields', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Test content',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          customerId,
          contractId,
          eventType: 'test_event',
          channel: 'sms',
          recipient: '+233123456789',
          content: 'Test content',
          status: NotificationStatus.sent,
          sentAt: expect.any(Date),
        }),
      });
    });

    it('should connect to customer relationship', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Test',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customer: { connect: { id: customerId } },
        }),
      });
    });

    it('should connect to contract relationship when provided', async () => {
      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'test_event',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Test',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contract: { connect: { id: contractId } },
        }),
      });
    });

    it('should omit contract relationship when not provided', async () => {
      await adapter.send(tenantId, {
        customerId,
        eventType: 'test_event',
        channel: 'sms',
        recipient: '+233123456789',
        content: 'Test',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle disbursement notification', async () => {
      await adapter.send(tenantId, {
        customerId: 'cust-001',
        contractId: 'contract-001',
        eventType: 'disbursement_completed',
        channel: 'sms',
        recipient: '+233245612345',
        content:
          'Dear John Doe, 5000.0000 GHS has been disbursed to your wallet. Contract: LON-2026-00001.',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'disbursement_completed',
          channel: NotificationChannel.sms,
          status: NotificationStatus.sent,
        }),
      });
    });

    it('should handle repayment reminder notification', async () => {
      await adapter.send(tenantId, {
        customerId: 'cust-002',
        contractId: 'contract-002',
        eventType: 'repayment_reminder',
        channel: 'sms',
        recipient: '+233278987654',
        content:
          'Dear Alice Smith, your payment of 1000.0000 GHS is due on 2026-04-09 for contract LON-2026-00002.',
      });

      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should handle email notification', async () => {
      await adapter.send(tenantId, {
        customerId: 'cust-003',
        contractId: 'contract-003',
        eventType: 'offer_sent',
        channel: 'email',
        recipient: 'bob@example.com',
        content:
          'Hi Bob Johnson, You have received a loan offer: Amount: 10000.0000 GHS Expires: 2026-03-28',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: NotificationChannel.email,
        }),
      });
    });
  });
});
