import { Prisma } from '@prisma/client';
import { calculateDailyPenalty, parseRateTiers, PenaltyRateTier } from '../penalty-calculator';

/**
 * S19-6 — penalty calculator policy-lock tests.
 *
 * Coverage:
 *   - Simple vs compound mode arithmetic.
 *   - Per-DPD tier selection (boundary inclusion + unlimited final tier).
 *   - Cap enforcement (against original principal, not outstanding).
 *   - DPD <= 0 short-circuits to zero.
 *   - No matching tier → zero (defensive).
 *   - parseRateTiers validation.
 *
 * All math uses Prisma.Decimal / decimal strings — assertions check
 * the .toString() form rather than numeric equality.
 */

const TIERS_3_BAND: PenaltyRateTier[] = [
  { fromDpd: 1, toDpd: 30, dailyRateBps: '10.00' },   // 0.10 % per day
  { fromDpd: 31, toDpd: 60, dailyRateBps: '20.00' },  // 0.20 % per day
  { fromDpd: 61, toDpd: null, dailyRateBps: '30.00' }, // 0.30 % per day, unlimited
];

describe('calculateDailyPenalty — simple mode', () => {
  it('returns zero when DPD = 0', () => {
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('0'),
      currentDpd: 0,
      mode: 'simple',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: null,
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('0');
  });

  it('uses tier 1 rate on day 1 (0.10 % of 1000 = 1.00)', () => {
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('0'),
      currentDpd: 1,
      mode: 'simple',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: null,
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('1');
  });

  it('uses tier 2 rate at DPD 45 (0.20 % of 1000 = 2.00)', () => {
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('100'),
      currentDpd: 45,
      mode: 'simple',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: null,
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('2');
  });

  it('uses tier 3 rate at DPD 100 (unlimited final tier)', () => {
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('500'),
      currentDpd: 100,
      mode: 'simple',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: null,
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('3');
  });

  it('simple mode IGNORES accumulated penalty in base calculation', () => {
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('500'), // ignored in simple
      currentDpd: 1,
      mode: 'simple',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: null,
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    // 1000 * 0.001 = 1.00 (NOT 1500 * 0.001)
    expect(r.toString()).toBe('1');
  });
});

describe('calculateDailyPenalty — compound mode', () => {
  it('adds accumulated penalty to base', () => {
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('500'),
      currentDpd: 1,
      mode: 'compound',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: null,
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    // (1000 + 500) * 0.001 = 1.50
    expect(r.toString()).toBe('1.5');
  });

  it('compounds penalty growth across DPD bands', () => {
    // At DPD 50, tier 2 = 0.20 %; base = 1000 + 200 = 1200; penalty = 2.40
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('200'),
      currentDpd: 50,
      mode: 'compound',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: null,
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('2.4');
  });
});

describe('calculateDailyPenalty — cap enforcement', () => {
  it('caps when accumulated + today would exceed maxPenaltyPct', () => {
    // Original 1000, cap 50 %. Accumulated 499, today would be 1.50,
    // but cap is 500 → today is allowed only 1.00.
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1500'),
      accumulatedPenalty: new Prisma.Decimal('499'),
      currentDpd: 1,
      mode: 'compound',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: new Prisma.Decimal('50'),
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('1');
  });

  it('returns zero when already at the cap', () => {
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('500'),
      currentDpd: 1,
      mode: 'simple',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: new Prisma.Decimal('50'),
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('0');
  });

  it('returns zero (clamped, not negative) when accumulated already exceeds cap', () => {
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('600'),
      currentDpd: 1,
      mode: 'simple',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: new Prisma.Decimal('50'),
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('0');
  });

  it('cap is based on ORIGINAL principal, NOT current outstanding', () => {
    // Original 10000, outstanding 5000 (half paid), cap 10 % → ceiling 1000.
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('5000'),
      accumulatedPenalty: new Prisma.Decimal('999'),
      currentDpd: 1,
      mode: 'simple',
      rateTiers: TIERS_3_BAND,
      maxPenaltyPct: new Prisma.Decimal('10'),
      originalPrincipal: new Prisma.Decimal('10000'),
    });
    // Today raw = 5000 * 0.001 = 5.00; cap-room = 1000 - 999 = 1.00 → 1.00
    expect(r.toString()).toBe('1');
  });
});

describe('calculateDailyPenalty — defensive', () => {
  it('returns zero when DPD falls in a gap (no matching tier)', () => {
    const gapped: PenaltyRateTier[] = [
      { fromDpd: 5, toDpd: 30, dailyRateBps: '10.00' }, // skips days 1-4
    ];
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('0'),
      currentDpd: 2,
      mode: 'simple',
      rateTiers: gapped,
      maxPenaltyPct: null,
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('0');
  });

  it('handles empty rateTiers as no-op', () => {
    const r = calculateDailyPenalty({
      principalOutstanding: new Prisma.Decimal('1000'),
      accumulatedPenalty: new Prisma.Decimal('0'),
      currentDpd: 10,
      mode: 'simple',
      rateTiers: [],
      maxPenaltyPct: null,
      originalPrincipal: new Prisma.Decimal('1000'),
    });
    expect(r.toString()).toBe('0');
  });
});

describe('parseRateTiers — validation', () => {
  it('accepts a valid array', () => {
    const out = parseRateTiers([
      { fromDpd: 1, toDpd: 30, dailyRateBps: '10.00' },
      { fromDpd: 31, toDpd: null, dailyRateBps: '20.00' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].toDpd).toBeNull();
  });

  it('rejects non-array', () => {
    expect(() => parseRateTiers('not an array')).toThrow(/must be a JSON array/);
  });

  it('rejects entry with wrong shape', () => {
    expect(() => parseRateTiers([{ fromDpd: '1' }])).toThrow(/fromDpd must be a number/);
  });

  it('rejects toDpd that is not number or null', () => {
    expect(() => parseRateTiers([{ fromDpd: 1, toDpd: 'x', dailyRateBps: '10' }])).toThrow(
      /toDpd must be a number or null/,
    );
  });

  it('rejects dailyRateBps as number (must be string per money rule)', () => {
    expect(() => parseRateTiers([{ fromDpd: 1, toDpd: null, dailyRateBps: 10 }])).toThrow(
      /dailyRateBps must be a decimal string/,
    );
  });
});
