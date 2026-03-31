import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  IWalletAdapter,
  TransferParams,
  TransferResult,
  CollectionParams,
  BalanceInfo,
  TransactionStatusResult,
} from '@lons/process-engine';
import {
  WalletCustomerInfo,
  WalletTransaction,
  DateRange,
  WebhookRegistration,
} from '../wallet-adapter.types';
import { maskPhone } from '@lons/common';
import { CircuitBreaker } from '../../resilience/circuit-breaker';
import { withRetry } from '../../resilience/retry';
import {
  IWalletAdapterConfig,
  IEndpointConfig,
  IWalletAdapterAuthConfig,
  IGenericWalletResponse,
} from './generic-wallet.types';

@Injectable()
export class GenericWalletAdapter implements IWalletAdapter {
  private readonly logger = new Logger('GenericWalletAdapter');
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(private configService: ConfigService) {}

  private getCircuitBreaker(config: IWalletAdapterConfig): CircuitBreaker {
    const key = config.providerId;
    if (!this.circuitBreakers.has(key)) {
      this.circuitBreakers.set(
        key,
        new CircuitBreaker({
          failureThreshold: config.resilience.circuitBreakerThreshold,
          resetTimeout: 30000,
          halfOpenMaxAttempts: 1,
        }),
      );
    }
    return this.circuitBreakers.get(key)!;
  }

  private isSandbox(): boolean {
    const env = this.configService.get<string>('NODE_ENV', 'development');
    return env !== 'production';
  }

  private async getAuthHeaders(auth: IWalletAdapterAuthConfig): Promise<Record<string, string>> {
    switch (auth.type) {
      case 'bearer':
        return { Authorization: `Bearer ${auth.credentials.token}` };

      case 'api_key': {
        const header = auth.apiKeyHeader || 'X-API-Key';
        return { [header]: auth.credentials.apiKey };
      }

      case 'basic': {
        const encoded = Buffer.from(
          `${auth.credentials.username}:${auth.credentials.password}`,
        ).toString('base64');
        return { Authorization: `Basic ${encoded}` };
      }

      case 'oauth2': {
        const token = await this.getOAuth2Token(auth);
        return { Authorization: `Bearer ${token}` };
      }

      default:
        return {};
    }
  }

