import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit_action';
export const AUDIT_RESOURCE_KEY = 'audit_resource';

/**
 * Decorator that marks a GraphQL resolver method or REST controller handler
 * for automatic audit logging via `AuditEventInterceptor`.
 *
 * @param action  - The action being performed (use `AuditActionType` values).
 * @param resource - The resource type being acted on (use `AuditResourceType` values).
 *
 * @example
 * ```ts
 * @Mutation(() => CustomerType)
 * @AuditAction(AuditActionType.BLACKLIST, AuditResourceType.CUSTOMER)
 * async addToBlacklist(...) { ... }
 * ```
 */
export const AuditAction = (action: string, resource: string) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, resource });
