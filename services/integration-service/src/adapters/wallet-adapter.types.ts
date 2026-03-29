/**
 * Re-declared wallet adapter types that are defined in process-engine but not
 * yet available from the compiled @lons/process-engine package export.
 *
 * These mirror the interfaces in:
 *   services/process-engine/src/disbursement/adapters/wallet-adapter.interface.ts
 *
 * Once process-engine is rebuilt with the updated interface, these imports can
 * be switched back to `from '@lons/process-engine'`.
 */

export interface WalletCustomerInfo {
  walletId: string;
  fullName: string;
  kycLevel: string;
  accountStatus: string;
  accountAge: number;
  currency: string;
}

export interface WalletTransaction {
  transactionId: string;
  walletId: string;
  type: 'credit' | 'debit';
  amount: string;
  currency: string;
  counterpartyId?: string;
  category?: string;
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface WebhookRegistration {
  id: string;
  events: string[];
  callbackUrl: string;
  active: boolean;
}
