export interface TransferParams {
  destination: string;
  amount: string;
  currency: string;
  reference: string;
}

export interface TransferResult {
  success: boolean;
  externalRef?: string;
  failureReason?: string;
}

export interface BalanceInfo {
  available: string;
  currency: string;
  lastUpdated: Date;
}

export interface CollectionParams {
  source: string;
  amount: string;
  currency: string;
  reference: string;
  reason?: string;
}

export interface TransactionStatusResult {
  reference: string;
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  amount?: string;
  completedAt?: Date;
  failureReason?: string;
}

export interface IWalletAdapter {
  transfer(params: TransferParams): Promise<TransferResult>;
  collect?(params: CollectionParams): Promise<TransferResult>;
  getBalance?(walletId: string): Promise<BalanceInfo>;
  getTransactionStatus?(reference: string): Promise<TransactionStatusResult>;
}

export const WALLET_ADAPTER = 'WALLET_ADAPTER';
