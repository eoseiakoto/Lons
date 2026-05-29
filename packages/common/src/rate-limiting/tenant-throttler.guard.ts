import { Injectable, ExecutionContext, HttpException, Optional } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  ThrottlerOptions,
  ThrottlerGetTrackerFunction,
  ThrottlerGenerateKeyFunction,
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';
import { Reflector } from '@nestjs/core';
import { RATE_CATEGORY_KEY, RateCategory } from './rate-category.decorator';
import { RateLimitConfigService } from './rate-limit-config.service';

/**
 * Default per-category rate limits (ttl in ms, limit in requests per ttl).
 *
 * F-ABC-1 (PM review of S19-11): reconciled to match
 * RATE_LIMIT_TIERS.starter × category multipliers. The prior values
 * (1000/200/100) were 10× the starter tier — if the config service
 * was unavailable, every tenant silently got enterprise-grade
 * limits. Now the fallback matches the smallest tier so a degraded
 * resolver fails closed, not open.
 *
 * Production behaviour: `RateLimitConfigService.getConfigForTenant`
 * returns the per-tenant tier; these constants are only used when
 * the service isn't injected (unit tests) or when no tenant config
 * is found.
 */
const DEFAULT_LIMITS: Record<RateCategory, { ttl: number; limit: number }> = {
  read:    { ttl: 60_000, limit: 100 },  // RATE_LIMIT_TIERS.starter × 1.0
  write:   { ttl: 60_000, limit: 20 },   // RATE_LIMIT_TIERS.starter × 0.2
  scoring: { ttl: 60_000, limit: 10 },   // RATE_LIMIT_TIERS.starter × 0.1
};

/**
 * F-ABC-1: shape attached to the request object after the throttler
 * check resolves. RateLimitHeadersInterceptor reads this to populate
 * X-RateLimit-* headers with the ACTUAL per-tenant values rather
 * than its previous static defaults. The underscore prefix marks
 * it as an internal/framework field — not part of any public
 * request shape.
 */
