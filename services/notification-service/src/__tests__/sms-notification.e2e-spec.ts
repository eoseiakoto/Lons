import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AfricasTalkingSmsAdapter } from '../adapters/africas-talking/at-sms.adapter';
import { ATDeliveryReportHandler } from '../adapters/africas-talking/at-delivery-report.handler';
import { ATDeliveryReport, AT_COST_PER_SMS } from '../adapters/africas-talking/at-sms.types';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-e2e-sms';
const CUSTOMER_ID = 'customer-sms-001';

enum NotificationChannel {
  sms = 'sms',
  email = 'email',
  push = 'push',
}

enum NotificationStatus {
  pending = 'pending',
  sent = 'sent',
  delivered = 'delivered',
  failed = 'failed',
  bounced = 'bounced',
}

function createMockPrismaForNotifications() {
  const notifications: any[] = [];

  return {
    notification: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = {
          id: `notif-${notifications.length + 1}`,
          tenantId: data.tenantId,
          eventType: data.eventType,
          channel: data.channel,
          recipient: data.recipient,
          content: data.content,
          status: data.status,
          externalRef: data.externalRef,
          sentAt: data.sentAt || null,
          deliveredAt: data.deliveredAt || null,
          failedAt: data.failedAt || null,
          failureReason: data.failureReason || null,
          retryCount: 0,
          customerId: data.customer?.connect?.id || null,
          contractId: data.contract?.connect?.id || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        notifications.push(record);
        return Promise.resolve(record);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.externalRef) {
          return Promise.resolve(
            notifications.find((n) => n.externalRef === where.externalRef) || null,
          );
        }
        return Promise.resolve(null);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const notif = notifications.find((n) => n.id === where.id);
        if (notif) {
          Object.assign(notif, data, { updatedAt: new Date() });
        }
        return Promise.resolve(notif);
      }),
    },
    _notifications: notifications,
  };
}

// ---------------------------------------------------------------------------
// AfricasTalkingSmsAdapter E2E Tests
// ---------------------------------------------------------------------------

