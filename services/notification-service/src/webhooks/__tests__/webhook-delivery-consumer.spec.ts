import { WebhookDeliveryConsumer } from '../webhook-delivery.consumer';
import { WebhookDeliveryService } from '../webhook-delivery.service';
import { Job } from 'bullmq';

describe('WebhookDeliveryConsumer', () => {
  let consumer: WebhookDeliveryConsumer;
  let mockDeliveryService: jest.Mocked<Pick<WebhookDeliveryService, 'attemptDelivery'>>;

  beforeEach(() => {
    mockDeliveryService = {
      attemptDelivery: jest.fn().mockResolvedValue(undefined),
    };
    consumer = new WebhookDeliveryConsumer(
      mockDeliveryService as unknown as WebhookDeliveryService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call attemptDelivery with the correct deliveryLogId', async () => {
    const job = {
      id: 'job-1',
      data: { deliveryLogId: 'log-abc-123' },
    } as Job<{ deliveryLogId: string }>;

    await consumer.process(job);

    expect(mockDeliveryService.attemptDelivery).toHaveBeenCalledTimes(1);
    expect(mockDeliveryService.attemptDelivery).toHaveBeenCalledWith('log-abc-123');
  });

  it('should propagate errors from attemptDelivery', async () => {
    mockDeliveryService.attemptDelivery.mockRejectedValue(
      new Error('delivery failed'),
    );

    const job = {
      id: 'job-2',
      data: { deliveryLogId: 'log-xyz-789' },
    } as Job<{ deliveryLogId: string }>;

    await expect(consumer.process(job)).rejects.toThrow('delivery failed');
  });
});

describe('WebhookDeliveryService queue integration', () => {
  it('should add a delayed job to the queue on failure with retries remaining', async () => {
    const mockQueueAdd = jest.fn().mockResolvedValue(undefined);
    const mockQueue = { add: mockQueueAdd } as any;

    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const mockFindUnique = jest.fn().mockResolvedValue({
      id: 'log-1',
      status: 'pending',
      retryCount: 0,
      webhookEndpoint: {
        id: 'ep-1',
        url: 'https://example.com/webhook',
        secret: 'secret123',
      },
    });
    const mockPrisma = {
      webhookEndpoint: { findMany: jest.fn() },
      webhookDeliveryLog: {
        create: jest.fn(),
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
    };
    const mockSigner = {
      sign: jest.fn().mockReturnValue({
        signature: 'sig',
        timestamp: 1700000000,
      }),
    };
    const mockEventEmitter = { emit: jest.fn() };

    // Import the actual service to test queue integration
    const { WebhookDeliveryService } = await import('../webhook-delivery.service');
    const service = new WebhookDeliveryService(
      mockPrisma as any,
      mockSigner as any,
      mockEventEmitter as any,
      mockQueue,
    );

    // Mock fetch to return a non-ok response
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: jest.fn().mockResolvedValue('Bad Gateway'),
    }) as any;

    try {
      await service.attemptDelivery('log-1');

      // Should have updated the DB with failed status
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'log-1' },
          data: expect.objectContaining({
            status: 'failed',
            retryCount: 1,
          }),
        }),
      );

      // Should have added a delayed job to the queue
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'retry',
        { deliveryLogId: 'log-1' },
        expect.objectContaining({
          delay: 300000, // RETRY_DELAYS[1] = 300 seconds = 300000ms
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: 100,
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should NOT add a queue job when retries are exhausted', async () => {
    const mockQueueAdd = jest.fn().mockResolvedValue(undefined);
    const mockQueue = { add: mockQueueAdd } as any;

    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const mockFindUnique = jest.fn()
      .mockResolvedValueOnce({
        id: 'log-2',
        status: 'failed',
        retryCount: 4, // Already at retry 4, next will be 5 which >= RETRY_DELAYS.length (5)
        webhookEndpoint: {
          id: 'ep-1',
          url: 'https://example.com/webhook',
          secret: 'secret123',
        },
      })
      .mockResolvedValueOnce({
        webhookEndpointId: 'ep-1',
        event: 'test.event',
      });
    const mockPrisma = {
      webhookEndpoint: { findMany: jest.fn() },
      webhookDeliveryLog: {
        create: jest.fn(),
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
    };
    const mockSigner = {
      sign: jest.fn().mockReturnValue({
        signature: 'sig',
        timestamp: 1700000000,
      }),
    };
    const mockEventEmitter = { emit: jest.fn() };

    const { WebhookDeliveryService } = await import('../webhook-delivery.service');
    const service = new WebhookDeliveryService(
      mockPrisma as any,
      mockSigner as any,
      mockEventEmitter as any,
      mockQueue,
    );

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    }) as any;

    try {
      await service.attemptDelivery('log-2');

      // Should have updated status to exhausted
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'log-2' },
          data: expect.objectContaining({
            status: 'exhausted',
            retryCount: 5,
          }),
        }),
      );

      // Should NOT have added a queue job
      expect(mockQueueAdd).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
