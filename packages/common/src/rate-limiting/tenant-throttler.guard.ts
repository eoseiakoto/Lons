import { Injectable, ExecutionContext, HttpException } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';
import { Reflector } from '@nestjs/core';
import { RATE_CATEGORY_KEY, RateCategory } from './rate-category.decorator';

/**
 * Default per-category rate limits (ttl in ms, limit in requests per ttl).
 *
 * These can be overridden per-tenant by extending this guard and overriding
 * `getLimitsForTenant`.
 */
const DEFAULT_LIMITS: Record<RateCategory, { ttl: number; limit: number }> = {
  read: { ttl: 60_000, limit: 1_000 },
  write: { ttl: 60_000, limit: 200 },
  scoring: { ttl: 60_000, limit: 100 },
};

/**
 * TenantThrottlerGuard extends ThrottlerGuard to:
 *
 *  1. Include the tenant ID (resolved from the request JWT claims) in the
 *     rate-limit key so that throttling is scoped per tenant, not globally.
 *
 *  2. Apply per-category limits based on the @RateCategoryDecorator metadata
 *     attached to the route handler or controller.
 *
 * Usage:
 *   Register as APP_GUARD in place of (or alongside) the plain ThrottlerGuard:
 *
 *     { provide: APP_GUARD, useClass: TenantThrottlerGuard }
 *
 *   Annotate routes:
 *
 *     @RateCategoryDecorator('write')
 *     @Post('loan-requests')
 *     createLoanRequest(...) {}
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Build the throttler key incorporating tenantId, rate category, and tracker
   * (IP address or authenticated user ID).
   *
   * Format: `{tenantId}:{category}:{suffix}:{throttlerName}`
   */
  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    throttlerName: string,
  ): string {
    const tenantId = this.resolveTenantId(context);
    const category = this.resolveCategory(context);
    return `${tenantId}:${category}:${suffix}:${throttlerName}`;
  }

  /**
   * Resolve the tracker string.  For authenticated requests we use the user ID
   * so that rate limits are per-user rather than per-IP (which may be shared
   * behind a NAT).  Falls back to the IP address for unauthenticated requests.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId: string | undefined = req.user?.sub ?? req.user?.id;
    if (userId) {
      return userId;
    }
    // Fall back to the default IP-based tracker from the parent class.
    return super.getTracker(req);
  }

  /**
   * Override the default 429 handler to attach a `Retry-After` header.
   *
   * The header value is the number of whole seconds the client should wait
   * before retrying (rounded up so we never undercount).
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { req, res } = this.getRequestResponse(context);

    // timeToExpire is in milliseconds — convert to whole seconds (ceil).
    const retryAfterSeconds = Math.ceil(throttlerLimitDetail.timeToExpire / 1_000);

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Retry-After', retryAfterSeconds);
    } else if (res && typeof res.header === 'function') {
      // Express-style response object (used by some adapters).
      res.header('Retry-After', String(retryAfterSeconds));
    }

    const message = await this.getErrorMessage(context, throttlerLimitDetail);

    throw new HttpException(
      {
        statusCode: 429,
        message,
        retryAfter: retryAfterSeconds,
      },
      429,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract the tenant ID from the JWT claims that NestJS auth guards attach
   * to `req.user`, or fall back to an `X-Tenant-ID` header, or 'default'.
   */
  private resolveTenantId(context: ExecutionContext): string {
    const { req } = this.getRequestResponse(context);
    return (
      req?.user?.tenantId ??
      req?.headers?.['x-tenant-id'] ??
      'default'
    );
  }

  /**
   * Read the @RateCategoryDecorator metadata from the handler / class.
   * Defaults to 'read' when no annotation is present.
   */
  private resolveCategory(context: ExecutionContext): RateCategory {
    return (
      this.reflector.getAllAndOverride<RateCategory>(RATE_CATEGORY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'read'
    );
  }

  /**
   * Return the rate-limit configuration for a given tenant and category.
   *
   * Override this method to load per-tenant limits from a database or config
   * service instead of using the static defaults.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected getLimitsForTenant(
    _tenantId: string,
    category: RateCategory,
  ): { ttl: number; limit: number } {
    return DEFAULT_LIMITS[category];
  }
}
