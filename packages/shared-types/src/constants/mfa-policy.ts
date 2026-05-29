/**
 * S19-STAB-5 — MFA enforcement policy constants.
 *
 * Lives in @lons/shared-types so the backend (compliance service +
 * login flow), the admin portal (banner + users list compliance
 * column), and any future client can reference one source of truth.
 *
 * Per `Docs/SPEC-plan-tiers.md` §2.5:
 *   - Starter tier      → MFA not required for any role.
 *   - Growth tier       → MFA required for admin roles ("SP Admin").
 *   - Enterprise tier   → MFA required for all roles.
 *
 * Per PM directive (PM-RESPONSE-DEV-SPRINT-19-QUESTIONS Q2.1):
 *   - 7-day fixed grace period from later(tenant.planTierChangedAt,
 *     user.createdAt, user.mfaDisabledAt).
 *   - If PM later approves per-tenant configurable grace, replace the
 *     constant with a lookup against TenantBillingConfig or similar —
 *     keep this module the single point of truth so the change is one
 *     edit + a UI for setting it.
 */

export const MFA_GRACE_PERIOD_DAYS = 7;

/**
 * Plan tier values mirrored from the Prisma `PlanTier` enum. Kept as a
 * plain string union here so shared-types doesn't need to import from
 * @lons/database (which would create a dependency cycle — the database
 * package already imports from shared-types).
 */
export type PlanTierLiteral = 'starter' | 'growth' | 'enterprise';

/**
 * Role names that require MFA on a given plan tier. The names match
 * the `Role.name` strings the seed creates (`'SP Admin'`,
 * `'SP Operator'`, etc.). Empty array = MFA not required for any role.
 *
 * Growth tier intentionally lists only `SP Admin` — not SP Operator
 * or other elevated-but-non-admin roles. If the product decision
 * later widens this (e.g. "all roles with `*:write` permission"),
 * update this map and the change propagates everywhere.
 */
export const MFA_REQUIRED_ROLES_BY_TIER: Record<PlanTierLiteral, readonly string[]> = {
  starter: [],
  growth: ['SP Admin'],
  // BA-C-2: SP Collections Manager landed in S19-1 (manager tier
  // above SP Collections — superset of officer perms + L2 write-off
  // approval + legal action). On Enterprise tier where MFA is
  // required for every operator role, the manager role must be in
  // the enforcement set too — otherwise the highest-privilege
  // collections operator can sidestep MFA. Name matches the
  // exact string seeded in packages/database/prisma/seed.ts
  // (sp_collections_manager → name: 'SP Collections Manager').
  enterprise: [
    'SP Admin',
    'SP Operator',
    'SP Analyst',
    'SP Auditor',
    'SP Collections',
    'SP Collections Manager',
  ],
};

/**
 * Return true if a user with the given role name must enrol MFA on
 * the given plan tier. Call sites use this to short-circuit
 * compliance checks ("the tenant is on Starter — never enforce").
 */
export function isMfaRequired(planTier: PlanTierLiteral, roleName: string): boolean {
  return MFA_REQUIRED_ROLES_BY_TIER[planTier].includes(roleName);
}

/**
 * MFA compliance status, in order of severity.
 *
 *   - `not_required`: tier+role combination doesn't mandate MFA.
 *   - `enrolled`:     user has MFA enabled. Compliant.
 *   - `pending`:      MFA required, not enrolled, but still inside
 *                     the 7-day grace window. Soft nudge.
 *   - `overdue`:      MFA required, not enrolled, grace expired.
 *                     Hard block — login refused until enrolment.
 */
export type MfaComplianceStatus = 'not_required' | 'enrolled' | 'pending' | 'overdue';

/**
 * Detail object returned by the compliance service. The status drives
 * gating decisions; `graceDaysRemaining` drives the countdown banner.
 *
 *   - For `not_required` / `enrolled`: graceDaysRemaining is `null`.
 *   - For `pending`: graceDaysRemaining is a positive integer ≥ 0.
 *     0 means "today is the last day"; tomorrow flips to overdue.
 *   - For `overdue`: graceDaysRemaining is a negative integer counting
 *     days past expiry — useful for "you are N days past due" warnings
 *     when an operator is hard-blocked. Frontend may display abs().
 */
export interface MfaComplianceResult {
  status: MfaComplianceStatus;
  graceDaysRemaining: number | null;
  /** ISO timestamp at which the grace window ends (or ended). Null for not_required / enrolled. */
  graceEndsAt: string | null;
}
