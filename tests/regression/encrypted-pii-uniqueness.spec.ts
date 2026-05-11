/**
 * Regression: FIX-S13B-1 (F-S13B-1) — encrypted-PII unique constraints.
 *
 * Sprint 13B encrypted PII columns (`PlatformUser.email`, `User.email`,
 * `Debtor.registrationNumber`) but the original `@unique` constraints on
 * those columns silently became no-ops (AES-GCM uses a random IV per
 * write, so the same plaintext produces different ciphertext on every
 * insert — the unique never fires).
 *
 * The fix moves the uniqueness invariant to the SHA-256 hash companion
 * columns. This regression test verifies the constraint at the database
 * level by attempting duplicate inserts directly via Prisma. The
 * application-level dedupe in `auth.service.ts` / `user.service.ts` /
 * `platform-user.service.ts` is the first line of defence; this test
 * ensures the database backstop is in place.
 *
 * Requires a real Postgres — runs as part of `pnpm test:regression`.
 */
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

import { prisma, seedTestData, cleanup, disconnectPrisma } from './setup';

const SUFFIX = 'pii-uniqueness';

function sha256(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

function uniqueId(): string {
  return crypto.randomUUID();
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

describe('FIX-S13B-1 — encrypted-PII unique constraints', () => {
  let tenantId: string;

  beforeAll(async () => {
    const seed = await seedTestData(SUFFIX);
    tenantId = seed.tenantId;
  });

  afterAll(async () => {
    // Best-effort cleanup of the rows we directly inserted; the standard
    // cleanup() in setup.ts handles the seeded tenant + users.
    await prisma.platformUser.deleteMany({
      where: { name: { startsWith: 'pii-uniqueness-' } },
    });
    await prisma.debtor.deleteMany({
      where: { tenantId, companyName: { startsWith: 'pii-uniqueness-' } },
    });
    await cleanup([SUFFIX]);
    await disconnectPrisma();
  });

  // ── User: tenant-scoped emailHash ───────────────────────────────────────

  it('User: duplicate (tenantId, emailHash) is rejected by the database', async () => {
    const emailHash = sha256(`dup-user-${SUFFIX}@lons-test.io`);
    const role = await prisma.role.findFirst({
      where: { tenantId, name: 'sp_admin' },
    });
    expect(role).not.toBeNull();

    // First insert succeeds.
    await prisma.user.create({
      data: {
        id: uniqueId(),
        tenantId,
        email: `pii-uniqueness-1@example.io`,
        emailHash,
        passwordHash: 'x',
        roleId: role!.id,
      },
    });

    // Second insert with the same (tenantId, emailHash) must violate.
    let caught: unknown = null;
    try {
      await prisma.user.create({
        data: {
          id: uniqueId(),
          tenantId,
          // Different ciphertext (encrypted), but the hash collides.
          email: `pii-uniqueness-2@example.io`,
          emailHash,
          passwordHash: 'x',
          roleId: role!.id,
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(isUniqueViolation(caught)).toBe(true);
  });

  // ── PlatformUser: emailHash ─────────────────────────────────────────────

  it('PlatformUser: duplicate emailHash is rejected by the database', async () => {
    const emailHash = sha256(`dup-platform-${SUFFIX}@lons-test.io`);

    await prisma.platformUser.create({
      data: {
        id: uniqueId(),
        email: `pii-uniqueness-platform-1@example.io`,
        emailHash,
        passwordHash: 'x',
        name: 'pii-uniqueness-1',
        role: 'platform_admin',
      },
    });

    let caught: unknown = null;
    try {
      await prisma.platformUser.create({
        data: {
          id: uniqueId(),
          email: `pii-uniqueness-platform-2@example.io`,
          emailHash,
          passwordHash: 'x',
          name: 'pii-uniqueness-2',
          role: 'platform_admin',
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(isUniqueViolation(caught)).toBe(true);
  });

  // ── Debtor: tenant-scoped (companyName, registrationNumberHash) ────────

  it('Debtor: duplicate (tenantId, companyName, registrationNumberHash) is rejected by the database', async () => {
    const companyName = `pii-uniqueness-${SUFFIX}-Co`;
    const registrationNumberHash = sha256(`REG-${SUFFIX}-001`);

    await prisma.debtor.create({
      data: {
        id: uniqueId(),
        tenantId,
        companyName,
        registrationNumber: 'cipher-blob-1',
        registrationNumberHash,
        country: 'GHA',
      },
    });

    let caught: unknown = null;
    try {
      await prisma.debtor.create({
        data: {
          id: uniqueId(),
          tenantId,
          companyName,
          // Different ciphertext, same hash.
          registrationNumber: 'cipher-blob-2',
          registrationNumberHash,
          country: 'GHA',
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
    expect(isUniqueViolation(caught)).toBe(true);
  });

  // ── NULL hash behaviour: NULL is distinct in Postgres unique constraints ─

  it('User: rows with NULL emailHash are treated as distinct (pre-backfill safety)', async () => {
    const role = await prisma.role.findFirst({
      where: { tenantId, name: 'sp_admin' },
    });
    expect(role).not.toBeNull();

    // Two rows with NULL hash — both should succeed (Postgres semantics).
    await prisma.user.create({
      data: {
        id: uniqueId(),
        tenantId,
        email: `pii-uniqueness-null-1@example.io`,
        emailHash: null,
        passwordHash: 'x',
        roleId: role!.id,
      },
    });
    await prisma.user.create({
      data: {
        id: uniqueId(),
        tenantId,
        email: `pii-uniqueness-null-2@example.io`,
        emailHash: null,
        passwordHash: 'x',
        roleId: role!.id,
      },
    });
  });
});
