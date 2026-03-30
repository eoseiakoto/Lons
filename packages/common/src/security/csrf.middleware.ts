import { Injectable, NestMiddleware } from '@nestjs/common';
import * as crypto from 'crypto';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void): void {
    if (SAFE_METHODS.includes(req.method)) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie('XSRF-TOKEN', token, {
        httpOnly: false,
        sameSite: 'strict',
        path: '/',
      });
      return next();
    }

    const cookieToken: string | undefined = req.cookies?.['XSRF-TOKEN'];
    const headerToken: string | undefined = req.headers?.['x-xsrf-token'];

    // Skip CSRF check for API key requests — no cookies present
    if (!cookieToken && (!req.cookies || Object.keys(req.cookies).length === 0)) {
      return next();
    }

    if (!cookieToken || !headerToken) {
      res
        .status(403)
        .json({ code: 'CSRF_VALIDATION_FAILED', message: 'Missing CSRF token' });
      return;
    }

    // Use timing-safe comparison to prevent timing attacks
    if (
      cookieToken.length !== headerToken.length ||
      !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
      res
        .status(403)
        .json({ code: 'CSRF_VALIDATION_FAILED', message: 'Invalid CSRF token' });
      return;
    }

    next();
  }
}
