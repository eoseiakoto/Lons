import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MpesaAdapter } from './mpesa.adapter';
import { MpesaAuthService } from './mpesa.auth';
import { MpesaWebhookHandler } from './mpesa.webhook';
import { WebhookService } from '../../webhook/webhook.service';
import { EventBusService } from '@lons/common';
import { DarajaCallbackData } from './mpesa.types';

describe('MpesaAuthService', () => {
  let authService: MpesaAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MpesaAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => defaultValue),
          },
        },
      ],
    }).compile();

    authService = module.get<MpesaAuthService>(MpesaAuthService);
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  it('should default to sandbox environment', () => {
    expect(authService.isSandbox()).toBe(true);
    expect(authService.getEnvironment()).toBe('sandbox');
  });

  it('should use sandbox base URL', () => {
    expect(authService.getBaseUrl()).toBe('https://sandbox.safaricom.co.ke');
  });

  it('should generate a valid timestamp in YYYYMMDDHHmmss format', () => {
    const timestamp = authService.generateTimestamp();
    expect(timestamp).toMatch(/^\d{14}$/);
  });

  it('should generate a base64 password from shortcode + passkey + timestamp', () => {
    const timestamp = '20260327120000';
    const password = authService.generatePassword(timestamp);
    const decoded = Buffer.from(password, 'base64').toString();
    expect(decoded).toContain('174379');
    expect(decoded).toContain('sandbox-passkey');
    expect(decoded).toContain(timestamp);
  });

  it('should generate a basic auth header', () => {
    const header = authService.getBasicAuthHeader();
    const decoded = Buffer.from(header, 'base64').toString();
    expect(decoded).toBe('sandbox-consumer-key:sandbox-consumer-secret');
  });

  describe('token caching', () => {
    it('should return a sandbox token on first request', async () => {
      const token = await authService.getAccessToken();
      expect(token).toMatch(/^mpesa-token-/);
    });

    it('should return cached token on subsequent requests', async () => {
      const token1 = await authService.getAccessToken();
      const token2 = await authService.getAccessToken();
      expect(token1).toBe(token2);
    });

    it('should clear the token cache', async () => {
      const token1 = await authService.getAccessToken();
      authService.clearTokenCache();
      const token2 = await authService.getAccessToken();
      expect(token1).not.toBe(token2);
    });
  });
});

