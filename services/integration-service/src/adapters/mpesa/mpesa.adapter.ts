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
import { MpesaAuthService } from './mpesa.auth';
import { MpesaTransactionState } from './mpesa.types';

@Injectable()
export class MpesaAdapter implements IWalletAdapter {
  private readonly logger = new Logger('MpesaAdapter');
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryOptions: RetryOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  };

  // In-memory transaction state tracking for sandbox
  private readonly transactions = new Map<string, MpesaTransactionState>();

  constructor(private authService: MpesaAuthService) {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      halfOpenMaxAttempts: 1,
    });
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    this.logger.log(
      `M-Pesa B2C disbursement: ${params.amount} ${params.currency} to ${maskPhone(params.destination)}`,
    );

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const conversationId = uuidv4();
        const token = await this.authService.getAccessToken();

        if (this.authService.isSandbox()) {
          return this.simulateB2CTransfer(conversationId, params);
        }

        // Production: POST /mpesa/b2c/v1/paymentrequest
        this.logger.log(
          `POST ${this.authService.getBaseUrl()}/mpesa/b2c/v1/paymentrequest [conv: ${conversationId}]`,
        );
        void token; // Would be used in production HTTP call

        return this.simulateB2CTransfer(conversationId, params);
      }, this.retryOptions),
    );
  }

  async collect(params: CollectionParams): Promise<TransferResult> {
    this.logger.log(
      `M-Pesa STK Push: ${params.amount} ${params.currency} from ${maskPhone(params.source)}`,
    );

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const checkoutRequestId = uuidv4();
        const token = await this.authService.getAccessToken();

        if (this.authService.isSandbox()) {
          return this.simulateSTKPush(checkoutRequestId, params);
        }

        // Production: POST /mpesa/stkpush/v1/processrequest
        const timestamp = this.authService.generateTimestamp();
        const _password = this.authService.generatePassword(timestamp);

        this.logger.log(
          `POST ${this.authService.getBaseUrl()}/mpesa/stkpush/v1/processrequest [checkout: ${checkoutRequestId}]`,
        );
        void token;

        return this.simulateSTKPush(checkoutRequestId, params);
      }, this.retryOptions),
    );
  }

  async getBalance(walletId: string): Promise<BalanceInfo> {
    this.logger.log(`M-Pesa balance query for ${maskPhone(walletId)}`);

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const token = await this.authService.getAccessToken();

        if (this.authService.isSandbox()) {
          return {
            available: '30000.0000',
            currency: 'KES',
            lastUpdated: new Date(),
          };
        }

        // Production: POST /mpesa/accountbalance/v1/query
        this.logger.log(`POST ${this.authService.getBaseUrl()}/mpesa/accountbalance/v1/query`);
        void token;

        return { available: '30000.0000', currency: 'KES', lastUpdated: new Date() };
      }, this.retryOptions),
    );
  }

  async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    this.logger.log(`M-Pesa status query for ${reference}`);

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        // Check local state first (sandbox)
        const txn = this.transactions.get(reference);
        if (txn) {
          // Simulate pending -> completed transition after 2 seconds
          if (txn.status === 'PENDING' && Date.now() - txn.createdAt.getTime() > 2000) {
            txn.status = 'COMPLETED';
            txn.completedAt = new Date();
          }

          return {
            reference: txn.referenceId,
            status: this.mapMpesaStatus(txn.status),
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

        // Production: POST /mpesa/transactionstatus/v1/query
        const token = await this.authService.getAccessToken();
        this.logger.log(
          `POST ${this.authService.getBaseUrl()}/mpesa/transactionstatus/v1/query [ref: ${reference}]`,
        );
        void token;

        return { reference, status: 'completed' as const, completedAt: new Date() };
      }, this.retryOptions),
    );
  }

  async getCustomerInfo(walletId: string): Promise<WalletCustomerInfo> {
    this.logger.log(`M-Pesa customer info query for ${maskPhone(walletId)}`);

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const token = await this.authService.getAccessToken();

        if (this.authService.isSandbox()) {
          return this.simulateCustomerInfo(walletId);
        }

        // Production: POST /mpesa/customerinfo/v1/query
        this.logger.log(
          `POST ${this.authService.getBaseUrl()}/mpesa/customerinfo/v1/query [wallet: ${maskPhone(walletId)}]`,
        );
        void token;

        return this.simulateCustomerInfo(walletId);
      }, this.retryOptions),
    );
  }

  async getTransactionHistory(walletId: string, dateRange: DateRange): Promise<WalletTransaction[]> {
    this.logger.log(
      `M-Pesa transaction history for ${maskPhone(walletId)} from ${dateRange.from.toISOString()} to ${dateRange.to.toISOString()}`,
    );

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const token = await this.authService.getAccessToken();

        if (this.authService.isSandbox()) {
          return this.simulateTransactionHistory(walletId, dateRange);
        }

        // Production: POST /mpesa/statement/v1/query
        this.logger.log(
          `POST ${this.authService.getBaseUrl()}/mpesa/statement/v1/query [wallet: ${maskPhone(walletId)}]`,
        );
        void token;

        return this.simulateTransactionHistory(walletId, dateRange);
      }, this.retryOptions),
    );
  }

  async registerWebhook(events: string[], callbackUrl: string): Promise<WebhookRegistration> {
    this.logger.log(`M-Pesa webhook registration for events: ${events.join(', ')}`);

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const token = await this.authService.getAccessToken();

        if (this.authService.isSandbox()) {
          const id = `MPESA-WH-${uuidv4().slice(0, 8).toUpperCase()}`;
          this.logger.log(`[SANDBOX] M-Pesa webhook registered: ${id}`);
          return {
            id,
            events,
            callbackUrl,
            active: true,
          };
        }

        // Production: POST /mpesa/webhook/v1/register
        this.logger.log(
          `POST ${this.authService.getBaseUrl()}/mpesa/webhook/v1/register`,
        );
        void token;

        const id = `MPESA-WH-${uuidv4().slice(0, 8).toUpperCase()}`;
        return { id, events, callbackUrl, active: true };
      }, this.retryOptions),
    );
  }

  private simulateCustomerInfo(walletId: string): WalletCustomerInfo {
    const firstNames = ['James', 'Mary', 'John', 'Faith', 'Peter', 'Grace', 'David', 'Ruth'];
    const lastNames = ['Kamau', 'Wanjiku', 'Ochieng', 'Muthoni', 'Kipchoge', 'Atieno', 'Kimani', 'Nyambura'];
    const kycLevels = ['tier_1', 'tier_2', 'tier_3'];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const fullName = `${firstName} ${lastName}`;
    const kycLevel = kycLevels[Math.floor(Math.random() * kycLevels.length)];
    const accountAge = 30 + Math.floor(Math.random() * 700); // 30-730 days

    this.logger.log(
      `[SANDBOX] M-Pesa customer info for ${maskPhone(walletId)}: ${maskName(firstName)} ${maskName(lastName)}, KYC: ${kycLevel}`,
    );

    return {
      walletId,
      fullName,
      kycLevel,
      accountStatus: 'active',
      accountAge,
      currency: 'KES',
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

      // Generate realistic KES amounts based on category
      let amount: string;
      switch (category) {
        case 'salary':
          amount = (25000 + Math.floor(Math.random() * 75000)).toFixed(4);
          break;
        case 'transfer':
          amount = (500 + Math.floor(Math.random() * 9500)).toFixed(4);
          break;
        case 'merchant':
          amount = (100 + Math.floor(Math.random() * 4900)).toFixed(4);
          break;
        case 'utility':
          amount = (200 + Math.floor(Math.random() * 4800)).toFixed(4);
          break;
        case 'airtime':
          amount = (50 + Math.floor(Math.random() * 950)).toFixed(4);
          break;
        default:
          amount = (100 + Math.floor(Math.random() * 9900)).toFixed(4);
      }

      const timestamp = new Date(startTime + Math.floor(Math.random() * timeRange));

      transactions.push({
        transactionId: `MPESA-TXN-${uuidv4().slice(0, 8).toUpperCase()}`,
        walletId,
        type: isCredit ? 'credit' : 'debit',
        amount,
        currency: 'KES',
        counterpartyId: `+2547${Math.floor(10000000 + Math.random() * 90000000)}`,
        category,
        timestamp,
        status: 'completed',
      });
    }

    // Sort by timestamp descending
    transactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    this.logger.log(
      `[SANDBOX] M-Pesa transaction history for ${maskPhone(walletId)}: ${transactions.length} transactions`,
    );

    return transactions;
  }

  private simulateB2CTransfer(conversationId: string, params: TransferParams): TransferResult {
    const rand = Math.random();
    let status: 'COMPLETED' | 'PENDING' | 'FAILED';
    let failureReason: string | undefined;

    // Sandbox: 70% success, 15% pending, 10% insufficient funds, 5% general failure
    if (rand < 0.70) {
      status = 'COMPLETED';
    } else if (rand < 0.85) {
      status = 'PENDING';
    } else if (rand < 0.95) {
      status = 'FAILED';
      failureReason = 'INSUFFICIENT_FUNDS';
    } else {
      status = 'FAILED';
      failureReason = 'TRANSACTION_FAILED';
    }

    const externalRef = `MPESA-${conversationId.slice(0, 8).toUpperCase()}`;

    this.transactions.set(conversationId, {
      referenceId: conversationId,
      externalId: params.reference,
      status,
      type: 'b2c',
      amount: params.amount,
      currency: params.currency,
      party: params.destination,
      createdAt: new Date(),
      completedAt: status === 'COMPLETED' ? new Date() : undefined,
      failureReason,
    });

    this.logger.log(
      `[SANDBOX] M-Pesa B2C ${externalRef}: ${status} (${params.amount} ${params.currency} to ${maskPhone(params.destination)})`,
    );

    return {
      success: status === 'COMPLETED' || status === 'PENDING',
      externalRef,
      failureReason,
    };
  }

  private simulateSTKPush(checkoutRequestId: string, params: CollectionParams): TransferResult {
    const rand = Math.random();
    let status: 'COMPLETED' | 'PENDING' | 'CANCELLED' | 'FAILED';
    let failureReason: string | undefined;

    // Sandbox: 80% success, 10% cancelled, 10% general failure
    if (rand < 0.80) {
      status = 'COMPLETED';
    } else if (rand < 0.90) {
      status = 'CANCELLED';
      failureReason = 'USER_CANCELLED';
    } else {
      status = 'FAILED';
      failureReason = 'TRANSACTION_FAILED';
    }

    const externalRef = `MPESA-STK-${checkoutRequestId.slice(0, 8).toUpperCase()}`;

    this.transactions.set(checkoutRequestId, {
      referenceId: checkoutRequestId,
      externalId: params.reference,
      status,
      type: 'stk_push',
      amount: params.amount,
      currency: params.currency,
      party: params.source,
      createdAt: new Date(),
      completedAt: status === 'COMPLETED' ? new Date() : undefined,
      failureReason,
    });

    this.logger.log(
      `[SANDBOX] M-Pesa STK Push ${externalRef}: ${status} (${params.amount} ${params.currency} from ${maskPhone(params.source)})`,
    );

    return {
      success: status === 'COMPLETED',
      externalRef,
      failureReason,
    };
  }

  private mapMpesaStatus(status: string): 'pending' | 'completed' | 'failed' | 'reversed' {
    switch (status) {
      case 'COMPLETED':
        return 'completed';
      case 'PENDING':
        return 'pending';
      case 'FAILED':
      case 'CANCELLED':
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
