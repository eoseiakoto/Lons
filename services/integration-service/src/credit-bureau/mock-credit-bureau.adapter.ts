import { Injectable, Logger } from '@nestjs/common';
import { ICreditBureauAdapter, CreditReport } from './credit-bureau.interface';

@Injectable()
export class MockCreditBureauAdapter implements ICreditBureauAdapter {
  private readonly logger = new Logger('MockCreditBureau');

  async queryReport(nationalId: string, consent: boolean): Promise<CreditReport | null> {
    if (!consent) {
      this.logger.warn(`Credit bureau query rejected: no consent for ${nationalId}`);
      return null;
    }

    this.logger.log(`[SANDBOX] Credit bureau query for ${nationalId}`);
    return {
      customerId: nationalId,
      bureauScore: 650 + Math.floor(Math.random() * 200),
      scoreRange: { min: 300, max: 900 },
      activeLoans: Math.floor(Math.random() * 3),
      totalOutstanding: String(Math.floor(Math.random() * 10000)),
      defaultHistory: { count: Math.random() > 0.8 ? 1 : 0, totalAmount: '0' },
      enquiryCount: Math.floor(Math.random() * 5),
      lastUpdated: new Date(),
    };
  }

  async submitPositiveData(data: { customerId: string; contractId: string; amount: string; status: string }): Promise<boolean> {
    this.logger.log(`[SANDBOX] Positive data submitted for ${data.customerId}: ${data.status}`);
    return true;
  }

  async submitNegativeData(data: { customerId: string; contractId: string; amount: string; reason: string }): Promise<boolean> {
    this.logger.log(`[SANDBOX] Negative data submitted for ${data.customerId}: ${data.reason}`);
    return true;
  }
}
