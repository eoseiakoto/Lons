import {
  maskPhone,
  maskEmail,
  maskNationalId,
  maskGeneric,
  maskPII,
} from './pii-masker';

describe('PII Masker', () => {
  describe('maskPhone', () => {
    it('should mask phone number correctly', () => {
      const result = maskPhone('+233245678901');
      expect(result).toBe('+233***7890');
    });

    it('should mask short phone numbers', () => {
      const result = maskPhone('+233123');
      expect(result).toBe('+233***23');
    });

    it('should handle null/undefined', () => {
      expect(maskPhone(null)).toBe('');
      expect(maskPhone(undefined)).toBe('');
    });

    it('should handle very short strings', () => {
      const result = maskPhone('123');
      expect(result).toBe('123'); // Too short to mask
    });

    it('should preserve format with different phone patterns', () => {
      const result = maskPhone('02345678901');
      expect(result).toContain('***');
      expect(result).toContain('8901'); // Last 4 digits
    });
  });

  describe('maskEmail', () => {
    it('should mask email address correctly', () => {
      const result = maskEmail('john.doe@example.com');
      expect(result).toBe('j***@example.com');
    });

    it('should preserve domain', () => {
      const result = maskEmail('alice@gmail.com');
      expect(result).toBe('a***@gmail.com');
    });

    it('should handle single character names', () => {
      const result = maskEmail('x@domain.co');
      expect(result).toBe('x***@domain.co');
    });

    it('should handle null/undefined', () => {
      expect(maskEmail(null)).toBe('');
      expect(maskEmail(undefined)).toBe('');
    });

    it('should handle invalid email format', () => {
      const result = maskEmail('notanemail');
      expect(result).toBe('notanemail'); // No @ sign
    });

    it('should handle email with multiple @', () => {
      const result = maskEmail('test@@example.com');
      expect(result).toBe('t***@example.com');
    });
  });

  describe('maskNationalId', () => {
    it('should mask national ID with dash format', () => {
      const result = maskNationalId('GHA-123456789-X');
      expect(result).toBe('GHA-***-X');
    });

    it('should mask national ID without dashes', () => {
      const result = maskNationalId('GHA123456789');
      expect(result).toBe('G***9');
    });

    it('should preserve first and last parts for dashed IDs', () => {
      const result = maskNationalId('USA-987654321-V');
      expect(result).toMatch(/^USA-\*\*\*-V$/);
    });

    it('should handle null/undefined', () => {
      expect(maskNationalId(null)).toBe('');
      expect(maskNationalId(undefined)).toBe('');
    });

    it('should handle very short IDs', () => {
      const result = maskNationalId('AB');
      expect(result).toBe('AB');
    });

    it('should handle only one dash', () => {
      const result = maskNationalId('GHA-123456789');
      expect(result).toContain('***');
    });
  });

  describe('maskGeneric', () => {
    it('should mask generic value', () => {
      const result = maskGeneric('secret123value');
      expect(result).toBe('s***');
    });

    it('should preserve first character', () => {
      const result = maskGeneric('testing');
      expect(result).toMatch(/^t\*\*\*$/);
    });

    it('should handle short values', () => {
      const result = maskGeneric('hi');
      expect(result).toBe('h***');
    });

    it('should handle null/undefined', () => {
      expect(maskGeneric(null)).toBe('');
      expect(maskGeneric(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      const result = maskGeneric('');
      expect(result).toBe('');
    });
  });

  describe('maskPII', () => {
    it('should mask phone fields', () => {
      const data = {
        id: '123',
        phone: '+233245678901',
        phonePrimary: '+233987654321',
      };

      const result = maskPII(data);

      expect(result.id).toBe('123');
      expect(result.phone).toBe('+233***7890');
      expect(result.phonePrimary).toBe('+233***4321');
    });

    it('should mask email fields', () => {
      const data = {
        id: '123',
        email: 'test@example.com',
        emailAddress: 'user@domain.org',
      };

      const result = maskPII(data);

      expect(result.id).toBe('123');
      expect(result.email).toBe('t***@example.com');
      expect(result.emailAddress).toBe('u***@domain.org');
    });

    it('should mask national ID fields', () => {
      const data = {
        nationalId: 'GHA-123456789-X',
        national_id: 'USA-987654321-V',
        idNumber: 'NGA-111222333-Z',
      };

      const result = maskPII(data);

      expect(result.nationalId).toMatch(/GHA-\*\*\*-X/);
      expect(result.national_id).toMatch(/USA-\*\*\*-V/);
      expect(result.idNumber).toMatch(/NGA-\*\*\*-Z/);
    });

    it('should redact password/secret/token fields', () => {
      const data = {
        password: 'super_secret_123',
        secret_key: 'secret_value',
        apiToken: 'token_12345',
        bearerToken: 'xyz789',
      };

      const result = maskPII(data);

      expect(result.password).toBe('***REDACTED***');
      expect(result.secret_key).toBe('***REDACTED***');
      expect(result.apiToken).toBe('***REDACTED***');
      expect(result.bearerToken).toBe('***REDACTED***');
    });

    it('should recursively mask nested objects', () => {
      const data = {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+233123456789',
        },
        metadata: {
          password: 'secret123',
        },
      };

      const result = maskPII(data);

      expect(result.user.name).toBe('John Doe');
      expect(result.user.email).toBe('j***@example.com');
      expect(result.user.phone).toBe('+233***6789');
      expect(result.metadata.password).toBe('***REDACTED***');
    });

    it('should handle null values in object', () => {
      const data = {
        id: '123',
        phone: null,
        email: undefined,
      };

      const result = maskPII(data);

      expect(result.id).toBe('123');
      expect(result.phone).toBeNull();
      expect(result.email).toBeUndefined();
    });

    it('should preserve non-PII fields', () => {
      const data = {
        id: '123',
        name: 'John Doe',
        status: 'active',
        amount: '5000.0000',
        email: 'john@example.com',
      };

      const result = maskPII(data);

      expect(result.id).toBe('123');
      expect(result.name).toBe('John Doe');
      expect(result.status).toBe('active');
      expect(result.amount).toBe('5000.0000');
      expect(result.email).toBe('j***@example.com');
    });

    it('should handle arrays gracefully', () => {
      const data = {
        id: '123',
        tags: ['tag1', 'tag2'],
        email: 'test@example.com',
      };

      const result = maskPII(data);

      expect(result.id).toBe('123');
      expect(result.tags).toEqual(['tag1', 'tag2']);
      expect(result.email).toBe('t***@example.com');
    });

    it('should handle empty object', () => {
      const result = maskPII({});
      expect(result).toEqual({});
    });

    it('should handle non-object input gracefully', () => {
      expect(maskPII(null as any)).toBeNull();
      expect(maskPII(undefined as any)).toBeUndefined();
      expect(maskPII('string' as any)).toBe('string');
    });
  });

  describe('Case Sensitivity', () => {
    it('should mask fields regardless of case', () => {
      const data = {
        Phone: '+233123456789', // Capital P
        EMAIL: 'test@example.com', // All caps
        NationalID: 'GHA-123456789-X', // Capital letters
      };

      const result = maskPII(data);

      expect(result.Phone).toContain('***');
      expect(result.EMAIL).toContain('***');
      expect(result.NationalID).toContain('***');
    });
  });

  describe('Real-World Examples', () => {
    it('should mask complete customer object', () => {
      const customer = {
        id: 'cust-001',
        tenantId: 'tenant-123',
        fullName: 'Alice Johnson',
        phonePrimary: '+233245123456',
        phoneSecondary: '+233278901234',
        email: 'alice@gmail.com',
        nationalId: 'GHA-987654321-Q',
        status: 'active',
        createdAt: '2026-03-01T00:00:00Z',
      };

      const result = maskPII(customer);

      expect(result.id).toBe('cust-001');
      expect(result.tenantId).toBe('tenant-123');
      expect(result.fullName).toBe('Alice Johnson');
      expect(result.phonePrimary).toBe('+233***3456');
      expect(result.phoneSecondary).toBe('+233***1234');
      expect(result.email).toBe('a***@gmail.com');
      expect(result.nationalId).toBe('GHA-***-Q');
      expect(result.status).toBe('active');
      expect(result.createdAt).toBe('2026-03-01T00:00:00Z');
    });

    it('should mask API error response with PII', () => {
      const errorResponse = {
        code: 'INVALID_PHONE',
        message: 'Invalid phone number provided',
        details: {
          phone: '+233123456789',
          email: 'user@example.com',
          timestamp: '2026-03-26T12:00:00Z',
        },
      };

      const result = maskPII(errorResponse);

      expect(result.code).toBe('INVALID_PHONE');
      expect(result.message).toBe('Invalid phone number provided');
      expect(result.details.phone).toBe('+233***6789');
      expect(result.details.email).toBe('u***@example.com');
      expect(result.details.timestamp).toBe('2026-03-26T12:00:00Z');
    });
  });
});
