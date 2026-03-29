import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { AUDIT_ACTION_KEY } from './audit-action.decorator';
import { AuditAccessType } from './audit.constants';
import { computeDiff } from './audit-diff.util';

interface AuditServiceLike {
  log: (input: AuditLogInput) => Promise<void>;
}

interface AuditLogInput {
  tenantId: string;
  actorId?: string;
  actorType: 'user' | 'system' | 'api_key';
  actorIp?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

interface RequestUser {
  id?: string;
  sub?: string;
  tenantId?: string;
  type?: 'user' | 'system' | 'api_key';
  role?: string;
}

/**
 * NestJS interceptor that automatically records audit log entries for handlers
 * decorated with `@AuditAction(action, resource)`.
 *
 * It resolves actor identity and tenant from `req.user`, reads the
 * `X-Correlation-Id` request header for traceability, and calls the
 * injected `AUDIT_SERVICE` after the handler successfully resolves.
 *
 * For mutations the diff between `before` (captured from the resolved value's
 * `before` property, if provided by the handler) and `after` (the resolved
 * value itself) is recorded.
 */
@Injectable()
export class AuditEventInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject('AUDIT_SERVICE') private readonly auditService?: AuditServiceLike,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Read the metadata placed by @AuditAction()
    const metadata = this.reflector.get<{ action: string; resource: string } | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    // No @AuditAction decorator — pass through without logging
    if (!metadata || !this.auditService) {
      return next.handle();
    }

    const { action, resource } = metadata;

    // Extract request from either HTTP or GraphQL context
    let req: { user?: RequestUser; headers?: Record<string, string> } = {};
    const contextType = context.getType<string>();

    if (contextType === 'http') {
      req = context.switchToHttp().getRequest();
    } else {
      // GraphQL — args[2] is the GQL context object
      const gqlArgs = context.getArgs();
      req = gqlArgs[2]?.req ?? {};
    }

    const user: RequestUser = req.user ?? {};
    const actorId = user.id ?? user.sub;
    const actorType: 'user' | 'system' | 'api_key' = user.type ?? 'system';
    const tenantId = user.tenantId ?? 'unknown';
    const actorIp: string | undefined = (req as Record<string, unknown>)['ip'] as string | undefined;
    const correlationId: string | undefined =
      req.headers?.['x-correlation-id'] as string | undefined;

    // Determine access type based on role
    const accessType =
      user.role === 'platform_admin'
        ? AuditAccessType.PLATFORM_ADMIN_CROSS_TENANT
        : AuditAccessType.TENANT_SCOPED;

    return next.handle().pipe(
      tap(async (responseValue: unknown) => {
        try {
          // Handlers that want to supply a before-state can wrap their return
          // value as `{ __before: <snapshot>, ...actual }`. We peel that off
          // here so the rest of the platform sees only the actual value.
          let beforeValue: Record<string, unknown> | null = null;
          let afterValue: Record<string, unknown> | null = null;
          let resourceId: string | undefined;

          if (responseValue && typeof responseValue === 'object') {
            const val = responseValue as Record<string, unknown>;

            if ('__before' in val) {
              beforeValue = val['__before'] as Record<string, unknown> | null;
              // Strip the sentinel key from the after value
              const { __before, ...rest } = val;
              void __before; // intentionally unused
              afterValue = rest as Record<string, unknown>;
            } else {
              afterValue = val;
            }

            resourceId = (afterValue?.id ?? beforeValue?.id) as string | undefined;
          }

          // Build field-level diff for update operations
          const diff = computeDiff(beforeValue, afterValue);
          const hasDiff = diff.length > 0;

          await this.auditService!.log({
            tenantId,
            actorId,
            actorType,
            actorIp,
            action,
            resourceType: resource,
            resourceId,
            beforeValue: hasDiff ? beforeValue : undefined,
            afterValue: hasDiff ? afterValue : undefined,
            correlationId,
            metadata: { accessType, diff: hasDiff ? diff : undefined },
          } as AuditLogInput);
        } catch {
          // Audit logging must never break the primary response path.
          // Errors are silently swallowed here; in production wire up a logger.
        }
      }),
    );
  }
}
