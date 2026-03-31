import { Injectable, Logger } from '@nestjs/common';
import { ICreditBureauAdapter, CreditReport } from './credit-bureau.interface';
import { CircuitBreaker } from '../resilience/circuit-breaker';
import { maskNationalId } from '@lons/common';

/**
 * Ghana XDS / TransUnion Credit Bureau Adapter
 *
 * Simulates integration with Ghana's credit bureau system (XDS/TransUnion format).
 * Uses circuit breaker for resilience. Runs in sandbox mode, returning realistic
 * mock data with GHS amounts and Ghana-specific scoring ranges.
 */
@Injectable()
export class GhanaXcbAdapter implements ICreditBureauAdapter {
  private readonly logger = new Logger('GhanaXcbAdapter');
  private readonly circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 60000,
      halfOpenMaxAttempts: 1,
    });
  }

  getBureauType(): string {
    return 'GHANA_XCB';
  }

  getSupportedCountries(): string[] {
    return ['GH'];
  }

  async queryReport(nationalId: string, consent: boolean): Promise<CreditReport | null> {
    const maskedId = maskNationalId(nationalId);

    if (!consent) {
      this.logger.warn(`[Ghana XCB] Query rejected: no consent for ${maskedId}`);
      return null;
    }

    return this.circuitBreaker.execute(async () => {
      this.logger.log(`[Ghana XCB] Querying credit report for ${maskedId}`);

      // Simulate API latency
      await this.simulateLatency();

      // Generate realistic Ghana-specific credit report
      const score = this.generateScore(nationalId);
      const activeFacilities = Math.floor(Math.random() * 6); // 0-5
      const defaultCount = Math.random() > 0.85 ? Math.floor(Math.random() * 3) + 1 : 0;

      const report: CreditReport = {
        customerId: nationalId,
        bureauScore: score,
        scoreRange: { min: 300, max: 900 },
        activeLoans: activeFacilities,
        totalOutstanding: this.generateOutstanding(activeFacilities),
        defaultHistory: {
          count: defaultCount,
          totalAmount: defaultCount > 0
            ? String(Math.floor(Math.random() * 5000) + 500)
            : '0',
        },
        enquiryCount: Math.floor(Math.random() * 8),
        lastUpdated: new Date(),
        bureauType: 'GHANA_XCB',
        country: 'GH',
      };

      this.logger.debug(
        `[Ghana XCB] Report generated for ${maskedId}: score=${score}, activeFacilities=${activeFacilities}`,
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
        `[Ghana XCB] Positive data submitted for contract ${data.contractId}: status=${data.status}, amount=GHS ${data.amount}`,
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
        `[Ghana XCB] Negative data submitted for contract ${data.contractId}: reason=${data.reason}, amount=GHS ${data.amount}`,
      );
      await this.simulateLatency();
      return true;
    });
  }

  /**
   * Generate a deterministic-ish score based on nationalId hash.
   * Range: 300-900 (Ghana XDS standard)
   */
  private generateScore(nationalId: string): number {
    let hash = 0;
    for (let i = 0; i < nationalId.length; i++) {
      hash = (hash * 31 + nationalId.charCodeAt(i)) & 0x7fffffff;
    }
    // Map to 300-900 range with some random variation
    const base = 300 + (hash % 601);
    const variation = Math.floor(Math.random() * 40) - 20;
    return Math.max(300, Math.min(900, base + variation));
  }

  /**
   * Generate realistic outstanding amount in GHS based on active facilities
   */
  private generateOutstanding(activeFacilities: number): string {
    if (activeFacilities === 0) return '0.00';
    const total = activeFacilities * (Math.floor(Math.random() * 3000) + 200);
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
