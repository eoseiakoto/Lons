export interface CreditReport {
  customerId: string;
  bureauScore: number;
  scoreRange: { min: number; max: number };
  activeLoans: number;
  totalOutstanding: string;
  defaultHistory: { count: number; totalAmount: string };
  enquiryCount: number;
  lastUpdated: Date;
  bureauType?: string;
  country?: string;
}

export interface ICreditBureauAdapter {
  queryReport(nationalId: string, consent: boolean): Promise<CreditReport | null>;
  submitPositiveData(data: { customerId: string; contractId: string; amount: string; status: string }): Promise<boolean>;
  submitNegativeData(data: { customerId: string; contractId: string; amount: string; reason: string }): Promise<boolean>;
  getBureauType(): string;
}

export interface BatchReportRecord {
  customerId: string;
  contractId: string;
  nationalId: string;
  amount: string;
  currency: string;
  type: string;
  status: string;
  reason?: string;
  eventDate?: Date;
}

export interface BatchReportResult {
  totalRecords: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ recordIndex?: number; customerId?: string; error: string }>;
}

export const CREDIT_BUREAU_ADAPTER = 'CREDIT_BUREAU_ADAPTER';
