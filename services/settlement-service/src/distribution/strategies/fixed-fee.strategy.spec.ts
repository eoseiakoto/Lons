import { FixedFeeStrategy } from './fixed-fee.strategy';
import { DistributionInput, FixedFeeConfig } from '../distribution.types';
import { ValidationError } from '@lons/common';

describe('FixedFeeStrategy', () => {
  const strategy = new FixedFeeStrategy();

  const config: FixedFeeConfig = {
    fixedFees: [
      { partyType: 'platform', partyId: 'lons-platform', amount: '5000.0000', currency: 'GHS' },
      { partyType: 'lender', partyId: 'lender-1', amount: '2000.0000', currency: 'GHS' },
    ],
    remainderParty: { partyType: 'sp', partyId: 'tenant-1' },
  };

  const baseInput: DistributionInput = {
    totalRevenue: '10000.0000',
    periodStart: new Date('2026-05-01'),
    periodEnd: new Date('2026-05-31'),
  };

  it('deducts fixed fees in order and assigns remainder', () => {
    const lines = strategy.calculate(baseInput, config);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ partyType: 'platform', shareAmount: '5000.0000' });
    expect(lines[1]).toMatchObject({ partyType: 'lender', shareAmount: '2000.0000' });
    expect(lines[2]).toMatchObject({ partyType: 'sp', partyId: 'tenant-1', shareAmount: '3000.0000' });
  });

  it('always emits the remainder line even when remainder is zero', () => {
    const lines = strategy.calculate({ ...baseInput, totalRevenue: '7000.0000' }, config);
    expect(lines).toHaveLength(3);
    expect(lines[2].shareAmount).toBe('0.0000');
    expect(lines[2].partyType).toBe('sp');
  });

  it('caps a fee at the remaining budget when revenue is insufficient', () => {
    const lines = strategy.calculate({ ...baseInput, totalRevenue: '5500.0000' }, config);
    // platform takes 5000, leaving 500. lender wants 2000 — capped at 500.
    expect(lines[0].shareAmount).toBe('5000.0000');
    expect(lines[1].shareAmount).toBe('500.0000');
    expect(lines[2].shareAmount).toBe('0.0000');
  });

  it('drives later fees to zero when budget is fully consumed by earlier fees', () => {
    const lines = strategy.calculate({ ...baseInput, totalRevenue: '5000.0000' }, config);
    expect(lines[0].shareAmount).toBe('5000.0000');
    expect(lines[1].shareAmount).toBe('0.0000');
    expect(lines[2].shareAmount).toBe('0.0000');
  });

  it('handles zero revenue', () => {
    const lines = strategy.calculate({ ...baseInput, totalRevenue: '0.0000' }, config);
    expect(lines[0].shareAmount).toBe('0.0000');
    expect(lines[1].shareAmount).toBe('0.0000');
    expect(lines[2].shareAmount).toBe('0.0000');
  });

  it('handles empty fixedFees (all revenue to remainder)', () => {
    const empty: FixedFeeConfig = { fixedFees: [], remainderParty: { partyType: 'sp', partyId: 't' } };
    const lines = strategy.calculate(baseInput, empty);
    expect(lines).toHaveLength(1);
    expect(lines[0].shareAmount).toBe('10000.0000');
  });

  it('caps remainder at 0 (never negative)', () => {
    // Construct over-deduction by passing huge fees, then a tiny budget.
    const overConfig: FixedFeeConfig = {
      fixedFees: [{ partyType: 'platform', partyId: 'lons-platform', amount: '99999.0000' }],
      remainderParty: { partyType: 'sp', partyId: 't' },
    };
    const lines = strategy.calculate({ ...baseInput, totalRevenue: '100.0000' }, overConfig);
    expect(lines[0].shareAmount).toBe('100.0000');
    expect(lines[1].shareAmount).toBe('0.0000');
  });

  it('stamps grossRevenue on every line', () => {
    const lines = strategy.calculate(baseInput, config);
    for (const l of lines) {
      expect(l.grossRevenue).toBe('10000.0000');
    }
  });

  describe('validation', () => {
    it('throws on missing config', () => {
      expect(() => strategy.calculate(baseInput, null)).toThrow(ValidationError);
    });

    it('throws when remainderParty is missing', () => {
      expect(() =>
        strategy.calculate(baseInput, { fixedFees: [], remainderParty: undefined } as unknown as FixedFeeConfig),
      ).toThrow(/remainderParty/);
    });

    it('throws when fee amount is not a string', () => {
      expect(() =>
        strategy.calculate(baseInput, {
          fixedFees: [{ partyType: 'p', partyId: 'p1', amount: 100 as unknown as string }],
          remainderParty: { partyType: 'sp', partyId: 't' },
        }),
      ).toThrow(/Decimal string/);
    });
  });
});
