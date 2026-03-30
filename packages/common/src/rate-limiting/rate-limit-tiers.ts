/**
 * Predefined rate-limit tiers for tenant plans.
 *
 * Each tier defines the maximum number of requests (`limit`) allowed within a
 * rolling time window (`ttl`, in milliseconds).
 *
 * Tenants can be assigned a tier by storing the tier name in their tenant
 * record and resolving it at runtime in TenantThrottlerGuard.getLimitsForTenant().
 */
export const RATE_LIMIT_TIERS = {
  /** Default tier for most tenants. */
  standard: { ttl: 60_000, limit: 100 },

  /** Upgraded tier with higher throughput. */
  premium: { ttl: 60_000, limit: 500 },

  /** Highest tier for large-volume integrators. */
  enterprise: { ttl: 60_000, limit: 2_000 },
} as const;

export type RateLimitTier = keyof typeof RATE_LIMIT_TIERS;
