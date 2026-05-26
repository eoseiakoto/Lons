import { Injectable } from '@nestjs/common';
import {
  MFA_GRACE_PERIOD_DAYS,
  MfaComplianceResult,
  MfaComplianceStatus,
  PlanTierLiteral,
  isMfaRequired,
} from '@lons/shared-types';

/**
 * S19-STAB-5 — MFA tier enforcement compliance check.
 *
 * Pure, stateless function-as-service. Inputs are explicit (tenant
 * tier + tier-change timestamp + user MFA state + role) — no DB
 * lookups inside, so it's trivially unit-testable and reusable from
 * both the login flow and the GraphQL `User.mfaComplianceStatus`
 * resolver field.
 *
 * Policy (per Docs/SPEC-plan-tiers.md §2.5 + PM directive Q2.1/Q2.2):
 *
 *   1. Determine if the (planTier, roleName) combination requires
 *      MFA. If not → `status = 'not_required'`. Done.
 *   2. If MFA is required AND the user has it enabled →
 *      `status = 'enrolled'`. Done.
 *   3. Otherwise: compute the grace window. Start =
 *      max(tenant.planTierChangedAt ?? tenant.createdAt,
 *          user.createdAt,
 *          user.mfaDisabledAt ?? 0). End = start + 7 days.
 *      - If now < end → `status = 'pending'` with positive
 *        `graceDaysRemaining`.
 *      - Else            → `status = 'overdue'` with negative
 *                          `graceDaysRemaining` (days past expiry).
 *
 * The login flow uses this to decide: enrolled / not_required →
 * proceed normally; pending → proceed with `mfaGraceDaysRemaining`
 * attached to the response so the UI can render the countdown
 * banner; overdue → throw a typed `MfaEnrollmentRequiredException`
 * which the resolver maps to `requiresMfaEnrollment: true`.
 */
export interface MfaComplianceInput {
  planTier: PlanTierLiteral;
  /** Null only on a hypothetical row created within the same transaction. */
  tenantPlanTierChangedAt: Date | null;
  tenantCreatedAt: Date;
  roleName: string;
  userMfaEnabled: boolean;
  userCreatedAt: Date;
  userMfaDisabledAt: Date | null;
  /** Defaults to `new Date()`; pass an explicit value for deterministic tests. */
  now?: Date;
}

@Injectable()
export class MfaComplianceService {
  computeStatus(input: MfaComplianceInput): MfaComplianceResult {
    const required = isMfaRequired(input.planTier, input.roleName);
    if (!required) {
      return { status: 'not_required', graceDaysRemaining: null, graceEndsAt: null };
    }
    if (input.userMfaEnabled) {
      return { status: 'enrolled', graceDaysRemaining: null, graceEndsAt: null };
    }

    const now = input.now ?? new Date();
    const tierStart = input.tenantPlanTierChangedAt ?? input.tenantCreatedAt;
    const candidates: Date[] = [tierStart, input.userCreatedAt];
    if (input.userMfaDisabledAt) candidates.push(input.userMfaDisabledAt);
    const graceStart = candidates.reduce((a, b) => (a > b ? a : b));
    const graceEnd = new Date(graceStart.getTime() + MFA_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    // Day count: integer count of full days remaining (floored).
    // 0 means "today is the last day" — still pending.
    const msRemaining = graceEnd.getTime() - now.getTime();
    const daysRemaining = Math.floor(msRemaining / (24 * 60 * 60 * 1000));
    const status: MfaComplianceStatus = msRemaining > 0 ? 'pending' : 'overdue';
    return {
      status,
      graceDaysRemaining: daysRemaining,
      graceEndsAt: graceEnd.toISOString(),
    };
  }
}

/**
 * Thrown by the login flow when an operator must enrol MFA before
 * proceeding (status = overdue). The resolver catches this and
 * surfaces `requiresMfaEnrollment: true` on the GraphQL response
 * instead of access tokens. Distinct from `UnauthorizedException`
 * so client code can branch cleanly: "wrong password" vs "enrol
 * MFA now".
 */
export class MfaEnrollmentRequiredException extends Error {
  constructor(public readonly graceDaysOverdue: number) {
    super('MFA enrollment required');
    this.name = 'MfaEnrollmentRequiredException';
  }
}
