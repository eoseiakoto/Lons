import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';

import { IJwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class JwtService {
  private privateKey: string;
  private publicKey: string;
  private readonly accessTokenExpiry: number;
  private readonly refreshTokenExpiry: number;

  constructor(private configService: ConfigService) {
    const privateKeyPath = this.configService.get<string>('JWT_PRIVATE_KEY', '');
    const publicKeyPath = this.configService.get<string>('JWT_PUBLIC_KEY', '');

    // Try loading from file paths, fall back to generating ephemeral keys for dev
    try {
      this.privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
      this.publicKey = fs.readFileSync(publicKeyPath, 'utf-8');
    } catch {
      // Generate ephemeral RSA keys for development
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.privateKey = privateKey;
      this.publicKey = publicKey;
      console.warn('Using ephemeral RSA keys — configure JWT_PRIVATE_KEY and JWT_PUBLIC_KEY for production');
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
