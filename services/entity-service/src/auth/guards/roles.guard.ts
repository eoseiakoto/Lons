import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IAuthenticatedUser } from '../interfaces/jwt-payload.interface';
import { AuthFailureLoggerService } from '../auth-failure-logger.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    // BA-C-1: @Optional so tests that construct the guard with just
    // a Reflector still work. Production wiring (AuthModule) always
    // injects the logger.
    @Optional() private readonly authFailureLogger?: AuthFailureLoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = this.getRequest(context);
    const user: IAuthenticatedUser = request.user;
    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }

    if (user.isPlatformAdmin) return true;

    const hasPermission = requiredPermissions.every(
      (perm) => user.permissions.includes(perm),
    );

    if (!hasPermission) {
      // BA-C-1: fire-and-forget audit + monitoring. Do NOT await —
      // a transient audit-log failure must never delay (or worse,
      // mask) the auth refusal that the client is waiting on. The
      // service swallows its own errors; we add .catch as a
      // belt-and-braces for unforeseen rejection paths.
      this.authFailureLogger
        ?.logMutationAccessDenied(user, context.getHandler().name, requiredPermissions)
        .catch(() => {
          /* swallow — authz denial is the priority */
        });

      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }

  private getRequest(context: ExecutionContext) {
    const type = context.getType<string>();
    if (type === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      return ctx.getContext().req;
    }
    return context.switchToHttp().getRequest();
  }
}
