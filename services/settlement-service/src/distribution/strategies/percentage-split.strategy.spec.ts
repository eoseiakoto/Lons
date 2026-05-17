import { PercentageSplitStrategy } from './percentage-split.strategy';
import { DistributionInput } from '../distribution.types';
import { ValidationError } from '@lons/common';

describe('PercentageSplitStrategy', () => {
  const strategy = new PercentageSplitStrategy();

  const baseInput: DistributionInput = {
    totalRevenue: '10000.0000',
    periodStart: new Date('2026-05-01'),
    periodEnd: new Date('2026-05-31'),
  };

  it('splits revenue across all parties per their percentages', () => {
    const lines = strategy.calculate(baseInput, {
      parties: [
        { partyType: 'platform', partyId: 'lons-platform', percentage: '5.0000' },
        { partyType: 'sp', partyId: 'tenant-1', percentage: '75.0000' },
        { partyType: 'lender', partyId: 'lender-1', percentage: '20.0000' },
      ],
    });

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ partyType: 'platform', shareAmount: '500.0000' });
    expect(lines[1]).toMatchObject({ partyType: 'sp', shareAmount: '7500.0000' });
    expect(lines[2]).toMatchObject({ partyType: 'lender', shareAmount: '2000.0000' });
  });

  it('uses banker\'s rounding (round half to even) on share amounts', () => {
    // 333.3333% of 100 = 333.33333... → 4dp banker rounding produces 333.3333
    // Use a value that lands on .5 in the 5th place: 12.34565 × 50% = 6.172825 → 6.1728 (round to even)
    const lines = strategy.calculate(
      { ...baseInput, totalRevenue: '12.34565' },
      {
        parties: [{ partyType: 'sp', partyId: 't', percentage: '50.0000' }],
      },
    );
    // 12.34565 * 0.5 = 6.172825 → banker's round to 4dp → 6.1728 (8 is even)
    expect(lines[0].shareAmount).toBe('6.1728');
  });

  it('handles zero revenue', () => {
    const lines = strategy.calculate(
      { ...baseInput, totalRevenue: '0.0000' },
      {
        parties: [
          { partyType: 'platform', partyId: 'lons-platform', percentage: '5.0000' },
          { partyType: 'sp', partyId: 'tenant-1', percentage: '95.0000' },
        ],
      },
    );
    expect(lines[0].shareAmount).toBe('0.0000');
    expect(lines[1].shareAmount).toBe('0.0000');
  });

  it('stamps grossRevenue and sharePercentage on every line', () => {
    const lines = strategy.calculate(baseInput, {
      parties: [{ partyType: 'sp', partyId: 't', percentage: '100.0000' }],
    });
    expect(lines[0].grossRevenue).toBe('10000.0000');
    expect(lines[0].sharePercentage).toBe('100.0000');
  });

  describe('validation', () => {
    it('throws when config is missing', () => {
      expect(() => strategy.calculate(baseInput, null)).toThrow(ValidationError);
    });

    it('throws when parties array is empty', () => {
      expect(() => strategy.calculate(baseInput, { parties: [] })).toThrow(ValidationError);
    });

    it('throws when percentage is not a string', () => {
      expect(() =>
        strategy.calculate(baseInput, {
          parties: [{ partyType: 'sp', partyId: 't', percentage: 50 as unknown as string }],
        }),
      ).toThrow(/Decimal string/);
    });

    it('throws when partyType is missing', () => {
      expect(() =>
        strategy.calculate(baseInput, {
          parties: [{ partyType: '', partyId: 't', percentage: '50.0000' }],
        }),
      ).toThrow(/partyType/);
    });
  });
});
