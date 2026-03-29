// Safaricom Daraja API DTOs for M-Pesa integration

export type MpesaEnvironment = 'sandbox' | 'production';

export interface DarajaAuthResponse {
  access_token: string;
  expires_in: string; // Daraja returns this as a string (e.g. "3599")
}

export interface STKPushRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  Amount: string;
  PartyA: string; // Phone number initiating the payment (MSISDN)
  PartyB: string; // Business short code receiving the payment
  PhoneNumber: string; // Phone number to receive STK prompt
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string; // "0" means success
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface B2CRequest {
  InitiatorName: string;
  SecurityCredential: string;
  CommandID: 'BusinessPayment' | 'SalaryPayment' | 'PromotionPayment';
  Amount: string;
  PartyA: string; // Organization short code
  PartyB: string; // Customer phone number (MSISDN)
  Remarks: string;
  QueueTimeOutURL: string;
  ResultURL: string;
  Occasion?: string;
}

export interface B2CResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string; // "0" means accepted
  ResponseDescription: string;
}

export interface TransactionStatusRequest {
  Initiator: string;
  SecurityCredential: string;
  CommandID: 'TransactionStatusQuery';
  TransactionID: string;
  PartyA: string;
  IdentifierType: '1' | '2' | '4'; // 1=MSISDN, 2=Till, 4=Shortcode
  Remarks: string;
  QueueTimeOutURL: string;
  ResultURL: string;
  Occasion?: string;
}

export interface TransactionStatusResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

export interface AccountBalanceRequest {
  Initiator: string;
  SecurityCredential: string;
  CommandID: 'AccountBalance';
  PartyA: string;
  IdentifierType: '1' | '2' | '4';
  Remarks: string;
  QueueTimeOutURL: string;
  ResultURL: string;
}

export interface AccountBalanceResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

export interface DarajaCallbackData {
  Body: {
    stkCallback?: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value?: string | number;
        }>;
      };
    };
    Result?: {
      ResultType: number;
      ResultCode: number;
      ResultDesc: string;
      OriginatorConversationID: string;
      ConversationID: string;
      TransactionID: string;
      ResultParameters?: {
        ResultParameter: Array<{
          Key: string;
          Value: string | number;
        }>;
      };
    };
  };
}

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  initiatorName: string;
  securityCredential: string;
  environment: MpesaEnvironment;
  baseUrl: string;
  callbackBaseUrl: string;
}

export interface MpesaTransactionState {
  referenceId: string;
  externalId: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'CANCELLED';
  type: 'b2c' | 'stk_push' | 'balance' | 'status_query';
  amount: string;
  currency: string;
  party: string;
  createdAt: Date;
  completedAt?: Date;
  failureReason?: string;
}

export interface MpesaCustomerInfoResponse {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'DORMANT';
  kycLevel: string;
  registrationDate?: string;
}

export interface MpesaStatementEntry {
  transactionId: string;
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline' | 'BusinessPayment' | 'SalaryPayment' | 'TransferFunds';
  amount: string;
  currency: string;
  debitParty: string;
  creditParty: string;
  balance?: string;
  transactionDate: string;
  description?: string;
}

export const MPESA_ADAPTER = 'MPESA_ADAPTER';
