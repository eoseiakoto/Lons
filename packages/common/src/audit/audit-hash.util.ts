import * as crypto from 'crypto';

export interface AuditHashEntry {
  id: string;
  createdAt: Date;
  action: string;
  resourceId?: string | null;
  entryHash?: string | null;
  previousHash?: string | null;
}

/**
 * Compute a SHA-256 hash for an audit log entry, chaining it to the
 * previous entry's hash. This creates a tamper-evident linked chain.
 */
export function computeEntryHash(
  entry: Pick<AuditHashEntry, 'id' | 'createdAt' | 'action' | 'resourceId'>,
  previousHash: string | null,
): string {
  const payload = [
    entry.id,
    entry.createdAt.toISOString(),
    entry.action,
    entry.resourceId ?? '',
    previousHash ?? '',
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Verify the integrity of an ordered (ASC by createdAt) sequence of audit
 * log entries by recomputing each entry's hash and comparing it to the
 * stored value.
 *
 * Returns `{ valid: true }` when the chain is intact, or
 * `{ valid: false, brokenAt: <entry id> }` for the first entry where a
 * mismatch is detected.
 */
export function verifyAuditChain(
  entries: AuditHashEntry[],
): { valid: boolean; brokenAt?: string } {
  let runningPreviousHash: string | null = null;

  for (const entry of entries) {
    const expected = computeEntryHash(entry, runningPreviousHash);

    if (entry.entryHash !== expected) {
      return { valid: false, brokenAt: entry.id };
    }

    runningPreviousHash = entry.entryHash ?? null;
  }

  return { valid: true };
}
