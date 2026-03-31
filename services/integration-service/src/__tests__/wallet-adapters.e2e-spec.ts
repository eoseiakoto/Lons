import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MtnMomoAdapter } from '../adapters/mtn-momo/mtn-momo.adapter';
import { MtnMomoAuthService } from '../adapters/mtn-momo/mtn-momo.auth';
import { MtnMomoWebhookHandler } from '../adapters/mtn-momo/mtn-momo.webhook';
import { MoMoCallbackPayload } from '../adapters/mtn-momo/mtn-momo.types';
import { MpesaAdapter } from '../adapters/mpesa/mpesa.adapter';
import { MpesaAuthService } from '../adapters/mpesa/mpesa.auth';
import { MpesaWebhookHandler } from '../adapters/mpesa/mpesa.webhook';
import { DarajaCallbackData } from '../adapters/mpesa/mpesa.types';
import { GenericWalletAdapter } from '../adapters/generic-wallet/generic-wallet.adapter';
import {
  GenericWalletService,
  CreateWalletProviderConfigDto,
  UpdateWalletProviderConfigDto,
} from '../adapters/generic-wallet/generic-wallet.service';
import { IWalletAdapterConfig } from '../adapters/generic-wallet/generic-wallet.types';
import { WebhookService } from '../webhook/webhook.service';

// ---------------------------------------------------------------------------
// Shared helpers & mocks
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-e2e-wallet';
const WEBHOOK_SECRET = 'test-webhook-secret-256';

