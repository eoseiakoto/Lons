import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IAuthenticatedUser } from '../interfaces/jwt-payload.interface';

/**
 * Field-level authorization decorator
 * Usage: @FieldAuth('national_id', ['customer.read.pii'])
 * Returns null if user lacks required permission
 */
export const FieldAuth = createParamDecorator(
  (requiredPermissions: string | string[], context: ExecutionContext) => {
    const ctx = GqlExecutionContext.create(context);
    const request = ctx.getContext().req;
    const user: IAuthenticatedUser = request.user;

    const permissions = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    if (!user) {
      return null;
    }

    // Platform admin has all permissions
    if (user.isPlatformAdmin) {
      return true;
    }

    // Check if user has any of the required permissions
    const hasPermission = permissions.some((perm) => user.permissions.includes(perm));
    return hasPermission;
  },
);

/**
 * Utility function to check field authorization in resolvers
 * Returns the value if authorized, null if not
 */
export function authorizeField<T>(
  value: T | null | undefined,
  hasPermission: boolean,
): T | null {
  if (!hasPermission) {
    return null;
  }
  return value ?? null;
}

/**
 * Utility type for field-level authorization metadata
 */
export interface IFieldAuthConfig {
  fieldName: string;
  requiredPermissions: string[];
}
