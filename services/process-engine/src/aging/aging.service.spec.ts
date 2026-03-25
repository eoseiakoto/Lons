import { AgingService } from './aging.service';

describe('AgingService', () => {
  let service: AgingService;

  beforeEach(() => {
    service = new AgingService(null as any, null as any);
  });

  describe('calculateDaysPastDue (via getBucket)', () => {
    it('should return performing for 0 DPD', () => {
      const bucket = (service as any).getBucket(0);
      expect(bucket.status).toBe('performing');
      expect(bucket.classification).toBe('performing');
    });

    it('should return due for 1-7 DPD', () => {
      expect((service as any).getBucket(1).status).toBe('due');
      expect((service as any).getBucket(7).status).toBe('due');
    });

    it('should return overdue for 8-30 DPD', () => {
      expect((service as any).getBucket(8).status).toBe('overdue');
      expect((service as any).getBucket(30).status).toBe('overdue');
      expect((service as any).getBucket(8).classification).toBe('special_mention');
    });

    it('should return delinquent for 31-60 DPD', () => {
      expect((service as any).getBucket(31).status).toBe('delinquent');
      expect((service as any).getBucket(60).status).toBe('delinquent');
      expect((service as any).getBucket(31).classification).toBe('substandard');
    });

    it('should return default for 61+ DPD', () => {
      expect((service as any).getBucket(61).status).toBe('default_status');
      expect((service as any).getBucket(90).classification).toBe('doubtful');
      expect((service as any).getBucket(91).classification).toBe('loss');
    });
  });
});
