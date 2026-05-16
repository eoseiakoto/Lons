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
  iat?: number;
  exp?: number;
}

export interface IAuthenticatedUser {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  isPlatformAdmin: boolean;
}
