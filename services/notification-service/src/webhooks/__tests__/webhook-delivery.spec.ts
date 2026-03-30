import { WebhookDeliveryService } from '../webhook-delivery.service';
import { WebhookSigner } from '../webhook-signer';

const mockCreate = jest.fn();
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

const mockPrisma = {
  webhookEndpoint: {
    findMany: mockFindMany,
  },
  webhookDeliveryLog: {
    create: mockCreate,
    findUnique: mockFindUnique,
    update: mockUpdate,
  },
};

const mockSigner = {
  sign: jest.fn().mockReturnValue({
    signature: 'abc123def456',
    timestamp: 1700000000,
    signedPayload: '1700000000.{}',
  }),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

describe('WebhookDeliveryService', () => {
  let service: WebhookDeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebhookDeliveryService(
      mockPrisma as any,
      mockSigner as unknown as WebhookSigner,
      mockEventEmitter as any,
      mockQueue as any,
    );
  });

  describe('fanOutEvent', () => {
    it('should create a delivery log for each matching active endpoint', async () => {
      const endpoints = [
        { id: 'ep-1', tenantId: 'tenant-1', url: 'https://example.com/hook', secret: 's3cr3t', events: ['contract.state_changed'], active: true },
        { id: 'ep-2', tenantId: 'tenant-1', url: 'https://other.com/hook', secret: 's3cr3t2', events: ['contract.state_changed'], active: true },
      ];
      mockFindMany.mockResolvedValue(endpoints);

      const createdLog = { id: 'log-1', retryCount: 0, status: 'pending', webhookEndpoint: endpoints[0] };
      mockCreate.mockResolvedValue(createdLog);

      // Make attemptDelivery a no-op for this test
      const attemptSpy = jest
        .spyOn(service, 'attemptDelivery')
        .mockResolvedValue(undefined);

      await service.fanOutEvent('tenant-1', 'contract.state_changed', { contractId: 'c-1' });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          active: true,
          deletedAt: null,
          events: { has: 'contract.state_changed' },
        },
      });

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(attemptSpy).toHaveBeenCalledTimes(2);
    });

    it('should not create delivery logs when no matching endpoints exist', async () => {
      mockFindMany.mockResolvedValue([]);

      await service.fanOutEvent('tenant-1', 'loan.disbursed', {});

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('attemptDelivery', () => {
    it('should mark log as delivered on HTTP 200 success', async () => {
      const endpoint = { id: 'ep-1', url: 'https://example.com/hook', secret: 's3cr3t' };
      const log = {
        id: 'log-1',
        status: 'pending',
        retryCount: 0,
        payload: { event: 'test' },
        webhookEndpoint: endpoint,
      };
      mockFindUnique.mockResolvedValue(log);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'OK',
      }) as any;

      await service.attemptDelivery('log-1');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: expect.objectContaining({
          status: 'delivered',
          httpStatus: 200,
          deliveredAt: expect.any(Date),
        }),
      });
    });

    it('should skip logs already delivered', async () => {
      mockFindUnique.mockResolvedValue({ id: 'log-1', status: 'delivered' });

      await service.attemptDelivery('log-1');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should mark log as exhausted after max retries exceeded', async () => {
      const RETRY_DELAYS_LENGTH = 5; // matches service RETRY_DELAYS
      const endpoint = { id: 'ep-1', url: 'https://example.com/hook', secret: 's3cr3t' };
      const log = {
        id: 'log-99',
        status: 'failed',
        retryCount: RETRY_DELAYS_LENGTH - 1, // last allowed retry
        payload: { event: 'test' },
        webhookEndpoint: endpoint,
      };
      mockFindUnique
        .mockResolvedValueOnce(log)
        .mockResolvedValueOnce({ webhookEndpointId: 'ep-1', event: 'test' });

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      }) as any;

      await service.attemptDelivery('log-99');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'log-99' },
        data: expect.objectContaining({
          status: 'exhausted',
          httpStatus: 500,
        }),
      });
    });

    it('should schedule next retry on HTTP failure with retries remaining', async () => {
      const endpoint = { id: 'ep-1', url: 'https://example.com/hook', secret: 's3cr3t' };
      const log = {
        id: 'log-2',
        status: 'pending',
        retryCount: 0,
        payload: { event: 'test' },
        webhookEndpoint: endpoint,
      };
      mockFindUnique.mockResolvedValue(log);

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      }) as any;

      await service.attemptDelivery('log-2');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'log-2' },
        data: expect.objectContaining({
          status: 'failed',
          httpStatus: 503,
          retryCount: 1,
          nextRetryAt: expect.any(Date),
        }),
      });
    });
  });
});
