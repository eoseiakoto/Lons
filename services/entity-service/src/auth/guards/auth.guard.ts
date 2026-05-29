import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PrismaService } from '@lons/database';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtService } from '../jwt.service';
import { MFA_ENROLLMENT_ONLY_ALLOWED_HANDLERS } from '../interfaces/jwt-payload.interface';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    @Optional() private prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = this.getRequest(context);
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      const payload = await this.jwtService.verifyToken(token);
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }
      const isPlatformAdmin = payload.role === 'platform_admin' || payload.role === 'platform_support';

      // Platform admins can override tenant context via X-Tenant-Context header
      let effectiveTenantId = payload.tenantId;
      const tenantOverride = request.headers?.['x-tenant-context'];
      if (tenantOverride) {
        if (!isPlatformAdmin) {
          throw new UnauthorizedException('Only platform admins can use X-Tenant-Context');
        }
        // Validate UUID format
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantOverride)) {
          throw new UnauthorizedException('Invalid tenant ID in X-Tenant-Context');
        }
        // Validate tenant exists and is active
        if (this.prisma) {
          const targetTenant = await this.prisma.tenant.findUnique({
            where: { id: tenantOverride },
            select: { status: true },
          });
          if (!targetTenant) {
            throw new ForbiddenException('Target tenant does not exist');
          }
          if (targetTenant.status !== 'active') {
            throw new ForbiddenException('Target tenant is inactive');
          }
        }
        effectiveTenantId = tenantOverride;
      }

      // MFA-lockout fix: an `mfa_enrollment_only`-scoped access
      // token is issued to overdue users so they can reach the
      // MFA enrolment flow. The token is intentionally restricted
      // to the handlers in MFA_ENROLLMENT_ONLY_ALLOWED_HANDLERS;
      // any other resolver/controller call returns 403.
      // Implemented here (not in RolesGuard) so the restriction
      // applies even to handlers with no @Roles decorator (e.g.
      // public-ish reads that AuthGuard runs on but RolesGuard
      // doesn't gate).
      if (payload.scope === 'mfa_enrollment_only') {
        const handlerName = context.getHandler()?.name;
        if (!handlerName || !MFA_ENROLLMENT_ONLY_ALLOWED_HANDLERS.includes(handlerName)) {
          throw new ForbiddenException(
            'MFA enrollment required — complete enrollment to access the platform',
          );
        }
      }

      request.user = {
        userId: payload.sub,
        tenantId: effectiveTenantId,
        role: payload.role,
        permissions: payload.permissions,
        isPlatformAdmin,
        tenantOverride: tenantOverride || undefined,
        scope: payload.scope,
      };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private getRequest(context: ExecutionContext) {
    const type = context.getType<string>();
    if (type === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      return ctx.getContext().req;
    }
    return context.switchToHttp().getRequest();
  }

  private extractToken(request: { headers?: { authorization?: string } }): string | undefined {
    const authorization = request.headers?.authorization;
    if (!authorization) return undefined;
    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
