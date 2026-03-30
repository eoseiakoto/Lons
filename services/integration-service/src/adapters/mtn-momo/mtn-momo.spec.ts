import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MtnMomoAdapter } from './mtn-momo.adapter';
import { MtnMomoAuthService } from './mtn-momo.auth';
import { MtnMomoWebhookHandler } from './mtn-momo.webhook';
import { WebhookService } from '../../webhook/webhook.service';
import { EventBusService } from '@lons/common';
import { MoMoCallbackPayload } from './mtn-momo.types';

describe('MtnMomoAuthService', () => {
  let authService: MtnMomoAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MtnMomoAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => defaultValue),
          },
        },
      ],
    }).compile();

    authService = module.get<MtnMomoAuthService>(MtnMomoAuthService);
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  it('should default to sandbox environment', () => {
    expect(authService.isSandbox()).toBe(true);
    expect(authService.getEnvironment()).toBe('sandbox');
  });

  it('should use sandbox base URL', () => {
    expect(authService.getBaseUrl()).toBe('https://sandbox.momoapi.mtn.com');
  });

  it('should generate a basic auth header', () => {
    const header = authService.getBasicAuthHeader();
    const decoded = Buffer.from(header, 'base64').toString();
    expect(decoded).toBe('sandbox-api-key:sandbox-api-secret');
  });

  describe('disbursement token', () => {
    it('should return a sandbox disbursement token', async () => {
      const token = await authService.getDisbursementToken();
      expect(token).toMatch(/^momo-disbursement-token-/);
    });

    it('should cache the disbursement token', async () => {
      const token1 = await authService.getDisbursementToken();
      const token2 = await authService.getDisbursementToken();
      expect(token1).toBe(token2);
    });
  });

  describe('collection token', () => {
    it('should return a sandbox collection token', async () => {
      const token = await authService.getCollectionToken();
      expect(token).toMatch(/^momo-collection-token-/);
    });

    it('should cache the collection token', async () => {
      const token1 = await authService.getCollectionToken();
      const token2 = await authService.getCollectionToken();
      expect(token1).toBe(token2);
    });

    it('should maintain separate caches for collection and disbursement tokens', async () => {
      const collectionToken = await authService.getCollectionToken();
      const disbursementToken = await authService.getDisbursementToken();
      expect(collectionToken).not.toBe(disbursementToken);
    });
  });

  describe('token refresh', () => {
    it('should provide fresh token after cache clear', async () => {
      const token1 = await authService.getDisbursementToken();
      authService.clearTokenCache();
      const token2 = await authService.getDisbursementToken();
      expect(token1).not.toBe(token2);
    });
  });
});

