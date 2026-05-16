import { ObjectType, Field } from '@nestjs/graphql';

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

