import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    // Tenant context is set by AuthGuard after JWT validation.
    // This middleware exists as a placeholder for any pre-auth tenant resolution
    // (e.g., from subdomain or API key header).
    next();
  }
}
