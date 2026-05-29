import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { authenticator } from 'otplib';

import { PrismaService } from '@lons/database';
import { NotFoundError, ValidationError } from '@lons/common';

/**
 * FIX-6 (Sprint 15 fixes): SHA-256 of the upper-cased backup code. The
 * server only needs equality comparison — never the plaintext — so a
 * one-way hash is strictly safer than the prior AES-encrypted plaintext.
 * If the encryption key leaks, encrypted plaintext codes would be
 * immediately usable; SHA-256 hashes are not. Codes are short (8 hex
 * chars = 32 bits of entropy each, ~10 codes per user) so a stolen
 * hash + a list of common code formats is still hard to brute-force.
 */
function hashBackupCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code.toUpperCase())
    .digest('hex');
}

/**
 * Sprint 15 (S15-6) — MFA TOTP enrollment + verification.
 *
 * `mfaSecret` and `mfaBackupCodes` are encrypted-at-rest fields per
 * `ENCRYPTED_FIELDS` — the Prisma field-encryption middleware handles
 * encrypt/decrypt transparently. Service code reads/writes plaintext.
 *
 * Backup codes are 10 single-use 8-character hex strings. Each is
 * consumed on use (removed from the encrypted JSON array). Once depleted,
 * the user must regenerate via `regenerateBackupCodes`.
 *
 * **Account scope.** `userType` selects between tenant `User` and
 * platform `PlatformUser`. Both have identical MFA fields. We avoid
 * generic-ifying by branching on `userType` rather than wrapping the
 * model in a polymorphic adapter — there are only two cases and the
 * Prisma client gives us strong typing for free.
 *
 * **MFA-RLS fix (MfaService).** Every method that touches the
 * tenant-scoped `users` table now requires a `tenantId` parameter
 * (REQUIRED when `userType === 'user'`). The tenant branch wraps the
 * Prisma call in `enterTenantContext({ tenantId }) + scoped()` so
 * RLS's `SET LOCAL app.current_tenant` is in effect. Without this,
 * the singleton `this.prisma` reference doesn't inherit the
 * resolver's context (Prisma's RLS middleware only auto-routes when
 * it can see the AsyncLocalStorage chain — calls from a service's
 * own injected Prisma reference bypass the wrap on the singleton's
 * middleware chain because `ctx.tx` is set, but `next(params)` then
 * dispatches on the singleton's connection, not the tx).
 *
 * Platform-user calls (`this.prisma.platformUser.*`) are unaffected
 * — `platform_users` isn't RLS-scoped.
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private static readonly ISSUER = 'Lons Platform';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Step 1: generate a TOTP secret + 10 backup codes. Stores both in the
   * encrypted columns BUT does NOT yet flip `mfaEnabled` — the user
   * confirms enrollment by submitting their first TOTP code via
   * `confirmEnrollment`. This guard catches the case where the user
   * scans the QR but the authenticator app fails to register.
   *
   * MFA-RLS fix: `tenantId` is REQUIRED when `userType === 'user'`.
   */
  async initiateEnrollment(
    userType: 'user' | 'platform_user',
    userId: string,
    userEmail: string,
    tenantId?: string,
  ): Promise<{
    secret: string;
    otpauthUri: string;
    backupCodes: string[];
  }> {
    const secret = authenticator.generateSecret();
    const otpauthUri = authenticator.keyuri(
      userEmail,
      MfaService.ISSUER,
      secret,
    );
    // FIX-6: generate codes, store HASHES, return PLAINTEXT (one-time
    // display). Plaintext is never persisted server-side.
    const plaintextCodes = this.generateBackupCodes();
    const hashedCodes = plaintextCodes.map(hashBackupCode);

    // `mfaSecret` is still AES-encrypted at rest (we need it back to
    // verify TOTPs). `mfaBackupCodes` is plaintext-of-hashes — the
    // field-encryption middleware no longer encrypts this column
    // (see encrypted-fields.config.ts).
    if (userType === 'user') {
      await this.tenantUserUpdate(userId, tenantId, {
        mfaSecret: secret,
        mfaBackupCodes: JSON.stringify(hashedCodes),
        // `mfaEnabled` stays false until confirmEnrollment.
      });
    } else {
      await this.prisma.platformUser.update({
        where: { id: userId },
        data: {
          mfaSecret: secret,
          mfaBackupCodes: JSON.stringify(hashedCodes),
        },
      });
    }

    return { secret, otpauthUri, backupCodes: plaintextCodes };
  }

  /**
   * Step 2: confirm enrollment by submitting the first TOTP code. On
   * success, flips `mfaEnabled = true` so the next login requires MFA.
   *
   * MFA-RLS fix: `tenantId` is REQUIRED when `userType === 'user'`.
   * Threaded through to `loadUser` so the secret-fetching findUnique
   * runs inside tenant context too.
   */
  async confirmEnrollment(
    userType: 'user' | 'platform_user',
    userId: string,
    code: string,
    tenantId?: string,
  ): Promise<boolean> {
    const user = await this.loadUser(userType, userId, tenantId);
    if (!user.mfaSecret) {
      throw new ValidationError(
        'MFA enrollment has not been initiated for this user',
      );
    }
    if (!authenticator.check(code.replace(/\s+/g, ''), user.mfaSecret)) {
      return false;
    }
    if (userType === 'user') {
      await this.tenantUserUpdate(userId, tenantId, { mfaEnabled: true });
    } else {
      await this.prisma.platformUser.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });
    }
    return true;
  }

  /**
   * Verify a login-time TOTP code OR a backup code. Returns true on
   * either path. Consumes the backup code if matched.
   *
   * MFA-RLS fix: `tenantId` is REQUIRED when `userType === 'user'`.
   * Threaded to `loadUser` and `consumeBackupCode`. Called from
   * `AuthService.verifyMfaAndLogin` which extracts `tenantId` from
   * the MFA token payload before invoking.
   */
  async verifyCode(
    userType: 'user' | 'platform_user',
    userId: string,
    code: string,
    tenantId?: string,
  ): Promise<boolean> {
    const user = await this.loadUser(userType, userId, tenantId);
    if (!user.mfaEnabled || !user.mfaSecret) {
      return false;
    }

    const normalized = code.replace(/[-\s]/g, '');
    // TOTP first (cheap path).
    if (authenticator.check(normalized, user.mfaSecret)) {
      return true;
    }
    // Backup code fallback.
    if (!user.mfaBackupCodes) return false;
    return this.consumeBackupCode(
      userType,
      userId,
      user.mfaBackupCodes,
      normalized,
      tenantId,
    );
  }

  /**
   * MFA-RLS fix: `tenantId` is REQUIRED when `userType === 'user'`.
   */
  async disableMfa(
    userType: 'user' | 'platform_user',
    userId: string,
    tenantId?: string,
  ): Promise<void> {
    if (userType === 'user') {
      // S19-STAB-5: stamp `mfaDisabledAt` so the compliance service
      // can start a fresh 7-day grace window from this moment if the
      // tenant tier requires MFA. PlatformUser rows don't carry that
      // column (platform admins are governed by a separate policy).
      await this.tenantUserUpdate(userId, tenantId, {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
        mfaDisabledAt: new Date(),
      });
    } else {
      await this.prisma.platformUser.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: null,
        },
      });
    }
  }

  /**
   * MFA-lockout fix: administrative MFA reset.
   *
   * Same field-clearing semantics as `disableMfa` but WITHOUT the
   * password re-auth — used when an admin needs to recover a
   * locked-out user (lost phone, device change). The caller's
   * permission gate (`user:update` for SP Admin, platform-admin
   * check for the cross-tenant variant) is enforced at the
   * resolver layer; this method assumes authz already passed.
   *
   * Stamps `mfaDisabledAt` so the compliance service computes a
   * fresh 7-day grace window from this moment — giving the
   * reset user a real chance to re-enrol before the next login
   * starts blocking again.
   *
   * The accountability trail is the resolver's @AuditAction
   * decorator, which records (actor, target, before/after).
   *
   * MFA-RLS fix: `tenantId` is REQUIRED when `userType === 'user'`.
   */
  async adminResetMfa(
    userType: 'user' | 'platform_user',
    userId: string,
    tenantId?: string,
  ): Promise<void> {
    if (userType === 'user') {
      await this.tenantUserUpdate(userId, tenantId, {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
        mfaDisabledAt: new Date(),
      });
    } else {
      await this.prisma.platformUser.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: null,
        },
      });
    }
  }

  /**
   * Regenerate the 10 backup codes after the user exhausts them. Does
   * not change the TOTP secret. Returns the new codes once — caller is
   * responsible for showing them to the user immediately.
   *
   * MFA-RLS fix: `tenantId` is REQUIRED when `userType === 'user'`.
   */
  async regenerateBackupCodes(
    userType: 'user' | 'platform_user',
    userId: string,
    tenantId?: string,
  ): Promise<string[]> {
    const user = await this.loadUser(userType, userId, tenantId);
    if (!user.mfaEnabled) {
      throw new ValidationError('MFA is not enabled — enrol first');
    }
    // FIX-6: persist hashes; return plaintext for one-time display.
    const plaintextCodes = this.generateBackupCodes();
    const hashedCodes = plaintextCodes.map(hashBackupCode);
    const data = { mfaBackupCodes: JSON.stringify(hashedCodes) };
    if (userType === 'user') {
      await this.tenantUserUpdate(userId, tenantId, data);
    } else {
      await this.prisma.platformUser.update({ where: { id: userId }, data });
    }
    return plaintextCodes;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  /**
   * 8-character hex codes (4 random bytes → 8 hex chars, uppercased).
   * 10 codes ≈ 10 × 4 bytes of entropy. The TOTP secret is the primary
   * mechanism; backup codes exist for the device-loss recovery path.
   */
  private generateBackupCodes(): string[] {
    return Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(),
    );
  }

  /**
   * MFA-RLS fix: centralised RLS-aware `prisma.user.update` helper.
   *
   * Wraps in `enterTenantContext({ tenantId }) + scoped()` so the
   * call runs on the in-context tx client (which has `SET LOCAL
   * app.current_tenant` active). Refuses to run when `tenantId` is
   * missing — surfaces the developer error at the call site rather
   * than silently writing to whatever row matches across tenants.
   *
   * Nested inside an already-active context this becomes a savepoint
   * — harmless, just an extra round-trip.
   */
  private async tenantUserUpdate(
    userId: string,
    tenantId: string | undefined,
    data: Parameters<PrismaService['user']['update']>[0]['data'],
  ): Promise<void> {
    if (!tenantId) {
      throw new Error(
        `MfaService: tenantId is required for tenant-user operations (userId=${userId}). ` +
          `Caller must pass user.tenantId.`,
      );
    }
    await this.prisma.enterTenantContext({ tenantId }, async () => {
      const tx = this.prisma.scoped();
      await tx.user.update({ where: { id: userId }, data });
    });
  }

  private async consumeBackupCode(
    userType: 'user' | 'platform_user',
    userId: string,
    rawCodesJson: string,
    submittedCode: string,
    tenantId?: string,
  ): Promise<boolean> {
    // FIX-6: column now stores hashes — hash the submission and compare.
    let storedHashes: string[];
    try {
      storedHashes = JSON.parse(rawCodesJson);
    } catch {
      this.logger.warn(
        `Malformed mfaBackupCodes JSON for ${userType} ${userId} — treating as empty`,
      );
      return false;
    }
    const submittedHash = hashBackupCode(submittedCode);
    const idx = storedHashes.indexOf(submittedHash);
    if (idx === -1) return false;
    storedHashes.splice(idx, 1);
    const newJson = JSON.stringify(storedHashes);
    if (userType === 'user') {
      await this.tenantUserUpdate(userId, tenantId, { mfaBackupCodes: newJson });
    } else {
      await this.prisma.platformUser.update({
        where: { id: userId },
        data: { mfaBackupCodes: newJson },
      });
    }
    return true;
  }

  /**
   * MFA-RLS fix: tenant lookups go through `scoped()` after
   * (re)entering tenant context. Same fail-fast on missing tenantId
   * as `tenantUserUpdate`.
   */
  private async loadUser(
    userType: 'user' | 'platform_user',
    userId: string,
    tenantId?: string,
  ) {
    if (userType === 'user') {
      if (!tenantId) {
        throw new Error(
          `MfaService.loadUser: tenantId is required for tenant-user operations (userId=${userId}). ` +
            `Caller must pass user.tenantId.`,
        );
      }
      return this.prisma.enterTenantContext({ tenantId }, async () => {
        const tx = this.prisma.scoped();
        const u = await tx.user.findUnique({ where: { id: userId } });
        if (!u) throw new NotFoundError('User', userId);
        return {
          mfaEnabled: u.mfaEnabled,
          mfaSecret: u.mfaSecret,
          mfaBackupCodes: u.mfaBackupCodes,
        };
      });
    }
    const u = await this.prisma.platformUser.findUnique({
      where: { id: userId },
    });
    if (!u) throw new NotFoundError('PlatformUser', userId);
    return {
      mfaEnabled: u.mfaEnabled,
      mfaSecret: u.mfaSecret,
      mfaBackupCodes: u.mfaBackupCodes,
    };
  }
}
