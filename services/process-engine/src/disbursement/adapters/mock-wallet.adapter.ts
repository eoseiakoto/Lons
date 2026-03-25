import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { IWalletAdapter, TransferParams, TransferResult, CollectionParams, BalanceInfo, TransactionStatusResult } from './wallet-adapter.interface';

@Injectable()
export class MockWalletAdapter implements IWalletAdapter {
  private successRate = 1.0;
  private transactions = new Map<string, { status: string; amount: string; completedAt?: Date }>();

  setSuccessRate(rate: number): void {
    this.successRate = rate;
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const ref = `MOCK-${uuidv4().slice(0, 8).toUpperCase()}`;

    if (Math.random() < this.successRate) {
      this.transactions.set(ref, { status: 'completed', amount: params.amount, completedAt: new Date() });
      return { success: true, externalRef: ref };
    }

    this.transactions.set(ref, { status: 'failed', amount: params.amount });
    return { success: false, failureReason: 'Mock wallet transfer failed (simulated)' };
  }

  async collect(params: CollectionParams): Promise<TransferResult> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const ref = `MOCK-COL-${uuidv4().slice(0, 8).toUpperCase()}`;

    if (Math.random() < this.successRate) {
      this.transactions.set(ref, { status: 'completed', amount: params.amount, completedAt: new Date() });
      return { success: true, externalRef: ref };
    }

    return { success: false, failureReason: 'Mock collection failed (simulated)' };
  }

  async getBalance(walletId: string): Promise<BalanceInfo> {
    return {
      available: '50000.0000',
      currency: 'GHS',
      lastUpdated: new Date(),
    };
  }

  async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    const txn = this.transactions.get(reference);
    if (!txn) {
      return { reference, status: 'pending' };
    }
    return {
      reference,
      status: txn.status as 'completed' | 'failed',
      amount: txn.amount,
      completedAt: txn.completedAt,
    };
  }
}
