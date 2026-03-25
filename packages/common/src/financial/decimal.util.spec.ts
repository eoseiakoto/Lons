import { add, subtract, multiply, divide, bankersRound, isPositive, isZero, isNegative, compare, min, max, percentage } from './decimal.util';

describe('Decimal Utilities', () => {
  describe('add', () => {
    it('should add two decimal strings', () => {
      expect(add('10.5000', '20.3000')).toBe('30.8000');
    });

    it('should handle zero', () => {
      expect(add('100.0000', '0.0000')).toBe('100.0000');
    });

    it('should handle negative numbers', () => {
      expect(add('100.0000', '-30.0000')).toBe('70.0000');
    });

    it('should maintain 4 decimal places', () => {
      expect(add('1.1111', '2.2222')).toBe('3.3333');
    });
  });

  describe('subtract', () => {
    it('should subtract two decimal strings', () => {
      expect(subtract('100.0000', '30.5000')).toBe('69.5000');
    });

    it('should handle result going negative', () => {
      expect(subtract('10.0000', '30.0000')).toBe('-20.0000');
    });
  });

  describe('multiply', () => {
    it('should multiply two decimal strings', () => {
      expect(multiply('10.0000', '3.0000')).toBe('30.0000');
    });

    it('should handle fractional multiplication', () => {
      expect(multiply('100.0000', '0.1500')).toBe('15.0000');
    });
  });

  describe('divide', () => {
    it('should divide two decimal strings', () => {
      expect(divide('100.0000', '3.0000')).toBe('33.3333');
    });

    it('should throw on division by zero', () => {
      expect(() => divide('100.0000', '0')).toThrow('Division by zero');
    });
  });

  describe('bankersRound', () => {
    it('should round half to even (down when digit before is even)', () => {
      expect(bankersRound('2.5', 0)).toBe('2');
    });

    it('should round half to even (up when digit before is odd)', () => {
      expect(bankersRound('3.5', 0)).toBe('4');
    });

    it('should round to specified decimal places', () => {
      expect(bankersRound('1.23456', 4)).toBe('1.2346');
    });

    it('should handle 0.5 rounding to even', () => {
      expect(bankersRound('0.5', 0)).toBe('0');
      expect(bankersRound('1.5', 0)).toBe('2');
      expect(bankersRound('2.5', 0)).toBe('2');
      expect(bankersRound('3.5', 0)).toBe('4');
    });
  });

  describe('comparison utilities', () => {
    it('isPositive should return true for positive values', () => {
      expect(isPositive('100')).toBe(true);
      expect(isPositive('0')).toBe(false);
      expect(isPositive('-1')).toBe(false);
    });

    it('isZero should return true for zero', () => {
      expect(isZero('0')).toBe(true);
      expect(isZero('0.0000')).toBe(true);
      expect(isZero('1')).toBe(false);
    });

    it('isNegative should return true for negative values', () => {
      expect(isNegative('-1')).toBe(true);
      expect(isNegative('0')).toBe(false);
      expect(isNegative('1')).toBe(false);
    });

    it('compare should return correct ordering', () => {
      expect(compare('10', '20')).toBe(-1);
      expect(compare('20', '10')).toBe(1);
      expect(compare('10', '10')).toBe(0);
    });

    it('min should return smaller value', () => {
      expect(min('10.0000', '20.0000')).toBe('10.0000');
    });

    it('max should return larger value', () => {
      expect(max('10.0000', '20.0000')).toBe('20.0000');
    });
  });

  describe('percentage', () => {
    it('should calculate percentage correctly', () => {
      expect(percentage('1000', '10')).toBe('100.0000');
    });

    it('should handle fractional percentages', () => {
      expect(percentage('1000', '0.5')).toBe('5.0000');
    });
  });
});
