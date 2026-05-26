import { TieredStrategy } from './tiered.strategy';
import { DistributionInput, TieredConfig } from '../distribution.types';
import { ValidationError } from '@lons/common';

describe('TieredStrategy', () => {
  const strategy = new TieredStrategy();

  const config: TieredConfig = {
    basedOn: 'monthly_disbursement_volume',
    tiers: [
      { upTo: '500000.0000', platformPercentage: '8.0000' },
      { upTo: '2000000.0000', platformPercentage: '5.0000' },
      { upTo: null, platformPercentage: '3.0000' },
    ],
    parties: [
      { partyType: 'platform', partyId: 'lons-platform', source: 'tiered' },
      { partyType: 'sp', partyId: 'tenant-7', source: 'remainder' },
    ],
  };

  const baseInput: DistributionInput = {
    totalRevenue: '10000.0000',
    periodStart: new Date('2026-05-01'),
    periodEnd: new Date('2026-05-31'),
  };

  it('selects the lowest tier when volume is small', () => {
    const lines = strategy.calculate(
      { ...baseInput, monthlyDisbursementVolume: '100000.0000' },
      config,
    );
    expect(lines[0].sharePercentage).toBe('8.0000');
    expect(lines[0].shareAmount).toBe('800.0000');
    expect(lines[1].shareAmount).toBe('9200.0000');
    expect(lines[1].sharePercentage).toBe('92.0000');
  });

  it('selects the middle tier at the exact boundary (boundary belongs to lower tier)', () => {
    const lines = strategy.calculate(
      { ...baseInput, monthlyDisbursementVolume: '500000.0000' },
      config,
    );
    // 500000 is the upTo of tier 1 (8%), so it belongs to tier 1.
    expect(lines[0].sharePercentage).toBe('8.0000');
  });

  it('selects the middle tier just above the lower boundary', () => {
    const lines = strategy.calculate(
      { ...baseInput, monthlyDisbursementVolume: '500000.0001' },
      config,
    );
    expect(lines[0].sharePercentage).toBe('5.0000');
  });

  it('selects the unbounded top tier when volume exceeds all numeric bounds', () => {
    const lines = strategy.calculate(
      { ...baseInput, monthlyDisbursementVolume: '5000000.0000' },
      config,
    );
    expect(lines[0].sharePercentage).toBe('3.0000');
    expect(lines[0].shareAmount).toBe('300.0000');
    expect(lines[1].shareAmount).toBe('9700.0000');
  });

  it('uses 0 volume when monthlyDisbursementVolume is omitted (lowest tier)', () => {
    const lines = strategy.calculate(baseInput, config);
    expect(lines[0].sharePercentage).toBe('8.0000');
  });

  it('uses the configured sp partyId from parties block', () => {
    const lines = strategy.calculate(
      { ...baseInput, monthlyDisbursementVolume: '100000' },
      config,
    );
    expect(lines[1].partyId).toBe('tenant-7');
  });

  it('falls back to canonical partyIds when parties block is missing', () => {
    const lines = strategy.calculate(
      { ...baseInput, monthlyDisbursementVolume: '100000' },
      { ...config, parties: undefined },
    );
    expect(lines[0].partyId).toBe('lons-platform');
    expect(lines[1].partyId).toBe('remainder');
  });

  it('handles zero revenue', () => {
    const lines = strategy.calculate(
      { ...baseInput, totalRevenue: '0.0000', monthlyDisbursementVolume: '100000' },
      config,
    );
    expect(lines[0].shareAmount).toBe('0.0000');
    expect(lines[1].shareAmount).toBe('0.0000');
  });

  it('handles unsorted tiers correctly', () => {
    const unsorted: TieredConfig = {
      tiers: [
        { upTo: null, platformPercentage: '3.0000' },
        { upTo: '500000.0000', platformPercentage: '8.0000' },
        { upTo: '2000000.0000', platformPercentage: '5.0000' },
      ],
    };
    const lines = strategy.calculate(
      { ...baseInput, monthlyDisbursementVolume: '300000' },
      unsorted,
    );
    expect(lines[0].sharePercentage).toBe('8.0000');
  });

  it('falls back to the last tier if no upper bound satisfies and no null tier exists', () => {
    const config: TieredConfig = {
      tiers: [
        { upTo: '100.0000', platformPercentage: '10.0000' },
        { upTo: '200.0000', platformPercentage: '5.0000' },
      ],
    };
    const lines = strategy.calculate(
      { ...baseInput, monthlyDisbursementVolume: '10000' },
      config,
    );
    expect(lines[0].sharePercentage).toBe('5.0000');
  });

  describe('validation', () => {
    it('throws on missing config', () => {
      expect(() => strategy.calculate(baseInput, null)).toThrow(ValidationError);
    });

    it('throws on empty tiers', () => {
      expect(() => strategy.calculate(baseInput, { tiers: [] })).toThrow(/non-empty tiers/);
    });

    it('throws when upTo is wrong type', () => {
      expect(() =>
        strategy.calculate(baseInput, {
          tiers: [{ upTo: 500 as unknown as string, platformPercentage: '5' }],
        }),
      ).toThrow(/upTo/);
    });

    // ── F-S18-9-A semantic checks ──────────────────────────────────
    // Sprint 18 PM review flagged that the strategy validated shape
    // but not the boundary semantics of the tier list. Adding tests
    // here locks in the behaviour so the next person editing the
    // validator can't accidentally regress it.

    it('throws when two tiers share the same upTo (duplicate boundary)', () => {
      expect(() =>
        strategy.calculate(baseInput, {
          tiers: [
            { upTo: '1000', platformPercentage: '8' },
            { upTo: '1000', platformPercentage: '5' }, // duplicate
            { upTo: null, platformPercentage: '3' },
          ],
        }),
      ).toThrow(/strictly ascending|overlap or duplicate/);
    });

    it('throws when more than one tier is unbounded (multiple null upTo)', () => {
      expect(() =>
        strategy.calculate(baseInput, {
          tiers: [
            { upTo: '1000', platformPercentage: '8' },
            { upTo: null, platformPercentage: '5' },
            { upTo: null, platformPercentage: '3' }, // second null
          ],
        }),
      ).toThrow(/at most one tier with upTo: null/);
    });

    it('throws when platformPercentage is outside [0, 100]', () => {
      expect(() =>
        strategy.calculate(baseInput, {
          tiers: [
            { upTo: '1000', platformPercentage: '110' }, // > 100
            { upTo: null, platformPercentage: '3' },
          ],
        }),
      ).toThrow(/between 0 and 100/);

      expect(() =>
        strategy.calculate(baseInput, {
          tiers: [
            { upTo: '1000', platformPercentage: '-5' }, // negative
            { upTo: null, platformPercentage: '3' },
          ],
        }),
      ).toThrow(/between 0 and 100/);
    });

    it('throws when upTo is zero or negative', () => {
      expect(() =>
        strategy.calculate(baseInput, {
          tiers: [
            { upTo: '0', platformPercentage: '8' },
            { upTo: null, platformPercentage: '3' },
          ],
        }),
      ).toThrow(/positive Decimal/);

      expect(() =>
        strategy.calculate(baseInput, {
          tiers: [
            { upTo: '-100', platformPercentage: '8' },
            { upTo: null, platformPercentage: '3' },
          ],
        }),
      ).toThrow(/positive Decimal/);
    });

    it('accepts a valid ascending config with a null top tier', () => {
      expect(() =>
        strategy.calculate(
          { ...baseInput, monthlyDisbursementVolume: '100' },
          {
            tiers: [
              { upTo: '500', platformPercentage: '8' },
              { upTo: '2000', platformPercentage: '5' },
              { upTo: null, platformPercentage: '3' },
            ],
          },
        ),
      ).not.toThrow();
    });

    it('accepts a valid config with NO null top tier (closed-set tiers)', () => {
      // Operators can choose to cap the model — anything above the
      // last numeric upTo falls through to the highest-tier rate by
      // the strategy's "fall back to last" branch.
      expect(() =>
        strategy.calculate(
          { ...baseInput, monthlyDisbursementVolume: '100' },
          {
            tiers: [
              { upTo: '500', platformPercentage: '8' },
              { upTo: '2000', platformPercentage: '5' },
            ],
          },
        ),
      ).not.toThrow();
    });
  });
});
