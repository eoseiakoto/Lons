export enum TenantStatus {
  PROVISIONING = 'provisioning',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DECOMMISSIONED = 'decommissioned',
}

/**
 * Sprint 14 (S14-9): the approved commercial model uses
 * Starter / Growth / Enterprise. `PROFESSIONAL` has been renamed to
 * `GROWTH` here and in the Prisma `PlanTier` enum (see migration
 * `20260511000000_plan_tier_billing_infrastructure`).
 */
export enum PlanTier {
  STARTER = 'starter',
  GROWTH = 'growth',
  ENTERPRISE = 'enterprise',
}
