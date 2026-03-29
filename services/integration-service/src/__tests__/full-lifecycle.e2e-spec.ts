import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MtnMomoAdapter } from '../adapters/mtn-momo/mtn-momo.adapter';
import { MtnMomoAuthService } from '../adapters/mtn-momo/mtn-momo.auth';
import { MtnMomoWebhookHandler } from '../adapters/mtn-momo/mtn-momo.webhook';
import { MoMoCallbackPayload } from '../adapters/mtn-momo/mtn-momo.types';
import { MpesaAdapter } from '../adapters/mpesa/mpesa.adapter';
import { MpesaAuthService } from '../adapters/mpesa/mpesa.auth';
import { GenericWalletAdapter } from '../adapters/generic-wallet/generic-wallet.adapter';
import {
  GenericWalletService,
  CreateWalletProviderConfigDto,
} from '../adapters/generic-wallet/generic-wallet.service';
import { IWalletAdapterConfig } from '../adapters/generic-wallet/generic-wallet.types';
import { WebhookService } from '../webhook/webhook.service';
import { GhanaXcbAdapter } from '../credit-bureau/ghana-xcb.adapter';
import { KenyaCrbAdapter } from '../credit-bureau/kenya-crb.adapter';
import { MockCreditBureauAdapter } from '../credit-bureau/mock-credit-bureau.adapter';
import { CreditBureauFactory } from '../credit-bureau/credit-bureau-factory';
import { BatchReportingService } from '../credit-bureau/batch-reporting.service';
import { BatchReportRecord } from '../credit-bureau/credit-bureau.interface';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-e2e-lifecycle';
const CUSTOMER_ID = 'customer-lifecycle-001';
const WEBHOOK_SECRET = 'lifecycle-webhook-secret';

function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function createMockEventBus() {
  return {
    emitAndBuild: jest.fn(),
    emit: jest.fn(),
    buildEvent: jest.fn(),
  };
}

function createMockPrismaForLifecycle() {
  const walletConfigs = new Map<string, any>();
  let counter = 0;

  return {
    walletProviderConfig: {
      create: jest.fn().mockImplementation(({ data }) => {
        counter++;
        const record = {
          id: `wpc-lc-${counter}`,
          ...data,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        walletConfigs.set(record.id, record);
        return Promise.resolve(record);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const rec = walletConfigs.get(where.id);
        if (rec && rec.tenantId === where.tenantId) return Promise.resolve(rec);
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() =>
        Promise.resolve(Array.from(walletConfigs.values())),
      ),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const rec = walletConfigs.get(where.id);
        if (rec) Object.assign(rec, data, { updatedAt: new Date() });
        return Promise.resolve(rec);
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        const rec = walletConfigs.get(where.id);
        walletConfigs.delete(where.id);
        return Promise.resolve(rec);
      }),
    },
    contract: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'contract-lc-001',
          tenantId: TENANT_ID,
          customerId: CUSTOMER_ID,
          principalAmount: '8000.0000',
          totalOutstanding: '8500.0000',
          status: 'active',
          customer: { nationalId: 'GHA-LC-001' },
          product: { currency: 'GHS' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    },
    repayment: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'repayment-lc-001',
          tenantId: TENANT_ID,
          contractId: 'contract-lc-001',
          amount: '2000.0000',
          status: 'completed',
          contract: {
            customerId: CUSTOMER_ID,
            customer: { nationalId: 'GHA-LC-001' },
            product: { currency: 'GHS' },
          },
          createdAt: new Date(),
        },
      ]),
    },
    notification: {
      create: jest.fn().mockImplementation(({ data }) => {
        return Promise.resolve({
          id: `notif-lc-${Date.now()}`,
          ...data,
          retryCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }),
      update: jest.fn(),
    },
    _walletConfigs: walletConfigs,
  };
}

// ---------------------------------------------------------------------------
// Full Lifecycle E2E Tests
// ---------------------------------------------------------------------------

