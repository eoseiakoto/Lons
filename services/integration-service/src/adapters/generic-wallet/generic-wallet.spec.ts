import { GenericWalletAdapter } from './generic-wallet.adapter';
import { IWalletAdapterConfig } from './generic-wallet.types';

describe('GenericWalletAdapter', () => {
  let adapter: GenericWalletAdapter;

  const mockConfig: IWalletAdapterConfig = {
    providerId: 'test-provider-id',
    name: 'TestWallet',
    baseUrl: 'https://api.testwallet.com',
    auth: {
      type: 'api_key',
      credentials: { apiKey: 'test-key-123' },
      apiKeyHeader: 'X-API-Key',
    },
    endpoints: {
      disburse: {
        method: 'POST',
        path: '/v1/transfer',
        bodyMapping: {
          'payee.msisdn': '$destination',
          'amount.value': '$amount',
          'amount.currency': '$currency',
          'externalId': '$reference',
        },
      },
      collect: {
        method: 'POST',
        path: '/v1/collect',
        bodyMapping: {
          'payer.msisdn': '$source',
          'amount.value': '$amount',
          'amount.currency': '$currency',
          'externalId': '$reference',
        },
      },
      balance: { method: 'GET', path: '/v1/balance' },
      status: { method: 'GET', path: '/v1/status' },
    },
    responseMapping: {
      referenceField: 'data.transactionId',
      statusField: 'data.status',
      statusValues: {
        success: 'SUCCESSFUL',
        pending: 'PENDING',
        failed: 'FAILED',
      },
    },
    resilience: {
      timeoutMs: 30000,
      maxRetries: 3,
      circuitBreakerThreshold: 5,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenericWalletAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('development'),
          },
        },
      ],
    }).compile();

    adapter = module.get<GenericWalletAdapter>(GenericWalletAdapter);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('buildRequestBody', () => {
    it('should map flat fields from params', () => {
      const mapping = {
        externalId: '$reference',
        amount: '$amount',
      };
      const params = { reference: 'REF-001', amount: '1000.00' };

      const result = adapter.buildRequestBody(mapping, params);

      expect(result).toEqual({
        externalId: 'REF-001',
        amount: '1000.00',
      });
    });

    it('should map nested fields from params', () => {
      const mapping = {
        'payee.msisdn': '$destination',
        'amount.value': '$amount',
        'amount.currency': '$currency',
      };
      const params = { destination: '+233245678901', amount: '500.00', currency: 'GHS' };

      const result = adapter.buildRequestBody(mapping, params);

      expect(result).toEqual({
        payee: { msisdn: '+233245678901' },
        amount: { value: '500.00', currency: 'GHS' },
      });
    });

    it('should handle static values (no $ prefix)', () => {
      const mapping = {
        type: 'DISBURSEMENT',
        channel: 'MOBILE_MONEY',
        ref: '$reference',
      };
      const params = { reference: 'REF-002' };

      const result = adapter.buildRequestBody(mapping, params);

      expect(result).toEqual({
        type: 'DISBURSEMENT',
        channel: 'MOBILE_MONEY',
        ref: 'REF-002',
      });
    });
  });

  describe('transformResponse', () => {
    it('should parse a successful response', () => {
      const response = {
        data: {
          transactionId: 'TXN-12345',
          status: 'SUCCESSFUL',
        },
      };

      const result = adapter.transformResponse(response, mockConfig);

      expect(result.success).toBe(true);
      expect(result.externalRef).toBe('TXN-12345');
      expect(result.failureReason).toBeUndefined();
    });

    it('should parse a pending response as success', () => {
      const response = {
        data: {
          transactionId: 'TXN-67890',
          status: 'PENDING',
        },
      };

      const result = adapter.transformResponse(response, mockConfig);

      expect(result.success).toBe(true);
      expect(result.externalRef).toBe('TXN-67890');
    });

    it('should parse a failed response', () => {
      const response = {
        data: {
          transactionId: 'TXN-FAIL',
          status: 'FAILED',
        },
      };

      const result = adapter.transformResponse(response, mockConfig);

      expect(result.success).toBe(false);
      expect(result.failureReason).toContain('FAILED');
    });

    it('should handle missing reference field gracefully', () => {
      const response = {
        data: {
          status: 'SUCCESSFUL',
        },
      };

      const result = adapter.transformResponse(response, mockConfig);

      expect(result.success).toBe(true);
      expect(result.externalRef).toBeDefined();
      expect(result.externalRef!.length).toBeGreaterThan(0);
    });
  });

  describe('auth header generation', () => {
    it('should generate api_key headers', async () => {
      const headers = await (adapter as any).getAuthHeaders({
        type: 'api_key',
        credentials: { apiKey: 'my-api-key' },
        apiKeyHeader: 'X-Custom-Key',
      });

      expect(headers).toEqual({ 'X-Custom-Key': 'my-api-key' });
    });

    it('should use default header name for api_key when not specified', async () => {
      const headers = await (adapter as any).getAuthHeaders({
        type: 'api_key',
        credentials: { apiKey: 'my-api-key' },
      });

      expect(headers).toEqual({ 'X-API-Key': 'my-api-key' });
    });

    it('should generate basic auth headers', async () => {
      const headers = await (adapter as any).getAuthHeaders({
        type: 'basic',
        credentials: { username: 'user', password: 'pass' },
      });

      const expectedEncoded = Buffer.from('user:pass').toString('base64');
      expect(headers).toEqual({ Authorization: `Basic ${expectedEncoded}` });
    });

    it('should generate bearer headers', async () => {
      const headers = await (adapter as any).getAuthHeaders({
        type: 'bearer',
        credentials: { token: 'my-bearer-token' },
      });

      expect(headers).toEqual({ Authorization: 'Bearer my-bearer-token' });
    });

    it('should generate oauth2 headers with sandbox token', async () => {
      const headers = await (adapter as any).getAuthHeaders({
        type: 'oauth2',
        tokenUrl: 'https://auth.example.com/token',
        credentials: { clientId: 'client', clientSecret: 'secret' },
      });

      expect(headers.Authorization).toMatch(/^Bearer sandbox-token-/);
    });
  });

  describe('transfer operations', () => {
    it('should execute transfer with config in sandbox mode', async () => {
      const result = await adapter.transferWithConfig(
        {
          destination: '+233245678901',
          amount: '1000.0000',
          currency: 'GHS',
          reference: 'REF-001',
        },
        mockConfig,
      );

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('externalRef');
    });

    it('should execute collection with config in sandbox mode', async () => {
      const result = await adapter.collectWithConfig(
        {
          source: '+233245678901',
          amount: '500.0000',
          currency: 'GHS',
          reference: 'REF-002',
        },
        mockConfig,
      );

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('externalRef');
    });
  });

  describe('balance and status', () => {
    it('should get balance with config', async () => {
      const result = await adapter.getBalanceWithConfig('wallet-123', mockConfig);

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('currency');
      expect(result).toHaveProperty('lastUpdated');
    });

    it('should get transaction status with config', async () => {
      const result = await adapter.getTransactionStatusWithConfig('REF-001', mockConfig);

      expect(result.reference).toBe('REF-001');
      expect(result.status).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should return failure when transfer called without config', async () => {
      const result = await adapter.transfer({
        destination: '+233245678901',
        amount: '1000.0000',
        currency: 'GHS',
        reference: 'REF-001',
      });

      expect(result.success).toBe(false);
      expect(result.failureReason).toContain('No wallet provider config');
    });

    it('should return failure when collect called without config', async () => {
      const result = await adapter.collect({
        source: '+233245678901',
        amount: '1000.0000',
        currency: 'GHS',
        reference: 'REF-001',
      });

      expect(result.success).toBe(false);
    });

    it('should return default customer info when called without config', async () => {
      const result = await adapter.getCustomerInfo('wallet-123');
      expect(result.walletId).toBe('wallet-123');
      expect(result.fullName).toBe('Unknown');
      expect(result.kycLevel).toBe('unknown');
    });

    it('should return empty array for transaction history when called without config', async () => {
      const result = await adapter.getTransactionHistory('wallet-123', {
        from: new Date(),
        to: new Date(),
      });
      expect(result).toEqual([]);
    });

    it('should return inactive webhook when called without config', async () => {
      const result = await adapter.registerWebhook(['event'], 'https://example.com');
      expect(result.active).toBe(false);
    });
  });

  describe('new methods with config', () => {
    const configWithNewEndpoints: IWalletAdapterConfig = {
      ...mockConfig,
      endpoints: {
        ...mockConfig.endpoints,
        customerInfo: { method: 'GET', path: '/v1/customer' },
        transactionHistory: { method: 'GET', path: '/v1/transactions' },
        registerWebhook: { method: 'POST', path: '/v1/webhooks' },
      },
    };

    it('should return customer info with config', async () => {
      const result = await adapter.getCustomerInfoWithConfig('wallet-123', configWithNewEndpoints);
      expect(result).toHaveProperty('walletId', 'wallet-123');
      expect(result).toHaveProperty('fullName');
      expect(result).toHaveProperty('kycLevel');
      expect(result).toHaveProperty('accountStatus');
    });

    it('should return default when customerInfo endpoint not configured', async () => {
      const result = await adapter.getCustomerInfoWithConfig('wallet-123', mockConfig);
      expect(result.walletId).toBe('wallet-123');
      expect(result.fullName).toBe('Unknown');
    });

    it('should return empty array when transactionHistory endpoint not configured', async () => {
      const result = await adapter.getTransactionHistoryWithConfig(
        'wallet-123',
        { from: new Date(), to: new Date() },
        mockConfig,
      );
      expect(result).toEqual([]);
    });

    it('should return inactive webhook when registerWebhook endpoint not configured', async () => {
      const result = await adapter.registerWebhookWithConfig(
        ['event'],
        'https://example.com',
        mockConfig,
      );
      expect(result.active).toBe(false);
    });

    it('should register webhook with config', async () => {
      const result = await adapter.registerWebhookWithConfig(
        ['payment.completed'],
        'https://example.com/hook',
        configWithNewEndpoints,
      );
      expect(result).toHaveProperty('id');
      expect(result.id).toMatch(/^GEN-WH-/);
      expect(result).toHaveProperty('events', ['payment.completed']);
      expect(result).toHaveProperty('callbackUrl', 'https://example.com/hook');
      expect(result).toHaveProperty('active', true);
    });
  });
});
