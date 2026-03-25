import { maskPhone, maskNationalId, maskEmail, maskName } from './masking.util';

describe('Masking Utilities', () => {
  describe('maskPhone', () => {
    it('should mask phone numbers', () => {
      expect(maskPhone('+233123456789')).toBe('+233***6789');
    });

    it('should handle short phones', () => {
      expect(maskPhone('123')).toBe('***');
    });
  });

  describe('maskNationalId', () => {
    it('should mask national IDs with dashes', () => {
      expect(maskNationalId('GHA-123456-789')).toBe('GHA-***-789');
    });

    it('should mask national IDs without dashes', () => {
      expect(maskNationalId('GHA123456789')).toBe('GHA-***-789');
    });
  });

  describe('maskEmail', () => {
    it('should mask email addresses', () => {
      expect(maskEmail('john.doe@example.com')).toBe('jo***@example.com');
    });

    it('should handle short local parts', () => {
      expect(maskEmail('a@b.com')).toBe('***@b.com');
    });
  });

  describe('maskName', () => {
    it('should mask names', () => {
      expect(maskName('John Doe')).toBe('J***');
    });
  });
});
