import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { bankersRound, divide, multiply } from '@lons/common';

import {
  EmiBalance,
  EmiFinancialSnapshot,
  EmiIncomePattern,
  EmiTransaction,
  IEmiDataAdapter,
} from './emi-data-adapter.interface';

/**
 * Mock EMI data adapter.
 *
 * Returns deterministic data derived from a SHA-256 hash of the walletId,
 * so the same wallet always produces the same snapshot. This is critical
 * for reproducible test fixtures and for keeping scoring deterministic in
 * non-prod environments.
 *
 * All amounts are returned as decimal strings per CLAUDE.md.
 */
@Injectable()
export class MockEmiDataAdapter implements IEmiDataAdapter {
  getProvider(): string {
    return 'mock';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getTransactionHistory(
    walletId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<EmiTransaction[]> {
    const seed = this.seed(walletId);
    const days = Math.max(
      1,
      Math.floor(
        (dateRange.to.getTime() - dateRange.from.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
    // Deterministic transaction count: 0.5–2 tx/day based on seed.
    const txPerDay = 0.5 + (seed.byte(0) / 255) * 1.5;
    const total = Math.floor(days * txPerDay);

    const transactions: EmiTransaction[] = [];
    for (let i = 0; i < total; i++) {
      const isCredit = seed.byte(i + 1) % 2 === 0;
      const amountCents = 1000 + (seed.byte(i + 2) * 100); // 10.00 – 2560.00
      const amount = bankersRound(divide(String(amountCents), '100'), 4);
      const offsetMs = (seed.byte(i + 3) / 255) * (dateRange.to.getTime() - dateRange.from.getTime());
      transactions.push({
        transactionId: `mock-tx-${seed.hex.slice(0, 6)}-${i}`,
        type: isCredit ? 'credit' : 'debit',
        amount,
        currency: 'GHS',
        category: isCredit ? (i % 5 === 0 ? 'salary' : 'transfer') : 'merchant',
        timestamp: new Date(dateRange.from.getTime() + offsetMs),
        status: 'completed',
      });
    }

    return transactions;
  }

  async getWalletBalance(walletId: string): Promise<EmiBalance> {
    const seed = this.seed(walletId);
    // Balance: 50 – 5050 GHS.
    const balanceCents = 5000 + seed.byte(0) * 1900;
    return {
      walletId,
      currentBalance: bankersRound(divide(String(balanceCents), '100'), 4),
      currency: 'GHS',
      asOf: new Date(),
    };
  }

  async getIncomePatterns(
    walletId: string,
    periodDays: number,
  ): Promise<EmiIncomePattern> {
    const seed = this.seed(walletId);
    const depositsCount = Math.max(1, Math.floor(periodDays / (3 + (seed.byte(1) % 5))));
    // Avg deposit 100 – 2000 GHS.
    const avgCents = 10000 + seed.byte(2) * 750;
    const totalCents = avgCents * depositsCount;
    const regularity = 40 + (seed.byte(3) % 60); // 40–100
    const volatility = bankersRound(divide(String(10 + (seed.byte(4) % 40)), '100'), 4);

    return {
      walletId,
      periodDays,
      totalIncome: bankersRound(divide(String(totalCents), '100'), 4),
      transactionCount: depositsCount,
      depositRegularity: regularity,
      incomeVolatility: Number(volatility),
      averageDeposit: bankersRound(divide(String(avgCents), '100'), 4),
      lastDepositDate: new Date(Date.now() - (seed.byte(5) % 7) * 24 * 60 * 60 * 1000),
    };
  }

  async getFinancialSnapshot(walletId: string): Promise<EmiFinancialSnapshot> {
    const seed = this.seed(walletId);
    const balance = await this.getWalletBalance(walletId);
    const income30 = await this.getIncomePatterns(walletId, 30);
    const income90 = await this.getIncomePatterns(walletId, 90);

    // Average balance varies slightly from current balance.
    const avg30Cents = 4500 + seed.byte(6) * 1800;
    const avg90Cents = 4200 + seed.byte(7) * 1700;
    // Ratio of income to expenses (0.8 – 1.8).
    const ratio = bankersRound(divide(String(80 + (seed.byte(8) % 100)), '100'), 4);

    return {
      walletId,
      currentBalance: balance.currentBalance,
      currency: 'GHS',
      averageBalance30d: bankersRound(divide(String(avg30Cents), '100'), 4),
      averageBalance90d: bankersRound(divide(String(avg90Cents), '100'), 4),
      transactionCount30d: income30.transactionCount * 2,
      transactionCount90d: income90.transactionCount * 2,
      incomeConsistency: income30.depositRegularity,
      incomeExpenseRatio: ratio,
      fetchedAt: new Date(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Produce a deterministic byte-sequence from a walletId so the same
   * wallet always returns the same mock data. Tests rely on this.
   */
  private seed(walletId: string): { hex: string; byte: (i: number) => number } {
    const hash = crypto.createHash('sha256').update(walletId).digest('hex');
    return {
      hex: hash,
      byte: (i: number) => parseInt(hash.slice((i * 2) % 64, (i * 2) % 64 + 2), 16),
    };
  }

  // Mocks for parity with real adapters — never actually multiply.
  private _amountFromCents(cents: number): string {
    return bankersRound(multiply(divide(String(cents), '100'), '1'), 4);
  }
}
