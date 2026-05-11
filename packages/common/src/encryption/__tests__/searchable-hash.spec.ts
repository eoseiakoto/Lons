/**
 * Security Hardening (SEC-5) — searchable-hash util tests.
 *
 * Verifies the HMAC-SHA-256 implementation, the pepper requirement, and
 * the determinism + null-handling contract that callers rely on.
 *
 * `HASH_PEPPER` is set globally by `packages/common/jest.setup.ts`. We
 * use `__resetPepperCacheForTests` to clear the module cache between
 * tests that need a different pepper.
 */
import * as crypto from 'crypto';

import {
  computeSearchableHash,
  computeEmailHash,
  computeTaxIdHash,
  computeRegistrationNumberHash,
  __resetPepperCacheForTests,
} from '../searchable-hash.util';

describe('computeSearchableHash (SEC-5)', () => {
  // Restore the test pepper after every mutation so other suites in the
  // same process see a sane value.
  const ORIGINAL_PEPPER = process.env.HASH_PEPPER;

  afterEach(() => {
    process.env.HASH_PEPPER = ORIGINAL_PEPPER;
    __resetPepperCacheForTests();
  });

  it('returns a 64-char hex string for a non-empty input', () => {
    const out = computeSearchableHash('user@example.com');
    expect(out).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input + same pepper → same output', () => {
    const a = computeSearchableHash('user@example.com');
    const b = computeSearchableHash('user@example.com');
    expect(a).toBe(b);
  });

  it('normalises trim + case — different inputs produce the same hash', () => {
    expect(computeSearchableHash('John@Example.com')).toBe(
      computeSearchableHash('  john@example.com  '),
    );
  });

  it('returns null for null / undefined / empty / whitespace-only', () => {
    expect(computeSearchableHash(null)).toBeNull();
    expect(computeSearchableHash(undefined)).toBeNull();
    expect(computeSearchableHash('')).toBeNull();
    expect(computeSearchableHash('   ')).toBeNull();
  });

  it('different inputs produce different hashes (collision sanity)', () => {
    expect(computeSearchableHash('REG-1')).not.toBe(
      computeSearchableHash('REG-2'),
    );
  });

  // SEC-5: HMAC vs plain SHA-256 — the exported hash MUST differ from a
  // plain SHA-256 of the same input. If it matches, the pepper is not
  // being applied and the security model is broken.
  it('uses HMAC keyed by HASH_PEPPER — output ≠ plain SHA-256', () => {
    const input = 'security-hardening-test';
    const ours = computeSearchableHash(input);
    const plain = crypto.createHash('sha256').update(input).digest('hex');
    expect(ours).not.toBe(plain);
  });

  // SEC-5: rotating the pepper must produce different hashes — otherwise
  // pepper rotation would silently leave cached lookups intact.
  it('different pepper → different hash for the same input', () => {
    __resetPepperCacheForTests();
    process.env.HASH_PEPPER = 'a'.repeat(40);
    const a = computeSearchableHash('shared-input');

    __resetPepperCacheForTests();
    process.env.HASH_PEPPER = 'b'.repeat(40);
    const b = computeSearchableHash('shared-input');

    expect(a).not.toBe(b);
  });

  // SEC-5: failing closed when pepper is missing is intentional — silent
  // success would let every hash collide on a constant value.
  it('throws when HASH_PEPPER is unset', () => {
    __resetPepperCacheForTests();
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      process.env,
      'HASH_PEPPER',
    );
    delete process.env.HASH_PEPPER;
    try {
      expect(() => computeSearchableHash('anything')).toThrow(
        /HASH_PEPPER/,
      );
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(process.env, 'HASH_PEPPER', originalDescriptor);
      }
    }
  });

  it('throws when HASH_PEPPER is too short', () => {
    __resetPepperCacheForTests();
    process.env.HASH_PEPPER = 'short';
    expect(() => computeSearchableHash('anything')).toThrow(
      /at least 32 characters/,
    );
  });

  it('aliases (computeEmailHash, computeTaxIdHash, ...) are equivalent to computeSearchableHash', () => {
    const v = 'alias-equivalence-test';
    const expected = computeSearchableHash(v);
    expect(computeEmailHash(v)).toBe(expected);
    expect(computeTaxIdHash(v)).toBe(expected);
    expect(computeRegistrationNumberHash(v)).toBe(expected);
  });
});