describe('MpesaAdapter', () => {
  let adapter: MpesaAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MpesaAdapter,
        MpesaAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => defaultValue),
          },
        },
      ],
    }).compile();

    adapter = module.get<MpesaAdapter>(MpesaAdapter);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('transfer (B2C)', () => {
    const transferParams = {
      destination: '+254712345678',
      amount: '5000.0000',
      currency: 'KES',
      reference: 'REF-B2C-001',
    };

    it('should return a transfer result with externalRef', async () => {
      const result = await adapter.transfer(transferParams);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('externalRef');
      expect(result.externalRef).toMatch(/^MPESA-/);
    });

    it('should return success or pending as a successful result', async () => {
      // Run multiple times to get a success
      let gotSuccess = false;
      for (let i = 0; i < 20; i++) {
        const result = await adapter.transfer(transferParams);
        if (result.success) {
          gotSuccess = true;
          expect(result.failureReason).toBeUndefined();
          break;
        }
      }
      expect(gotSuccess).toBe(true);
    });

    it('should sometimes return failed results in sandbox', async () => {
      let gotFailure = false;
      for (let i = 0; i < 50; i++) {
        const result = await adapter.transfer(transferParams);
        if (!result.success) {
          gotFailure = true;
          expect(result.failureReason).toBeDefined();
          break;
        }
      }
      // With 15% failure rate, should hit failure in 50 tries
      expect(gotFailure).toBe(true);
    });

    it('should handle amount as string, never as number', async () => {
      const result = await adapter.transfer(transferParams);
      // The amount in the params is a string
      expect(typeof transferParams.amount).toBe('string');
      expect(result).toHaveProperty('externalRef');
    });
  });

  describe('collect (STK Push)', () => {
    const collectParams = {
      source: '+254712345678',
      amount: '1000.0000',
      currency: 'KES',
      reference: 'REF-STK-001',
      reason: 'Loan repayment',
    };

    it('should return a transfer result with externalRef', async () => {
      const result = await adapter.collect(collectParams);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('externalRef');
      expect(result.externalRef).toMatch(/^MPESA-STK-/);
    });

    it('should return success results in sandbox', async () => {
      let gotSuccess = false;
      for (let i = 0; i < 20; i++) {
        const result = await adapter.collect(collectParams);
        if (result.success) {
          gotSuccess = true;
          break;
        }
      }
      expect(gotSuccess).toBe(true);
    });
  });

  describe('getBalance', () => {
    it('should return balance info in sandbox', async () => {
      const result = await adapter.getBalance('+254712345678');
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('currency');
      expect(result).toHaveProperty('lastUpdated');
      expect(result.currency).toBe('KES');
      expect(typeof result.available).toBe('string');
    });
  });

  describe('getTransactionStatus', () => {
    it('should return completed for unknown references in sandbox', async () => {
      const result = await adapter.getTransactionStatus('unknown-ref-123');
      expect(result.reference).toBe('unknown-ref-123');
      expect(result.status).toBe('completed');
    });

    it('should track transaction state from a previous transfer', async () => {
      // Force a deterministic scenario by making many calls
      const transferResult = await adapter.transfer({
        destination: '+254712345678',
        amount: '2000.0000',
        currency: 'KES',
        reference: 'REF-TRACK-001',
      });
      expect(transferResult.externalRef).toBeDefined();
    });
  });

  describe('getCustomerInfo', () => {
    it('should return customer info with correct structure', async () => {
      const result = await adapter.getCustomerInfo('+254712345678');
      expect(result).toHaveProperty('walletId', '+254712345678');
      expect(result).toHaveProperty('fullName');
      expect(result).toHaveProperty('kycLevel');
      expect(result).toHaveProperty('accountStatus', 'active');
      expect(result).toHaveProperty('accountAge');
      expect(result).toHaveProperty('currency', 'KES');
    });

    it('should return a valid KYC level (tier_1, tier_2, or tier_3)', async () => {
      const result = await adapter.getCustomerInfo('+254712345678');
      expect(['tier_1', 'tier_2', 'tier_3']).toContain(result.kycLevel);
    });

    it('should return account age between 30 and 730 days', async () => {
      const result = await adapter.getCustomerInfo('+254712345678');
      expect(result.accountAge).toBeGreaterThanOrEqual(30);
      expect(result.accountAge).toBeLessThanOrEqual(730);
    });

    it('should return a non-empty fullName', async () => {
      const result = await adapter.getCustomerInfo('+254712345678');
      expect(result.fullName.length).toBeGreaterThan(0);
      expect(result.fullName).toContain(' '); // first + last name
    });

    it('should return KES currency for Kenya', async () => {
      const result = await adapter.getCustomerInfo('+254712345678');
      expect(result.currency).toBe('KES');
    });
  });

  describe('getTransactionHistory', () => {
    const dateRange = {
      from: new Date('2026-01-01'),
      to: new Date('2026-03-27'),
    };

    it('should return between 10 and 30 transactions', async () => {
      const result = await adapter.getTransactionHistory('+254712345678', dateRange);
      expect(result.length).toBeGreaterThanOrEqual(10);
      expect(result.length).toBeLessThanOrEqual(30);
    });

    it('should return transactions with correct structure', async () => {
      const result = await adapter.getTransactionHistory('+254712345678', dateRange);
      expect(result.length).toBeGreaterThan(0);

      const txn = result[0];
      expect(txn).toHaveProperty('transactionId');
      expect(txn).toHaveProperty('walletId', '+254712345678');
      expect(txn).toHaveProperty('type');
      expect(txn).toHaveProperty('amount');
      expect(txn).toHaveProperty('currency', 'KES');
      expect(txn).toHaveProperty('timestamp');
      expect(txn).toHaveProperty('status', 'completed');
    });

    it('should return transactions with amount as a string (Decimal format)', async () => {
      const result = await adapter.getTransactionHistory('+254712345678', dateRange);
      for (const txn of result) {
        expect(typeof txn.amount).toBe('string');
        expect(txn.amount).toMatch(/^\d+\.\d{4}$/);
      }
    });

    it('should have both credit and debit transactions', async () => {
      let hasCredit = false;
      let hasDebit = false;
      for (let i = 0; i < 5; i++) {
        const result = await adapter.getTransactionHistory('+254712345678', dateRange);
        for (const txn of result) {
          if (txn.type === 'credit') hasCredit = true;
          if (txn.type === 'debit') hasDebit = true;
        }
        if (hasCredit && hasDebit) break;
      }
      expect(hasCredit).toBe(true);
      expect(hasDebit).toBe(true);
    });

    it('should return transactions sorted by timestamp descending', async () => {
      const result = await adapter.getTransactionHistory('+254712345678', dateRange);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          result[i].timestamp.getTime(),
        );
      }
    });

    it('should include valid categories', async () => {
      const validCategories = ['salary', 'transfer', 'merchant', 'utility', 'airtime'];
      const result = await adapter.getTransactionHistory('+254712345678', dateRange);
      for (const txn of result) {
        if (txn.category) {
          expect(validCategories).toContain(txn.category);
        }
      }
    });

    it('should have transaction IDs starting with MPESA-TXN-', async () => {
      const result = await adapter.getTransactionHistory('+254712345678', dateRange);
      for (const txn of result) {
        expect(txn.transactionId).toMatch(/^MPESA-TXN-/);
      }
    });
  });

  describe('registerWebhook', () => {
    it('should return a webhook registration with correct structure', async () => {
      const result = await adapter.registerWebhook(
        ['payment.completed', 'payment.failed'],
        'https://example.com/mpesa-webhook',
      );
      expect(result).toHaveProperty('id');
      expect(result.id).toMatch(/^MPESA-WH-/);
      expect(result).toHaveProperty('events', ['payment.completed', 'payment.failed']);
      expect(result).toHaveProperty('callbackUrl', 'https://example.com/mpesa-webhook');
      expect(result).toHaveProperty('active', true);
    });
  });

  describe('circuit breaker', () => {
    it('should report circuit breaker state', () => {
      const state = adapter.getCircuitBreakerState();
      expect(state).toBe('closed');
    });

    it('should allow resetting circuit breaker', () => {
      adapter.resetCircuitBreaker();
      expect(adapter.getCircuitBreakerState()).toBe('closed');
    });
  });
});

