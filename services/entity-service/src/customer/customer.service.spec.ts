/**
 * Security Hardening (SEC-1) — CustomerService search hash routing.
 *
 * Pre-SEC-1, `search(... { phonePrimary })` and `findAll/count(...)` ran
 * Prisma `WHERE` filters directly against the encrypted `phonePrimary`,
 * `email`, and `fullName` columns. Because AES-GCM uses a random IV per
 * write, those filters always silently returned empty.
 *
 * The fix routes equality lookups through hash companion columns
 * (`phonePrimaryHash`, `emailHash`) and removes the broken
 * substring-on-encrypted-column clauses from the free-text search OR.
 *
 * These tests assert the constructed `where` clauses — the behaviour
 * contract of the service.
 */
import { computeSearchableHash } from '@lons/common';

import { CustomerService } from './customer.service';

const TENANT = '11111111-1111-1111-1111-111111111111';

function makeService() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    customer: { findMany, count, findFirst: jest.fn() },
  } as any;
  // S14-10: QuotaEnforcementService stub for tests not exercising quotas.
  const quotaEnforcementService = {
    checkEntityLimit: jest.fn(async () => undefined),
  } as any;
  const service = new CustomerService(prisma, quotaEnforcementService);
  return { service, prisma, findMany, count };
}

describe('CustomerService — encrypted PII search routing (SEC-1)', () => {
  it('search() routes phonePrimary filter through phonePrimaryHash', async () => {
    const { service, findMany } = makeService();

    await service.search(TENANT, { phonePrimary: '+233244567890' });

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0];
    // The legacy `where.phonePrimary = ...` is gone.
    expect(args.where.phonePrimary).toBeUndefined();
    // The new hash filter is used.
    expect(args.where.phonePrimaryHash).toBe(
      computeSearchableHash('+233244567890'),
    );
  });

  it('search() with no phonePrimary leaves both columns unset', async () => {
    const { service, findMany } = makeService();

    await service.search(TENANT, { externalId: 'ext-1' });

    const args = findMany.mock.calls[0][0];
    expect(args.where.phonePrimary).toBeUndefined();
    expect(args.where.phonePrimaryHash).toBeUndefined();
    expect(args.where.externalId).toBe('ext-1');
  });

  it('findAll() free-text search OR clause does NOT include encrypted columns', async () => {
    const { service, findMany } = makeService();

    await service.findAll(TENANT, { search: '+233244567890' });

    const args = findMany.mock.calls[0][0];
    expect(Array.isArray(args.where.OR)).toBe(true);
    const orClauses: Array<Record<string, unknown>> = args.where.OR;

    // Every clause must reference either a plaintext column (externalId)
    // or a hash column (*Hash). Encrypted columns must NOT appear.
    for (const clause of orClauses) {
      const keys = Object.keys(clause);
      for (const key of keys) {
        expect(['externalId', 'phonePrimaryHash', 'emailHash']).toContain(key);
      }
    }
    expect(JSON.stringify(orClauses)).not.toContain('"fullName"');
    expect(JSON.stringify(orClauses)).not.toContain('"phonePrimary"');
    // The `email` column appears as `emailHash` — confirm the raw column
    // name is absent (substring check).
    expect(JSON.stringify(orClauses)).not.toMatch(/"email"\s*:/);
  });

  it('findAll() with non-empty search produces hash-based exact match', async () => {
    const { service, findMany } = makeService();

    await service.findAll(TENANT, { search: 'user@example.com' });

    const args = findMany.mock.calls[0][0];
    const orClauses: Array<Record<string, unknown>> = args.where.OR;
    const expectedHash = computeSearchableHash('user@example.com');
    // At least one clause must match emailHash with the expected hash.
    expect(
      orClauses.some(
        (c) =>
          'emailHash' in c &&
          (c as Record<string, unknown>).emailHash === expectedHash,
      ),
    ).toBe(true);
  });

  it('count() applies the same OR shape as findAll() (consistency)', async () => {
    const { service, findMany, count } = makeService();

    await service.findAll(TENANT, { search: 'foo' });
    await service.count(TENANT, { search: 'foo' });

    const findManyArgs = findMany.mock.calls[0][0];
    const countArgs = count.mock.calls[0][0];
    expect(findManyArgs.where.OR).toEqual(countArgs.where.OR);
  });

  it('search() leaves the where clause valid when filters.search is empty', async () => {
    const { service, findMany } = makeService();
    await service.findAll(TENANT, { search: '' });
    const args = findMany.mock.calls[0][0];
    // Empty search → no OR clause at all (avoid producing a degenerate
    // empty OR which Prisma reduces to "match all").
    expect(args.where.OR).toBeUndefined();
  });
});
