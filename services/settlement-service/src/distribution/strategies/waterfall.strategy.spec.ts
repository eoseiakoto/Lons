import { WaterfallStrategy } from './waterfall.strategy';
import { DistributionInput, WaterfallConfig } from '../distribution.types';
import { ValidationError } from '@lons/common';

describe('WaterfallStrategy', () => {
  const strategy = new WaterfallStrategy();

  const config: WaterfallConfig = {
    waterfall: [
      { partyType: 'platform', partyId: 'lons-platform', deduction: { type: 'percentage', value: '5.0000' } },
      { partyType: 'lender', partyId: 'lender-1', deduction: { type: 'fixed', value: '1000.0000' } },
      { partyType: 'sp', partyId: 'tenant-1', deduction: { type: 'remainder' } },
    ],
  };

  const baseInput: DistributionInput = {
    totalRevenue: '10000.0000',
    periodStart: new Date('2026-05-01'),
    periodEnd: new Date('2026-05-31'),
  };

  it('walks the waterfall sequentially', () => {
    const lines = strategy.calculate(baseInput, config);

    // Step 1: 5% of 10000 = 500 → platform
    // Remaining: 9500
    // Step 2: fixed 1000 → lender
    // Remaining: 8500
    // Step 3: remainder = 8500 → sp
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ partyType: 'platform', shareAmount: '500.0000', sharePercentage: '5.0000' });
    expect(lines[1]).toMatchObject({ partyType: 'lender', shareAmount: '1000.0000', sharePercentage: '0' });
    expect(lines[2]).toMatchObject({ partyType: 'sp', shareAmount: '8500.0000', sharePercentage: '0' });
  });

  it('applies percentage to remaining balance (not original gross)', () => {
    const cfg: WaterfallConfig = {
      waterfall: [
        { partyType: 'a', partyId: 'a', deduction: { type: 'fixed', value: '5000.0000' } },
        { partyType: 'b', partyId: 'b', deduction: { type: 'percentage', value: '10.0000' } },
        { partyType: 'c', partyId: 'c', deduction: { type: 'remainder' } },
      ],
    };
    const lines = strategy.calculate(baseInput, cfg);
    // After a takes 5000, remaining is 5000. 10% of 5000 = 500 (NOT 1000).
    expect(lines[0].shareAmount).toBe('5000.0000');
    expect(lines[1].shareAmount).toBe('500.0000');
    expect(lines[2].shareAmount).toBe('4500.0000');
  });

  it('caps fixed deduction at remaining balance', () => {
    const cfg: WaterfallConfig = {
      waterfall: [
        { partyType: 'a', partyId: 'a', deduction: { type: 'fixed', value: '6000.0000' } },
        { partyType: 'b', partyId: 'b', deduction: { type: 'fixed', value: '5000.0000' } },
        { partyType: 'c', partyId: 'c', deduction: { type: 'remainder' } },
      ],
    };
    const lines = strategy.calculate(baseInput, cfg);
    expect(lines[0].shareAmount).toBe('6000.0000');
    expect(lines[1].shareAmount).toBe('4000.0000'); // capped
    expect(lines[2].shareAmount).toBe('0.0000');
  });

  it('handles zero revenue', () => {
    const lines = strategy.calculate({ ...baseInput, totalRevenue: '0.0000' }, config);
    expect(lines[0].shareAmount).toBe('0.0000');
    expect(lines[1].shareAmount).toBe('0.0000');
    expect(lines[2].shareAmount).toBe('0.0000');
  });

  it('caps remainder at 0 (never negative)', () => {
    const cfg: WaterfallConfig = {
      waterfall: [
        { partyType: 'a', partyId: 'a', deduction: { type: 'fixed', value: '15000.0000' } },
        { partyType: 'b', partyId: 'b', deduction: { type: 'remainder' } },
      ],
    };
    const lines = strategy.calculate(baseInput, cfg);
    expect(lines[0].shareAmount).toBe('10000.0000'); // capped at total
    expect(lines[1].shareAmount).toBe('0.0000');
  });

  it('uses banker\'s rounding on percentage steps', () => {
    const cfg: WaterfallConfig = {
      waterfall: [
        // 50% of 12.34565 = 6.172825 → banker's round to 4dp = 6.1728
        { partyType: 'a', partyId: 'a', deduction: { type: 'percentage', value: '50.0000' } },
        { partyType: 'b', partyId: 'b', deduction: { type: 'remainder' } },
      ],
    };
    const lines = strategy.calculate({ ...baseInput, totalRevenue: '12.34565' }, cfg);
    expect(lines[0].shareAmount).toBe('6.1728');
    // 12.34565 - 6.1728 = 6.17285. Banker's round to 4dp: drop "5",
    // preceding digit "8" is even, so round down → 6.1728.
    expect(lines[1].shareAmount).toBe('6.1728');
  });

  it('handles multiple percentage steps compounding', () => {
    const cfg: WaterfallConfig = {
      waterfall: [
        { partyType: 'a', partyId: 'a', deduction: { type: 'percentage', value: '50.0000' } },
        { partyType: 'b', partyId: 'b', deduction: { type: 'percentage', value: '50.0000' } },
        { partyType: 'c', partyId: 'c', deduction: { type: 'remainder' } },
      ],
    };
    const lines = strategy.calculate(baseInput, cfg);
    // Step 1: 5000, remaining 5000
    // Step 2: 50% of 5000 = 2500, remaining 2500
    // Step 3: 2500
    expect(lines[0].shareAmount).toBe('5000.0000');
    expect(lines[1].shareAmount).toBe('2500.0000');
    expect(lines[2].shareAmount).toBe('2500.0000');
  });

  it('stamps grossRevenue on every line (original total, not remaining)', () => {
    const lines = strategy.calculate(baseInput, config);
    for (const l of lines) {
      expect(l.grossRevenue).toBe('10000.0000');
    }
  });

  describe('validation', () => {
    it('throws on missing config', () => {
      expect(() => strategy.calculate(baseInput, null)).toThrow(ValidationError);
    });

    it('throws on empty waterfall', () => {
      expect(() => strategy.calculate(baseInput, { waterfall: [] })).toThrow(/non-empty/);
    });

    it('throws on missing deduction.value for percentage', () => {
      const cfg = {
        waterfall: [{ partyType: 'a', partyId: 'a', deduction: { type: 'percentage' } }],
      };
      expect(() => strategy.calculate(baseInput, cfg)).toThrow(/percentage step requires/);
    });

    it('throws on missing deduction.value for fixed', () => {
      const cfg = {
        waterfall: [{ partyType: 'a', partyId: 'a', deduction: { type: 'fixed' } }],
      };
      expect(() => strategy.calculate(baseInput, cfg)).toThrow(/fixed step requires/);
    });

    it('throws on unknown deduction type', () => {
      const cfg = {
        waterfall: [{ partyType: 'a', partyId: 'a', deduction: { type: 'mystery' } }],
      };
      expect(() => strategy.calculate(baseInput, cfg)).toThrow(/Unknown waterfall deduction/);
    });
  });
});
