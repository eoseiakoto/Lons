import { aggregateCustomFactors, normalizeBureauScore } from './feature-normalizer';

describe('normalizeBureauScore', () => {
  it('maps mid-range scores correctly', () => {
    expect(normalizeBureauScore(575, { min: 300, max: 850 })).toBe(50);
  });

  it('caps at 100 for above-max scores', () => {
    expect(normalizeBureauScore(900, { min: 300, max: 850 })).toBe(100);
  });

  it('floors at 0 for below-min scores', () => {
    expect(normalizeBureauScore(100, { min: 300, max: 850 })).toBe(0);
  });

  it('maps min and max exactly', () => {
    expect(normalizeBureauScore(300, { min: 300, max: 850 })).toBe(0);
    expect(normalizeBureauScore(850, { min: 300, max: 850 })).toBe(100);
  });

  it('respects a custom target range', () => {
    expect(
      normalizeBureauScore(700, { min: 0, max: 1000 }, { min: 0, max: 10 }),
    ).toBe(7);
  });

  it('throws when sourceRange is invalid', () => {
    expect(() => normalizeBureauScore(500, { min: 850, max: 300 })).toThrow();
  });
});

describe('aggregateCustomFactors', () => {
  it('returns null for empty/missing input', () => {
    expect(aggregateCustomFactors(null)).toBeNull();
    expect(aggregateCustomFactors(undefined)).toBeNull();
    expect(aggregateCustomFactors({})).toBeNull();
  });

  it('averages numeric values', () => {
    expect(aggregateCustomFactors({ a: 60, b: 80 })).toBe(70);
  });

  it('ignores non-numeric values', () => {
    expect(
      aggregateCustomFactors({ a: 50, b: 'high', c: true, d: 70 }),
    ).toBe(60);
  });

  it('clamps numeric values into [0,100]', () => {
    expect(aggregateCustomFactors({ a: -10, b: 200 })).toBe(50);
  });

  it('returns null when no numeric values present', () => {
    expect(aggregateCustomFactors({ a: 'low', b: 'medium' })).toBeNull();
  });
});
