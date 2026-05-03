import type {
  IWalletBalanceInsufficientEvent,
} from '@lons/event-contracts';

/** Queue name shared by listener (producer) and consumer. */
export const WALLET_EVENTS_QUEUE = 'overdraft-wallet-events';
/** Dead-letter queue name. */
export const WALLET_EVENTS_DLQ = 'overdraft-wallet-events-dlq';

/** BullMQ job names. Map 1:1 to the EventBus event types. */
export const WALLET_JOB_INSUFFICIENT = 'wallet.balance_insufficient';
export const WALLET_JOB_CREDITED = 'wallet.balance_credited';

/**
 * Job payload shapes for the BullMQ queue. Wraps the EventEmitter2 event
 * data with the tenantId so the consumer can re-enter the tenant context
 * (BullMQ jobs don't carry HTTP request state).
 */
export interface WalletInsufficientJob {
  tenantId: string;
  event: IWalletBalanceInsufficientEvent;
}

export interface WalletCreditedJob {
  tenantId: string;
  customerId: string;
  walletId: string;
  /** Amount credited to the wallet — what auto-repayment can collect against. */
  creditAmount: string;
  newBalance: string;
  transactionRef: string;
  walletProvider: string;
}
