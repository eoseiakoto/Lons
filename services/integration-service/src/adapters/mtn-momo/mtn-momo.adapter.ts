import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  IWalletAdapter,
  TransferParams,
  TransferResult,
  CollectionParams,
  BalanceInfo,
  TransactionStatusResult,
} from '@lons/process-engine';
import {
  WalletCustomerInfo,
  WalletTransaction,
  DateRange,
  WebhookRegistration,
} from '../wallet-adapter.types';
import { maskPhone, maskName } from '@lons/common';
import { CircuitBreaker } from '../../resilience/circuit-breaker';
import { withRetry, RetryOptions } from '../../resilience/retry';
import { MtnMomoAuthService } from './mtn-momo.auth';
import { MoMoTransactionState } from './mtn-momo.types';

@Injectable()
export class MtnMomoAdapter implements IWalletAdapter {
  private readonly logger = new Logger('MtnMomoAdapter');
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryOptions: RetryOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  };

  // In-memory transaction state tracking for sandbox
  private readonly transactions = new Map<string, MoMoTransactionState>();

  constructor(private authService: MtnMomoAuthService) {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      halfOpenMaxAttempts: 1,
    });
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    this.logger.log(
      `MoMo disbursement: ${params.amount} ${params.currency} to ${maskPhone(params.destination)}`,
    );

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const referenceId = uuidv4();
        const token = await this.authService.getDisbursementToken();

        if (this.authService.isSandbox()) {
          return this.simulateTransfer(referenceId, params);
        }

        // Production: POST /disbursement/v1_0/transfer
        // Headers: Authorization: Bearer {token}, X-Reference-Id: {referenceId},
        //          X-Target-Environment: {env}, Ocp-Apim-Subscription-Key: {key}
        this.logger.log(
          `POST ${this.authService.getBaseUrl()}/disbursement/v1_0/transfer [ref: ${referenceId}]`,
        );
        void token; // Would be used in production HTTP call

        return this.simulateTransfer(referenceId, params);
      }, this.retryOptions),
    );
  }

  async collect(params: CollectionParams): Promise<TransferResult> {
    this.logger.log(
      `MoMo requestToPay: ${params.amount} ${params.currency} from ${maskPhone(params.source)}`,
    );

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const referenceId = uuidv4();
        const token = await this.authService.getCollectionToken();

        if (this.authService.isSandbox()) {
          return this.simulateCollection(referenceId, params);
        }

        // Production: POST /collection/v1_0/requesttopay
        this.logger.log(
          `POST ${this.authService.getBaseUrl()}/collection/v1_0/requesttopay [ref: ${referenceId}]`,
        );
        void token;

        return this.simulateCollection(referenceId, params);
      }, this.retryOptions),
    );
  }

  async getBalance(walletId: string): Promise<BalanceInfo> {
    this.logger.log(`MoMo balance query for ${maskPhone(walletId)}`);

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const token = await this.authService.getDisbursementToken();

        if (this.authService.isSandbox()) {
          return {
            available: '25000.0000',
            currency: 'GHS',
            lastUpdated: new Date(),
          };
        }

        // Production: GET /disbursement/v1_0/account/balance
        this.logger.log(`GET ${this.authService.getBaseUrl()}/disbursement/v1_0/account/balance`);
        void token;

        return { available: '25000.0000', currency: 'GHS', lastUpdated: new Date() };
      }, this.retryOptions),
    );
  }

  async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    this.logger.log(`MoMo status query for ${reference}`);

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        // Check local state first (sandbox)
        const txn = this.transactions.get(reference);
        if (txn) {
          // Simulate pending -> completed transition after 2 seconds
          if (txn.status === 'PENDING' && Date.now() - txn.createdAt.getTime() > 2000) {
            txn.status = 'SUCCESSFUL';
            txn.completedAt = new Date();
          }

          return {
            reference: txn.referenceId,
            status: this.mapMoMoStatus(txn.status),
            amount: txn.amount,
            completedAt: txn.completedAt,
            failureReason: txn.failureReason,
          };
        }

        if (this.authService.isSandbox()) {
          return {
            reference,
            status: 'completed' as const,
            completedAt: new Date(),
          };
        }

        // Production: GET /disbursement/v1_0/transfer/{referenceId} or
        //             GET /collection/v1_0/requesttopay/{referenceId}
        const token = await this.authService.getDisbursementToken();
        this.logger.log(
          `GET ${this.authService.getBaseUrl()}/disbursement/v1_0/transfer/${reference}`,
        );
        void token;

        return { reference, status: 'completed' as const, completedAt: new Date() };
      }, this.retryOptions),
    );
  }

  async getCustomerInfo(walletId: string): Promise<WalletCustomerInfo> {
    this.logger.log(`MoMo customer info query for ${maskPhone(walletId)}`);

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const token = await this.authService.getDisbursementToken();

        if (this.authService.isSandbox()) {
          return this.simulateCustomerInfo(walletId);
        }

        // Production: GET /disbursement/v1_0/accountholder/msisdn/{walletId}/basicuserinfo
        this.logger.log(
          `GET ${this.authService.getBaseUrl()}/disbursement/v1_0/accountholder/msisdn/${maskPhone(walletId)}/basicuserinfo`,
        );
        void token;

        return this.simulateCustomerInfo(walletId);
      }, this.retryOptions),
    );
  }

  async getTransactionHistory(walletId: string, dateRange: DateRange): Promise<WalletTransaction[]> {
    this.logger.log(
      `MoMo transaction history for ${maskPhone(walletId)} from ${dateRange.from.toISOString()} to ${dateRange.to.toISOString()}`,
    );

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const token = await this.authService.getDisbursementToken();

        if (this.authService.isSandbox()) {
          return this.simulateTransactionHistory(walletId, dateRange);
        }

        // Production: GET /disbursement/v1_0/accountholder/msisdn/{walletId}/transactions
        this.logger.log(
          `GET ${this.authService.getBaseUrl()}/disbursement/v1_0/accountholder/msisdn/${maskPhone(walletId)}/transactions`,
        );
        void token;

        return this.simulateTransactionHistory(walletId, dateRange);
      }, this.retryOptions),
    );
  }

  async registerWebhook(events: string[], callbackUrl: string): Promise<WebhookRegistration> {
    this.logger.log(`MoMo webhook registration for events: ${events.join(', ')}`);

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const token = await this.authService.getDisbursementToken();

        if (this.authService.isSandbox()) {
          const id = `MOMO-WH-${uuidv4().slice(0, 8).toUpperCase()}`;
          this.logger.log(`[SANDBOX] MoMo webhook registered: ${id}`);
          return {
            id,
            events,
            callbackUrl,
            active: true,
          };
        }

        // Production: POST /v1_0/webhooks
        this.logger.log(
          `POST ${this.authService.getBaseUrl()}/v1_0/webhooks`,
        );
        void token;

        const id = `MOMO-WH-${uuidv4().slice(0, 8).toUpperCase()}`;
        return { id, events, callbackUrl, active: true };
      }, this.retryOptions),
    );
  }

  private simulateCustomerInfo(walletId: string): WalletCustomerInfo {
    const firstNames = ['Kwame', 'Ama', 'Kofi', 'Akua', 'Yaw', 'Abena', 'Kwesi', 'Efua'];
    const lastNames = ['Mensah', 'Asante', 'Osei', 'Boateng', 'Agyemang', 'Appiah', 'Owusu', 'Darko'];
    const kycLevels = ['tier_1', 'tier_2', 'tier_3'];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const fullName = `${firstName} ${lastName}`;
    const kycLevel = kycLevels[Math.floor(Math.random() * kycLevels.length)];
    const accountAge = 30 + Math.floor(Math.random() * 700); // 30-730 days

    this.logger.log(
      `[SANDBOX] MoMo customer info for ${maskPhone(walletId)}: ${maskName(firstName)} ${maskName(lastName)}, KYC: ${kycLevel}`,
    );

    return {
      walletId,
      fullName,
      kycLevel,
      accountStatus: 'active',
      accountAge,
      currency: 'GHS',
    };
  }

  private simulateTransactionHistory(walletId: string, dateRange: DateRange): WalletTransaction[] {
    const categories = ['salary', 'transfer', 'merchant', 'utility', 'airtime'];
    const transactionCount = 10 + Math.floor(Math.random() * 21); // 10-30
    const transactions: WalletTransaction[] = [];

    const startTime = dateRange.from.getTime();
    const endTime = dateRange.to.getTime();
    const timeRange = endTime - startTime;

    for (let i = 0; i < transactionCount; i++) {
      const isCredit = Math.random() < 0.4;
      const category = categories[Math.floor(Math.random() * categories.length)];

      // Generate realistic amounts based on category
      let amount: string;
      switch (category) {
        case 'salary':
          amount = (1500 + Math.floor(Math.random() * 3500)).toFixed(4);
          break;
        case 'transfer':
          amount = (50 + Math.floor(Math.random() * 950)).toFixed(4);
          break;
        case 'merchant':
          amount = (10 + Math.floor(Math.random() * 490)).toFixed(4);
          break;
        case 'utility':
          amount = (20 + Math.floor(Math.random() * 280)).toFixed(4);
          break;
        case 'airtime':
          amount = (5 + Math.floor(Math.random() * 95)).toFixed(4);
          break;
        default:
          amount = (10 + Math.floor(Math.random() * 990)).toFixed(4);
      }

      const timestamp = new Date(startTime + Math.floor(Math.random() * timeRange));

      transactions.push({
        transactionId: `MOMO-TXN-${uuidv4().slice(0, 8).toUpperCase()}`,
        walletId,
        type: isCredit ? 'credit' : 'debit',
        amount,
        currency: 'GHS',
        counterpartyId: `+2332${Math.floor(10000000 + Math.random() * 90000000)}`,
        category,
        timestamp,
        status: 'completed',
      });
    }

    // Sort by timestamp descending
    transactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    this.logger.log(
      `[SANDBOX] MoMo transaction history for ${maskPhone(walletId)}: ${transactions.length} transactions`,
    );

    return transactions;
  }

  private simulateTransfer(referenceId: string, params: TransferParams): TransferResult {
    const rand = Math.random();
    let status: 'SUCCESSFUL' | 'PENDING' | 'FAILED';
    let failureReason: string | undefined;

    if (rand < 0.75) {
      status = 'SUCCESSFUL';
    } else if (rand < 0.85) {
      status = 'PENDING';
    } else if (rand < 0.95) {
      status = 'FAILED';
      failureReason = 'PAYER_LIMIT_REACHED';
    } else {
      status = 'FAILED';
      failureReason = 'NOT_ENOUGH_FUNDS';
    }

    const externalRef = `MOMO-${referenceId.slice(0, 8).toUpperCase()}`;

    this.transactions.set(referenceId, {
      referenceId,
      externalId: params.reference,
      status,
      type: 'disbursement',
      amount: params.amount,
      currency: params.currency,
      party: params.destination,
      createdAt: new Date(),
      completedAt: status === 'SUCCESSFUL' ? new Date() : undefined,
      failureReason,
    });

    this.logger.log(
      `[SANDBOX] MoMo disbursement ${externalRef}: ${status} (${params.amount} ${params.currency} to ${maskPhone(params.destination)})`,
    );

    return {
      success: status === 'SUCCESSFUL' || status === 'PENDING',
      externalRef,
      failureReason,
    };
  }

  private simulateCollection(referenceId: string, params: CollectionParams): TransferResult {
    const rand = Math.random();
    let status: 'SUCCESSFUL' | 'PENDING' | 'FAILED';
    let failureReason: string | undefined;

    if (rand < 0.75) {
      status = 'SUCCESSFUL';
    } else if (rand < 0.85) {
      status = 'PENDING';
    } else if (rand < 0.95) {
      status = 'FAILED';
      failureReason = 'PAYER_LIMIT_REACHED';
    } else {
      status = 'FAILED';
      failureReason = 'NOT_ENOUGH_FUNDS';
    }

    const externalRef = `MOMO-COL-${referenceId.slice(0, 8).toUpperCase()}`;

    this.transactions.set(referenceId, {
      referenceId,
      externalId: params.reference,
      status,
      type: 'collection',
      amount: params.amount,
      currency: params.currency,
      party: params.source,
      createdAt: new Date(),
      completedAt: status === 'SUCCESSFUL' ? new Date() : undefined,
      failureReason,
    });

    this.logger.log(
      `[SANDBOX] MoMo requestToPay ${externalRef}: ${status} (${params.amount} ${params.currency} from ${maskPhone(params.source)})`,
    );

    return {
      success: status === 'SUCCESSFUL' || status === 'PENDING',
      externalRef,
      failureReason,
    };
  }

  private mapMoMoStatus(status: string): 'pending' | 'completed' | 'failed' | 'reversed' {
    switch (status) {
      case 'SUCCESSFUL':
        return 'completed';
      case 'PENDING':
        return 'pending';
      case 'FAILED':
        return 'failed';
      default:
        return 'pending';
    }
  }

  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}
