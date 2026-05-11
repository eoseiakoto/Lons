import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';

import { REQUIRED_PLAN_KEY, TenantPlanGuard } from './tenant-plan.guard';

/**
 * Sprint 14 (S14-9) — `@RequiresPlan('growth')` decorator.
 *
 * Apply to a resolver method or REST handler that should only be
 * available on the specified plan tier or higher. Tier ordering:
 * `starter` < `growth` < `enterprise`.
 *
 * Tenants on a lower tier receive a structured `ForbiddenException`:
 * ```
 * { code: 'PLAN_TIER_INSUFFICIENT',
 *   message: 'This feature requires the growth plan or higher. Current plan: starter.',
 *   currentTier: 'starter',
 *   requiredTier: 'growth',
 *   upgradeUrl: '/settings/plan' }
 * ```
 *
 * Platform admins bypass the check (they're not on a tenant tier).
 *
 * @example
 *   @Mutation(() => ProductType)
 *   @RequiresPlan('growth')
 *   async createBnplProduct(...) { ... }
 *
 * **When NOT to use this decorator.** If the gate depends on a value
 * inside the input (e.g. product *type*, not the resolver itself),
 * inject `PlanTierConfigService` and use `isProductTypeAllowed()`
 * inside the handler instead — the decorator can only see the tier,
 * not the args.
 */
export type RequiredPlanTier = 'starter' | 'growth' | 'enterprise';

export const RequiresPlan = (tier: RequiredPlanTier) =>
  applyDecorators(SetMetadata(REQUIRED_PLAN_KEY, tier), UseGuards(TenantPlanGuard));
