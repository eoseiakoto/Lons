import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';

import { IJwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);
  private privateKey: string;
  private publicKey: string;
  private readonly accessTokenExpiry: number;
  private readonly refreshTokenExpiry: number;

  constructor(private configService: ConfigService) {
    const privateKeyPath = this.configService.get<string>('JWT_PRIVATE_KEY', '');
    const publicKeyPath = this.configService.get<string>('JWT_PUBLIC_KEY', '');
    // SEC-9: read NODE_ENV from process.env directly — ConfigService is the
    // standard injection point but `NODE_ENV` is set by every Node runtime
    // independently of any .env loading order.
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;

    // Try loading from file paths, fall back to generating ephemeral keys
    // for development only.
    try {
      this.privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
      this.publicKey = fs.readFileSync(publicKeyPath, 'utf-8');
    } catch (err) {
      // Security Hardening (SEC-9): in production, ephemeral keys are a
      // disaster waiting to happen — every restart invalidates all live
      // tokens, and there is no cryptographic continuity. Fail at boot
      // with a clear message rather than silently degrading security.
      if (nodeEnv === 'production') {
        const reason = (err as NodeJS.ErrnoException)?.code ?? 'unknown';
        throw new Error(
          `JWT signing keys could not be loaded ` +
            `(JWT_PRIVATE_KEY="${privateKeyPath}", JWT_PUBLIC_KEY="${publicKeyPath}", reason=${reason}). ` +
            'Ephemeral RSA keys are not permitted in production. ' +
            'Generate a 2048-bit RSA key pair and configure both paths.',
        );
      }

      // Non-production: generate ephemeral RSA keys.
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.privateKey = privateKey;
      this.publicKey = publicKey;
      this.logger.warn(
        `Using ephemeral RSA keys (NODE_ENV=${nodeEnv ?? '<unset>'}) — ` +
          'configure JWT_PRIVATE_KEY and JWT_PUBLIC_KEY for production.',
      );
    }

    this.accessTokenExpiry = this.configService.get<number>('JWT_EXPIRY', 3600);
    this.refreshTokenExpiry = this.configService.get<number>('REFRESH_TOKEN_EXPIRY', 604800);
  }

  signAccessToken(payload: Omit<IJwtPayload, 'type' | 'iat' | 'exp'>): string {
    return this.sign({ ...payload, type: 'access' }, this.accessTokenExpiry);
  }

  signRefreshToken(payload: Pick<IJwtPayload, 'sub' | 'tenantId'>): string {
    return this.sign({ ...payload, role: '', permissions: [], type: 'refresh' }, this.refreshTokenExpiry);
  }

  /**
   * Sprint 15 (S15-6) — short-lived MFA verification token. Issued when
   * login credentials are valid but MFA is required; consumed by the
   * `verifyMfa` mutation in exchange for a full access+refresh pair.
   * 5-minute expiry. Carries `purpose: 'mfa_verification'` so the access
   * guard can reject any other endpoint that sees it.
   */
  signMfaToken(payload: {
    sub: string;
    tenantId: string;
    userType: 'user' | 'platform_user';
  }): string {
    return this.sign(
      {
        ...payload,
        role: '',
        permissions: [],
        type: 'mfa',
        purpose: 'mfa_verification',
      },
      300, // 5 minutes
    );
  }

  verifyToken(token: string): IJwtPayload {
    return this.verify(token);
  }

  private sign(payload: IJwtPayload, expiresIn: number): string {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: IJwtPayload = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
    };

    const header = this.base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = this.base64url(JSON.stringify(fullPayload));
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(`${header}.${body}`)
      .sign(this.privateKey, 'base64url');

    return `${header}.${body}.${signature}`;
  }

  private verify(token: string): IJwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [header, body, signature] = parts;

    const isValid = crypto
      .createVerify('RSA-SHA256')
      .update(`${header}.${body}`)
      .verify(this.publicKey, signature, 'base64url');

    if (!isValid) {
      throw new Error('Invalid token signature');
    }

    const payload: IJwtPayload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf-8'),
    );

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }

    return payload;
  }

  private base64url(str: string): string {
    return Buffer.from(str).toString('base64url');
  }
}