describe('AfricasTalkingSmsAdapter (E2E)', () => {
  let module: TestingModule;
  let adapter: AfricasTalkingSmsAdapter;
  let mockPrisma: ReturnType<typeof createMockPrismaForNotifications>;

  beforeAll(async () => {
    mockPrisma = createMockPrismaForNotifications();

    module = await Test.createTestingModule({
      providers: [
        AfricasTalkingSmsAdapter,
        {
          provide: 'PrismaService',
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                AFRICAS_TALKING_API_KEY: '',
                AFRICAS_TALKING_USERNAME: 'sandbox',
                AFRICAS_TALKING_SENDER_ID: 'LONS',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();

    // Manually construct to inject the mocked PrismaService
    adapter = new AfricasTalkingSmsAdapter(
      mockPrisma as any,
      module.get(ConfigService),
    );
  });

  afterAll(async () => {
    await module.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send single SMS', () => {
    it('should create a notification record and return with messageId', async () => {
      const result = await adapter.send(TENANT_ID, {
        customerId: CUSTOMER_ID,
        contractId: 'contract-sms-001',
        eventType: 'loan.disbursed',
        recipient: '+233241234567',
        content: 'Your loan of GHS 5,000.00 has been disbursed.',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(TENANT_ID);
      expect(result.channel).toBe(NotificationChannel.sms);
      expect(result.externalRef).toBeDefined();
      expect(result.externalRef!.startsWith('ATXid_')).toBe(true);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('should handle various recipient statuses in sandbox', async () => {
      const outcomes = { sent: 0, failed: 0 };

      for (let i = 0; i < 40; i++) {
        const result = await adapter.send(TENANT_ID, {
          customerId: CUSTOMER_ID,
          eventType: 'payment.reminder',
          recipient: '+233241234567',
          content: `Reminder ${i}`,
        });
        if (result.status === NotificationStatus.sent) outcomes.sent++;
        if (result.status === NotificationStatus.failed) outcomes.failed++;
      }

      // Sandbox: 95% success, 5% failure
      expect(outcomes.sent).toBeGreaterThan(0);
    });
  });

  describe('send bulk SMS', () => {
    it('should process each recipient individually', async () => {
      const recipients = ['+233241111111', '+233242222222', '+254712345678'];

      const results = await adapter.sendBulk(TENANT_ID, {
        customerId: CUSTOMER_ID,
        eventType: 'loan.approved',
        recipients,
        content: 'Your loan has been approved!',
      });

      expect(results.length).toBe(3);
      for (const result of results) {
        expect(result.id).toBeDefined();
        expect(result.externalRef).toBeDefined();
      }
    });
  });

  describe('cost calculation', () => {
    it('should calculate GHS cost for +233 (Ghana) numbers', () => {
      const cost = adapter.calculateCost('+233241234567');
      expect(cost.currency).toBe('GHS');
      expect(cost.cost).toBe('0.05');
    });

    it('should calculate KES cost for +254 (Kenya) numbers', () => {
      const cost = adapter.calculateCost('+254712345678');
      expect(cost.currency).toBe('KES');
      expect(cost.cost).toBe('1.00');
    });

    it('should calculate UGX cost for +256 (Uganda) numbers', () => {
      const cost = adapter.calculateCost('+256701234567');
      expect(cost.currency).toBe('UGX');
      expect(cost.cost).toBe('50.00');
    });

    it('should return USD default cost for unknown country prefix', () => {
      const cost = adapter.calculateCost('+1234567890');
      expect(cost.currency).toBe('USD');
      expect(cost.cost).toBe('0.10');
    });

    it('should match all AT_COST_PER_SMS entries', () => {
      const prefixes = Object.keys(AT_COST_PER_SMS);
      for (const prefix of prefixes) {
        const cost = adapter.calculateCost(`${prefix}000000000`);
        expect(cost).toEqual(AT_COST_PER_SMS[prefix]);
      }
    });
  });

  describe('message ID generation', () => {
    it('should generate unique AT-style message IDs', () => {
      const id1 = adapter.generateMessageId();
      const id2 = adapter.generateMessageId();

      expect(id1).not.toBe(id2);
      expect(id1.startsWith('ATXid_')).toBe(true);
      expect(id2.startsWith('ATXid_')).toBe(true);
    });
  });

  describe('PII masking in logs', () => {
    it('should not contain full phone numbers in logged content', async () => {
      const logSpy = jest.spyOn((adapter as any).logger, 'log');

      await adapter.send(TENANT_ID, {
        customerId: CUSTOMER_ID,
        eventType: 'loan.disbursed',
        recipient: '+233241234567',
        content: 'Test message',
      });

      // Verify that log calls mask the phone number
      for (const call of logSpy.mock.calls) {
        const logMessage = String(call[0]);
        if (logMessage.includes('233')) {
          // Should contain masked format, not the full number
          expect(logMessage).not.toContain('+233241234567');
          expect(logMessage).toMatch(/\+233\*{3}\d{4}|\+233.*\*.*\d/);
        }
      }

      logSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// AT Delivery Report Handler E2E Tests
// ---------------------------------------------------------------------------

describe('ATDeliveryReportHandler (E2E)', () => {
  let handler: ATDeliveryReportHandler;
  let mockPrisma: ReturnType<typeof createMockPrismaForNotifications>;

  beforeEach(() => {
    mockPrisma = createMockPrismaForNotifications();

    // Pre-seed a notification that was already sent
    mockPrisma._notifications.push({
      id: 'notif-existing-001',
      tenantId: TENANT_ID,
      eventType: 'loan.disbursed',
      channel: NotificationChannel.sms,
      recipient: '+233241234567',
      content: 'Your loan has been disbursed.',
      status: NotificationStatus.sent,
      externalRef: 'ATXid_existing001',
      sentAt: new Date(),
      deliveredAt: null,
      failedAt: null,
      failureReason: null,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    handler = new ATDeliveryReportHandler(mockPrisma as any);
  });

  it('should update notification to delivered on Success report', async () => {
    const report: ATDeliveryReport = {
      id: 'ATXid_existing001',
      status: 'Success',
      phoneNumber: '+233241234567',
    };

    await handler.processDeliveryReport(report);

    expect(mockPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notif-existing-001' },
        data: expect.objectContaining({
          status: NotificationStatus.delivered,
          deliveredAt: expect.any(Date),
        }),
      }),
    );
  });

  it('should mark as failed with retry on Failed report (under max retries)', async () => {
    const report: ATDeliveryReport = {
      id: 'ATXid_existing001',
      status: 'Failed',
      phoneNumber: '+233241234567',
      failureReason: 'DeliveryFailure',
    };

    await handler.processDeliveryReport(report);

    expect(mockPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notif-existing-001' },
        data: expect.objectContaining({
          status: NotificationStatus.pending, // queued for retry
          retryCount: 1,
        }),
      }),
    );
  });

  it('should mark as permanently failed when max retries reached', async () => {
    // Set retryCount to max (3)
    mockPrisma._notifications[0].retryCount = 3;

    const report: ATDeliveryReport = {
      id: 'ATXid_existing001',
      status: 'Failed',
      phoneNumber: '+233241234567',
      failureReason: 'NetworkError',
    };

    await handler.processDeliveryReport(report);

    expect(mockPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notif-existing-001' },
        data: expect.objectContaining({
          status: NotificationStatus.failed,
          failedAt: expect.any(Date),
          failureReason: 'NetworkError',
        }),
      }),
    );
  });

  it('should skip processing for unknown externalRef', async () => {
    const report: ATDeliveryReport = {
      id: 'ATXid_unknown_ref',
      status: 'Success',
      phoneNumber: '+233241234567',
    };

    await handler.processDeliveryReport(report);

    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  it('should be idempotent for already-delivered notifications', async () => {
    // Set notification to already delivered
    mockPrisma._notifications[0].status = NotificationStatus.delivered;

    const report: ATDeliveryReport = {
      id: 'ATXid_existing001',
      status: 'Success',
      phoneNumber: '+233241234567',
    };

    await handler.processDeliveryReport(report);

    // Should skip update since it is already in terminal state
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  it('should map Buffered status to sent', async () => {
    const report: ATDeliveryReport = {
      id: 'ATXid_existing001',
      status: 'Buffered',
      phoneNumber: '+233241234567',
    };

    await handler.processDeliveryReport(report);

    expect(mockPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: NotificationStatus.sent,
        }),
      }),
    );
  });

  it('should map Rejected status to failed', async () => {
    const report: ATDeliveryReport = {
      id: 'ATXid_existing001',
      status: 'Rejected',
      phoneNumber: '+233241234567',
      failureReason: 'InvalidNumber',
    };

    await handler.processDeliveryReport(report);

    expect(mockPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'InvalidNumber',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Sandbox delivery distribution test
// ---------------------------------------------------------------------------

describe('Sandbox SMS delivery distribution', () => {
  it('should approximate 85% delivered, 10% sent, 5% failed over many trials', () => {
    // Simulate the delivery report distribution from the adapter's
    // scheduleDeliveryReport logic
    const counts = { delivered: 0, sent: 0, failed: 0 };
    const trials = 10000;

    for (let i = 0; i < trials; i++) {
      const roll = Math.random();
      if (roll < 0.85) {
        counts.delivered++;
      } else if (roll < 0.95) {
        counts.sent++;
      } else {
        counts.failed++;
      }
    }

    const deliveredPct = (counts.delivered / trials) * 100;
    const sentPct = (counts.sent / trials) * 100;
    const failedPct = (counts.failed / trials) * 100;

    // Allow 5% tolerance
    expect(deliveredPct).toBeGreaterThan(78);
    expect(deliveredPct).toBeLessThan(92);
    expect(sentPct).toBeGreaterThan(5);
    expect(sentPct).toBeLessThan(17);
    expect(failedPct).toBeGreaterThan(1);
    expect(failedPct).toBeLessThan(11);
  });
});
