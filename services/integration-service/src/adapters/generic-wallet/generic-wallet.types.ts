export interface IWalletAdapterAuthConfig {
  type: 'oauth2' | 'api_key' | 'basic' | 'bearer';
  tokenUrl?: string;
  credentials: Record<string, string>;
  apiKeyHeader?: string;
}

export interface IEndpointConfig {
  method: string;
  path: string;
  bodyMapping?: Record<string, string>;
}

export interface IWalletAdapterEndpoints {
  disburse: IEndpointConfig;
  collect: IEndpointConfig;
  balance: IEndpointConfig;
  status: IEndpointConfig;
  customerInfo?: IEndpointConfig;
  transactionHistory?: IEndpointConfig;
  registerWebhook?: IEndpointConfig;
}

export interface IResponseMapping {
  referenceField: string;
  statusField: string;
  statusValues: {
    success: string;
    pending: string;
    failed: string;
  };
}

export interface IWebhookConfig {
  signatureHeader: string;
  signatureAlgorithm: 'hmac-sha256' | 'hmac-sha512';
}

export interface IResilienceConfig {
  timeoutMs: number;
  maxRetries: number;
  circuitBreakerThreshold: number;
}

export interface IWalletAdapterConfig {
  providerId: string;
  name: string;
  baseUrl: string;
  auth: IWalletAdapterAuthConfig;
  endpoints: IWalletAdapterEndpoints;
  responseMapping: IResponseMapping;
  webhook?: IWebhookConfig;
  resilience: IResilienceConfig;
}

export interface IGenericWalletResponse {
  [key: string]: unknown;
}

export const GENERIC_WALLET_ADAPTER = 'GENERIC_WALLET_ADAPTER';