describe('Full Integration Lifecycle (E2E)', () => {
  let module: TestingModule;
  let momoAdapter: MtnMomoAdapter;
  let mpesaAdapter: MpesaAdapter;
  let genericWalletAdapter: GenericWalletAdapter;
  let genericWalletService: GenericWalletService;
  let momoWebhookHandler: MtnMomoWebhookHandler;
  let batchReportingService: BatchReportingService;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let mockPrisma: ReturnType<typeof createMockPrismaForLifecycle>;

  beforeAll(async () => {
    eventBus = createMockEventBus();
    mockPrisma = createMockPrismaForLifecycle();

    const sandboxConfigService = {
      get: jest.fn().mockImplementation((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          MTN_MOMO_API_KEY: 'sandbox-api-key',
          MTN_MOMO_API_SECRET: 'sandbox-api-secret',
          MTN_MOMO_SUBSCRIPTION_KEY: 'sandbox-sub-key',
          MTN_MOMO_ENVIRONMENT: 'sandbox',
          MPESA_CONSUMER_KEY: 'sandbox-consumer-key',
          MPESA_CONSUMER_SECRET: 'sandbox-consumer-secret',
          MPESA_SHORT_CODE: '174379',
          MPESA_PASSKEY: 'sandbox-passkey',
          MPESA_INITIATOR_NAME: 'testapi',
          MPESA_SECURITY_CREDENTIAL: 'sandbox-credential',
          MPESA_ENVIRONMENT: 'sandbox',
          MPESA_CALLBACK_BASE_URL: 'https://callbacks.example.com',
          NODE_ENV: 'development',
        };
        return values[key] ?? fallback;
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        MtnMomoAdapter,
        MtnMomoAuthService,
        MpesaAdapter,
        MpesaAuthService,
        GenericWalletAdapter,
        GhanaXcbAdapter,
        KenyaCrbAdapter,
        MockCreditBureauAdapter,
        CreditBureauFactory,
        { provide: ConfigService, useValue: sandboxConfigService },
        { provide: 'EventBusService', useValue: eventBus },
      ],
    }).compile();

    momoAdapter = module.get(MtnMomoAdapter);
    mpesaAdapter = module.get(MpesaAdapter);
    genericWalletAdapter = module.get(GenericWalletAdapter);

    genericWalletService = new GenericWalletService(
      mockPrisma as any,
      genericWalletAdapter,
    );

    const webhookService = new WebhookService(eventBus as any);
    momoWebhookHandler = new MtnMomoWebhookHandler(webhookService, eventBus as any);

    batchReportingService = new BatchReportingService(
      mockPrisma as any,
      module.get(CreditBureauFactory),
    );
  });

  afterAll(async () => {
    await module.close();
  });

  // -----------------------------------------------------------------------
  // Step 1: Create wallet provider config -> use for disbursement
  // -----------------------------------------------------------------------

  let walletConfigId: string;

  it('Step 1: should create a wallet provider config', async () => {
    const dto: CreateWalletProviderConfigDto = {
      providerName: 'LifecycleWallet',
      authType: 'api_key',
      baseUrl: 'https://api.lifecycle-wallet.local',
      configJson: {
        credentials: { apiKey: 'lc-key-001' },
        apiKeyHeader: 'X-API-Key',
      },
      requestMapping: {
        disburse: {
          method: 'POST',
          path: '/v1/send',
          bodyMapping: {
            to: '$destination',
            amount: '$amount',
            currency: '$currency',
            ref: '$reference',
          },
        },
        collect: { method: 'POST', path: '/v1/collect', bodyMapping: {} },
        balance: { method: 'GET', path: '/v1/balance' },
        status: { method: 'GET', path: '/v1/status' },
      },
      responseMapping: {
        referenceField: 'txnId',
        statusField: 'txnStatus',
        statusValues: { success: 'DONE', pending: 'IN_PROGRESS', failed: 'REJECTED' },
      },
    };

    const record = await genericWalletService.create(TENANT_ID, dto);

    expect(record).toBeDefined();
    expect(record.id).toBeDefined();
    expect(record.providerName).toBe('LifecycleWallet');
    walletConfigId = record.id;
  });

  it('Step 1b: should use the config for a generic wallet disbursement', async () => {
    const record = await genericWalletService.findById(TENANT_ID, walletConfigId);
    const config: IWalletAdapterConfig = genericWalletService.buildAdapterConfig(record);

    const result = await genericWalletAdapter.transferWithConfig(
      {
        destination: '+233241234567',
        amount: '8000.0000',
        currency: 'GHS',
        reference: 'lc-disb-001',
      },
      config,
    );

    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(result.externalRef).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Step 2: Disbursement via MTN MoMo
  // -----------------------------------------------------------------------

  it('Step 2: should disburse via MTN MoMo and get a TransferResult', async () => {
    const result = await momoAdapter.transfer({
      destination: '+233241234567',
      amount: '8000.0000',
      currency: 'GHS',
      reference: 'lc-momo-disb-001',
    });

    expect(result).toBeDefined();
    expect(result.externalRef).toBeDefined();
    expect(result.externalRef!.startsWith('MOMO-')).toBe(true);
    expect(typeof result.success).toBe('boolean');
  });

  // -----------------------------------------------------------------------
  // Step 3: Disbursement via M-Pesa
  // -----------------------------------------------------------------------

  it('Step 3: should disburse via M-Pesa and get a TransferResult', async () => {
    const result = await mpesaAdapter.transfer({
      destination: '+254712345678',
      amount: '50000.0000',
      currency: 'KES',
      reference: 'lc-mpesa-disb-001',
    });

    expect(result).toBeDefined();
    expect(result.externalRef).toBeDefined();
    expect(result.externalRef!.startsWith('MPESA-')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Step 4: After disbursement, submit batch credit bureau report
  // -----------------------------------------------------------------------

  it('Step 4: should generate and submit a batch credit bureau report after loan events', async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const records = await batchReportingService.generateBatchReport(TENANT_ID, since);

    expect(records.length).toBeGreaterThan(0);

    // All amounts should be strings
    for (const record of records) {
      expect(typeof record.amount).toBe('string');
    }

    const result = await batchReportingService.submitBatch(TENANT_ID, 'GH', records);

    expect(result.totalRecords).toBe(records.length);
    expect(result.successCount).toBeGreaterThan(0);
    expect(result.failureCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Step 5: Webhook callback from MoMo -> process and verify idempotency
  // -----------------------------------------------------------------------

  it('Step 5: should process MoMo webhook callback successfully', async () => {
    const payload: MoMoCallbackPayload = {
      referenceId: 'lc-webhook-ref-001',
      externalId: 'lc-momo-disb-001',
      financialTransactionId: 'fin-lc-001',
      status: 'SUCCESSFUL',
      amount: '8000.0000',
      currency: 'GHS',
      payee: { partyIdType: 'MSISDN', partyId: '+233241234567' },
    };

    const payloadStr = JSON.stringify(payload);
    const signature = generateSignature(payloadStr, WEBHOOK_SECRET);

    const result = await momoWebhookHandler.handleCallback(
      payload,
      signature,
      WEBHOOK_SECRET,
      TENANT_ID,
    );

    expect(result.processed).toBe(true);
    expect(result.status).toBe('SUCCESSFUL');
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'momo.transaction.completed',
      TENANT_ID,
      expect.objectContaining({
        referenceId: 'lc-webhook-ref-001',
        amount: '8000.0000',
        currency: 'GHS',
      }),
    );
  });

  it('Step 5b: should verify idempotency for duplicate webhook callback', async () => {
    const payload: MoMoCallbackPayload = {
      referenceId: 'lc-webhook-ref-001', // same as above
      externalId: 'lc-momo-disb-001',
      status: 'SUCCESSFUL',
      amount: '8000.0000',
      currency: 'GHS',
    };

    const payloadStr = JSON.stringify(payload);
    const signature = generateSignature(payloadStr, WEBHOOK_SECRET);

    const result = await momoWebhookHandler.handleCallback(
      payload,
      signature,
      WEBHOOK_SECRET,
      TENANT_ID,
    );

    expect(result.processed).toBe(false);
    expect(result.message).toContain('Duplicate');
  });

  // -----------------------------------------------------------------------
  // Step 6: Combined lifecycle — config creation, disbursement, bureau report
  // -----------------------------------------------------------------------

  it('Step 6: full chain - create config, disburse, report to bureau', async () => {
    // Create config
    const configRecord = await genericWalletService.create(TENANT_ID, {
      providerName: 'ChainWallet',
      authType: 'bearer',
      baseUrl: 'https://api.chainwallet.local',
      configJson: { credentials: { token: 'chain-token-001' } },
      requestMapping: {
        disburse: {
          method: 'POST',
          path: '/transfer',
          bodyMapping: { dest: '$destination', amt: '$amount', cur: '$currency' },
        },
        collect: { method: 'POST', path: '/collect', bodyMapping: {} },
        balance: { method: 'GET', path: '/balance' },
        status: { method: 'GET', path: '/status' },
      },
      responseMapping: {
        referenceField: 'id',
        statusField: 'state',
        statusValues: { success: 'OK', pending: 'WAIT', failed: 'FAIL' },
      },
    });

    // Build config and disburse
    const adapterConfig = genericWalletService.buildAdapterConfig(configRecord);
    const disbResult = await genericWalletAdapter.transferWithConfig(
      {
        destination: '+233247777777',
        amount: '3000.0000',
        currency: 'GHS',
        reference: 'chain-disb-001',
      },
      adapterConfig,
    );

    expect(disbResult).toBeDefined();
    expect(typeof disbResult.success).toBe('boolean');

    // Submit bureau report for the disbursement event
    const batchRecords: BatchReportRecord[] = [
      {
        customerId: CUSTOMER_ID,
        contractId: 'contract-chain-001',
        nationalId: 'GHA-CHAIN-001',
        amount: '3000.0000',
        currency: 'GHS',
        type: 'origination',
        status: 'active',
        eventDate: new Date(),
      },
    ];

    const batchResult = await batchReportingService.submitBatch(
      TENANT_ID,
      'GH',
      batchRecords,
    );

    expect(batchResult.totalRecords).toBe(1);
    expect(batchResult.successCount).toBe(1);
  });
});
