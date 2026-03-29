import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@lons/database';
import { Logger } from '@nestjs/common';
import { RecordingNotificationAdapter } from './recording-notification.adapter';

describe('RecordingNotificationAdapter', () => {
  let adapter: RecordingNotificationAdapter;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance;

  const tenantId = 'tenant-001';
  const mockRecord = {
    id: 'mock-log-001',
    tenantId,
    channel: 'sms',
    recipient: '+233245678901',
    templateId: 'tpl-welcome',
    renderedContent: 'Hello, your loan is approved.',
    status: 'SENT',
    correlationId: 'corr-123',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordingNotificationAdapter,
        {
          provide: PrismaService,
          useValue: {
            notificationMockLog: {
              create: jest.fn().mockResolvedValue(mockRecord),
            },
          },
        },
      ],
    }).compile();

    adapter = module.get<RecordingNotificationAdapter>(RecordingNotificationAdapter);
    prisma = module.get<PrismaService>(PrismaService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('should create a record in notificationMockLog with correct data shape', async () => {
    await adapter.send(tenantId, {
      customerId: 'cust-001',
      contractId: 'contract-001',
      eventType: 'disbursement_completed',
      channel: 'sms',
      recipient: '+233245678901',
      content: 'Hello, your loan is approved.',
      correlationId: 'corr-123',
      templateId: 'tpl-welcome',
    });

    expect(prisma.notificationMockLog.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        channel: 'sms',
        recipient: '+233245678901',
        templateId: 'tpl-welcome',
        renderedContent: 'Hello, your loan is approved.',
        status: 'SENT',
        correlationId: 'corr-123',
      },
    });
  });

  it('should return success with messageId from created record', async () => {
    const result = await adapter.send(tenantId, {
      customerId: 'cust-001',
      eventType: 'repayment_reminder',
      channel: 'sms',
      recipient: '+233245678901',
      content: 'Payment due tomorrow.',
    });

    expect(result).toEqual({
      success: true,
      messageId: mockRecord.id,
    });
  });

  it('should log the send operation', async () => {
    await adapter.send(tenantId, {
      customerId: 'cust-001',
      eventType: 'offer_sent',
      channel: 'sms',
      recipient: '+233245678901',
      content: 'You have a new offer.',
      templateId: 'tpl-offer',
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RECORDING]'),
    );
  });
});
