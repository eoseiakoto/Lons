export interface IJwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  permissions: string[];
  /**
   * Sprint 15 (S15-6): added `mfa` for the short-lived MFA-verification
   * token returned by the login flow when MFA is required. This token
   * cannot be used to access any API endpoint other than `verifyMfa`.
   */
  type: 'access' | 'refresh' | 'mfa';
  email?: string;
  name?: string;
  /** Sprint 15 (S15-6): MFA scope marker — set on `type=mfa` tokens. */
  purpose?: 'mfa_verification';
  /** Sprint 15 (S15-6): which model owns the user (tenant vs. platform). */
  userType?: 'user' | 'platform_user';
  /**
   * MFA-lockout fix: tenant-tier-mandatory MFA whose grace window has
   * expired previously rejected login outright, leaving the user with
   * no way to enrol. Now we issue a restricted `access` token with
   * `scope: 'mfa_enrollment_only'`. AuthGuard admits this token only
   * for the MFA enrollment endpoints + `me` query; every other
   * resolver returns 403. After enrolment completes the user must
   * re-login to get a full-scope token (no refresh token is issued
   * for an enrollment-only session, so this is enforced naturally).
   */
  scope?: 'mfa_enrollment_only';
  iat?: number;
  exp?: number;
}

/**
 * MFA-lockout fix: list of resolver handler names the
 * `mfa_enrollment_only`-scoped token is allowed to invoke. Maintained
 * as a single source of truth so the AuthGuard allow-list and any
 * future enforcement points stay aligned. Every addition is a
 * security-relevant change — vet that the handler cannot bypass the
 * enrolment requirement.
 */
export const MFA_ENROLLMENT_ONLY_ALLOWED_HANDLERS: ReadonlyArray<string> = [
  // MFA flow
  'initiateMfaEnrollment',
  'confirmMfaEnrollment',
  'disableMfa', // restart-the-flow recovery
  // Profile read — the portal needs to know who's logged in to
  // render the enrolment card with the right user context.
  'me',
  'myTenant',
];

export type AuthenticatedUserScope = 'mfa_enrollment_only';

export interface IAuthenticatedUser {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  isPlatformAdmin: boolean;
  /** MFA-lockout fix: present on restricted tokens (see IJwtPayload.scope). */
  scope?: AuthenticatedUserScope;
}
