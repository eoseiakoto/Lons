/**
 * Sprint 15 (S15-FIX-3 / F-S14-A3) — customer PII hash stays in sync on update.
 *
 * Sprint 13B added hash companion columns (`phonePrimaryHash`,
 * `emailHash`, `nationalIdHash`). The field-encryption middleware hooks
 * `create`, `update`, `upsert`, `createMany`, AND `updateMany`, so hash
 * recomputation should happen automatically on every write path. This
 * test pins that behaviour against the middleware contract so a future
 * refactor that drops `update` from `WRITE_ACTIONS` would be caught.
 *
 * Failure mode this test prevents:
 *   - Customer updates phone → old phoneHash stays in the DB → the
 *     SEC-1 hash-routed lookup in CustomerService stops matching.
 *     Customer is functionally locked out of the system.
 */
import { computeSearchableHash } from '@lons/common';

import { prisma, seedTestData, cleanup, disconnectPrisma } from './setup';

const SUFFIX = 'customer-hash-update';

function expectedHash(value: string): string {
  // Delegate to the production helper so the test always tracks any
  // future algorithm change (SHA → HMAC happened in SEC-5).
  return computeSearchableHash(value) as string;
}

describe('Sprint 15 (S15-FIX-3) — Customer PII hash updates', () => {
  let tenantId: string;
  let customerId: string;

  beforeAll(async () => {
    const seed = await seedTestData(SUFFIX);
    tenantId = seed.tenantId;
    customerId = seed.customerId;
  });

  afterAll(async () => {
    await cleanup([SUFFIX]);
    await disconnectPrisma();
  });

  it('phonePrimaryHash is recomputed when phonePrimary is updated', async () => {
    const newPhone = '+233200000001';

    await prisma.customer.update({
      where: { id: customerId },
      data: { phonePrimary: newPhone },
    });

    // Bypass middleware decryption to read the raw hash column.
    const rows = await prisma.$queryRawUnsafe<
      Array<{ phone_primary_hash: string | null }>
    >(
      `SELECT phone_primary_hash FROM customers WHERE id = $1::uuid`,
      customerId,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].phone_primary_hash).toBe(expectedHash(newPhone));
  });

  it('emailHash is recomputed when email is updated', async () => {
    const newEmail = 'updated.email@example.com';

    await prisma.customer.update({
      where: { id: customerId },
      data: { email: newEmail },
    });

    const rows = await prisma.$queryRawUnsafe<
      Array<{ email_hash: string | null }>
    >(
      `SELECT email_hash FROM customers WHERE id = $1::uuid`,
      customerId,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].email_hash).toBe(expectedHash(newEmail));
  });

  it('hash is not changed when the PII field is not in the update payload', async () => {
    // Capture the current hashes
    const before = await prisma.$queryRawUnsafe<
      Array<{ phone_primary_hash: string; email_hash: string }>
    >(
      `SELECT phone_primary_hash, email_hash FROM customers WHERE id = $1::uuid`,
      customerId,
    );

    // Update an unrelated field
    await prisma.customer.update({
      where: { id: customerId },
      data: { fullName: 'Renamed Test Customer' },
    });

    const after = await prisma.$queryRawUnsafe<
      Array<{ phone_primary_hash: string; email_hash: string }>
    >(
      `SELECT phone_primary_hash, email_hash FROM customers WHERE id = $1::uuid`,
      customerId,
    );

    expect(after[0].phone_primary_hash).toBe(before[0].phone_primary_hash);
    expect(after[0].email_hash).toBe(before[0].email_hash);
  });

  it('hash is cleared to NULL when the PII field is cleared to NULL', async () => {
    await prisma.customer.update({
      where: { id: customerId },
      data: { phonePrimary: null },
    });

    const rows = await prisma.$queryRawUnsafe<
      Array<{ phone_primary_hash: string | null }>
    >(
      `SELECT phone_primary_hash FROM customers WHERE id = $1::uuid`,
      customerId,
    );
    expect(rows[0].phone_primary_hash).toBeNull();
  });
});
