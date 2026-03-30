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
export interface IWalletAdapter {
    transfer(params: TransferParams): Promise<TransferResult>;
    collect?(params: CollectionParams): Promise<TransferResult>;
    getBalance?(walletId: string): Promise<BalanceInfo>;
    getTransactionStatus?(reference: string): Promise<TransactionStatusResult>;
    getCustomerInfo?(walletId: string): Promise<WalletCustomerInfo>;
    getTransactionHistory?(walletId: string, dateRange: DateRange): Promise<WalletTransaction[]>;
    registerWebhook?(events: string[], callbackUrl: string): Promise<WebhookRegistration>;
}
export declare const WALLET_ADAPTER = "WALLET_ADAPTER";
//# sourceMappingURL=wallet-adapter.interface.d.ts.map