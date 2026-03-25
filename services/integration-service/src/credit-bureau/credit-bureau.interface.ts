export interface CreditReport {
  customerId: string;
  bureauScore: number;
  scoreRange: { min: number; max: number };
  activeLoans: number;
  totalOutstanding: string;
  defaultHistory: { count: number; totalAmount: string };
  enquiryCount: number;
  lastUpdated: Date;
}

export interface ICreditBureauAdapter {
  queryReport(nationalId: string, consent: boolean): Promise<CreditReport | null>;
  submitPositiveData(data: { customerId: string; contractId: string; amount: string; status: string }): Promise<boolean>;
  submitNegativeData(data: { customerId: string; contractId: string; amount: string; reason: string }): Promise<boolean>;
}

export const CREDIT_BUREAU_ADAPTER = 'CREDIT_BUREAU_ADAPTER';
