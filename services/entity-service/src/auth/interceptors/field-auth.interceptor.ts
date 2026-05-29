import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';
import { Observable, from, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import { FieldAuthService } from '../field-auth.service';
import { AuthFailureLoggerService } from '../auth-failure-logger.service';
import { IAuthenticatedUser } from '../interfaces/jwt-payload.interface';

/**
 * S19-12 — automatic field redaction interceptor.
 *
 * Apply with `@UseInterceptors(FieldAuthInterceptor)` on a resolver,
 * and `@FieldAuthResource('customer')` (decorator below) to tag
 * which resource type's rules apply. The interceptor walks the
 * response shape (single object, array, or { items: [...] }) and
 * redacts every field whose rule the user fails.
 *
 * Performance: a single rule lookup per resource type per request
 * (FieldAuthService caches in Redis). Object walking is shallow by
 * default — nested objects are NOT recursed into automatically (a
 * single resolver typically returns one resource type at a time).
 *
 * Failure modes:
 *   - rule.behavior = 'redact' → field replaced with null in-place
 *   - rule.behavior = 'error'  → ForbiddenException thrown (use for
 *                                fields where the caller MUST know
 *                                they were blocked)
 */

const FIELD_AUTH_RESOURCE_KEY = 'field-auth-resource';

/**
 * Decorator that tags a resolver class (or individual handler) with
 * the resource type. The interceptor reads this via Reflector. Without
 * it, the interceptor is a no-op.
 *
 * Usage:
 *   @FieldAuthResource('customer')
 *   @UseInterceptors(FieldAuthInterceptor)
 *   @Resolver(() => Customer)
 *   export class CustomerResolver { ... }
 */
export const FieldAuthResource = (resourceType: string) =>
  SetMetadata(FIELD_AUTH_RESOURCE_KEY, resourceType);

@Injectable()
export class FieldAuthInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FieldAuthInterceptor.name);

  constructor(
    private readonly fieldAuthService: FieldAuthService,
    private readonly reflector: Reflector,
    // BA-C-1: @Optional so unit tests without DI wiring still work.
    // Production wiring (AuthModule) injects the logger so every
    // redaction / throw also writes to audit_logs + emits the
    // AUTHORIZATION_FAILURE event.
    @Optional() private readonly authFailureLogger?: AuthFailureLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const resourceType = this.resolveResourceType(context);
    if (!resourceType) return next.handle();

    const user = this.extractUser(context);
    if (!user) return next.handle();

    return next.handle().pipe(
      mergeMap((data) =>
        from(this.applyRedaction(data, user, resourceType, user.tenantId)),
      ),
    );
  }

  private resolveResourceType(context: ExecutionContext): string | undefined {
    // Check handler-level first (more specific), then class-level.
    return (
      this.reflector.get<string>(FIELD_AUTH_RESOURCE_KEY, context.getHandler()) ??
      this.reflector.get<string>(FIELD_AUTH_RESOURCE_KEY, context.getClass())
    );
  }

  private extractUser(context: ExecutionContext): IAuthenticatedUser | undefined {
    try {
      const gqlCtx = GqlExecutionContext.create(context);
      const req = gqlCtx.getContext().req;
      return req?.user as IAuthenticatedUser | undefined;
    } catch {
      // Non-GraphQL context (REST). Return undefined → interceptor
      // becomes a no-op. REST field-auth is out of scope for S19-12.
      return undefined;
    }
  }

  private async applyRedaction(
    data: unknown,
    user: IAuthenticatedUser,
    resourceType: string,
    tenantId: string,
  ): Promise<unknown> {
    if (data === null || data === undefined) return data;

    const rules = await this.fieldAuthService.getFieldAuthRules(tenantId, resourceType);
    if (rules.size === 0) return data;

    return this.redactValue(data, rules, user, resourceType);
  }

  private redactValue(
    value: unknown,
    rules: Map<string, import('../field-auth.service').FieldAuthRule>,
    user: IAuthenticatedUser,
    resourceType: string,
  ): unknown {
    if (value === null || value === undefined) return value;

    // Arrays: redact each element.
    if (Array.isArray(value)) {
      return value.map((v) => this.redactValue(v, rules, user, resourceType));
    }

    // Connection shape: { items: [...], hasMore } — redact `items`.
    if (typeof value === 'object' && value !== null && 'items' in (value as Record<string, unknown>)) {
      const obj = value as Record<string, unknown>;
      return {
        ...obj,
        items: Array.isArray(obj.items)
          ? obj.items.map((v) => this.redactValue(v, rules, user, resourceType))
          : obj.items,
      };
    }

    // Plain object: redact each known field per the rules.
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const redacted: Record<string, unknown> = { ...obj };
      for (const [fieldName, rule] of rules) {
        if (!(fieldName in redacted)) continue;
        if (this.fieldAuthService.checkFieldAccess(user.permissions ?? [], user.isPlatformAdmin, rule)) {
          continue;
        }
        // BA-C-1: log every denied field access. Fire-and-forget —
        // a transient audit-log failure must never delay (or mask)
        // the redaction / Forbidden the client is waiting on. The
        // service already swallows its own errors; the .catch is
        // belt-and-braces for any unforeseen rejection path.
        this.authFailureLogger
          ?.logFieldAccessDenied(user, resourceType, fieldName, rule.requiredPermissions)
          .catch(() => {
            /* swallow */
          });
        if (rule.behavior === 'error') {
          throw new ForbiddenException(`Access denied to field: ${fieldName}`);
        }
        redacted[fieldName] = null;
      }
      return redacted;
    }

    return value;
  }
}
