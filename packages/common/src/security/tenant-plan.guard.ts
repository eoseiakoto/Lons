import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Sprint 14 (S14-9) — TenantPlanGuard.
 *
 * Reads the `REQUIRED_PLAN_KEY` metadata set by `@RequiresPlan(tier)`
 * and rejects the request if the tenant's plan tier is below the
 * required tier. Platform admins bypass.
 *
 * **Why decorator-driven.** The required tier is part of the handler's
 * declarative contract (visible in code, picked up by the audit
 * coverage tooling, easy to grep). Lookup of the tenant's *current*
 * tier still runs against the live `PlanTierConfigService` cache, so
 * a downgrade takes effect within the 5-minute Redis TTL.
 *
 * **Why not @SetMetadata + handler-level check.** Centralising the
 * comparison here means every resolver/controller can opt into plan
 * gating with one decorator line. Drift between checks is impossible.
 *
 * The guard expects an `IPlanTierConfigLike` injectable shape rather
 * than the concrete `PlanTierConfigService` from entity-service —
 * `@lons/common` cannot depend on `@lons/entity-service` (it sits
 * below it). Consumers wire the real service via a generic provider
 * token. See `apps/graphql-server/src/app.module.ts` for the wiring.
 */
export const REQUIRED_PLAN_KEY = 'required_plan_tier';
export const PLAN_TIER_CONFIG_SERVICE = Symbol(
  'PLAN_TIER_CONFIG_SERVICE',
);

/** Minimal contract the guard needs from a plan-tier config provider. */
export interface IPlanTierConfigLike {
  getTenantTierConfig(tenantId: string): Promise<{ tier: string }>;
}

@Injectable()
export class TenantPlanGuard implements CanActivate {
  private readonly logger = new Logger(TenantPlanGuard.name);

  /**
   * Tier order — higher number = more capable. A request requiring
   * `growth` is admitted for `growth` and `enterprise`.
   */
  private readonly tierHierarchy: Record<string, number> = {
    starter: 0,
    growth: 1,
    enterprise: 2,
  };

  constructor(
    private readonly reflector: Reflector,
    /**
     * Apps register a provider with token `PLAN_TIER_CONFIG_SERVICE`
     * that delegates to `PlanTierConfigService` from
     * `@lons/entity-service`. We use a symbol token (not the concrete
     * class) so this package stays free of an entity-service import —
     * `@lons/common` sits below entity-service in the dep graph.
     */
    @Inject(PLAN_TIER_CONFIG_SERVICE)
    private readonly planTierConfigService: IPlanTierConfigLike,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredTier = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequiresPlan decorator → admit. Most handlers don't have one.
    if (!requiredTier) return true;

    const request = this.getRequest(context);
    const user = request?.user ?? {};

    // Platform admins bypass plan gates — they're not on a tenant tier.
    if (user.isPlatformAdmin) return true;

    const tenantId: string | undefined = user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException({
        code: 'PLAN_TIER_CHECK_NO_TENANT',
        message: 'Tenant context required for plan tier check',
      });
    }

    let tenantConfig;
    try {
      tenantConfig =
        await this.planTierConfigService.getTenantTierConfig(tenantId);
    } catch (err) {
      this.logger.warn(
        `Plan tier lookup failed for tenant ${tenantId}: ${(err as Error).message}`,
      );
      throw new ForbiddenException({
        code: 'PLAN_TIER_LOOKUP_FAILED',
        message: 'Could not verify plan tier for this tenant',
      });
    }

    const tenantLevel = this.tierHierarchy[tenantConfig.tier] ?? 0;
    const requiredLevel = this.tierHierarchy[requiredTier] ?? 0;

    if (tenantLevel < requiredLevel) {
      throw new ForbiddenException({
        code: 'PLAN_TIER_INSUFFICIENT',
        message: `This feature requires the ${requiredTier} plan or higher. Current plan: ${tenantConfig.tier}.`,
        currentTier: tenantConfig.tier,
        requiredTier,
        upgradeUrl: '/settings/plan',
      });
    }

    return true;
  }

  /**
   * Extract the request object from either an HTTP or GraphQL
   * execution context. We avoid importing `@nestjs/graphql` here
   * (`@lons/common` doesn't depend on it) and reach into the GraphQL
   * resolver args directly — the third element is the context object,
   * and `context.req` is the wrapped HTTP request.
   */
  private getRequest(context: ExecutionContext): {
    user?: { tenantId?: string; isPlatformAdmin?: boolean };
  } {
    const type = context.getType<string>();
    if (type === 'graphql') {
      const gqlArgs = context.getArgs();
      const ctx = gqlArgs[2] as { req?: { user?: unknown } } | undefined;
      return (ctx?.req ?? {}) as { user?: { tenantId?: string; isPlatformAdmin?: boolean } };
    }
    return context.switchToHttp().getRequest();
  }
}
