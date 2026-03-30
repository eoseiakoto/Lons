import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createHash, randomUUID } from 'crypto';
import {
  IWalletAdapter,
  TransferParams,
  TransferResult,
  BalanceInfo,
  CollectionParams,
  TransactionStatusResult,
} from '@lons/process-engine';
import {
  WalletCustomerInfo,
  WalletTransaction,
  DateRange,
  WebhookRegistration,
} from '../wallet-adapter.types';

export interface MockWalletConfig {
  failure_rate: number;
  latency_ms: number;
  webhook_delay_ms: number;
  initial_balance: number;
  supported_currencies: string[];
}

interface MockWalletState {
  balance: string;
  currency: string;
  transactions: WalletTransaction[];
}

interface MockWebhookReg {
  id: string;
  events: string[];
  callbackUrl: string;
  active: boolean;
}

const DEFAULT_CONFIG: MockWalletConfig = {
  failure_rate: 0.0,
  latency_ms: 100,
  webhook_delay_ms: 2000,
  initial_balance: 50000.0,
  supported_currencies: ['GHS', 'KES', 'NGN'],
};

@Injectable()
export class MockWalletAdapter implements IWalletAdapter {
  private readonly logger = new Logger(MockWalletAdapter.name);
  private readonly walletStates = new Map<string, MockWalletState>();
  private readonly pendingTransactions = new Map<string, { status: 'pending' | 'completed' | 'failed'; amount: string; completedAt?: Date }>();
  private readonly webhookRegistrations: MockWebhookReg[] = [];
  private config: MockWalletConfig;
  private httpService?: HttpService;

  constructor(configJson?: Record<string, unknown>, httpService?: HttpService) {
    this.config = { ...DEFAULT_CONFIG, ...(configJson as Partial<MockWalletConfig>) };
    this.httpService = httpService;
  }

  private async simulateLatency(): Promise<void> {
    if (this.config.latency_ms > 0) {
      await new Promise((r) => setTimeout(r, this.config.latency_ms));
    }
  }

  private shouldFail(): boolean {
    return this.config.failure_rate > 0 && Math.random() < this.config.failure_rate;
  }

  private getOrCreateState(walletId: string, currency = 'GHS'): MockWalletState {
    let state = this.walletStates.get(walletId);
    if (!state) {
      state = {
        balance: this.config.initial_balance.toFixed(4),
        currency,
        transactions: [],
      };
      this.walletStates.set(walletId, state);
    }
    return state;
  }

  private deterministicHash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  async getCustomerInfo(walletId: string): Promise<WalletCustomerInfo> {
    await this.simulateLatency();

    const hash = this.deterministicHash(walletId);
    const kycLevels = ['full', 'partial', 'none'];
    const statuses = ['active', 'active', 'active', 'suspended'];
    const firstNames = ['Kwame', 'Ama', 'Kofi', 'Abena', 'Yaw', 'Akua', 'Kwesi', 'Efua'];
    const lastNames = ['Mensah', 'Osei', 'Asante', 'Boateng', 'Adjei', 'Owusu', 'Darko', 'Agyeman'];

    const idx = parseInt(hash.slice(0, 8), 16);

    return {
      walletId,
      fullName: `${firstNames[idx % firstNames.length]} ${lastNames[(idx >> 8) % lastNames.length]}`,
      kycLevel: kycLevels[idx % kycLevels.length],
      accountStatus: statuses[idx % statuses.length],
      accountAge: (idx % 730) + 30,
      currency: this.config.supported_currencies[0] ?? 'GHS',
    };
  }

  async getBalance(walletId: string): Promise<BalanceInfo> {
    await this.simulateLatency();

    const state = this.getOrCreateState(walletId);
    return {
      available: state.balance,
      currency: state.currency,
      lastUpdated: new Date(),
    };
  }