  private async getOAuth2Token(auth: IWalletAdapterAuthConfig): Promise<string> {
    const cacheKey = `${auth.tokenUrl}-${auth.credentials.clientId}`;
    const cached = this.tokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    if (this.isSandbox()) {
      const token = `sandbox-token-${uuidv4().slice(0, 8)}`;
      this.tokenCache.set(cacheKey, {
        token,
        expiresAt: Date.now() + 3600 * 1000,
      });
      return token;
    }

    // In production, would POST to auth.tokenUrl
    // For now, simulate
    const token = `oauth2-token-${uuidv4().slice(0, 8)}`;
    this.tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + 3600 * 1000,
    });
    return token;
  }

  buildRequestBody(
    mapping: Record<string, string>,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    for (const [targetField, sourceExpression] of Object.entries(mapping)) {
      const value = this.resolveMapping(sourceExpression, params);
      this.setNestedValue(body, targetField, value);
    }

    return body;
  }

  private resolveMapping(expression: string, params: Record<string, unknown>): unknown {
    // If expression starts with '$', it's a reference to a param field
    if (expression.startsWith('$')) {
      const field = expression.slice(1);
      return params[field];
    }
    // Static value
    return expression;
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  transformResponse(
    response: IGenericWalletResponse,
    config: IWalletAdapterConfig,
  ): TransferResult {
    const mapping = config.responseMapping;
    const ref = this.getNestedValue(response, mapping.referenceField) as string | undefined;
    const status = this.getNestedValue(response, mapping.statusField) as string | undefined;

    const isSuccess = status === mapping.statusValues.success;
    const isPending = status === mapping.statusValues.pending;

    return {
      success: isSuccess || isPending,
      externalRef: ref || uuidv4().slice(0, 12).toUpperCase(),
      failureReason: !isSuccess && !isPending ? `Provider status: ${status}` : undefined,
    };
  }

  private simulateSandboxResponse(
    endpoint: IEndpointConfig,
    config: IWalletAdapterConfig,
  ): IGenericWalletResponse {
    const mapping = config.responseMapping;
    const rand = Math.random();
    let status: string;

    if (rand < 0.75) {
      status = mapping.statusValues.success;
    } else if (rand < 0.90) {
      status = mapping.statusValues.pending;
    } else {
      status = mapping.statusValues.failed;
    }

    const response: IGenericWalletResponse = {};
    this.setNestedValue(
      response as Record<string, unknown>,
      mapping.referenceField,
      `GEN-${uuidv4().slice(0, 8).toUpperCase()}`,
    );
    this.setNestedValue(response as Record<string, unknown>, mapping.statusField, status);

    return response;
  }

  private async executeRequest(
    config: IWalletAdapterConfig,
    endpointKey: keyof IWalletAdapterConfig['endpoints'],
    params: Record<string, unknown>,
  ): Promise<IGenericWalletResponse> {
    const endpoint = config.endpoints[endpointKey];
    if (!endpoint) {
      throw new Error(`No endpoint configured for '${String(endpointKey)}' in ${config.name}`);
    }
    const cb = this.getCircuitBreaker(config);

    return cb.execute(() =>
      withRetry(
        async () => {
          if (this.isSandbox()) {
            this.logger.log(
              `[SANDBOX] ${config.name} ${endpointKey}: ${endpoint.method} ${config.baseUrl}${endpoint.path}`,
            );
            return this.simulateSandboxResponse(endpoint, config);
          }

          // Production: build and send actual HTTP request
          await this.getAuthHeaders(config.auth);
          endpoint.bodyMapping
            ? this.buildRequestBody(endpoint.bodyMapping, params)
            : undefined;

          // Would use HttpService/axios here in production
          this.logger.log(
            `${config.name} ${endpointKey}: ${endpoint.method} ${config.baseUrl}${endpoint.path}`,
          );
          return this.simulateSandboxResponse(endpoint, config);
        },
        {
          maxRetries: config.resilience.maxRetries,
          baseDelay: 1000,
          maxDelay: config.resilience.timeoutMs,
          backoffMultiplier: 2,
        },
      ),
    );
  }

  async transferWithConfig(
    params: TransferParams,
    config: IWalletAdapterConfig,
  ): Promise<TransferResult> {
    this.logger.log(
      `Disbursing ${params.amount} ${params.currency} to ${maskPhone(params.destination)} via ${config.name}`,
    );

    const response = await this.executeRequest(config, 'disburse', {
      destination: params.destination,
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
    });

    return this.transformResponse(response, config);
  }

  async collectWithConfig(
    params: CollectionParams,
    config: IWalletAdapterConfig,
  ): Promise<TransferResult> {
    this.logger.log(
      `Collecting ${params.amount} ${params.currency} from ${maskPhone(params.source)} via ${config.name}`,
    );

    const response = await this.executeRequest(config, 'collect', {
      source: params.source,
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
      reason: params.reason,
    });

    return this.transformResponse(response, config);
  }

  async getBalanceWithConfig(
    walletId: string,
    config: IWalletAdapterConfig,
  ): Promise<BalanceInfo> {
    this.logger.log(`Balance query for ${maskPhone(walletId)} via ${config.name}`);

    const cb = this.getCircuitBreaker(config);
    return cb.execute(() =>
      withRetry(
        async () => {
          if (this.isSandbox()) {
            return {
              available: '50000.0000',
              currency: 'GHS',
              lastUpdated: new Date(),
            };
          }
          // Production would make actual HTTP request
          return { available: '50000.0000', currency: 'GHS', lastUpdated: new Date() };
        },
        {
          maxRetries: config.resilience.maxRetries,
          baseDelay: 1000,
          maxDelay: config.resilience.timeoutMs,
          backoffMultiplier: 2,
        },
      ),
    );
  }

  async getTransactionStatusWithConfig(
    reference: string,
    config: IWalletAdapterConfig,
  ): Promise<TransactionStatusResult> {
    this.logger.log(`Status query for ${reference} via ${config.name}`);

    const cb = this.getCircuitBreaker(config);
    return cb.execute(() =>
      withRetry(
        async () => {
          if (this.isSandbox()) {
            return {
              reference,
              status: 'completed' as const,
              completedAt: new Date(),
            };
          }
          return { reference, status: 'completed' as const, completedAt: new Date() };
        },
        {
          maxRetries: config.resilience.maxRetries,
          baseDelay: 1000,
          maxDelay: config.resilience.timeoutMs,
          backoffMultiplier: 2,
        },
      ),
    );
  }

  async getCustomerInfoWithConfig(
    walletId: string,
    config: IWalletAdapterConfig,
  ): Promise<WalletCustomerInfo> {
    this.logger.log(`Customer info query for ${maskPhone(walletId)} via ${config.name}`);

    const endpoint = config.endpoints.customerInfo;
    if (!endpoint) {
      this.logger.warn(`No customerInfo endpoint configured for ${config.name}`);
      return {
        walletId,
        fullName: 'Unknown',
        kycLevel: 'unknown',
        accountStatus: 'unknown',
        accountAge: 0,
        currency: 'USD',
      };
    }

    const cb = this.getCircuitBreaker(config);
    return cb.execute(() =>
      withRetry(
        async () => {
          if (this.isSandbox()) {
            this.logger.log(
              `[SANDBOX] ${config.name} customerInfo: ${endpoint.method} ${config.baseUrl}${endpoint.path}`,
            );
            return {
              walletId,
              fullName: 'Test User',
              kycLevel: 'tier_2',
              accountStatus: 'active',
              accountAge: 180,
              currency: 'USD',
            };
          }

          await this.getAuthHeaders(config.auth);
          this.logger.log(
            `${config.name} customerInfo: ${endpoint.method} ${config.baseUrl}${endpoint.path}`,
          );
          return {
            walletId,
            fullName: 'Test User',
            kycLevel: 'tier_2',
            accountStatus: 'active',
            accountAge: 180,
            currency: 'USD',
          };
        },
        {
          maxRetries: config.resilience.maxRetries,
          baseDelay: 1000,
          maxDelay: config.resilience.timeoutMs,
          backoffMultiplier: 2,
        },
      ),
    );
  }

  async getTransactionHistoryWithConfig(
    walletId: string,
    dateRange: DateRange,
    config: IWalletAdapterConfig,
  ): Promise<WalletTransaction[]> {
    this.logger.log(
      `Transaction history for ${maskPhone(walletId)} via ${config.name}`,
    );

    const endpoint = config.endpoints.transactionHistory;
    if (!endpoint) {
      this.logger.warn(`No transactionHistory endpoint configured for ${config.name}`);
      return [];
    }

    const cb = this.getCircuitBreaker(config);
    return cb.execute(() =>
      withRetry(
        async () => {
          if (this.isSandbox()) {
            this.logger.log(
              `[SANDBOX] ${config.name} transactionHistory: ${endpoint.method} ${config.baseUrl}${endpoint.path}`,
            );
            return [];
          }

          await this.getAuthHeaders(config.auth);
          this.logger.log(
            `${config.name} transactionHistory: ${endpoint.method} ${config.baseUrl}${endpoint.path}`,
          );
          return [];
        },
        {
          maxRetries: config.resilience.maxRetries,
          baseDelay: 1000,
          maxDelay: config.resilience.timeoutMs,
          backoffMultiplier: 2,
        },
      ),
    );
  }

  async registerWebhookWithConfig(
    events: string[],
    callbackUrl: string,
    config: IWalletAdapterConfig,
  ): Promise<WebhookRegistration> {
    this.logger.log(
      `Webhook registration for events [${events.join(', ')}] via ${config.name}`,
    );

    const endpoint = config.endpoints.registerWebhook;
    if (!endpoint) {
      this.logger.warn(`No registerWebhook endpoint configured for ${config.name}`);
      return {
        id: `GEN-WH-${uuidv4().slice(0, 8).toUpperCase()}`,
        events,
        callbackUrl,
        active: false,
      };
    }

    const cb = this.getCircuitBreaker(config);
    return cb.execute(() =>
      withRetry(
        async () => {
          const id = `GEN-WH-${uuidv4().slice(0, 8).toUpperCase()}`;

          if (this.isSandbox()) {
            this.logger.log(
              `[SANDBOX] ${config.name} registerWebhook: ${endpoint.method} ${config.baseUrl}${endpoint.path}`,
            );
            return { id, events, callbackUrl, active: true };
          }

          await this.getAuthHeaders(config.auth);
          this.logger.log(
            `${config.name} registerWebhook: ${endpoint.method} ${config.baseUrl}${endpoint.path}`,
          );
          return { id, events, callbackUrl, active: true };
        },
        {
          maxRetries: config.resilience.maxRetries,
          baseDelay: 1000,
          maxDelay: config.resilience.timeoutMs,
          backoffMultiplier: 2,
        },
      ),
    );
  }

  // IWalletAdapter interface — these require a config to be set externally
  // Use transferWithConfig/collectWithConfig for config-driven usage
  async transfer(_params: TransferParams): Promise<TransferResult> {
    this.logger.warn(
      'GenericWalletAdapter.transfer() called without config — use transferWithConfig() instead',
    );
    return {
      success: false,
      failureReason: 'No wallet provider config set. Use transferWithConfig() with a config object.',
    };
  }

  async collect(_params: CollectionParams): Promise<TransferResult> {
    this.logger.warn(
      'GenericWalletAdapter.collect() called without config — use collectWithConfig() instead',
    );
    return {
      success: false,
      failureReason: 'No wallet provider config set. Use collectWithConfig() with a config object.',
    };
  }

  async getBalance(_walletId: string): Promise<BalanceInfo> {
    this.logger.warn(
      'GenericWalletAdapter.getBalance() called without config — use getBalanceWithConfig() instead',
    );
    return { available: '0.0000', currency: 'USD', lastUpdated: new Date() };
  }

  async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    this.logger.warn(
      'GenericWalletAdapter.getTransactionStatus() called without config — use getTransactionStatusWithConfig() instead',
    );
    return { reference, status: 'failed', failureReason: 'No wallet provider config set' };
  }

  async getCustomerInfo(_walletId: string): Promise<WalletCustomerInfo> {
    this.logger.warn(
      'GenericWalletAdapter.getCustomerInfo() called without config — use getCustomerInfoWithConfig() instead',
    );
    return {
      walletId: '',
      fullName: 'Unknown',
      kycLevel: 'unknown',
      accountStatus: 'unknown',
      accountAge: 0,
      currency: 'USD',
    };
  }

  async getTransactionHistory(_walletId: string, _dateRange: DateRange): Promise<WalletTransaction[]> {
    this.logger.warn(
      'GenericWalletAdapter.getTransactionHistory() called without config — use getTransactionHistoryWithConfig() instead',
    );
    return [];
  }

  async registerWebhook(events: string[], callbackUrl: string): Promise<WebhookRegistration> {
    this.logger.warn(
      'GenericWalletAdapter.registerWebhook() called without config — use registerWebhookWithConfig() instead',
    );
    return {
      id: 'none',
      events,
      callbackUrl,
      active: false,
    };
  }
}
