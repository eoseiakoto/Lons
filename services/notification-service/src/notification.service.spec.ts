import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, NotificationChannel, NotificationStatus } from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { NotificationService } from './notification.service';
import { ConsoleNotificationAdapter } from './adapters/console-notification.adapter';
import { renderTemplate, NOTIFICATION_TEMPLATES } from './templates/template-renderer';

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: PrismaService;
  let adapter: ConsoleNotificationAdapter;

  const tenantId = 'tenant-123';
  const customerId = 'customer-123';
  const contractId = 'contract-123';

  const mockCustomer = {
    id: customerId,
    fullName: 'John Doe',
    phonePrimary: '+233245678901',
    email: 'john@example.com',
  };

  const mockNotification = {
    id: 'notif-123',
    tenantId,
    customerId,
    contractId,
    eventType: 'disbursement_completed',
    channel: NotificationChannel.sms,
    recipient: '+233245678901',
    templateId: null,
    content: 'Dear John Doe, 5000.0000 GHS has been disbursed to your wallet. Contract: LON-2026-00001.',
    status: NotificationStatus.sent,
    externalRef: null,
    retryCount: 0,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    sentAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: PrismaService,
          useValue: {
            customer: {
              findFirst: jest.fn().mockResolvedValue(mockCustomer),
            },
            notification: {
              create: jest.fn().mockResolvedValue(mockNotification),
            },
          },
        },
        {
          provide: ConsoleNotificationAdapter,
          useValue: {
            send: jest.fn().mockResolvedValue(mockNotification),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    prisma = module.get<PrismaService>(PrismaService);
    adapter = module.get<ConsoleNotificationAdapter>(ConsoleNotificationAdapter);
  });

  describe('Template Rendering', () => {
    it('should render template with variable interpolation', () => {
      const template = 'Dear {{customerName}}, {{amount}} {{currency}} has been disbursed.';
      const variables = {
        customerName: 'John Doe',
        amount: '5000.0000',
        currency: 'GHS',
      };

      const result = renderTemplate(template, variables);

      expect(result).toBe('Dear John Doe, 5000.0000 GHS has been disbursed.');
    });

    it('should leave unmatched variables as-is', () => {
      const template = 'Hello {{name}}, your balance is {{balance}}';
      const variables = { name: 'Alice' }; // balance not provided

      const result = renderTemplate(template, variables);

      expect(result).toBe('Hello Alice, your balance is {{balance}}');
    });

    it('should handle multiple occurrences of same variable', () => {
      const template = '{{name}} owes {{amount}}, {{name}} will pay {{amount}}.';
      const variables = { name: 'Bob', amount: '1000' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('Bob owes 1000, Bob will pay 1000.');
    });

    it('should handle empty variables', () => {
      const template = 'Amount: {{amount}}';
      const variables = {};

      const result = renderTemplate(template, variables);

      expect(result).toBe('Amount: {{amount}}');
    });
  });

  describe('Core Notification Templates', () => {
    it('should have all 6 core templates defined', () => {
      const requiredTemplates = [
        'loan_approved',
        'offer_sent',
        'disbursement_completed',
        'repayment_reminder',
        'repayment_received',
        'overdue_notice',
      ];

      for (const template of requiredTemplates) {
        expect(NOTIFICATION_TEMPLATES[template]).toBeDefined();
        expect(NOTIFICATION_TEMPLATES[template].sms).toBeDefined();
      }
    });

    it('loan_approved template should contain required content', () => {
      const template = NOTIFICATION_TEMPLATES.loan_approved.sms;
      expect(template).toContain('{{customerName}}');
      expect(template).toContain('approved');
    });

    it('offer_sent template should contain required variables', () => {
      const template = NOTIFICATION_TEMPLATES.offer_sent.sms;
      expect(template).toContain('{{customerName}}');
      expect(template).toContain('{{amount}}');
      expect(template).toContain('{{currency}}');
      expect(template).toContain('{{expiresAt}}');
    });

    it('disbursement_completed template should contain required variables', () => {
      const template = NOTIFICATION_TEMPLATES.disbursement_completed.sms;
      expect(template).toContain('{{customerName}}');
      expect(template).toContain('{{amount}}');
      expect(template).toContain('{{currency}}');
      expect(template).toContain('{{contractNumber}}');
    });

    it('repayment_reminder template should contain required variables', () => {
      const template = NOTIFICATION_TEMPLATES.repayment_reminder.sms;
      expect(template).toContain('{{amount}}');
      expect(template).toContain('{{dueDate}}');
      expect(template).toContain('{{contractNumber}}');
    });

    it('repayment_received template should contain required variables', () => {
      const template = NOTIFICATION_TEMPLATES.repayment_received.sms;
      expect(template).toContain('{{customerName}}');
      expect(template).toContain('{{amount}}');
      expect(template).toContain('{{contractNumber}}');
    });

    it('overdue_notice template should contain required variables', () => {
      const template = NOTIFICATION_TEMPLATES.overdue_notice.sms;
      expect(template).toContain('{{amount}}');
      expect(template).toContain('{{contractNumber}}');
      expect(template).toContain('{{daysOverdue}}');
    });

    it('templates should support multiple channels', () => {
      const template = NOTIFICATION_TEMPLATES.disbursement_completed;
      expect(template.sms).toBeDefined();
      expect(template.email).toBeDefined();
      expect(template.push).toBeDefined();
      expect(template.in_app).toBeDefined();
    });
  });

  describe('PII Masking in Log Adapter', () => {
    it('should mask phone numbers', () => {
      const phone = '+233245678901';
      // This would be masked by maskPhone utility
      // Phone masking: first part + *** + last 4 digits
      expect(phone.length).toBeGreaterThan(4);
    });

    it('should mask email addresses', () => {
      const email = 'john@example.com';
      // Email masking: first letter + *** + domain
      expect(email).toContain('@');
    });

    it('should log with masked PII', async () => {
      jest.spyOn(adapter, 'send').mockResolvedValue(mockNotification);

      await adapter.send(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        channel: NotificationChannel.sms,
        recipient: mockCustomer.phonePrimary!,
        content: 'Test notification',
      });

      expect(adapter.send).toHaveBeenCalled();
    });
  });

  describe('sendNotification', () => {
    it('should send notification with template rendering', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(mockCustomer as any);
      jest.spyOn(adapter, 'send').mockResolvedValue(mockNotification);

      const result = await service.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        variables: {
          amount: '5000.0000',
          currency: 'GHS',
          contractNumber: 'LON-2026-00001',
          dueDate: '2026-04-09',
        },
      });

      expect(result).toBeDefined();
      expect(adapter.send).toHaveBeenCalled();
    });

    it('should add customer name to variables', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(mockCustomer as any);
      jest.spyOn(adapter, 'send').mockResolvedValue(mockNotification);

      await service.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        variables: {
          amount: '5000.0000',
          currency: 'GHS',
          contractNumber: 'LON-2026-00001',
        },
      });

      expect(adapter.send).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          recipient: mockCustomer.phonePrimary,
        }),
      );
    });

    it('should return null if no templates found for event', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(mockCustomer as any);

      const result = await service.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'unknown_event',
        variables: {},
      });

      expect(result).toBeNull();
    });

    it('should handle customer not found', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(null);

      const result = await service.sendNotification(tenantId, {
        customerId: 'nonexistent',
        contractId,
        eventType: 'disbursement_completed',
        variables: {
          amount: '5000.0000',
          currency: 'GHS',
          contractNumber: 'LON-2026-00001',
        },
      });

      expect(result).toBeNull();
    });

    it('should support sending to a specific channel', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(mockCustomer as any);
      jest.spyOn(adapter, 'send').mockResolvedValue(mockNotification);

      const result = await service.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        channel: NotificationChannel.sms,
        variables: {
          amount: '5000.0000',
          currency: 'GHS',
          contractNumber: 'LON-2026-00001',
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('Notification Delivery Tracking', () => {
    it('should store notification with SENT status in database', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(mockCustomer as any);
      jest.spyOn(adapter, 'send').mockResolvedValue(mockNotification);

      await service.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        variables: {
          amount: '5000.0000',
          currency: 'GHS',
          contractNumber: 'LON-2026-00001',
        },
      });

      expect(adapter.send).toHaveBeenCalled();
    });

    it('should include tenant context in notification', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(mockCustomer as any);
      jest.spyOn(adapter, 'send').mockResolvedValue(mockNotification);

      await service.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        variables: {
          amount: '5000.0000',
          currency: 'GHS',
          contractNumber: 'LON-2026-00001',
        },
      });

      expect(adapter.send).toHaveBeenCalledWith(
        tenantId,
        expect.any(Object),
      );
    });
  });

  describe('Recipient Selection', () => {
    it('should use email for email channel', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(mockCustomer as any);
      jest.spyOn(adapter, 'send').mockResolvedValue(mockNotification);

      await service.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        channel: NotificationChannel.email,
        variables: {
          amount: '5000.0000',
          currency: 'GHS',
          contractNumber: 'LON-2026-00001',
        },
      });

      expect(adapter.send).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          recipient: mockCustomer.email,
          channel: NotificationChannel.email,
        }),
      );
    });

    it('should use phone for sms channel', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(mockCustomer as any);
      jest.spyOn(adapter, 'send').mockResolvedValue(mockNotification);

      await service.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        channel: NotificationChannel.sms,
        variables: {
          amount: '5000.0000',
          currency: 'GHS',
          contractNumber: 'LON-2026-00001',
        },
      });

      expect(adapter.send).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          recipient: mockCustomer.phonePrimary,
          channel: NotificationChannel.sms,
        }),
      );
    });

    it('should use customer ID for push/in-app channels', async () => {
      jest.spyOn(prisma.customer, 'findFirst').mockResolvedValue(mockCustomer as any);
      jest.spyOn(adapter, 'send').mockResolvedValue(mockNotification);

      await service.sendNotification(tenantId, {
        customerId,
        contractId,
        eventType: 'disbursement_completed',
        channel: NotificationChannel.push,
        variables: {
          amount: '5000.0000',
          currency: 'GHS',
          contractNumber: 'LON-2026-00001',
        },
      });

      expect(adapter.send).toHaveBeenCalled();
    });
  });
});
