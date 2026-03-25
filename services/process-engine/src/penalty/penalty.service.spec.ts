import { PenaltyService } from './penalty.service';

describe('PenaltyService', () => {
  let service: PenaltyService;

  beforeEach(() => {
    service = new PenaltyService(null as any, null as any);
  });

  describe('calculatePenalty', () => {
    it('should calculate flat penalty', () => {
      const result = service.calculatePenalty(
        { outstandingPrincipal: 10000, outstandingPenalties: 0, principalAmount: 10000 },
        { type: 'flat', rate: 50 },
      );
      expect(result).toBe('50.0000');
    });

    it('should calculate percentage penalty', () => {
      const result = service.calculatePenalty(
        { outstandingPrincipal: 10000, outstandingPenalties: 0, principalAmount: 10000 },
        { type: 'percentage', rate: 2 },
      );
      expect(result).toBe('200.0000');
    });

    it('should enforce penalty cap', () => {
      const result = service.calculatePenalty(
        { outstandingPrincipal: 10000, outstandingPenalties: 2000, principalAmount: 10000 },
        { type: 'percentage', rate: 5, cap: 25 },
      );
      // Cap = 25% of 10000 = 2500. Already has 2000 in penalties.
      // New penalty would be 500 (to reach cap of 2500)
      expect(result).toBe('500.0000');
    });

    it('should return zero when cap already exceeded', () => {
      const result = service.calculatePenalty(
        { outstandingPrincipal: 10000, outstandingPenalties: 3000, principalAmount: 10000 },
        { type: 'percentage', rate: 5, cap: 25 },
      );
      expect(result).toBe('0.0000');
    });
  });
});
