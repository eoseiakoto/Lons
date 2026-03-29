import { WebhookDeliveryExhaustedListener } from '../webhook-delivery-exhausted.listener';

describe('WebhookDeliveryExhaustedListener', () => {
  let listener: WebhookDeliveryExhaustedListener;
  let mockPrisma: any;
  let mockEmailAdapter: any;

  const basePayload = {
    endpointId: 'ep-1',
    deliveryLogId: 'dl-1',
    event: 'contract.created',
    lastError: 'Connection refused',
    retryCount: 5,
  };

  beforeEach(() => {
    mockPrisma = {
      webhookEndpoint: {
        findUnique: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    };

    mockEmailAdapter = {
      send: jest.fn().mockResolvedValue({}),
    };

    listener = new WebhookDeliveryExhaustedListener(mockPrisma, mockEmailAdapter);
  });

  it('should send email to tenant admin users when delivery is exhausted', async () => {
    mockPrisma.webhookEndpoint.findUnique.mockResolvedValue({
      tenantId: 'tenant-1',
      url: 'https://example.com/webhook',
    });

    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', email: 'admin@example.com', name: 'Admin' },
      { id: 'user-2', email: 'ops@example.com', name: 'Ops' },
    ]);

    await listener.handleExhaustedDelivery(basePayload);

    expect(mockEmailAdapter.send).toHaveBeenCalledTimes(2);
    expect(mockEmailAdapter.send).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        customerId: 'user-1',
        eventType: 'webhook.delivery_exhausted',
        recipient: 'admin@example.com',
        subject: expect.stringContaining('Webhook delivery failed permanently'),
        content: expect.stringContaining('https://example.com/webhook'),
      }),
    );
  });

  it('should handle missing webhook endpoint gracefully', async () => {
    mockPrisma.webhookEndpoint.findUnique.mockResolvedValue(null);

    await listener.handleExhaustedDelivery(basePayload);

    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    expect(mockEmailAdapter.send).not.toHaveBeenCalled();
  });

  it('should handle no admin users gracefully', async () => {
    mockPrisma.webhookEndpoint.findUnique.mockResolvedValue({
      tenantId: 'tenant-1',
      url: 'https://example.com/webhook',
    });

    mockPrisma.user.findMany.mockResolvedValue([]);

    await listener.handleExhaustedDelivery(basePayload);

    expect(mockEmailAdapter.send).not.toHaveBeenCalled();
  });

  it('should not propagate email sending failures', async () => {
    mockPrisma.webhookEndpoint.findUnique.mockResolvedValue({
      tenantId: 'tenant-1',
      url: 'https://example.com/webhook',
    });

    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', email: 'admin@example.com', name: 'Admin' },
    ]);

    mockEmailAdapter.send.mockRejectedValue(new Error('SMTP down'));

    await expect(
      listener.handleExhaustedDelivery(basePayload),
    ).resolves.toBeUndefined();
  });

  it('should include delivery details in email content', async () => {
    mockPrisma.webhookEndpoint.findUnique.mockResolvedValue({
      tenantId: 'tenant-1',
      url: 'https://hooks.example.com/events',
    });

    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', email: 'admin@example.com', name: 'Admin' },
    ]);

    await listener.handleExhaustedDelivery(basePayload);

    const sentContent = mockEmailAdapter.send.mock.calls[0][1].content;
    expect(sentContent).toContain('5 retry attempts');
    expect(sentContent).toContain('contract.created');
    expect(sentContent).toContain('dl-1');
    expect(sentContent).toContain('Connection refused');
  });
});
