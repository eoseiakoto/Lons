import { Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { LonsBaseError } from '@lons/common';
import { GraphQLError } from 'graphql';

/**
 * Security Hardening (SEC-8): map internal column names → user-facing
 * field names. The previous `parsePrismaError` echoed `meta.target`
 * directly, leaking Sprint 13B/SEC-1 hash column names (`emailHash`,
 * `registrationNumberHash`, etc.) and the snake_case DB names. An
 * attacker hitting a duplicate-record path could enumerate the schema
 * including which columns are encrypted (the `*Hash` suffix is a strong
 * signal).
 *
 * Strategy:
 *   1. Collapse hash columns to their plaintext counterpart's display
 *      name (`emailHash` → `email`, `registrationNumberHash` →
 *      `registration number`).
 *   2. Whitelist a small set of innocuous column names that are safe to
 *      echo (`code`, `name`, `slug`, etc.).
 *   3. Anything else collapses to a generic "value" — no schema leak.
 *   4. The `target` array is NEVER returned in the GraphQL response
 *      extensions; only the sanitised display string is.
 */
const FIELD_DISPLAY_MAP: Record<string, string> = {
  // Hash companion columns → plaintext display name.
  emailHash: 'email',
  email_hash: 'email',
  phonePrimaryHash: 'phone',
  phone_primary_hash: 'phone',
  nationalIdHash: 'national ID',
  national_id_hash: 'national ID',
  registrationNumberHash: 'registration number',
  registration_number_hash: 'registration number',
  taxIdHash: 'tax ID',
  tax_id_hash: 'tax ID',
  // Non-PII columns safe to echo.
  code: 'code',
  name: 'name',
  slug: 'slug',
  externalId: 'external ID',
  external_id: 'external ID',
  invoiceNumber: 'invoice number',
  invoice_number: 'invoice number',
  // Tenant-scoping prefixes (e.g. `tenantId, code`) → drop tenantId.
  tenantId: '',
  tenant_id: '',
  // The encrypted column names themselves should never appear in P2002
  // (we moved uniqueness off them in FIX-S13B-1) but map them defensively.
  email: 'email',
  phonePrimary: 'phone',
  phone_primary: 'phone',
  nationalId: 'national ID',
  national_id: 'national ID',
  registrationNumber: 'registration number',
  registration_number: 'registration number',
  taxId: 'tax ID',
  tax_id: 'tax ID',
  companyName: 'company name',
  company_name: 'company name',
};

function sanitizeFieldName(field: string): string {
  if (Object.prototype.hasOwnProperty.call(FIELD_DISPLAY_MAP, field)) {
    return FIELD_DISPLAY_MAP[field];
  }
  // Unknown column — collapse to a generic placeholder rather than
  // leaking internal column names.
  return 'value';
}

function sanitizeTargetForDisplay(target: unknown): string {
  if (Array.isArray(target)) {
    const parts = target
      .filter((f): f is string => typeof f === 'string')
      .map(sanitizeFieldName)
      .filter((f) => f.length > 0);
    if (parts.length === 0) return 'value';
    // De-dupe (e.g. ["tenantId","email"] after dropping tenantId may produce
    // a single element; arrays with duplicates are unusual but safe).
    const unique = Array.from(new Set(parts));
    return unique.join(', ');
  }
  if (typeof target === 'string') {
    return sanitizeFieldName(target) || 'value';
  }
  return 'value';
}

/** Map Prisma error codes to user-friendly messages */
function parsePrismaError(exception: any): GraphQLError | null {
  // PrismaClientKnownRequestError has a `code` property (e.g. P2002, P2025)
  const code = exception?.code;
  const meta = exception?.meta;

  if (code === 'P2002') {
    // Unique constraint violation
    const target = meta?.target;

    // Special case: product code unique violation gets a specific message
    // (this is a non-PII business invariant so the field name is safe).
    if (Array.isArray(target) && target.includes('code')) {
      return new GraphQLError('A product with this code already exists. Please use a different code.', {
        extensions: { code: 'DUPLICATE_CODE', field: 'code' },
      });
    }

    // Security Hardening (SEC-8): sanitise the target field names before
    // including them in the user-facing message. Do NOT include the raw
    // `target` in `extensions` — it's the canonical schema-leak vector.
    const displayFields = sanitizeTargetForDisplay(target);
    return new GraphQLError(`A record with this ${displayFields} already exists.`, {
      extensions: { code: 'DUPLICATE_ENTRY' },
    });
  }

  if (code === 'P2025') {
    // Record not found
    return new GraphQLError('The requested record was not found.', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  if (code === 'P2003') {
    // Foreign key constraint
    return new GraphQLError('Referenced record does not exist.', {
      extensions: { code: 'INVALID_REFERENCE' },
    });
  }

  // PrismaClientValidationError — invalid field values (e.g. wrong enum value)
  if (exception?.constructor?.name === 'PrismaClientValidationError' ||
      exception?.constructor?.name === 'PrismaClientKnownRequestError') {
    const message = exception.message || '';
    // Extract the useful part from Prisma validation errors
    const enumMatch = message.match(/Invalid value for argument `(\w+)`\. Expected (\w+)\./);
    if (enumMatch) {
      return new GraphQLError(`Invalid value for field '${enumMatch[1]}'. Expected a valid ${enumMatch[2]} value.`, {
        extensions: { code: 'VALIDATION_ERROR', field: enumMatch[1] },
      });
    }
  }

  return null;
}

@Catch()
export class GraphqlExceptionFilter implements GqlExceptionFilter {
  private readonly logger = new Logger(GraphqlExceptionFilter.name);

  catch(exception: unknown, _host: ArgumentsHost) {
    if (exception instanceof LonsBaseError) {
      return new GraphQLError(exception.message, {
        extensions: {
          code: exception.code,
          details: exception.details,
        },
      });
    }

    if (exception instanceof GraphQLError) {
      return exception;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message = typeof response === 'string' ? response : (response as { message: string }).message;
      return new GraphQLError(message, {
        extensions: {
          code: status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
        },
      });
    }

    // Handle Prisma errors with user-friendly messages
    const prismaError = parsePrismaError(exception);
    if (prismaError) {
      this.logger.warn(
        `Prisma error handled: ${(exception as any)?.code || 'unknown'}`,
        exception instanceof Error ? exception.message : String(exception),
      );
      return prismaError;
    }

    // Log the actual error so we can diagnose "Internal server error" responses
    this.logger.error(
      'Unhandled exception in GraphQL resolver',
      exception instanceof Error ? exception.stack : String(exception),
    );

    return new GraphQLError('Internal server error', {
      extensions: { code: 'INTERNAL_ERROR' },
    });
  }
}
