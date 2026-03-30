export interface IWalletTransaction {
  transactionId: string;
  walletId: string;
  type: 'credit' | 'debit';
  amount: string; // Decimal as string
  currency: string;
  counterpartyId?: string;
  category?: string; // e.g., 'salary', 'transfer', 'merchant', 'utility'
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
}

export interface IDateRange {
  from: Date;
  to: Date;
}
