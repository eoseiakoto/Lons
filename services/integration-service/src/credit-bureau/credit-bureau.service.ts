import { Injectable, Inject, Logger } from '@nestjs/common';
import { CREDIT_BUREAU_ADAPTER, ICreditBureauAdapter, CreditReport } from './credit-bureau.interface';

@Injectable()
export class CreditBureauService {
  private readonly logger = new Logger('CreditBureauService');
  private cache = new Map<string, { report: CreditReport; cachedAt: number }>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @Inject(CREDIT_BUREAU_ADAPTER) private adapter: ICreditBureauAdapter,
  ) {}

  async queryReport(nationalId: string, consent: boolean): Promise<CreditReport | null> {
    // Check cache
    const cached = this.cache.get(nationalId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      this.logger.log(`Cache hit for credit report: ${nationalId}`);
      return cached.report;
    }

    const report = await this.adapter.queryReport(nationalId, consent);
    if (report) {
      this.cache.set(nationalId, { report, cachedAt: Date.now() });
    }
    return report;
  }

  async submitPositiveData(data: { customerId: string; contractId: string; amount: string; status: string }): Promise<boolean> {
    return this.adapter.submitPositiveData(data);
  }

  async submitNegativeData(data: { customerId: string; contractId: string; amount: string; reason: string }): Promise<boolean> {
    return this.adapter.submitNegativeData(data);
  }
}
