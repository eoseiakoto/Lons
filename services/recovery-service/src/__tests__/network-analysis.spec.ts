import { NetworkAnalysisService, GuarantorCandidate } from '../network-analysis.service';

describe('NetworkAnalysisService', () => {
  let service: NetworkAnalysisService;

  beforeEach(() => {
    service = new NetworkAnalysisService();
  });

  it('should return mock guarantor candidates', async () => {
    const candidates = await service.findGuarantorCandidates('tenant-1', 'customer-1');

    expect(candidates).toBeDefined();
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeLessThanOrEqual(4);
  });

  it('should return candidates with required fields', async () => {
    const candidates = await service.findGuarantorCandidates('tenant-1', 'customer-1');

    for (const candidate of candidates) {
      expect(candidate.customerId).toBeDefined();
      expect(typeof candidate.customerId).toBe('string');
      expect(candidate.name).toBeDefined();
      expect(typeof candidate.name).toBe('string');
      expect(candidate.tieStrength).toBeDefined();
      expect(typeof candidate.tieStrength).toBe('number');
      expect(candidate.relationshipType).toBeDefined();
      expect(typeof candidate.relationshipType).toBe('string');
      expect(candidate.financialCapacityScore).toBeDefined();
      expect(typeof candidate.financialCapacityScore).toBe('number');
    }
  });

  it('should have tieStrength between 0 and 1', async () => {
    const candidates = await service.findGuarantorCandidates('tenant-1', 'customer-1');

    for (const candidate of candidates) {
      expect(candidate.tieStrength).toBeGreaterThanOrEqual(0);
      expect(candidate.tieStrength).toBeLessThanOrEqual(1);
    }
  });

  it('should have financialCapacityScore between 0 and 100', async () => {
    const candidates = await service.findGuarantorCandidates('tenant-1', 'customer-1');

    for (const candidate of candidates) {
      expect(candidate.financialCapacityScore).toBeGreaterThanOrEqual(0);
      expect(candidate.financialCapacityScore).toBeLessThanOrEqual(100);
    }
  });

  it('should have valid relationship types', async () => {
    const validTypes = ['family', 'colleague', 'business_partner', 'friend', 'neighbor'];
    const candidates = await service.findGuarantorCandidates('tenant-1', 'customer-1');

    for (const candidate of candidates) {
      expect(validTypes).toContain(candidate.relationshipType);
    }
  });

  it('should generate different customer IDs based on input', async () => {
    const candidatesA = await service.findGuarantorCandidates('tenant-1', 'customer-aaa');
    const candidatesB = await service.findGuarantorCandidates('tenant-1', 'customer-bbb');

    expect(candidatesA[0].customerId).not.toBe(candidatesB[0].customerId);
  });
});
