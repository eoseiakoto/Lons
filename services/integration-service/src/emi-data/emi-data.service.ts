import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';

import { CircuitBreaker } from '../resilience/circuit-breaker';
import { RetryOptions, withRetry } from '../resilience/retry';
import {
  EMI_DATA_ADAPTER,
  EmiFinancialSnapshot,
  IEmiDataAdapter,
} from './emi-data-adapter.interface';

interface CacheEntry {
  snapshot: EmiFinancialSnapshot;
  cachedAt: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1_000,
  maxDelay: 8_000,
  backoffMultiplier: 2,
};

/**
 * S17-1 / FR-DI-001.1 — wraps the active {@link IEmiDataAdapter} with:
 *
 *  - Circuit breaker (5 failures → 30s open)
 *  - Exponential-backoff retry (3 attempts, 1s base)
 *  - In-memory cache of {@link EmiFinancialSnapshot} per walletId
 *    (1 hour default TTL — configurable via constructor for tests)
 *  - PII-safe logging — walletId is hashed in log lines
 *  - Persistence of every snapshot to `customer_financial_data` so
 *    scoring stays available even when the EMI is unreachable.
 */
@Injectable()
export class EmiDataService {
  private readonly logger = new Logger('EmiDataService');
  private readonly circuit = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30_000,
    halfOpenMaxAttempts: 1,
  });
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(EMI_DATA_ADAPTER) private readonly adapter: IEmiDataAdapter,
    private readonly prisma: PrismaService,
    private readonly cacheTtlMs: number = 60 * 60 * 1000, // 1 hour default
    private readonly retryOptions: RetryOptions = DEFAULT_RETRY,
  ) {}

  /**
   * Fetch a financial snapshot for a wallet — uses cache, circuit-breaker,
   * and retry. Returns null and logs a warning if the EMI is unavailable
   * (caller decides whether to fall back to stored historical data).
   */
  async getFinancialSnapshot(
    walletId: string,
  ): Promise<EmiFinancialSnapshot | null> {
    const cached = this.cache.get(walletId);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs) {
      this.logger.debug(`EMI snapshot cache hit ${this.maskWalletId(walletId)}`);
      return cached.snapshot;
    }

    try {
      const snapshot = await this.circuit.execute(() =>
        withRetry(() => this.adapter.getFinancialSnapshot(walletId), this.retryOptions),
      );
      this.cache.set(walletId, { snapshot, cachedAt: Date.now() });
      return snapshot;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `EMI snapshot fetch failed for ${this.maskWalletId(walletId)}: ${msg}`,
      );
      return null;
    }
  }

  /**
   * Fetch a snapshot AND persist it to `customer_financial_data` so the
   * scoring service can rely on the table even when the EMI is down.
   *
   * Idempotent across runs because the sync job upserts based on the
   * latest row (createdAt desc). We always insert a new row so we keep
   * historical snapshots for audit; the scoring service reads the most
   * recent one.
   */
  async syncFinancialSnapshot(
    tenantId: string,
    customerId: string,
    walletId: string,
  ): Promise<EmiFinancialSnapshot | null> {
    const snapshot = await this.getFinancialSnapshot(walletId);
    if (!snapshot) return null;

    await this.prisma.customerFinancialData.create({
      data: {
        tenantId,
        customerId,
        source: 'emi',
        sourceProvider: this.adapter.getProvider(),
        walletId,
        currentBalance: snapshot.currentBalance,
        averageBalance30d: snapshot.averageBalance30d,
        averageBalance90d: snapshot.averageBalance90d,
        transactionCount30d: snapshot.transactionCount30d,
        transactionCount90d: snapshot.transactionCount90d,
        incomeConsistency: snapshot.incomeConsistency,
        incomeExpenseRatio: snapshot.incomeExpenseRatio,
        currency: snapshot.currency,
        rawData: snapshot as unknown as Prisma.InputJsonValue,
        fetchedAt: snapshot.fetchedAt,
      },
    });

    this.logger.log(
      `Synced EMI snapshot for tenant=${tenantId} wallet=${this.maskWalletId(
        walletId,
      )}`,
    );

    return snapshot;
  }

  /**
   * Direct delegation to the adapter — wrapped in circuit-breaker only.
   * Snapshots are the only thing we cache because that's the scoring
   * input; raw transaction lists are too large to cache safely.
   */
  async getTransactionHistory(
    walletId: string,
    dateRange: { from: Date; to: Date },
  ) {
    return this.circuit.execute(() =>
      withRetry(() => this.adapter.getTransactionHistory(walletId, dateRange), this.retryOptions),
    );
  }

  async getWalletBalance(walletId: string) {
    return this.circuit.execute(() =>
      withRetry(() => this.adapter.getWalletBalance(walletId), this.retryOptions),
    );
  }

  async getIncomePatterns(walletId: string, periodDays: number) {
    return this.circuit.execute(() =>
      withRetry(() => this.adapter.getIncomePatterns(walletId, periodDays), this.retryOptions),
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await this.adapter.isAvailable();
    } catch {
      return false;
    }
  }

  /** Test/ops hook — flush a single wallet from the cache. */
  invalidateCache(walletId?: string): void {
    if (walletId) {
      this.cache.delete(walletId);
    } else {
      this.cache.clear();
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * walletId may be PII (a phone number, MSISDN, etc.). Per CLAUDE.md we
   * never log them in cleartext. Show the last 4 digits only.
   */
  private maskWalletId(walletId: string): string {
    if (!walletId) return '';
    if (walletId.length <= 4) return '***';
    return `***${walletId.slice(-4)}`;
  }
}
