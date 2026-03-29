import { Injectable, Logger } from '@nestjs/common';
import { ICreditBureauAdapter, CreditReport } from './credit-bureau.interface';
import { CircuitBreaker } from '../resilience/circuit-breaker';
import { maskNationalId } from '@lons/common';

/**
 * Kenya CRB Africa / Metropol Credit Bureau Adapter
 *
 * Simulates integration with Kenya's credit bureau system (CRB Africa / Metropol format).
 * Uses circuit breaker for resilience. Runs in sandbox mode, returning realistic
 * mock data with KES amounts and Kenya-specific scoring ranges.
 */
@Injectable()
export class KenyaCrbAdapter implements ICreditBureauAdapter {
  private readonly logger = new Logger('KenyaCrbAdapter');
  private readonly circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 60000,
      halfOpenMaxAttempts: 1,
    });
  }

  getBureauType(): string {
    return 'KENYA_CRB';
  }

  getSupportedCountries(): string[] {
    return ['KE'];
  }

  async queryReport(nationalId: string, consent: boolean): Promise<CreditReport | null> {
    const maskedId = maskNationalId(nationalId);

    if (!consent) {
      this.logger.warn(`[Kenya CRB] Query rejected: no consent for ${maskedId}`);
      return null;
    }

    return this.circuitBreaker.execute(async () => {
      this.logger.log(`[Kenya CRB] Querying credit report for ${maskedId}`);

      await this.simulateLatency();

      const score = this.generateScore(nationalId);
      const activeFacilities = Math.floor(Math.random() * 6);
      const defaultCount = Math.random() > 0.8 ? Math.floor(Math.random() * 3) + 1 : 0;

      const report: CreditReport = {
        customerId: nationalId,
        bureauScore: score,
        scoreRange: { min: 200, max: 900 },
        activeLoans: activeFacilities,
        totalOutstanding: this.generateOutstanding(activeFacilities),
        defaultHistory: {
          count: defaultCount,
          totalAmount: defaultCount > 0
            ? String(Math.floor(Math.random() * 200000) + 10000)
            : '0',
        },
        enquiryCount: Math.floor(Math.random() * 10),
        lastUpdated: new Date(),
        bureauType: 'KENYA_CRB',
        country: 'KE',
      };

      this.logger.debug(
        `[Kenya CRB] Report generated for ${maskedId}: score=${score}, activeFacilities=${activeFacilities}`,
      );

      return report;
    });
  }

  async submitPositiveData(data: {
    customerId: string;
    contractId: string;
    amount: string;
    status: string;
  }): Promise<boolean> {
    return this.circuitBreaker.execute(async () => {
      this.logger.log(
        `[Kenya CRB] Positive data submitted for contract ${data.contractId}: status=${data.status}, amount=KES ${data.amount}`,
      );
      await this.simulateLatency();
      return true;
    });
  }

  async submitNegativeData(data: {
    customerId: string;
    contractId: string;
    amount: string;
    reason: string;
  }): Promise<boolean> {
    return this.circuitBreaker.execute(async () => {
      this.logger.log(
        `[Kenya CRB] Negative data submitted for contract ${data.contractId}: reason=${data.reason}, amount=KES ${data.amount}`,
      );
      await this.simulateLatency();
      return true;
    });
  }

  /**
   * Generate a deterministic-ish score based on nationalId hash.
   * Range: 200-900 (Kenya CRB standard)
   */
  private generateScore(nationalId: string): number {
    let hash = 0;
    for (let i = 0; i < nationalId.length; i++) {
      hash = (hash * 37 + nationalId.charCodeAt(i)) & 0x7fffffff;
    }
    const base = 200 + (hash % 701);
    const variation = Math.floor(Math.random() * 40) - 20;
    return Math.max(200, Math.min(900, base + variation));
  }

  /**
   * Generate realistic outstanding amount in KES based on active facilities
   */
  private generateOutstanding(activeFacilities: number): string {
    if (activeFacilities === 0) return '0.00';
    const total = activeFacilities * (Math.floor(Math.random() * 100000) + 5000);
    return total.toFixed(2);
  }

  /**
   * Simulate network latency (100-500ms)
   */
  private async simulateLatency(): Promise<void> {
    const delay = 100 + Math.floor(Math.random() * 400);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
