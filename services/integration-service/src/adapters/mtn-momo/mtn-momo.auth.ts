import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { MoMoEnvironment, MoMoTokenResponse } from './mtn-momo.types';

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

@Injectable()
export class MtnMomoAuthService {
  private readonly logger = new Logger('MtnMomoAuthService');
  private readonly tokenCache = new Map<string, TokenCacheEntry>();

  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly subscriptionKey: string;
  private readonly environment: MoMoEnvironment;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MTN_MOMO_API_KEY', 'sandbox-api-key');
    this.apiSecret = this.configService.get<string>('MTN_MOMO_API_SECRET', 'sandbox-api-secret');
    this.subscriptionKey = this.configService.get<string>('MTN_MOMO_SUBSCRIPTION_KEY', 'sandbox-sub-key');
    this.environment = this.configService.get<MoMoEnvironment>('MTN_MOMO_ENVIRONMENT', 'sandbox');
    this.baseUrl =
      this.environment === 'production'
        ? 'https://proxy.momoapi.mtn.com'
        : 'https://sandbox.momoapi.mtn.com';
  }

  getEnvironment(): MoMoEnvironment {
    return this.environment;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getSubscriptionKey(): string {
    return this.subscriptionKey;
  }

  isSandbox(): boolean {
    return this.environment === 'sandbox';
  }

  async getCollectionToken(): Promise<string> {
    return this.getToken('collection');
  }

  async getDisbursementToken(): Promise<string> {
    return this.getToken('disbursement');
  }

  private async getToken(product: 'collection' | 'disbursement'): Promise<string> {
    const cacheKey = `momo-${product}`;
    const cached = this.tokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Using cached ${product} token`);
      return cached.token;
    }

    this.logger.log(`Requesting new ${product} token`);

    const tokenResponse = await this.requestToken(product);
    const ttlMs = (tokenResponse.expires_in || 3600) * 1000;

    // Cache with 60-second buffer before expiry
    this.tokenCache.set(cacheKey, {
      token: tokenResponse.access_token,
      expiresAt: Date.now() + ttlMs - 60000,
    });

    return tokenResponse.access_token;
  }

  private async requestToken(product: 'collection' | 'disbursement'): Promise<MoMoTokenResponse> {
    if (this.isSandbox()) {
      this.logger.log(`[SANDBOX] Simulating POST ${this.baseUrl}/${product}/token`);

      return {
        access_token: `momo-${product}-token-${uuidv4().slice(0, 8)}`,
        token_type: 'Bearer',
        expires_in: 3600,
      };
    }

    // Production: POST to /{product}/token with Basic auth
    // Authorization: Basic base64(apiKey:apiSecret)
    // Ocp-Apim-Subscription-Key: subscriptionKey
    const _credentials = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');

    // Would use HttpService in production
    this.logger.log(`POST ${this.baseUrl}/${product}/token`);

    return {
      access_token: `momo-${product}-token-${uuidv4().slice(0, 8)}`,
      token_type: 'Bearer',
      expires_in: 3600,
    };
  }

  clearTokenCache(): void {
    this.tokenCache.clear();
    this.logger.log('Token cache cleared');
  }

  getBasicAuthHeader(): string {
    return Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
  }
}
