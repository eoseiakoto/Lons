export interface MoMoTransferRequest {
  amount: string;
  currency: string;
  externalId: string;
  payee: {
    partyIdType: 'MSISDN';
    partyId: string;
  };
  payerMessage: string;
  payeeNote: string;
}

export interface MoMoRequestToPayRequest {
  amount: string;
  currency: string;
  externalId: string;
  payer: {
    partyIdType: 'MSISDN';
    partyId: string;
  };
  payerMessage: string;
  payeeNote: string;
}

export interface MoMoCallbackPayload {
  referenceId: string;
  externalId: string;
  financialTransactionId?: string;
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING';
  reason?: {
    code: string;
    message: string;
  };
  amount: string;
  currency: string;
  payer?: {
    partyIdType: string;
    partyId: string;
  };
  payee?: {
    partyIdType: string;
    partyId: string;
  };
}

export interface MoMoAccountInfo {
  availableBalance: string;
  currency: string;
}

export interface MoMoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export type MoMoEnvironment = 'sandbox' | 'production';

export interface MoMoConfig {
  apiKey: string;
  apiSecret: string;
  subscriptionKey?: string;
  environment: MoMoEnvironment;
  baseUrl: string;
  callbackUrl?: string;
}

export interface MoMoTransactionState {
  referenceId: string;
  externalId: string;
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING';
  type: 'disbursement' | 'collection';
  amount: string;
  currency: string;
  party: string;
  createdAt: Date;
  completedAt?: Date;
  failureReason?: string;
}

export interface MoMoCustomerInfoResponse {
  given_name: string;
  family_name: string;
  birthdate?: string;
  locale?: string;
  gender?: string;
  status: string;
  kycLevel: string;
}

export interface MoMoTransactionHistoryItem {
  financialTransactionId: string;
  externalId: string;
  amount: string;
  currency: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER' | 'PAYMENT';
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING';
  counterpartyId?: string;
  note?: string;
  timestamp: string;
}
