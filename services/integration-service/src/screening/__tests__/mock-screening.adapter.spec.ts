import { MockScreeningAdapter } from '../mock-screening.adapter';
import { IScreeningInput, ScreeningMatchType } from '../screening.interface';

describe('MockScreeningAdapter', () => {
  let adapter: MockScreeningAdapter;

  beforeEach(() => {
    adapter = new MockScreeningAdapter();
  });

  const baseInput: IScreeningInput = {
    customerId: 'cust-001',
    tenantId: 'tenant-001',
    fullName: 'John Doe',
    country: 'GH',
  };

  describe('getProviderName', () => {
    it('should return "mock"', () => {
      expect(adapter.getProviderName()).toBe('mock');
    });
  });

  describe('screenCustomer — CLEAR result', () => {
    it('should return CLEAR status for a normal name', async () => {
      const result = await adapter.screenCustomer(baseInput);

      expect(result.status).toBe('CLEAR');
      expect(result.riskLevel).toBe('LOW');
      expect(result.matches).toHaveLength(0);
      expect(result.provider).toBe('mock');
      expect(result.customerId).toBe('cust-001');
      expect(result.tenantId).toBe('tenant-001');
      expect(result.screeningId).toBeDefined();
      expect(result.screenedAt).toBeInstanceOf(Date);
    });
  });

  describe('screenCustomer — SANCTIONS match', () => {
    it('should return MATCH with SANCTIONS type when name contains "SANCTIONS"', async () => {
      const input = { ...baseInput, fullName: 'SANCTIONS Person' };
      const result = await adapter.screenCustomer(input);

      expect(result.status).toBe('MATCH');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchType).toBe(ScreeningMatchType.SANCTIONS);
      expect(result.matches[0].matchScore).toBeGreaterThanOrEqual(60);
      expect(result.matches[0].matchScore).toBeLessThanOrEqual(99);
      expect(result.matches[0].source).toBe('OFAC SDN List');
    });

    it('should be case-insensitive for SANCTIONS detection', async () => {
      const input = { ...baseInput, fullName: 'John sanctions Test' };
      const result = await adapter.screenCustomer(input);

      expect(result.status).toBe('MATCH');
      expect(result.matches[0].matchType).toBe(ScreeningMatchType.SANCTIONS);
    });
  });

  describe('screenCustomer — PEP match', () => {
    it('should return POTENTIAL_MATCH with PEP type when name contains "PEP"', async () => {
      const input = { ...baseInput, fullName: 'PEP Official' };
      const result = await adapter.screenCustomer(input);

      expect(result.status).toBe('POTENTIAL_MATCH');
      expect(result.riskLevel).toBe('HIGH');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchType).toBe(ScreeningMatchType.PEP);
      expect(result.matches[0].source).toBe('World PEP Database');
    });
  });

  describe('screenCustomer — ADVERSE_MEDIA match', () => {
    it('should return POTENTIAL_MATCH with ADVERSE_MEDIA type when name contains "ADVERSE"', async () => {
      const input = { ...baseInput, fullName: 'Adverse Media Person' };
      const result = await adapter.screenCustomer(input);

      expect(result.status).toBe('POTENTIAL_MATCH');
      expect(result.riskLevel).toBe('MEDIUM');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchType).toBe(ScreeningMatchType.ADVERSE_MEDIA);
      expect(result.matches[0].source).toBe('Global Adverse Media Archive');
    });
  });

  describe('getScreeningStatus', () => {
    it('should return null for unknown screening ID', async () => {
      const result = await adapter.getScreeningStatus('unknown-id');
      expect(result).toBeNull();
    });

    it('should return stored result for a previously screened customer', async () => {
      const screenResult = await adapter.screenCustomer(baseInput);
      const status = await adapter.getScreeningStatus(screenResult.screeningId);

      expect(status).not.toBeNull();
      expect(status!.screeningId).toBe(screenResult.screeningId);
      expect(status!.status).toBe(screenResult.status);
    });
  });

  describe('deterministic match scores', () => {
    it('should produce consistent scores for the same input', async () => {
      const input = { ...baseInput, fullName: 'SANCTIONS Test Person' };
      const result1 = await adapter.screenCustomer(input);
      const result2 = await adapter.screenCustomer(input);

      // Match scores are deterministic based on name hash
      expect(result1.matches[0].matchScore).toBe(result2.matches[0].matchScore);
    });
  });
});