export interface ResolvedRateLimit {
  limit: number;
  remaining: number;
  /** Unix timestamp in SECONDS (not ms) — matches the X-RateLimit-Reset header convention. */
  resetAt: number;
}

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
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    // F-ABC-1: per-tenant DB-driven limit resolver. @Optional so
    // tests + environments without DI can fall back to DEFAULT_LIMITS.
    @Optional() private readonly rateLimitConfig?: RateLimitConfigService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * F-ABC-1: override the parent's handleRequest to substitute the
   * per-tenant (limit, ttl) before the throttler hits storage.
   *
   * @nestjs/throttler v5's ThrottlerGuard.canActivate iterates over
   * each configured throttler and calls handleRequest(context, limit,
   * ttl, throttler, getTracker, generateKey). The `limit` + `ttl`
   * arguments come from the ThrottlerModule's static configuration.
   * To make limits per-tenant + per-category, we ignore those
   * arguments and resolve fresh ones via RateLimitConfigService.
   *
   * Falls back to DEFAULT_LIMITS when:
   *   - the config service isn't injected (unit-test wiring); OR
   *   - getConfigForTenant returns null (no tenant billing row).
   *
   * Side effect: after the storage check, attaches the resolved
   * (limit, remaining, resetAt) to req._rateLimitConfig so
   * RateLimitHeadersInterceptor can emit accurate X-RateLimit-*
   * headers instead of its static fallback.
   */
  protected async handleRequest(
    context: ExecutionContext,
    _limit: number,
    _ttl: number,
    throttler: ThrottlerOptions,
    getTracker: ThrottlerGetTrackerFunction,
    generateKey: ThrottlerGenerateKeyFunction,
  ): Promise<boolean> {
    const tenantId = this.resolveTenantId(context);
    const category = this.resolveCategory(context);
    const resolved = await this.getLimitsForTenant(tenantId, category);

    // Hand off to the parent with the resolved values. The parent
    // builds the storage key, increments the counter, and either
    // returns true or calls throwThrottlingException — we don't
    // duplicate that logic.
    const allowed = await super.handleRequest(
      context,
      resolved.limit,
      resolved.ttl,
      throttler,
      getTracker,
      generateKey,
    );

    // F-ABC-3: stamp the resolved limits on the request so the
    // headers interceptor can emit accurate values. We re-derive
    // `remaining` by reading the storage's last result via a fresh
    // count would be racy — instead approximate as (limit - 1) on
    // the first request, decreasing as the same client repeats.
    // The interceptor only uses this when the field is present;
    // when absent it falls back to its static defaults.
    const { req } = this.getRequestResponse(context);
    if (req) {
      // We don't have direct access to the storage record from
      // here (super.handleRequest swallows it), so the best we can
      // do is publish the LIMIT + a synthesized resetAt. The
      // interceptor uses this to set X-RateLimit-Limit accurately;
      // remaining/reset are best-effort.
      const existing = (req._rateLimitConfig as ResolvedRateLimit | undefined) ?? null;
      const remaining = existing ? Math.max(0, existing.remaining - 1) : resolved.limit - 1;
      const resetAt = existing?.resetAt ?? Math.floor(Date.now() / 1_000) + Math.ceil(resolved.ttl / 1_000);
      req._rateLimitConfig = { limit: resolved.limit, remaining, resetAt };
    }

    return allowed;
  }

  /**
   * Override getRequestResponse to handle GraphQL execution contexts.
   * The default ThrottlerGuard only handles HTTP contexts; in GraphQL
   * the request/response live inside the GqlExecutionContext.
   *
   * We avoid importing @nestjs/graphql directly (not a dependency of this
   * package) and instead extract req/res from the GraphQL context manually.
   */
  protected getRequestResponse(context: ExecutionContext) {
    const contextType = context.getType<string>();
    if (contextType === 'graphql') {
      // In GraphQL, the 3rd arg of the resolver is the context object
      // which contains { req, res } as set up by Apollo/NestJS.
      const gqlArgs = context.getArgs();
      const ctx = gqlArgs[2]; // [root, args, context, info]

      // Provide a no-op stub for res if it's missing, so the parent
      // ThrottlerGuard doesn't crash when trying to set headers.
      const noopRes = {
        header: () => noopRes,
        setHeader: () => noopRes,
        status: () => noopRes,
      };

      return {
        req: ctx?.req ?? ({} as any),
        res: ctx?.res ?? (noopRes as any),
      };
    }
    return super.getRequestResponse(context);
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
    // In GraphQL context, req may be undefined — guard against it.
    if (!req) {
      return 'anonymous';
    }
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
    const { res } = this.getRequestResponse(context);

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
   * F-ABC-1: Resolve per-tenant + per-category limits.
   *
   * Now async — RateLimitConfigService does DB + Redis IO. When the
   * service isn't injected (unit tests with no DI wiring), falls
   * back to DEFAULT_LIMITS so existing tests that construct the
   * guard with `new TenantThrottlerGuard(...)` still work.
   *
   * Resolution chain:
   *   1. RateLimitConfigService.getConfigForTenant — DB → Redis cache
   *   2. applyCategory(config, category) — multiplier per category
   *   3. Fallback: starter-tier DEFAULT_LIMITS
   */
  protected async getLimitsForTenant(
    tenantId: string,
    category: RateCategory,
  ): Promise<{ ttl: number; limit: number }> {
    if (!this.rateLimitConfig) {
      return DEFAULT_LIMITS[category];
    }
    try {
      const config = await this.rateLimitConfig.getConfigForTenant(tenantId);
      return this.rateLimitConfig.applyCategory(config, category);
    } catch {
      // Resolver failure (DB / Redis outage) must not crash the
      // request — fall back to the starter tier so the system
      // degrades closed (low limits) rather than open.
      return DEFAULT_LIMITS[category];
    }
  }
}
