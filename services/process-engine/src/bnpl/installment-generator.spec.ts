/**
 * Installment generator — Sprint 11 Track B / B6. Pure function with
 * Decimal-precision invariants: the sum of `amount` across rows must
 * equal `totalRepayable` exactly, no rounding loss.
 */

import { generateInstallmentSchedule } from './installment-generator';

const ASOF = new Date('2026-05-02T00:00:00Z');

describe('generateInstallmentSchedule', () => {
  describe('input validation', () => {
    it('rejects non-positive purchaseAmount', () => {
      expect(() =>
        generateInstallmentSchedule({
          purchaseAmount: '0',
          numberOfInstallments: 3,
          interestRate: '0',
          asOf: ASOF,
        }),
      ).toThrow(/positive/);
    });

    it('rejects non-integer or zero numberOfInstallments', () => {
      expect(() =>
        generateInstallmentSchedule({
          purchaseAmount: '100',
          numberOfInstallments: 0,
          interestRate: '0',
          asOf: ASOF,
        }),
      ).toThrow(/positive integer/);
    });

    it('rejects negative interestRate', () => {
      expect(() =>
        generateInstallmentSchedule({
          purchaseAmount: '100',
          numberOfInstallments: 3,
          interestRate: '-0.05',
          asOf: ASOF,
        }),
      ).toThrow(/non-negative/);
    });
  });

  describe('zero-interest happy path', () => {
    it('splits a 120.00 purchase into 3 equal 40.00 installments', () => {
      const out = generateInstallmentSchedule({
        purchaseAmount: '120.00',
        numberOfInstallments: 3,
        interestRate: '0',
        asOf: ASOF,
      });

      expect(out.totalRepayable).toBe('120.0000');
      expect(out.totalInterest).toBe('0');
      expect(out.installments).toHaveLength(3);
      expect(out.installments.map((i) => i.amount)).toEqual([
        '40.0000',
        '40.0000',
        '40.0000',
      ]);
    });

    it('first installment due asOf when deferral is 0', () => {
      const out = generateInstallmentSchedule({
        purchaseAmount: '90',
        numberOfInstallments: 3,
        interestRate: '0',
        asOf: ASOF,
      });
      expect(out.installments[0].dueDate.toISOString()).toBe('2026-05-02T00:00:00.000Z');
    });

    it('honors firstInstallmentDeferralDays', () => {
      const out = generateInstallmentSchedule({
        purchaseAmount: '90',
        numberOfInstallments: 3,
        interestRate: '0',
        firstInstallmentDeferralDays: 30,
        asOf: ASOF,
      });
      // 2026-05-02 + 30 days = 2026-06-01
      expect(out.installments[0].dueDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
      // Subsequent at +30 day cadence
      expect(out.installments[1].dueDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(out.installments[2].dueDate.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    });
  });

  describe('rounding invariant', () => {
    it('absorbs odd-cents remainder into the last installment', () => {
      // 100 / 3 = 33.3333… × 3 = 99.9999. Last row must absorb the 0.0001
      // so the sum equals the principal exactly.
      const out = generateInstallmentSchedule({
        purchaseAmount: '100',
        numberOfInstallments: 3,
        interestRate: '0',
        asOf: ASOF,
      });

      const sum = out.installments.reduce(
        (acc, i) => add4dp(acc, i.amount),
        '0.0000',
      );
      expect(sum).toBe('100.0000');
      // First (n-1) rows are the base amount; the last absorbs.
      expect(out.installments[0].amount).toBe('33.3333');
      expect(out.installments[1].amount).toBe('33.3333');
      expect(out.installments[2].amount).toBe('33.3334');
    });

    it('preserves principal sum even with non-zero interest', () => {
      const out = generateInstallmentSchedule({
        purchaseAmount: '1000',
        numberOfInstallments: 6,
        interestRate: '0.12',
        asOf: ASOF,
      });

      const principalSum = out.installments.reduce(
        (acc, i) => add4dp(acc, i.principalPortion),
        '0.0000',
      );
      const interestSum = out.installments.reduce(
        (acc, i) => add4dp(acc, i.interestPortion),
        '0.0000',
      );
      const amountSum = out.installments.reduce(
        (acc, i) => add4dp(acc, i.amount),
        '0.0000',
      );
      expect(principalSum).toBe('1000.0000');
      expect(interestSum).toBe(out.totalInterest);
      expect(amountSum).toBe(out.totalRepayable);
    });
  });

  describe('interest computation', () => {
    it('charges interest = purchase × rate × tenorDays / 365', () => {
      // 1000 × 0.12 × (3 × 30 / 365) = 1000 × 0.12 × 0.246575… = 29.5890
      const out = generateInstallmentSchedule({
        purchaseAmount: '1000',
        numberOfInstallments: 3,
        interestRate: '0.12',
        asOf: ASOF,
      });
      expect(out.totalInterest).toBe('29.5890');
      expect(out.totalRepayable).toBe('1029.5890');
    });

    it('waives interest entirely when full tenor fits within zeroInterestDays', () => {
      const out = generateInstallmentSchedule({
        purchaseAmount: '1000',
        numberOfInstallments: 3,
        interestRate: '0.20',
        installmentIntervalDays: 30,
        zeroInterestDays: 90, // exactly the tenor
        asOf: ASOF,
      });
      expect(out.totalInterest).toBe('0');
      expect(out.totalRepayable).toBe('1000.0000');
    });

    it('charges full interest when tenor exceeds zeroInterestDays even by one day', () => {
      const out = generateInstallmentSchedule({
        purchaseAmount: '1000',
        numberOfInstallments: 4, // 4 × 30 = 120 days
        interestRate: '0.10',
        zeroInterestDays: 90,
        asOf: ASOF,
      });
      expect(out.totalInterest).not.toBe('0');
    });
  });

  describe('UTC date stability', () => {
    it('produces UTC-midnight dueDates regardless of input local time', () => {
      const out = generateInstallmentSchedule({
        purchaseAmount: '90',
        numberOfInstallments: 3,
        interestRate: '0',
        asOf: new Date('2026-05-02T23:59:59Z'),
      });
      expect(out.installments[0].dueDate.toISOString()).toBe('2026-05-02T00:00:00.000Z');
      expect(out.installments[1].dueDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    });
  });
});

/** Tiny helper to add 4dp Decimal strings without pulling in decimal.js here. */
function add4dp(a: string, b: string): string {
  const toUnits = (s: string) => {
    const [intPart, fracPart = ''] = s.split('.');
    const sign = intPart.startsWith('-') ? -1n : 1n;
    const intAbs = BigInt(intPart.replace('-', '') || '0');
    const fracPadded = (fracPart + '0000').slice(0, 4);
    return sign * (intAbs * 10000n + BigInt(fracPadded));
  };
  const sum = toUnits(a) + toUnits(b);
  const negative = sum < 0n;
  const abs = negative ? -sum : sum;
  const intOut = abs / 10000n;
  const fracOut = (abs % 10000n).toString().padStart(4, '0');
  return `${negative ? '-' : ''}${intOut}.${fracOut}`;
}
