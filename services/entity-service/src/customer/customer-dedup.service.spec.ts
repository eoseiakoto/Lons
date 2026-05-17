/**
 * S17-8 / FR-CM-001.3 — CustomerDedupService unit tests.
 *
 * Exercises:
 *   1. Rule iteration in priority order.
 *   2. First-match-wins semantics.
 *   3. Missing-field short-circuit (skips the rule rather than matching
 *      on a degenerate WHERE).
 *   4. Encrypted-field routing through the hash columns.
 *   5. Plaintext-field routing (dateOfBirth).
 *   6. fullName intentionally has no hash column → still allowed in
 *      multi-field rules but contributes no clause on its own.
 *   7. Legacy fallback (no rules configured → externalId lookup).
 */
import { computeSearchableHash } from '@lons/common';

import { CustomerDedupService } from './customer-dedup.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function makeService() {
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const prisma = {
    customer: { findFirst },
    customerMatchingRule: { findMany },
  } as any;
  const service = new CustomerDedupService(prisma);
  return { service, prisma, findFirst, findMany };
}

describe('CustomerDedupService (S17-8)', () => {
  beforeAll(() => {
    if (!process.env.HASH_PEPPER) {
      process.env.HASH_PEPPER = 'b'.repeat(64);
    }
  });

  it('returns null when no rules and no externalId match', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([]); // no rules
    findFirst.mockResolvedValue(null);

    const result = await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
    });

    expect(result).toBeNull();
  });

  it('legacy fallback matches by externalId when no rules are configured', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([]);
    const existing = { id: 'cust-1', externalId: 'ext-1' };
    findFirst.mockResolvedValue(existing);

    const result = await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
    });

    expect(result).toEqual({ match: existing, matchedRule: 'Legacy externalId' });
    // Hash columns NOT used in legacy mode.
    const where = findFirst.mock.calls[0][0].where;
    expect(where.externalId).toBe('ext-1');
    expect(where.nationalIdHash).toBeUndefined();
  });

  it('matches by nationalId via hash column', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([
      {
        id: 'r1',
        name: 'National ID',
        matchFields: ['nationalId'],
        priority: 1,
      },
    ]);
    const existing = { id: 'cust-1' };
    findFirst.mockResolvedValue(existing);

    const result = await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
      nationalId: 'GHA-12345678',
    });

    expect(result?.matchedRule).toBe('National ID');
    const where = findFirst.mock.calls[0][0].where;
    expect(where.nationalIdHash).toBe(
      computeSearchableHash('GHA-12345678'),
    );
    // Hash routing — plaintext nationalId NOT in the WHERE clause.
    expect(where.nationalId).toBeUndefined();
  });

  it('matches by phone+dob using hash for phone, Date for dob', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([
      {
        id: 'r2',
        name: 'Phone + DOB',
        matchFields: ['phonePrimary', 'dateOfBirth'],
        priority: 2,
      },
    ]);
    findFirst.mockResolvedValue({ id: 'cust-1' });

    await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
      phonePrimary: '+233244567890',
      dateOfBirth: new Date('1990-01-15'),
    });

    const where = findFirst.mock.calls[0][0].where;
    expect(where.phonePrimaryHash).toBe(
      computeSearchableHash('+233244567890'),
    );
    expect(where.dateOfBirth).toEqual(new Date('1990-01-15'));
  });

  it('matches by email when emailHash matches', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([
      {
        id: 'r3',
        name: 'Email + Name',
        matchFields: ['email', 'fullName'],
        priority: 3,
      },
    ]);
    findFirst.mockResolvedValue({ id: 'cust-1' });

    await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
      email: 'Test@Example.com',
      fullName: 'John Doe',
    });

    const where = findFirst.mock.calls[0][0].where;
    // Normalised lowercase email.
    expect(where.emailHash).toBe(computeSearchableHash('test@example.com'));
    // fullName intentionally NOT in WHERE (no hash column by design).
    expect(where.fullName).toBeUndefined();
  });

  it('respects rule priority — first match wins', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([
      {
        id: 'r1',
        name: 'National ID',
        matchFields: ['nationalId'],
        priority: 1,
      },
      {
        id: 'r2',
        name: 'Phone + DOB',
        matchFields: ['phonePrimary', 'dateOfBirth'],
        priority: 2,
      },
    ]);
    // First rule (nationalId) returns a match — we should NOT proceed
    // to the second rule.
    const firstMatch = { id: 'cust-from-nationalid' };
    findFirst.mockResolvedValueOnce(firstMatch);

    const result = await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
      nationalId: 'GHA-12345678',
      phonePrimary: '+233244567890',
      dateOfBirth: new Date('1990-01-15'),
    });

    expect(result?.match).toBe(firstMatch);
    expect(result?.matchedRule).toBe('National ID');
    // Only the first rule's query ran.
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('skips rules with missing fields', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([
      {
        id: 'r1',
        name: 'National ID',
        matchFields: ['nationalId'],
        priority: 1,
      },
      {
        id: 'r2',
        name: 'Phone + DOB',
        matchFields: ['phonePrimary', 'dateOfBirth'],
        priority: 2,
      },
    ]);
    // Second rule's query returns a match.
    findFirst.mockResolvedValueOnce({ id: 'cust-from-phone' });

    const result = await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
      // No nationalId → first rule skipped (no query).
      phonePrimary: '+233244567890',
      dateOfBirth: new Date('1990-01-15'),
    });

    expect(result?.matchedRule).toBe('Phone + DOB');
    // Only one query — the first rule was skipped at the in-memory check.
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('rule with only fullName as fields does NOT match arbitrary customers', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([
      {
        id: 'r-bad',
        name: 'fullName only',
        matchFields: ['fullName'],
        priority: 1,
      },
    ]);

    const result = await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
      fullName: 'John Doe',
    });

    // No DB query fired — the rule degenerated to tenantId + deletedAt
    // only, which would have matched everyone. Service correctly
    // returned null instead.
    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('handles malformed matchFields JSON gracefully', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([
      { id: 'r-bad', name: 'broken', matchFields: 'not-an-array', priority: 1 },
      {
        id: 'r2',
        name: 'National ID',
        matchFields: ['nationalId'],
        priority: 2,
      },
    ]);
    findFirst.mockResolvedValueOnce({ id: 'cust-1' });

    const result = await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
      nationalId: 'GHA-12345678',
    });

    // Broken rule was skipped; second rule fired and matched.
    expect(result?.matchedRule).toBe('National ID');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('filters by tenantId and excludes soft-deleted rows', async () => {
    const { service, findFirst, findMany } = makeService();
    findMany.mockResolvedValue([
      {
        id: 'r1',
        name: 'National ID',
        matchFields: ['nationalId'],
        priority: 1,
      },
    ]);
    findFirst.mockResolvedValue(null);

    await service.findDuplicate(TENANT_ID, {
      externalId: 'ext-1',
      nationalId: 'GHA-12345678',
    });

    const where = findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_ID);
    expect(where.deletedAt).toBeNull();
  });
});