  async getTransactionHistory(walletId: string, dateRange: DateRange): Promise<WalletTransaction[]> {
    await this.simulateLatency();

    const state = this.getOrCreateState(walletId);

    // Return recorded transactions within date range + synthetic history
    const recorded = state.transactions.filter(
      (t) => t.timestamp >= dateRange.from && t.timestamp <= dateRange.to,
    );

    // Generate some synthetic transactions if no real ones exist
    if (recorded.length === 0) {
      const hash = this.deterministicHash(walletId);
      const count = (parseInt(hash.slice(0, 4), 16) % 10) + 3;
      const synthetic: WalletTransaction[] = [];

      for (let i = 0; i < count; i++) {
        const dayOffset = i * 3;
        const txDate = new Date(dateRange.from.getTime() + dayOffset * 86400000);
        if (txDate > dateRange.to) break;

        synthetic.push({
          transactionId: `mock-tx-${walletId.slice(0, 8)}-${i}`,
          walletId,
          type: i % 3 === 0 ? 'debit' : 'credit',
          amount: ((parseInt(hash.slice(i * 2, i * 2 + 4), 16) % 5000) + 100).toFixed(4),
          currency: state.currency,
          counterpartyId: `wallet-${hash.slice(i * 4, i * 4 + 8)}`,
          category: i % 3 === 0 ? 'withdrawal' : i % 2 === 0 ? 'deposit' : 'transfer',
          timestamp: txDate,
          status: 'completed',
        });
      }
      return synthetic;
    }

    return recorded;
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    await this.simulateLatency();

    if (this.shouldFail()) {
      this.logger.warn(`[MOCK] Transfer failed (simulated): ${params.reference}`);
      return { success: false, failureReason: 'SIMULATED_FAILURE' };
    }

    const state = this.getOrCreateState(params.destination, params.currency);
    // For disbursement, we're sending TO a wallet, so balance increases for recipient
    const newBalance = (parseFloat(state.balance) + parseFloat(params.amount)).toFixed(4);
    state.balance = newBalance;

    const externalRef = `mock-tx-${randomUUID().slice(0, 12)}`;

    state.transactions.push({
      transactionId: externalRef,
      walletId: params.destination,
      type: 'credit',
      amount: params.amount,
      currency: params.currency,
      category: 'transfer',
      timestamp: new Date(),
      status: 'completed',
    });

    this.pendingTransactions.set(params.reference, {
      status: 'pending',
      amount: params.amount,
    });

    // Transition to completed after a delay
    setTimeout(() => {
      const tx = this.pendingTransactions.get(params.reference);
      if (tx) {
        tx.status = 'completed';
        tx.completedAt = new Date();
      }
    }, this.config.webhook_delay_ms);

    // Fire webhook callbacks
    this.fireWebhooks('transfer.completed', { reference: params.reference, externalRef, amount: params.amount });

    this.logger.log(`[MOCK] Transfer: ${params.amount} ${params.currency} → ${params.destination} (ref: ${externalRef})`);

    return { success: true, externalRef };
  }

  async collect(params: CollectionParams): Promise<TransferResult> {
    await this.simulateLatency();

    const state = this.getOrCreateState(params.source, params.currency);

    if (parseFloat(state.balance) < parseFloat(params.amount)) {
      return { success: false, failureReason: 'INSUFFICIENT_FUNDS' };
    }

    if (this.shouldFail()) {
      this.logger.warn(`[MOCK] Collection failed (simulated): ${params.reference}`);
      return { success: false, failureReason: 'SIMULATED_FAILURE' };
    }

    const newBalance = (parseFloat(state.balance) - parseFloat(params.amount)).toFixed(4);
    state.balance = newBalance;

    const externalRef = `mock-col-${randomUUID().slice(0, 12)}`;

    state.transactions.push({
      transactionId: externalRef,
      walletId: params.source,
      type: 'debit',
      amount: params.amount,
      currency: params.currency,
      category: 'collection',
      timestamp: new Date(),
      status: 'completed',
    });

    this.pendingTransactions.set(params.reference, {
      status: 'pending',
      amount: params.amount,
    });

    setTimeout(() => {
      const tx = this.pendingTransactions.get(params.reference);
      if (tx) {
        tx.status = 'completed';
        tx.completedAt = new Date();
      }
    }, this.config.webhook_delay_ms);

    this.fireWebhooks('collection.completed', { reference: params.reference, externalRef, amount: params.amount });

    this.logger.log(`[MOCK] Collect: ${params.amount} ${params.currency} ← ${params.source} (ref: ${externalRef})`);

    return { success: true, externalRef };
  }

  async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    await this.simulateLatency();

    const tx = this.pendingTransactions.get(reference);
    if (!tx) {
      return { reference, status: 'failed', failureReason: 'TRANSACTION_NOT_FOUND' };
    }

    return {
      reference,
      status: tx.status === 'pending' ? 'pending' : 'completed',
      amount: tx.amount,
      completedAt: tx.completedAt,
    };
  }

  async registerWebhook(events: string[], callbackUrl: string): Promise<WebhookRegistration> {
    await this.simulateLatency();

    const registration: MockWebhookReg = {
      id: randomUUID(),
      events,
      callbackUrl,
      active: true,
    };

    this.webhookRegistrations.push(registration);
    this.logger.log(`[MOCK] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

    return registration;
  }

  private fireWebhooks(event: string, payload: Record<string, unknown>): void {
    const matchingRegs = this.webhookRegistrations.filter(
      (r) => r.active && r.events.includes(event),
    );

    for (const reg of matchingRegs) {
      setTimeout(async () => {
        try {
          if (this.httpService) {
            await this.httpService.axiosRef.post(reg.callbackUrl, {
              event,
              timestamp: new Date().toISOString(),
              data: payload,
            });
            this.logger.log(`[MOCK] Webhook delivered: ${event} → ${reg.callbackUrl}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[MOCK] Webhook delivery failed: ${reg.callbackUrl} — ${message}`);
        }
      }, this.config.webhook_delay_ms);
    }
  }
}
