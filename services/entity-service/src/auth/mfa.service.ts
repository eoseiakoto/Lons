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
   */
  async initiateEnrollment(
    userType: 'user' | 'platform_user',
    userId: string,
    userEmail: string,
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
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaSecret: secret,
          mfaBackupCodes: JSON.stringify(hashedCodes),
          // `mfaEnabled` stays false until confirmEnrollment.
        },
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
   */
  async confirmEnrollment(
    userType: 'user' | 'platform_user',
    userId: string,
    code: string,
  ): Promise<boolean> {
    const user = await this.loadUser(userType, userId);
    if (!user.mfaSecret) {
      throw new ValidationError(
        'MFA enrollment has not been initiated for this user',
      );
    }
    if (!authenticator.check(code.replace(/\s+/g, ''), user.mfaSecret)) {
      return false;
    }
    if (userType === 'user') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });
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
   */
  async verifyCode(
    userType: 'user' | 'platform_user',
    userId: string,
    code: string,
  ): Promise<boolean> {
    const user = await this.loadUser(userType, userId);
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
    return this.consumeBackupCode(userType, userId, user.mfaBackupCodes, normalized);
  }

  async disableMfa(
    userType: 'user' | 'platform_user',
    userId: string,
  ): Promise<void> {
    const data = { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null };
    if (userType === 'user') {
      await this.prisma.user.update({ where: { id: userId }, data });
    } else {
      await this.prisma.platformUser.update({ where: { id: userId }, data });
    }
  }

  /**
   * Regenerate the 10 backup codes after the user exhausts them. Does
   * not change the TOTP secret. Returns the new codes once — caller is
   * responsible for showing them to the user immediately.
   */
  async regenerateBackupCodes(
    userType: 'user' | 'platform_user',
    userId: string,
  ): Promise<string[]> {
    const user = await this.loadUser(userType, userId);
    if (!user.mfaEnabled) {
      throw new ValidationError('MFA is not enabled — enrol first');
    }
    // FIX-6: persist hashes; return plaintext for one-time display.
    const plaintextCodes = this.generateBackupCodes();
    const hashedCodes = plaintextCodes.map(hashBackupCode);
    const data = { mfaBackupCodes: JSON.stringify(hashedCodes) };
    if (userType === 'user') {
      await this.prisma.user.update({ where: { id: userId }, data });
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

  private async consumeBackupCode(
    userType: 'user' | 'platform_user',
    userId: string,
    rawCodesJson: string,
    submittedCode: string,
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
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaBackupCodes: newJson },
      });
    } else {
      await this.prisma.platformUser.update({
        where: { id: userId },
        data: { mfaBackupCodes: newJson },
      });
    }
    return true;
  }

  private async loadUser(userType: 'user' | 'platform_user', userId: string) {
    if (userType === 'user') {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!u) throw new NotFoundError('User', userId);
      return {
        mfaEnabled: u.mfaEnabled,
        mfaSecret: u.mfaSecret,
        mfaBackupCodes: u.mfaBackupCodes,
      };
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
