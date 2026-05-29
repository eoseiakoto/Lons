import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class AuthResponse {
  @Field()
  accessToken!: string;

  @Field()
  refreshToken!: string;
}

/**
 * Sprint 15 (S15-6) — login response when MFA is enabled on the account.
 *
 * `requiresMfa=true` means the client must prompt the user for their
 * TOTP code and call `verifyMfa(mfaToken, code)`. `requiresMfa=false`
 * yields the regular access + refresh pair.
 *
 * Only one of `mfaToken` or (`accessToken`+`refreshToken`) will be set
 * on any given response.
 *
 * S19-STAB-5 — extended with two MFA-tier-enforcement signals:
 *
 *   - `requiresMfaEnrollment=true` (server returned no tokens) means
 *     the user is on a tier that mandates MFA and the 7-day grace
 *     window has expired. The client MUST redirect to the enrolment
 *     flow before retrying login.
 *   - `mfaGraceDaysRemaining` (server returned tokens) is the integer
 *     count of full days left in the grace window. The UI surfaces a
 *     persistent banner counting down to the deadline. Absent when
 *     MFA is enrolled, not required, or already overdue.
 */
@ObjectType()
export class LoginResponse {
  @Field()
  requiresMfa!: boolean;

  /** Short-lived (5-min) MFA challenge token. Present when `requiresMfa=true`. */
  @Field({ nullable: true })
  mfaToken?: string;

  /** Present when `requiresMfa=false`. */
  @Field({ nullable: true })
  accessToken?: string;

  /** Present when `requiresMfa=false`. */
  @Field({ nullable: true })
  refreshToken?: string;

  /**
   * S19-STAB-5: true when the user's tenant tier requires MFA AND the
   * 7-day grace window has expired. When true, no tokens are issued
   * and the client must redirect into the MFA enrolment flow. Always
   * false (or absent) on a normal login.
   */
  @Field({ nullable: true })
  requiresMfaEnrollment?: boolean;

  /**
   * S19-STAB-5: when the user is still inside the 7-day grace window,
   * the integer count of full days remaining. 0 means today is the
   * last day. The UI uses this to render a countdown banner.
   */
  @Field(() => Int, { nullable: true })
  mfaGraceDaysRemaining?: number;
}

/**
 * Sprint 15 (S15-6) — payload returned from `initiateMfaEnrollment`.
 *
 * The TOTP secret is returned in BOTH the raw form (so a developer or
 * test client can verify) and as an `otpauth://` URI suitable for a
 * QR-code generator. Backup codes are shown ONCE — caller must persist
 * them.
 */
@ObjectType()
export class MfaEnrollmentPayload {
  @Field()
  secret!: string;

  @Field()
  otpauthUri!: string;

  @Field(() => [String])
  backupCodes!: string[];
}