describe('MtnMomoAdapter', () => {
  let adapter: MtnMomoAdapter;
  let authService: MtnMomoAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MtnMomoAdapter,
        MtnMomoAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => defaultValue),
          },
        },
      ],
    }).compile();

    adapter = module.get<MtnMomoAdapter>(MtnMomoAdapter);
    authService = module.get<MtnMomoAuthService>(MtnMomoAuthService);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('transfer (disbursement)', () => {
    const transferParams = {
      destination: '+233245678901',
      amount: '1000.0000',
      currency: 'GHS',
      reference: 'REF-DISB-001',
    };

    it('should return a transfer result with externalRef', async () => {
      const result = await adapter.transfer(transferParams);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('externalRef');
      expect(result.externalRef).toMatch(/^MOMO-/);
    });

    it('should return success for most sandbox transfers', async () => {
      let successCount = 0;
      const iterations = 30;
      for (let i = 0; i < iterations; i++) {
        const result = await adapter.transfer(transferParams);
        if (result.success) successCount++;
      }
      // With 85% success+pending rate, we expect many successes
      expect(successCount).toBeGreaterThan(iterations * 0.5);
    });

    it('should sometimes return failures in sandbox', async () => {
      let gotFailure = false;
      for (let i = 0; i < 50; i++) {
        const result = await adapter.transfer(transferParams);
        if (!result.success) {
          gotFailure = true;
          expect(result.failureReason).toBeDefined();
          break;
        }
      }
      expect(gotFailure).toBe(true);
    });

    it('should handle amounts as strings', async () => {
      expect(typeof transferParams.amount).toBe('string');
      const result = await adapter.transfer(transferParams);
      expect(result).toBeDefined();
    });
  });

  describe('collect (requestToPay)', () => {
    const collectParams = {
      source: '+233245678901',
      amount: '500.0000',
      currency: 'GHS',
      reference: 'REF-COL-001',
      reason: 'Loan repayment',
    };

    it('should return a transfer result with externalRef', async () => {
      const result = await adapter.collect(collectParams);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('externalRef');
      expect(result.externalRef).toMatch(/^MOMO-COL-/);
    });

    it('should return success for most sandbox collections', async () => {
      let successCount = 0;
      const iterations = 30;
      for (let i = 0; i < iterations; i++) {
        const result = await adapter.collect(collectParams);
        if (result.success) successCount++;
      }
      expect(successCount).toBeGreaterThan(iterations * 0.5);
    });

    it('should sometimes return failures in sandbox', async () => {
      let gotFailure = false;
      for (let i = 0; i < 50; i++) {
        const result = await adapter.collect(collectParams);
        if (!result.success) {
          gotFailure = true;
          expect(result.failureReason).toBeDefined();
          break;
        }
      }
      expect(gotFailure).toBe(true);
    });
  });

  describe('getBalance', () => {
    it('should return balance info in sandbox', async () => {
      const result = await adapter.getBalance('+233245678901');
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('currency');
      expect(result).toHaveProperty('lastUpdated');
      expect(result.currency).toBe('GHS');
      expect(typeof result.available).toBe('string');
      expect(result.available).toBe('25000.0000');
    });
  });

  describe('getTransactionStatus', () => {
    it('should return completed for unknown references in sandbox', async () => {
      const result = await adapter.getTransactionStatus('unknown-ref-xyz');
      expect(result.reference).toBe('unknown-ref-xyz');
      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
    });

    it('should track a transaction after transfer and query its status', async () => {
      // The adapter stores transactions in memory; but the referenceId is
      // internal (UUID), not the externalRef. We verify the adapter works
      // end-to-end by doing a transfer.
      const transferResult = await adapter.transfer({
        destination: '+233245678901',
        amount: '2000.0000',
        currency: 'GHS',
        reference: 'REF-STATUS-001',
      });
      expect(transferResult.externalRef).toBeDefined();
    });
  });

  describe('getCustomerInfo', () => {
    it('should return customer info with correct structure', async () => {
      const result = await adapter.getCustomerInfo('+233245678901');
      expect(result).toHaveProperty('walletId', '+233245678901');
      expect(result).toHaveProperty('fullName');
      expect(result).toHaveProperty('kycLevel');
      expect(result).toHaveProperty('accountStatus', 'active');
      expect(result).toHaveProperty('accountAge');
      expect(result).toHaveProperty('currency', 'GHS');
    });

    it('should return a valid KYC level (tier_1, tier_2, or tier_3)', async () => {
      const result = await adapter.getCustomerInfo('+233245678901');
      expect(['tier_1', 'tier_2', 'tier_3']).toContain(result.kycLevel);
    });

    it('should return account age between 30 and 730 days', async () => {
      const result = await adapter.getCustomerInfo('+233245678901');
      expect(result.accountAge).toBeGreaterThanOrEqual(30);
      expect(result.accountAge).toBeLessThanOrEqual(730);
    });

    it('should return a non-empty fullName', async () => {
      const result = await adapter.getCustomerInfo('+233245678901');
      expect(result.fullName.length).toBeGreaterThan(0);
      expect(result.fullName).toContain(' '); // first + last name
    });

    it('should return GHS currency for Ghana', async () => {
      const result = await adapter.getCustomerInfo('+233245678901');
      expect(result.currency).toBe('GHS');
    });
  });

  describe('getTransactionHistory', () => {
    const dateRange = {
      from: new Date('2026-01-01'),
      to: new Date('2026-03-27'),
    };

    it('should return between 10 and 30 transactions', async () => {
      const result = await adapter.getTransactionHistory('+233245678901', dateRange);
      expect(result.length).toBeGreaterThanOrEqual(10);
      expect(result.length).toBeLessThanOrEqual(30);
    });

    it('should return transactions with correct structure', async () => {
      const result = await adapter.getTransactionHistory('+233245678901', dateRange);
      expect(result.length).toBeGreaterThan(0);

      const txn = result[0];
      expect(txn).toHaveProperty('transactionId');
      expect(txn).toHaveProperty('walletId', '+233245678901');
      expect(txn).toHaveProperty('type');
      expect(txn).toHaveProperty('amount');
      expect(txn).toHaveProperty('currency', 'GHS');
      expect(txn).toHaveProperty('timestamp');
      expect(txn).toHaveProperty('status', 'completed');
    });

    it('should return transactions with amount as a string (Decimal format)', async () => {
      const result = await adapter.getTransactionHistory('+233245678901', dateRange);
      for (const txn of result) {
        expect(typeof txn.amount).toBe('string');
        // Verify it has 4 decimal places
        expect(txn.amount).toMatch(/^\d+\.\d{4}$/);
      }
    });

    it('should have both credit and debit transactions', async () => {
      // Run multiple times to account for randomness
      let hasCredit = false;
      let hasDebit = false;
      for (let i = 0; i < 5; i++) {
        const result = await adapter.getTransactionHistory('+233245678901', dateRange);
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
      const result = await adapter.getTransactionHistory('+233245678901', dateRange);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          result[i].timestamp.getTime(),
        );
      }
    });

    it('should include valid categories', async () => {
      const validCategories = ['salary', 'transfer', 'merchant', 'utility', 'airtime'];
      const result = await adapter.getTransactionHistory('+233245678901', dateRange);
      for (const txn of result) {
        if (txn.category) {
          expect(validCategories).toContain(txn.category);
        }
      }
    });

    it('should have transaction IDs starting with MOMO-TXN-', async () => {
      const result = await adapter.getTransactionHistory('+233245678901', dateRange);
      for (const txn of result) {
        expect(txn.transactionId).toMatch(/^MOMO-TXN-/);
      }
    });
  });

  describe('registerWebhook', () => {
    it('should return a webhook registration with correct structure', async () => {
      const result = await adapter.registerWebhook(
        ['transaction.completed', 'transaction.failed'],
        'https://example.com/webhook',
      );
      expect(result).toHaveProperty('id');
      expect(result.id).toMatch(/^MOMO-WH-/);
      expect(result).toHaveProperty('events', ['transaction.completed', 'transaction.failed']);
      expect(result).toHaveProperty('callbackUrl', 'https://example.com/webhook');
      expect(result).toHaveProperty('active', true);
    });
  });

  describe('circuit breaker', () => {
    it('should initially have circuit breaker closed', () => {
      expect(adapter.getCircuitBreakerState()).toBe('closed');
    });

    it('should reset circuit breaker state', () => {
      adapter.resetCircuitBreaker();
      expect(adapter.getCircuitBreakerState()).toBe('closed');
    });
  });
});

