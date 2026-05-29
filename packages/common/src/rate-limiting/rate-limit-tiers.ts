/**
 * Predefined rate-limit tiers for tenant plans.
 *
 * Each tier defines the maximum number of requests (`limit`) allowed within a
 * rolling time window (`ttl`, in milliseconds).
 *
 * S19-11: tier names align with the canonical PlanTier enum
 * (starter / growth / enterprise) per `Docs/SPEC-plan-tiers.md`.
 * Backward-compatible aliases for the old `standard` / `premium`
 * names are exported below — they map to starter / growth
 * respectively. Remove the aliases after Sprint 21 once all
 * consumers are migrated.
 *
 * Tenants are assigned a tier via `TenantBillingConfig.planTier` and
 * the limit is resolved at runtime by `RateLimitConfigService`
 * (which reads from PlanTierConfig in the DB and caches in Redis).
 * These static tiers are the fallback when no DB config exists.
 */
export const RATE_LIMIT_TIERS = {
  /** Starter tier — default for most tenants. */
  starter: { ttl: 60_000, limit: 100 },

  /** Growth tier — mid-volume integrators. */
  growth: { ttl: 60_000, limit: 500 },

  /** Enterprise tier — high-volume integrators. */
  enterprise: { ttl: 60_000, limit: 2_000 },
} as const;

export type RateLimitTier = keyof typeof RATE_LIMIT_TIERS;

/** @deprecated Use `RATE_LIMIT_TIERS.starter`. Remove after Sprint 21. */
export const STANDARD_TIER = RATE_LIMIT_TIERS.starter;
/** @deprecated Use `RATE_LIMIT_TIERS.growth`. Remove after Sprint 21. */
export const PREMIUM_TIER = RATE_LIMIT_TIERS.growth;
