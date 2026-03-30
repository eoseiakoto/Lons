import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@lons/entity-service';

@Injectable()
export class SubscriptionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionAuthGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const ctx = context.switchToWs();
    const client = ctx.getClient();
    const connectionParams =
      client?.connectionParams || client?.handshake?.auth || {};

    // Extract token from connection params
    const token =
      connectionParams.authToken || connectionParams.Authorization;
    if (!token) {
      return false;
    }

    // Strip "Bearer " prefix if present
    const rawToken = typeof token === 'string' && token.startsWith('Bearer ')
      ? token.slice(7)
      : token;

    try {
      // Validate JWT signature and expiry using RS256
      const payload = this.jwtService.verifyToken(rawToken);

      // Attach decoded user info to the client for downstream use
      client.user = {
        id: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        permissions: payload.permissions,
        type: 'user' as const,
      };

      return true;
    } catch (error) {
      this.logger.warn('WebSocket auth failed: invalid or expired token');
      return false;
    }
  }
}