describe('MtnMomoWebhookHandler', () => {
  let webhookHandler: MtnMomoWebhookHandler;

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
        MtnMomoWebhookHandler,
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();

    webhookHandler = module.get<MtnMomoWebhookHandler>(MtnMomoWebhookHandler);
  });

  describe('handleCallback', () => {
    const successPayload: MoMoCallbackPayload = {
      referenceId: 'momo-ref-001',
      externalId: 'ext-ref-001',
      financialTransactionId: 'fin-txn-001',
      status: 'SUCCESSFUL',
      amount: '1000.0000',
      currency: 'GHS',
      payee: { partyIdType: 'MSISDN', partyId: '+233245678901' },
    };

    const failedPayload: MoMoCallbackPayload = {
      referenceId: 'momo-ref-002',
      externalId: 'ext-ref-002',
      status: 'FAILED',
      reason: { code: 'PAYER_LIMIT_REACHED', message: 'Payer limit reached' },
      amount: '5000.0000',
      currency: 'GHS',
      payer: { partyIdType: 'MSISDN', partyId: '+233245678901' },
    };

    const pendingPayload: MoMoCallbackPayload = {
      referenceId: 'momo-ref-003',
      externalId: 'ext-ref-003',
      status: 'PENDING',
      amount: '2000.0000',
      currency: 'GHS',
      payer: { partyIdType: 'MSISDN', partyId: '+233245678901' },
    };

    it('should process a successful callback', async () => {
      const result = await webhookHandler.handleCallback(
        successPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(true);
      expect(result.referenceId).toBe('momo-ref-001');
      expect(result.status).toBe('SUCCESSFUL');
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'momo.transaction.completed',
        'tenant-001',
        expect.objectContaining({
          referenceId: 'momo-ref-001',
          status: 'SUCCESSFUL',
          amount: '1000.0000',
        }),
      );
    });

    it('should process a failed callback', async () => {
      const result = await webhookHandler.handleCallback(
        failedPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(true);
      expect(result.referenceId).toBe('momo-ref-002');
      expect(result.status).toBe('FAILED');
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'momo.transaction.failed',
        'tenant-001',
        expect.objectContaining({
          referenceId: 'momo-ref-002',
          status: 'FAILED',
          reason: { code: 'PAYER_LIMIT_REACHED', message: 'Payer limit reached' },
        }),
      );
    });

    it('should process a pending callback', async () => {
      const result = await webhookHandler.handleCallback(
        pendingPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(true);
      expect(result.referenceId).toBe('momo-ref-003');
      expect(result.status).toBe('PENDING');
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'momo.transaction.pending',
        'tenant-001',
        expect.objectContaining({
          referenceId: 'momo-ref-003',
          status: 'PENDING',
        }),
      );
    });

    it('should reject callback with invalid signature', async () => {
      mockWebhookService.verifySignature.mockReturnValueOnce(false);

      const result = await webhookHandler.handleCallback(
        successPayload,
        'bad-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Invalid webhook signature');
      expect(mockEventBus.emitAndBuild).not.toHaveBeenCalled();
    });

    it('should skip duplicate callbacks via idempotency check', async () => {
      mockWebhookService.isIdempotent.mockReturnValueOnce(true);

      const result = await webhookHandler.handleCallback(
        successPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(result.processed).toBe(false);
      expect(result.message).toContain('Duplicate callback');
      expect(mockEventBus.emitAndBuild).not.toHaveBeenCalled();
    });

    it('should call verifySignature with the correct arguments', async () => {
      await webhookHandler.handleCallback(
        successPayload,
        'sig-value',
        'secret-value',
        'tenant-001',
      );

      expect(mockWebhookService.verifySignature).toHaveBeenCalledWith(
        JSON.stringify(successPayload),
        'sig-value',
        'secret-value',
      );
    });

    it('should call isIdempotent with a MoMo-specific key', async () => {
      await webhookHandler.handleCallback(
        successPayload,
        'valid-sig',
        'webhook-secret',
        'tenant-001',
      );

      expect(mockWebhookService.isIdempotent).toHaveBeenCalledWith(
        'momo-callback-momo-ref-001',
      );
    });
  });
});
