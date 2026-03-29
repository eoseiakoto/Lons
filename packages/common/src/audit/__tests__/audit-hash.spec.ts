import { computeEntryHash, verifyAuditChain } from '../audit-hash.util';

const BASE_DATE = new Date('2026-01-01T00:00:00.000Z');

function makeEntry(overrides: Partial<{
  id: string;
  createdAt: Date;
  action: string;
  resourceId: string | null;
  entryHash: string | null;
  previousHash: string | null;
}> = {}) {
  return {
    id: 'entry-1',
    createdAt: BASE_DATE,
    action: 'create',
    resourceId: 'res-1',
    entryHash: null,
    previousHash: null,
    ...overrides,
  };
}

describe('computeEntryHash', () => {
  it('is deterministic — same inputs produce the same hash', () => {
    const entry = makeEntry();
    const hash1 = computeEntryHash(entry, null);
    const hash2 = computeEntryHash(entry, null);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes when previousHash differs', () => {
    const entry = makeEntry();
    const hashA = computeEntryHash(entry, null);
    const hashB = computeEntryHash(entry, 'abc123');
    expect(hashA).not.toBe(hashB);
  });

  it('produces different hashes when the action differs', () => {
    const entry1 = makeEntry({ action: 'create' });
    const entry2 = makeEntry({ action: 'delete' });
    expect(computeEntryHash(entry1, null)).not.toBe(computeEntryHash(entry2, null));
  });

  it('returns a 64-character lowercase hex string (SHA-256)', () => {
    const hash = computeEntryHash(makeEntry(), null);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyAuditChain', () => {
  function buildValidChain(length: number) {
    const entries: ReturnType<typeof makeEntry>[] = [];
    let prevHash: string | null = null;

    for (let i = 0; i < length; i++) {
      const entry = makeEntry({
        id: `entry-${i + 1}`,
        createdAt: new Date(BASE_DATE.getTime() + i * 1000),
        action: 'create',
        resourceId: `res-${i + 1}`,
        previousHash: prevHash,
      });
      const hash = computeEntryHash(entry, prevHash);
      entry.entryHash = hash;
      prevHash = hash;
      entries.push(entry);
    }

    return entries;
  }

  it('returns valid: true for a correctly chained sequence', () => {
    const chain = buildValidChain(3);
    const result = verifyAuditChain(chain);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('returns valid: true for a single-entry chain', () => {
    const chain = buildValidChain(1);
    const result = verifyAuditChain(chain);
    expect(result.valid).toBe(true);
  });

  it('returns valid: true for an empty chain', () => {
    const result = verifyAuditChain([]);
    expect(result.valid).toBe(true);
  });

  it('detects tampering when an entryHash is manually altered', () => {
    const chain = buildValidChain(3);
    // Corrupt the hash of the second entry
    chain[1].entryHash = 'deadbeef'.repeat(8);

    const result = verifyAuditChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe('entry-2');
  });

  it('detects tampering when an action is modified without updating the hash', () => {
    const chain = buildValidChain(3);
    // Silently change the action on entry 3 (simulating data tampering)
    chain[2].action = 'write_off';

    const result = verifyAuditChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe('entry-3');
  });

  it('detects a broken previousHash link between entries', () => {
    const chain = buildValidChain(3);
    // Break the previousHash pointer on entry 2 so it no longer links to entry 1
    chain[1].previousHash = 'tampered-prev-hash';
    // Recompute its own hash to match the tampered previousHash
    chain[1].entryHash = computeEntryHash(chain[1], 'tampered-prev-hash');

    const result = verifyAuditChain(chain);
    // The chain should break at entry-2 because its previousHash no longer
    // matches the actual entryHash of entry-1.
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe('entry-2');
  });
});