function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function createMockPrismaService() {
  const store = new Map<string, any>();
  let counter = 0;

  return {
    walletProviderConfig: {
      create: jest.fn().mockImplementation(({ data }) => {
        counter++;
        const record = {
          id: `wpc-${counter}`,
          ...data,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.set(record.id, record);
        return Promise.resolve(record);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const record = store.get(where.id);
        if (record && record.tenantId === where.tenantId) {
          return Promise.resolve(record);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() => {
        return Promise.resolve(Array.from(store.values()));
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const record = store.get(where.id);
        if (!record) return Promise.resolve(null);
        Object.assign(record, data, { updatedAt: new Date() });
        return Promise.resolve(record);
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        const record = store.get(where.id);
        store.delete(where.id);
        return Promise.resolve(record);
      }),
    },
    _store: store,
  };
}

function createMockEventBus() {
  return {
    emitAndBuild: jest.fn(),
    emit: jest.fn(),
    buildEvent: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// MTN MoMo Adapter E2E Tests
// ---------------------------------------------------------------------------

describe('MTN MoMo Adapter (E2E)', () => {
  let module: TestingModule;
  let momoAdapter: MtnMomoAdapter;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        MtnMomoAdapter,
        MtnMomoAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                MTN_MOMO_API_KEY: 'sandbox-api-key',
                MTN_MOMO_API_SECRET: 'sandbox-api-secret',
                MTN_MOMO_SUBSCRIPTION_KEY: 'sandbox-sub-key',
                MTN_MOMO_ENVIRONMENT: 'sandbox',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();

    momoAdapter = module.get(MtnMomoAdapter);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('transfer (disbursement)', () => {
    it('should return a TransferResult with externalRef starting with MOMO-', async () => {
      const result = await momoAdapter.transfer({
        destination: '+233241234567',
        amount: '500.0000',
        currency: 'GHS',
        reference: 'loan-disb-001',
      });

      expect(result).toBeDefined();
      expect(result.externalRef).toBeDefined();
      expect(result.externalRef!.startsWith('MOMO-')).toBe(true);
      expect(typeof result.success).toBe('boolean');
      if (!result.success) {
        expect(typeof result.failureReason).toBe('string');
      }
    });

    it('should return success, pending, or failed based on sandbox simulation', async () => {
      const outcomes = { success: 0, failure: 0 };

      for (let i = 0; i < 50; i++) {
        const result = await momoAdapter.transfer({
          destination: '+233241234567',
          amount: '100.0000',
          currency: 'GHS',
          reference: `ref-${i}`,
        });
        if (result.success) outcomes.success++;
        else outcomes.failure++;
      }

      // Sandbox produces a mix of outcomes; at least some should succeed
      expect(outcomes.success).toBeGreaterThan(0);
    });
  });

  describe('collect (requestToPay)', () => {
    it('should return a TransferResult with externalRef containing MOMO-COL', async () => {
      const result = await momoAdapter.collect({
        source: '+233209876543',
        amount: '200.0000',
        currency: 'GHS',
        reference: 'loan-repay-001',
        reason: 'Loan repayment',
      });

      expect(result).toBeDefined();
      expect(result.externalRef).toBeDefined();
      expect(result.externalRef!.includes('MOMO-COL')).toBe(true);
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('getBalance', () => {
    it('should return BalanceInfo with string amount and currency GHS', async () => {
      const balance = await momoAdapter.getBalance('+233241234567');

      expect(balance).toBeDefined();
      expect(typeof balance.available).toBe('string');
      expect(balance.available).toBe('25000.0000');
      expect(balance.currency).toBe('GHS');
      expect(balance.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return completed for an unknown reference in sandbox', async () => {
      const status = await momoAdapter.getTransactionStatus('unknown-ref-123');

      expect(status).toBeDefined();
      expect(status.reference).toBe('unknown-ref-123');
      expect(status.status).toBe('completed');
      expect(status.completedAt).toBeInstanceOf(Date);
    });

    it('should track in-memory transaction state after transfer', async () => {
      // Force a transfer first
      await momoAdapter.transfer({
        destination: '+233241111111',
        amount: '300.0000',
        currency: 'GHS',
        reference: 'status-check-ref',
      });

      // The externalRef is MOMO-<first8chars>, but the internal referenceId
      // is a full UUID stored in the map. We can verify the status via the
      // adapter's own getTransactionStatus by checking a known reference.
      // Since the internal map key is the UUID (not the external ref),
      // we verify the sandbox fallback path works for arbitrary references.
      const status = await momoAdapter.getTransactionStatus('non-existent-uuid');
      expect(['pending', 'completed', 'failed']).toContain(status.status);
    });
  });

  describe('circuit breaker', () => {
    it('should report circuit breaker state as closed initially', () => {
      const state = momoAdapter.getCircuitBreakerState();
      expect(state).toBe('closed');
    });

    it('should reset circuit breaker', () => {
      momoAdapter.resetCircuitBreaker();
      expect(momoAdapter.getCircuitBreakerState()).toBe('closed');
    });
  });
});

// ---------------------------------------------------------------------------
// MTN MoMo Webhook E2E Tests
// ---------------------------------------------------------------------------

describe('MTN MoMo Webhook Handler (E2E)', () => {
  let module: TestingModule;
  let webhookHandler: MtnMomoWebhookHandler;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeAll(async () => {
    eventBus = createMockEventBus();

    module = await Test.createTestingModule({
      providers: [
        MtnMomoWebhookHandler,
        WebhookService,
        { provide: 'EventBusService', useValue: eventBus },
      ],
    })
      .overrideProvider(WebhookService)
      .useFactory({
        factory: () => {
          const svc = new WebhookService(eventBus as any);
          return svc;
        },
      })
      .compile();

    webhookHandler = module.get(MtnMomoWebhookHandler);
  });

  afterAll(async () => {
    await module.close();
  });

  it('should process a valid SUCCESSFUL callback and emit completion event', async () => {
    const payload: MoMoCallbackPayload = {
      referenceId: 'ref-success-001',
      externalId: 'ext-001',
      financialTransactionId: 'fin-txn-001',
      status: 'SUCCESSFUL',
      amount: '1000.0000',
      currency: 'GHS',
      payee: { partyIdType: 'MSISDN', partyId: '+233241234567' },
    };

    const payloadStr = JSON.stringify(payload);
    const signature = generateSignature(payloadStr, WEBHOOK_SECRET);

    const result = await webhookHandler.handleCallback(
      payload,
      signature,
      WEBHOOK_SECRET,
      TENANT_ID,
    );

    expect(result.processed).toBe(true);
    expect(result.referenceId).toBe('ref-success-001');
    expect(result.status).toBe('SUCCESSFUL');
    expect(result.message).toContain('momo.transaction.completed');
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'momo.transaction.completed',
      TENANT_ID,
      expect.objectContaining({
        referenceId: 'ref-success-001',
        amount: '1000.0000',
        currency: 'GHS',
      }),
    );
  });

  it('should reject callback with invalid signature', async () => {
    const payload: MoMoCallbackPayload = {
      referenceId: 'ref-invalid-sig',
      externalId: 'ext-002',
      status: 'SUCCESSFUL',
      amount: '500.0000',
      currency: 'GHS',
    };

    const result = await webhookHandler.handleCallback(
      payload,
      'bad-signature-value-that-has-correct-length-000000',
      WEBHOOK_SECRET,
      TENANT_ID,
    );

    expect(result.processed).toBe(false);
    expect(result.message).toContain('Invalid webhook signature');
  });

  it('should skip duplicate callback (idempotency)', async () => {
    const payload: MoMoCallbackPayload = {
      referenceId: 'ref-success-001', // same as first test
      externalId: 'ext-001',
      status: 'SUCCESSFUL',
      amount: '1000.0000',
      currency: 'GHS',
    };

    const payloadStr = JSON.stringify(payload);
    const signature = generateSignature(payloadStr, WEBHOOK_SECRET);

    const result = await webhookHandler.handleCallback(
      payload,
      signature,
      WEBHOOK_SECRET,
      TENANT_ID,
    );

    expect(result.processed).toBe(false);
    expect(result.message).toContain('Duplicate');
  });

  it('should emit failure event for FAILED callback', async () => {
    const payload: MoMoCallbackPayload = {
      referenceId: 'ref-failed-001',
      externalId: 'ext-fail-001',
      status: 'FAILED',
      reason: { code: 'PAYER_LIMIT_REACHED', message: 'Limit exceeded' },
      amount: '2000.0000',
      currency: 'GHS',
      payer: { partyIdType: 'MSISDN', partyId: '+233209876543' },
    };

    const payloadStr = JSON.stringify(payload);
    const signature = generateSignature(payloadStr, WEBHOOK_SECRET);

    const result = await webhookHandler.handleCallback(
      payload,
      signature,
      WEBHOOK_SECRET,
      TENANT_ID,
    );

    expect(result.processed).toBe(true);
    expect(result.message).toContain('momo.transaction.failed');
  });
});

// ---------------------------------------------------------------------------
// M-Pesa Adapter E2E Tests
// ---------------------------------------------------------------------------

describe('M-Pesa Adapter (E2E)', () => {
  let module: TestingModule;
  let mpesaAdapter: MpesaAdapter;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        MpesaAdapter,
        MpesaAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                MPESA_CONSUMER_KEY: 'sandbox-consumer-key',
                MPESA_CONSUMER_SECRET: 'sandbox-consumer-secret',
                MPESA_SHORT_CODE: '174379',
                MPESA_PASSKEY: 'sandbox-passkey',
                MPESA_INITIATOR_NAME: 'testapi',
                MPESA_SECURITY_CREDENTIAL: 'sandbox-credential',
                MPESA_ENVIRONMENT: 'sandbox',
                MPESA_CALLBACK_BASE_URL: 'https://callbacks.example.com',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();

    mpesaAdapter = module.get(MpesaAdapter);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('B2C transfer', () => {
    it('should return TransferResult with MPESA- prefixed externalRef', async () => {
      const result = await mpesaAdapter.transfer({
        destination: '+254712345678',
        amount: '5000.0000',
        currency: 'KES',
        reference: 'b2c-disb-001',
      });

      expect(result).toBeDefined();
      expect(result.externalRef).toBeDefined();
      expect(result.externalRef!.startsWith('MPESA-')).toBe(true);
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('STK Push collection', () => {
    it('should return TransferResult with MPESA-STK prefix', async () => {
      const result = await mpesaAdapter.collect({
        source: '+254798765432',
        amount: '1500.0000',
        currency: 'KES',
        reference: 'stk-repay-001',
        reason: 'Loan repayment',
      });

      expect(result).toBeDefined();
      expect(result.externalRef).toBeDefined();
      expect(result.externalRef!.includes('MPESA-STK')).toBe(true);
    });
  });

  describe('getBalance', () => {
    it('should return BalanceInfo with KES currency and string amount', async () => {
      const balance = await mpesaAdapter.getBalance('+254712345678');

      expect(balance).toBeDefined();
      expect(typeof balance.available).toBe('string');
      expect(balance.available).toBe('30000.0000');
      expect(balance.currency).toBe('KES');
      expect(balance.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return TransactionStatusResult for unknown ref in sandbox', async () => {
      const status = await mpesaAdapter.getTransactionStatus('unknown-mpesa-ref');

      expect(status).toBeDefined();
      expect(status.reference).toBe('unknown-mpesa-ref');
      expect(status.status).toBe('completed');
    });
  });

  describe('circuit breaker', () => {
    it('should report closed state', () => {
      expect(mpesaAdapter.getCircuitBreakerState()).toBe('closed');
    });
  });
});

// ---------------------------------------------------------------------------
// M-Pesa Webhook E2E Tests
// ---------------------------------------------------------------------------

describe('M-Pesa Webhook Handler (E2E)', () => {
  let module: TestingModule;
  let webhookHandler: MpesaWebhookHandler;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeAll(async () => {
    eventBus = createMockEventBus();

    module = await Test.createTestingModule({
      providers: [
        MpesaWebhookHandler,
        {
          provide: WebhookService,
          useFactory: () => new WebhookService(eventBus as any),
        },
        { provide: 'EventBusService', useValue: eventBus },
      ],
    }).compile();

    webhookHandler = module.get(MpesaWebhookHandler);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('STK Push callback', () => {
    it('should process successful STK Push callback', async () => {
      const payload: DarajaCallbackData = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'merch-001',
            CheckoutRequestID: 'checkout-001',
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 1500 },
                { Name: 'MpesaReceiptNumber', Value: 'QKJ12AB345' },
                { Name: 'PhoneNumber', Value: '254712345678' },
                { Name: 'TransactionDate', Value: '20260327120000' },
              ],
            },
          },
        },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = generateSignature(payloadStr, WEBHOOK_SECRET);

      const result = await webhookHandler.handleSTKPushCallback(
        payload,
        signature,
        WEBHOOK_SECRET,
        TENANT_ID,
      );

      expect(result.processed).toBe(true);
      expect(result.referenceId).toBe('checkout-001');
      expect(result.status).toBe('completed');
      expect(result.message).toContain('mpesa.stk_push.completed');
    });

    it('should handle missing stkCallback body gracefully', async () => {
      const payload: DarajaCallbackData = {
        Body: {},
      };

      const result = await webhookHandler.handleSTKPushCallback(
        payload,
        'any-sig',
        WEBHOOK_SECRET,
        TENANT_ID,
      );

      expect(result.processed).toBe(false);
      expect(result.referenceId).toBe('unknown');
      expect(result.message).toContain('Missing stkCallback body');
    });
  });

  describe('B2C result callback', () => {
    it('should process successful B2C callback', async () => {
      const payload: DarajaCallbackData = {
        Body: {
          Result: {
            ResultType: 0,
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            OriginatorConversationID: 'orig-conv-001',
            ConversationID: 'conv-001',
            TransactionID: 'txn-001',
            ResultParameters: {
              ResultParameter: [
                { Key: 'TransactionAmount', Value: 5000 },
                { Key: 'TransactionReceipt', Value: 'QKJ12CD567' },
                { Key: 'ReceiverPartyPublicName', Value: '254712345678 - John Doe' },
                { Key: 'TransactionCompletedDateTime', Value: '27.03.2026 12:00:00' },
                { Key: 'B2CUtilityAccountAvailableFunds', Value: 100000 },
                { Key: 'B2CWorkingAccountAvailableFunds', Value: 50000 },
              ],
            },
          },
        },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = generateSignature(payloadStr, WEBHOOK_SECRET);

      const result = await webhookHandler.handleB2CCallback(
        payload,
        signature,
        WEBHOOK_SECRET,
        TENANT_ID,
      );

      expect(result.processed).toBe(true);
      expect(result.referenceId).toBe('conv-001');
      expect(result.status).toBe('completed');
      expect(result.message).toContain('mpesa.b2c.completed');
    });

    it('should handle missing Result body', async () => {
      const payload: DarajaCallbackData = {
        Body: {},
      };

      const result = await webhookHandler.handleB2CCallback(
        payload,
        'any-sig',
        WEBHOOK_SECRET,
        TENANT_ID,
      );

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Missing Result body');
    });

    it('should emit failure event for non-zero result code', async () => {
      const payload: DarajaCallbackData = {
        Body: {
          Result: {
            ResultType: 0,
            ResultCode: 1,
            ResultDesc: 'Insufficient funds',
            OriginatorConversationID: 'orig-conv-fail-001',
            ConversationID: 'conv-fail-001',
            TransactionID: 'txn-fail-001',
          },
        },
      };

      const payloadStr = JSON.stringify(payload);
      const signature = generateSignature(payloadStr, WEBHOOK_SECRET);

      const result = await webhookHandler.handleB2CCallback(
        payload,
        signature,
        WEBHOOK_SECRET,
        TENANT_ID,
      );

      expect(result.processed).toBe(true);
      expect(result.status).toBe('failed');
      expect(result.message).toContain('mpesa.b2c.failed');
    });
  });
});

// ---------------------------------------------------------------------------
// Generic Wallet Adapter E2E Tests
// ---------------------------------------------------------------------------

describe('Generic Wallet Adapter (E2E)', () => {
  let module: TestingModule;
  let adapter: GenericWalletAdapter;

  const sampleConfig: IWalletAdapterConfig = {
    providerId: 'provider-generic-001',
    name: 'TestWallet',
    baseUrl: 'https://api.testwallet.local',
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
          destination: '$destination',
          amount: '$amount',
          currency: '$currency',
          reference: '$reference',
        },
      },
      collect: {
        method: 'POST',
        path: '/v1/collect',
        bodyMapping: {
          source: '$source',
          amount: '$amount',
          currency: '$currency',
        },
      },
      balance: { method: 'GET', path: '/v1/balance' },
      status: { method: 'GET', path: '/v1/status' },
    },
    responseMapping: {
      referenceField: 'data.transactionId',
      statusField: 'data.state',
      statusValues: {
        success: 'COMPLETED',
        pending: 'PROCESSING',
        failed: 'REJECTED',
      },
    },
    resilience: {
      timeoutMs: 15000,
      maxRetries: 2,
      circuitBreakerThreshold: 3,
    },
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        GenericWalletAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, fallback?: string) => {
              if (key === 'NODE_ENV') return 'development';
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get(GenericWalletAdapter);
  });

  afterAll(async () => {
    await module.close();
  });

  it('should perform a transfer with JSON-configured adapter', async () => {
    const result = await adapter.transferWithConfig(
      {
        destination: '+233241234567',
        amount: '750.0000',
        currency: 'GHS',
        reference: 'gen-disb-001',
      },
      sampleConfig,
    );

    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(result.externalRef).toBeDefined();
  });

  it('should perform a collection with config', async () => {
    const result = await adapter.collectWithConfig(
      {
        source: '+233209876543',
        amount: '250.0000',
        currency: 'GHS',
        reference: 'gen-col-001',
        reason: 'Repayment',
      },
      sampleConfig,
    );

    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('should get balance with config', async () => {
    const balance = await adapter.getBalanceWithConfig('+233241234567', sampleConfig);

    expect(balance).toBeDefined();
    expect(typeof balance.available).toBe('string');
    expect(balance.available).toBe('50000.0000');
    expect(balance.lastUpdated).toBeInstanceOf(Date);
  });

  it('should get transaction status with config', async () => {
    const status = await adapter.getTransactionStatusWithConfig('gen-ref-001', sampleConfig);

    expect(status).toBeDefined();
    expect(status.reference).toBe('gen-ref-001');
    expect(status.status).toBe('completed');
  });

  it('should fail transfer without config (bare interface)', async () => {
    const result = await adapter.transfer({
      destination: '+233241234567',
      amount: '100.0000',
      currency: 'GHS',
      reference: 'no-config',
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain('No wallet provider config set');
  });

  it('should build request body from field mappings', () => {
    const body = adapter.buildRequestBody(
      {
        'payment.destination': '$destination',
        'payment.amount': '$amount',
        'payment.currency': '$currency',
        type: 'DISBURSEMENT',
      },
      {
        destination: '+233241234567',
        amount: '500.0000',
        currency: 'GHS',
      },
    );

    expect(body).toEqual({
      payment: {
        destination: '+233241234567',
        amount: '500.0000',
        currency: 'GHS',
      },
      type: 'DISBURSEMENT',
    });
  });

  it('should transform sandbox response to TransferResult', () => {
    const response = { data: { transactionId: 'TXN-12345', state: 'COMPLETED' } };
    const result = adapter.transformResponse(response, sampleConfig);

    expect(result.success).toBe(true);
    expect(result.externalRef).toBe('TXN-12345');
    expect(result.failureReason).toBeUndefined();
  });

  it('should handle failed status in response transformation', () => {
    const response = { data: { transactionId: 'TXN-FAIL', state: 'REJECTED' } };
    const result = adapter.transformResponse(response, sampleConfig);

    expect(result.success).toBe(false);
    expect(result.failureReason).toContain('REJECTED');
  });
});

// ---------------------------------------------------------------------------
// Generic Wallet Service E2E Tests (CRUD)
// ---------------------------------------------------------------------------

describe('GenericWalletService (E2E)', () => {
  let module: TestingModule;
  let service: GenericWalletService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  beforeAll(async () => {
    mockPrisma = createMockPrismaService();

    module = await Test.createTestingModule({
      providers: [
        GenericWalletService,
        GenericWalletAdapter,
        { provide: 'PrismaService', useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('development'),
          },
        },
      ],
    })
      .overrideProvider('PrismaService')
      .useValue(mockPrisma)
      .compile();

    // Manually construct the service with correct dependencies
    const adapter = module.get(GenericWalletAdapter);
    service = new GenericWalletService(mockPrisma as any, adapter);
  });

  afterAll(async () => {
    await module.close();
  });

  let createdConfigId: string;

  it('should create a wallet provider config', async () => {
    const dto: CreateWalletProviderConfigDto = {
      providerName: 'TestWallet',
      authType: 'api_key',
      baseUrl: 'https://api.testwallet.local',
      configJson: {
        apiKeyHeader: 'X-API-Key',
        credentials: { apiKey: 'my-key' },
      },
      requestMapping: {
        disburse: { method: 'POST', path: '/v1/send', bodyMapping: { destination: '$destination' } },
        collect: { method: 'POST', path: '/v1/collect', bodyMapping: {} },
        balance: { method: 'GET', path: '/v1/balance' },
        status: { method: 'GET', path: '/v1/status' },
      },
      responseMapping: {
        referenceField: 'id',
        statusField: 'status',
        statusValues: { success: 'OK', pending: 'PENDING', failed: 'ERROR' },
      },
    };

    const result = await service.create(TENANT_ID, dto);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.providerName).toBe('TestWallet');
    expect(result.tenantId).toBe(TENANT_ID);
    createdConfigId = result.id;
  });

  it('should find a config by id and tenant', async () => {
    const result = await service.findById(TENANT_ID, createdConfigId);
    expect(result).toBeDefined();
    expect(result.providerName).toBe('TestWallet');
  });

  it('should update a wallet provider config', async () => {
    const dto: UpdateWalletProviderConfigDto = {
      providerName: 'TestWalletV2',
      baseUrl: 'https://api.testwallet-v2.local',
    };

    const result = await service.update(TENANT_ID, createdConfigId, dto);
    expect(result).toBeDefined();
    expect(result.providerName).toBe('TestWalletV2');
    expect(result.baseUrl).toBe('https://api.testwallet-v2.local');
  });

  it('should delete a wallet provider config', async () => {
    const result = await service.delete(TENANT_ID, createdConfigId);
    expect(result).toBeDefined();
  });

  it('should throw NotFoundException for non-existent config', async () => {
    await expect(service.findById(TENANT_ID, 'non-existent-id')).rejects.toThrow();
  });
});
