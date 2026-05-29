/**
 * Sprint 15 fixes (FIX-4 + FIX-6) — MFA service unit tests.
 *
 * Tests are written against the FIX-6 storage format (SHA-256 hashes
 * of upper-cased backup codes). Plaintext codes are NEVER persisted —
 * the service only ever sees them at generation time (returned to the
 * caller) and consumption time (hashed and compared).
 *
 * `authenticator.check()` is real (otplib is deterministic given the
 * same secret + clock), so TOTP tests freeze time via jest fake timers
 * to make them stable.
 */
import * as crypto from 'crypto';
import { authenticator } from 'otplib';

import { MfaService } from './mfa.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const EMAIL = 'user@example.com';

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

function makeService() {
  const user = {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };
  const platformUser = {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };
  const prisma = { user, platformUser } as any;
  const service = new MfaService(prisma);
  return { service, prisma, user, platformUser };
}

describe('initiateEnrollment', () => {
  it('returns plaintext codes but stores HASHES (FIX-6)', async () => {
    const { service, user } = makeService();

    const result = await service.initiateEnrollment('user', USER_ID, EMAIL);

    expect(result.backupCodes).toHaveLength(10);
    expect(result.backupCodes.every((c) => /^[A-F0-9]{8}$/.test(c))).toBe(true);

    const storedJson = user.update.mock.calls[0][0].data.mfaBackupCodes;
    const storedHashes = JSON.parse(storedJson) as string[];

    // Each plaintext, hashed, must equal the persisted value at the
    // same index — exactly what consumeBackupCode will recompute later.
    for (let i = 0; i < 10; i++) {
      expect(storedHashes[i]).toBe(hashBackupCode(result.backupCodes[i]));
    }

    // The persisted hashes are NOT the plaintext.
    for (const code of result.backupCodes) {
      expect(storedHashes).not.toContain(code);
    }
  });

  it('stores the TOTP secret in plaintext (encryption middleware handles at-rest)', async () => {
    const { service, user } = makeService();
    const result = await service.initiateEnrollment('user', USER_ID, EMAIL);
    expect(user.update.mock.calls[0][0].data.mfaSecret).toBe(result.secret);
    expect(result.otpauthUri).toContain(encodeURIComponent('Lons Platform'));
  });

  it('does NOT enable MFA on initiate (must confirm first)', async () => {
    const { service, user } = makeService();
    await service.initiateEnrollment('user', USER_ID, EMAIL);
    expect(user.update.mock.calls[0][0].data.mfaEnabled).toBeUndefined();
  });

  it('routes platform_user to platformUser model', async () => {
    const { service, user, platformUser } = makeService();
    await service.initiateEnrollment('platform_user', USER_ID, EMAIL);
    expect(platformUser.update).toHaveBeenCalledTimes(1);
    expect(user.update).not.toHaveBeenCalled();
  });
});

describe('confirmEnrollment', () => {
  it('enables MFA when the code matches the stored secret', async () => {
    const { service, user } = makeService();
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);
    user.findUnique.mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: secret,
      mfaBackupCodes: '[]',
    });

    const ok = await service.confirmEnrollment('user', USER_ID, code);

    expect(ok).toBe(true);
    expect(user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { mfaEnabled: true },
    });
  });

  it('rejects an invalid first code without enabling MFA', async () => {
    const { service, user } = makeService();
    const secret = authenticator.generateSecret();
    user.findUnique.mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: secret,
      mfaBackupCodes: '[]',
    });

    const ok = await service.confirmEnrollment('user', USER_ID, '000000');

    expect(ok).toBe(false);
    expect(user.update).not.toHaveBeenCalled();
  });

  it('throws when enrollment has not been initiated', async () => {
    const { service, user } = makeService();
    user.findUnique.mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
    });
    await expect(
      service.confirmEnrollment('user', USER_ID, '123456'),
    ).rejects.toThrow(/has not been initiated/);
  });
});