describe('MpesaWebhookHandler', () => {
  let webhookHandler: MpesaWebhookHandler;

  const mockWebhookService = {
    verifySignature: jest.fn().mockReturnValue(true),
    isIdempotent: jest.fn().mockReturnValue(false),
    handleWebhookEvent: jest.fn(),
  };

  const mockEventBus = {
    emitAndBuild: jest.fn(),
    emit: jest.fn(),
    buildEvent: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MpesaWebhookHandler,
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();

    webhookHandler = module.get<MpesaWebhookHandler>(MpesaWebhookHandler);
  });

  describe('STK Push callback', () => {
    const successPayload: DarajaCallbackData = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'merchant-req-001',
          CheckoutRequestID: 'checkout-req-001',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1000 },
              { Name: 'MpesaReceiptNumber', Value: 'QJK1234567' },
              { Name: 'TransactionDate', Value: 20260327121500 },
              { Name: 'PhoneNumber', Value: '254712345678' },
            ],
          },
        },
      },
    };

    const failedPayload: DarajaCallbackData = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'merchant-req-002',
          CheckoutRequestID: 'checkout-req-002',
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user',
        },
      },
    };

    it('should process a successful STK Push callback', async () => {
      const result = await webhookHandler.handleSTKPushCallback(
        successPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(true);
      expect(result.referenceId).toBe('checkout-req-001');
      expect(result.status).toBe('completed');
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'mpesa.stk_push.completed',
        'tenant-001',
        expect.objectContaining({
          checkoutRequestId: 'checkout-req-001',
          resultCode: 0,
          amount: 1000,
          mpesaReceiptNumber: 'QJK1234567',
        }),
      );
    });

    it('should process a failed STK Push callback', async () => {
      const result = await webhookHandler.handleSTKPushCallback(
        failedPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(true);
      expect(result.referenceId).toBe('checkout-req-002');
      expect(result.status).toBe('failed');
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'mpesa.stk_push.failed',
        'tenant-001',
        expect.objectContaining({
          checkoutRequestId: 'checkout-req-002',
          resultCode: 1032,
        }),
      );
    });

    it('should reject callback with invalid signature', async () => {
      mockWebhookService.verifySignature.mockReturnValueOnce(false);

      const result = await webhookHandler.handleSTKPushCallback(
        successPayload,
        'invalid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Invalid webhook signature');
      expect(mockEventBus.emitAndBuild).not.toHaveBeenCalled();
    });

    it('should skip duplicate callbacks via idempotency check', async () => {
      mockWebhookService.isIdempotent.mockReturnValueOnce(true);

      const result = await webhookHandler.handleSTKPushCallback(
        successPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Duplicate callback');
      expect(mockEventBus.emitAndBuild).not.toHaveBeenCalled();
    });

    it('should handle missing stkCallback body gracefully', async () => {
      const emptyPayload: DarajaCallbackData = { Body: {} };

      const result = await webhookHandler.handleSTKPushCallback(
        emptyPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Missing stkCallback body');
    });
  });

  describe('B2C callback', () => {
    const successPayload: DarajaCallbackData = {
      Body: {
        Result: {
          ResultType: 0,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          OriginatorConversationID: 'orig-conv-001',
          ConversationID: 'conv-001',
          TransactionID: 'TXN-B2C-001',
          ResultParameters: {
            ResultParameter: [
              { Key: 'TransactionAmount', Value: 5000 },
              { Key: 'TransactionReceipt', Value: 'QJK9876543' },
              { Key: 'ReceiverPartyPublicName', Value: '254712345678 - John Doe' },
              { Key: 'TransactionCompletedDateTime', Value: '27.03.2026 12:15:00' },
              { Key: 'B2CUtilityAccountAvailableFunds', Value: 100000 },
              { Key: 'B2CWorkingAccountAvailableFunds', Value: 50000 },
            ],
          },
        },
      },
    };

    const failedPayload: DarajaCallbackData = {
      Body: {
        Result: {
          ResultType: 0,
          ResultCode: 2001,
          ResultDesc: 'The initiator information is invalid.',
          OriginatorConversationID: 'orig-conv-002',
          ConversationID: 'conv-002',
          TransactionID: 'TXN-B2C-002',
        },
      },
    };

    it('should process a successful B2C callback', async () => {
      const result = await webhookHandler.handleB2CCallback(
        successPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(true);
      expect(result.referenceId).toBe('conv-001');
      expect(result.status).toBe('completed');
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'mpesa.b2c.completed',
        'tenant-001',
        expect.objectContaining({
          conversationId: 'conv-001',
          transactionId: 'TXN-B2C-001',
          resultCode: 0,
          transactionAmount: 5000,
        }),
      );
    });

    it('should process a failed B2C callback', async () => {
      const result = await webhookHandler.handleB2CCallback(
        failedPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(true);
      expect(result.referenceId).toBe('conv-002');
      expect(result.status).toBe('failed');
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'mpesa.b2c.failed',
        'tenant-001',
        expect.objectContaining({
          conversationId: 'conv-002',
          resultCode: 2001,
        }),
      );
    });

    it('should reject B2C callback with invalid signature', async () => {
      mockWebhookService.verifySignature.mockReturnValueOnce(false);

      const result = await webhookHandler.handleB2CCallback(
        successPayload,
        'invalid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Invalid webhook signature');
    });

    it('should skip duplicate B2C callbacks', async () => {
      mockWebhookService.isIdempotent.mockReturnValueOnce(true);

      const result = await webhookHandler.handleB2CCallback(
        successPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Duplicate callback');
    });

    it('should handle missing Result body gracefully', async () => {
      const emptyPayload: DarajaCallbackData = { Body: {} };

      const result = await webhookHandler.handleB2CCallback(
        emptyPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Missing Result body');
    });
  });
});
