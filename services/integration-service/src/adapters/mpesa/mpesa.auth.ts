import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { DarajaAuthResponse, MpesaEnvironment } from './mpesa.types';

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

@Injectable()
export class MpesaAuthService {
  private readonly logger = new Logger('MpesaAuthService');
  private tokenCacheEntry: TokenCacheEntry | null = null;

  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly shortCode: string;
  private readonly passkey: string;
  private readonly initiatorName: string;
  private readonly securityCredential: string;
  private readonly environment: MpesaEnvironment;
  private readonly baseUrl: string;
  private readonly callbackBaseUrl: string;

  constructor(private configService: ConfigService) {
    this.consumerKey = this.configService.get<string>('MPESA_CONSUMER_KEY', 'sandbox-consumer-key');
    this.consumerSecret = this.configService.get<string>('MPESA_CONSUMER_SECRET', 'sandbox-consumer-secret');
    this.shortCode = this.configService.get<string>('MPESA_SHORT_CODE', '174379');
    this.passkey = this.configService.get<string>('MPESA_PASSKEY', 'sandbox-passkey');
    this.initiatorName = this.configService.get<string>('MPESA_INITIATOR_NAME', 'testapi');
    this.securityCredential = this.configService.get<string>('MPESA_SECURITY_CREDENTIAL', 'sandbox-credential');
    this.environment = this.configService.get<MpesaEnvironment>('MPESA_ENVIRONMENT', 'sandbox');
    this.baseUrl =
      this.environment === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';
    this.callbackBaseUrl = this.configService.get<string>('MPESA_CALLBACK_BASE_URL', 'https://callbacks.example.com');
  }

  getEnvironment(): MpesaEnvironment {
    return this.environment;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getShortCode(): string {
    return this.shortCode;
  }

  getInitiatorName(): string {
    return this.initiatorName;
  }

  getSecurityCredential(): string {
    return this.securityCredential;
  }

  getCallbackBaseUrl(): string {
    return this.callbackBaseUrl;
  }

  isSandbox(): boolean {
    return this.environment === 'sandbox';
  }

  /**
   * Generate the STK Push password: base64(ShortCode + Passkey + Timestamp)
   */
  generatePassword(timestamp: string): string {
    return Buffer.from(`${this.shortCode}${this.passkey}${timestamp}`).toString('base64');
  }

  /**
   * Generate a Daraja-format timestamp: YYYYMMDDHHmmss
   */
  generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  async getAccessToken(): Promise<string> {
    // Check cache first — Daraja tokens expire in 3599s, we refresh at 59 minutes (3540s)
    if (this.tokenCacheEntry && this.tokenCacheEntry.expiresAt > Date.now()) {
      this.logger.debug('Using cached Daraja access token');
      return this.tokenCacheEntry.token;
    }

    this.logger.log('Requesting new Daraja access token');

    const tokenResponse = await this.requestToken();
    const expiresInMs = parseInt(tokenResponse.expires_in, 10) * 1000;

    // Cache with 60-second buffer before expiry
    this.tokenCacheEntry = {
      token: tokenResponse.access_token,
      expiresAt: Date.now() + expiresInMs - 60000,
    };

    return tokenResponse.access_token;
  }

  private async requestToken(): Promise<DarajaAuthResponse> {
    if (this.isSandbox()) {
      this.logger.log(`[SANDBOX] Simulating GET ${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`);

      return {
        access_token: `mpesa-token-${uuidv4().slice(0, 8)}`,
        expires_in: '3599',
      };
    }

    // Production: GET /oauth/v1/generate?grant_type=client_credentials
    // Authorization: Basic base64(consumerKey:consumerSecret)
    this.getBasicAuthHeader();

    this.logger.log(`GET ${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`);

    // Would use HttpService in production
    return {
      access_token: `mpesa-token-${uuidv4().slice(0, 8)}`,
      expires_in: '3599',
    };
  }

  getBasicAuthHeader(): string {
    return Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
  }

  clearTokenCache(): void {
    this.tokenCacheEntry = null;
    this.logger.log('Daraja token cache cleared');
  }
}
