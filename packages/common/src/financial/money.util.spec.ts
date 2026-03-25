import { createMoney, addMoney, subtractMoney, multiplyMoney, compareMoney, isMoneyPositive, isMoneyZero, percentageOfMoney, zeroMoney } from './money.util';

describe('Money Utilities', () => {
  describe('createMoney', () => {
    it('should create money with rounded amount', () => {
      const money = createMoney('100.12345', 'GHS');
      // Banker's rounding: 5th decimal is 5, 4th decimal is 4 (even), rounds down
      expect(money.amount).toBe('100.1234');
      expect(money.currency).toBe('GHS');
    });
  });

  describe('addMoney', () => {
    it('should add two money values', () => {
      const result = addMoney(
        { amount: '100.0000', currency: 'GHS' },
        { amount: '50.5000', currency: 'GHS' },
      );
      expect(result.amount).toBe('150.5000');
      expect(result.currency).toBe('GHS');
    });

    it('should throw on currency mismatch', () => {
      expect(() =>
        addMoney(
          { amount: '100.0000', currency: 'GHS' },
          { amount: '50.0000', currency: 'KES' },
        ),
      ).toThrow('Currency mismatch');
    });
  });

  describe('subtractMoney', () => {
    it('should subtract money values', () => {
      const result = subtractMoney(
        { amount: '100.0000', currency: 'GHS' },
        { amount: '30.0000', currency: 'GHS' },
      );
      expect(result.amount).toBe('70.0000');
    });
  });

  describe('multiplyMoney', () => {
    it('should multiply money by factor', () => {
      const result = multiplyMoney({ amount: '100.0000', currency: 'GHS' }, '1.5');
      expect(result.amount).toBe('150.0000');
    });
  });

  describe('compareMoney', () => {
    it('should compare money values', () => {
      const a = { amount: '100.0000', currency: 'GHS' };
      const b = { amount: '200.0000', currency: 'GHS' };
      expect(compareMoney(a, b)).toBe(-1);
      expect(compareMoney(b, a)).toBe(1);
      expect(compareMoney(a, a)).toBe(0);
    });
  });

  describe('isMoneyPositive', () => {
    it('should check if money is positive', () => {
      expect(isMoneyPositive({ amount: '100.0000', currency: 'GHS' })).toBe(true);
      expect(isMoneyPositive({ amount: '0.0000', currency: 'GHS' })).toBe(false);
    });
  });

  describe('isMoneyZero', () => {
    it('should check if money is zero', () => {
      expect(isMoneyZero(zeroMoney('GHS'))).toBe(true);
      expect(isMoneyZero({ amount: '1.0000', currency: 'GHS' })).toBe(false);
    });
  });

  describe('percentageOfMoney', () => {
    it('should calculate percentage of money', () => {
      const result = percentageOfMoney({ amount: '1000.0000', currency: 'GHS' }, '15');
      expect(result.amount).toBe('150.0000');
      expect(result.currency).toBe('GHS');
    });
  });
});