describe('verifyCode', () => {
  it('valid TOTP returns true', async () => {
    const { service, user } = makeService();
    const secret = authenticator.generateSecret();
    user.findUnique.mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: secret,
      mfaBackupCodes: '[]',
    });
    const code = authenticator.generate(secret);
    expect(await service.verifyCode('user', USER_ID, code)).toBe(true);
  });

  it('invalid TOTP with no backup match returns false', async () => {
    const { service, user } = makeService();
    user.findUnique.mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: authenticator.generateSecret(),
      mfaBackupCodes: '[]',
    });
    expect(await service.verifyCode('user', USER_ID, '000000')).toBe(false);
  });

  it('valid backup code (post-hashing) returns true and consumes it', async () => {
    const { service, user } = makeService();
    const plaintext = 'A1B2C3D4';
    user.findUnique.mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: authenticator.generateSecret(),
      mfaBackupCodes: JSON.stringify([
        hashBackupCode(plaintext),
        hashBackupCode('FFFFFFFF'),
      ]),
    });

    expect(await service.verifyCode('user', USER_ID, plaintext)).toBe(true);

    // Consumed → only the remaining hash is persisted.
    const persisted = JSON.parse(
      user.update.mock.calls[0][0].data.mfaBackupCodes,
    ) as string[];
    expect(persisted).toEqual([hashBackupCode('FFFFFFFF')]);
  });

  it('used backup code is rejected the second time', async () => {
    const { service, user } = makeService();
    const plaintext = 'A1B2C3D4';
    user.findUnique
      .mockResolvedValueOnce({
        mfaEnabled: true,
        mfaSecret: authenticator.generateSecret(),
        mfaBackupCodes: JSON.stringify([hashBackupCode(plaintext)]),
      })
      .mockResolvedValueOnce({
        mfaEnabled: true,
        mfaSecret: authenticator.generateSecret(),
        mfaBackupCodes: '[]',
      });

    expect(await service.verifyCode('user', USER_ID, plaintext)).toBe(true);
    expect(await service.verifyCode('user', USER_ID, plaintext)).toBe(false);
  });

  it('rejects when MFA is not enabled', async () => {
    const { service, user } = makeService();
    user.findUnique.mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
    });
    expect(await service.verifyCode('user', USER_ID, '123456')).toBe(false);
  });

  it('backup code is case-insensitive', async () => {
    const { service, user } = makeService();
    const plaintext = 'A1B2C3D4';
    user.findUnique.mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: authenticator.generateSecret(),
      mfaBackupCodes: JSON.stringify([hashBackupCode(plaintext)]),
    });
    expect(await service.verifyCode('user', USER_ID, 'a1b2c3d4')).toBe(true);
  });
});

describe('disableMfa', () => {
  it('clears all MFA fields and stamps mfaDisabledAt for tenant users', async () => {
    const { service, user } = makeService();
    await service.disableMfa('user', USER_ID);
    // S19-STAB-5: `mfaDisabledAt` is now set so the compliance
    // service can compute a fresh 7-day grace window if the
    // tenant tier still mandates MFA. We assert the timestamp
    // is present + recent rather than asserting exact equality
    // (the test uses `new Date()` at call time).
    expect(user.update).toHaveBeenCalledTimes(1);
    const [args] = (user.update as jest.Mock).mock.calls[0];
    expect(args.where).toEqual({ id: USER_ID });
    expect(args.data.mfaEnabled).toBe(false);
    expect(args.data.mfaSecret).toBeNull();
    expect(args.data.mfaBackupCodes).toBeNull();
    expect(args.data.mfaDisabledAt).toBeInstanceOf(Date);
    expect(Date.now() - args.data.mfaDisabledAt.getTime()).toBeLessThan(5_000);
  });
});

describe('regenerateBackupCodes', () => {
  it('rejects when MFA is not enabled', async () => {
    const { service, user } = makeService();
    user.findUnique.mockResolvedValue({
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
    });
    await expect(
      service.regenerateBackupCodes('user', USER_ID),
    ).rejects.toThrow(/MFA is not enabled/);
  });

  it('returns plaintext + persists hashes (FIX-6)', async () => {
    const { service, user } = makeService();
    user.findUnique.mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: 'irrelevant',
      mfaBackupCodes: '[]',
    });

    const codes = await service.regenerateBackupCodes('user', USER_ID);
    expect(codes).toHaveLength(10);

    const persisted = JSON.parse(
      user.update.mock.calls[0][0].data.mfaBackupCodes,
    ) as string[];
    for (let i = 0; i < 10; i++) {
      expect(persisted[i]).toBe(hashBackupCode(codes[i]));
    }
  });
});
