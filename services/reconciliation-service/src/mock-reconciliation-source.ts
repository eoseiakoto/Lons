import { Injectable } from '@nestjs/common';

export interface ExternalTransaction {
  externalRef: string;
  type: 'disbursement' | 'repayment';
  amount: number;
  date: Date;
  status: 'completed' | 'pending';
}

interface MockConfig {
  matchRate?: number;      // default 0.95 (95%)
  timingDiffRate?: number; // default 0.03 (3%)
  exceptionRate?: number;  // default 0.02 (2%)
}

@Injectable()
export class MockReconciliationSource {
  /**
   * Generates simulated external transaction records based on internal transactions.
   * Configurable match/timing/exception rates for realistic test scenarios.
   */
  generateExternalRecords(
    internalTxns: Array<{ id: string; type: 'disbursement' | 'repayment'; amount: number; externalRef: string | null; date: Date }>,
    config: MockConfig = {},
  ): ExternalTransaction[] {
    const { matchRate = 0.95, timingDiffRate = 0.03, exceptionRate = 0.02 } = config;
    const external: ExternalTransaction[] = [];

    for (const txn of internalTxns) {
      const rand = Math.random();
      const ref = txn.externalRef || `EXT-${txn.id.slice(0, 8)}`;

      if (rand < matchRate) {
        // Perfect match
        external.push({ externalRef: ref, type: txn.type, amount: txn.amount, date: txn.date, status: 'completed' });
      } else if (rand < matchRate + timingDiffRate) {
        // Timing difference: same amount but date offset by 1-2 days
        const offsetDate = new Date(txn.date);
        offsetDate.setDate(offsetDate.getDate() + (Math.random() > 0.5 ? 1 : 2));
        external.push({ externalRef: ref, type: txn.type, amount: txn.amount, date: offsetDate, status: 'completed' });
      } else if (rand < matchRate + timingDiffRate + (exceptionRate / 2)) {
        // Amount mismatch
        const mismatchAmount = txn.amount * (1 + (Math.random() * 0.1 - 0.05)); // +-5%
        external.push({ externalRef: ref, type: txn.type, amount: Number(mismatchAmount.toFixed(4)), date: txn.date, status: 'completed' });
      }
      // else: omitted entirely (Lons-only, unmatched)
    }

    // Add some orphaned external-only transactions
    const orphanCount = Math.max(1, Math.floor(internalTxns.length * (exceptionRate / 2)));
    for (let i = 0; i < orphanCount; i++) {
      external.push({
        externalRef: `ORPHAN-${Date.now()}-${i}`,
        type: Math.random() > 0.5 ? 'disbursement' : 'repayment',
        amount: Number((Math.random() * 1000 + 100).toFixed(4)),
        date: new Date(),
        status: 'completed',
      });
    }

    return external;
  }
}
