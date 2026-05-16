import { AgingService, DEFAULT_BUCKETS } from './aging.service';

describe('AgingService', () => {
  let service: AgingService;

  beforeEach(() => {
    service = new AgingService(null as any, null as any);
  });

  // Sprint 16 (S16-11): getBucket now takes an explicit bucket list so
  // it can be called with either tenant/product-specific configs or
  // the DEFAULT_BUCKETS fallback. These tests exercise the fallback.
  describe('getBucket (with DEFAULT_BUCKETS)', () => {
    it('should return performing for 0 DPD', () => {
      const bucket = (service as any).getBucket(0, DEFAULT_BUCKETS);
      expect(bucket.status).toBe('performing');
      expect(bucket.classification).toBe('performing');
    });

    it('should return due for 1-7 DPD', () => {
      expect((service as any).getBucket(1, DEFAULT_BUCKETS).status).toBe('due');
      expect((service as any).getBucket(7, DEFAULT_BUCKETS).status).toBe('due');
    });

    it('should return overdue for 8-30 DPD', () => {
      expect((service as any).getBucket(8, DEFAULT_BUCKETS).status).toBe('overdue');
      expect((service as any).getBucket(30, DEFAULT_BUCKETS).status).toBe('overdue');
      expect((service as any).getBucket(8, DEFAULT_BUCKETS).classification).toBe('special_mention');
    });

    it('should return delinquent for 31-60 DPD', () => {
      expect((service as any).getBucket(31, DEFAULT_BUCKETS).status).toBe('delinquent');
      expect((service as any).getBucket(60, DEFAULT_BUCKETS).status).toBe('delinquent');
      expect((service as any).getBucket(31, DEFAULT_BUCKETS).classification).toBe('substandard');
    });

    it('should return default for 61+ DPD', () => {
      expect((service as any).getBucket(61, DEFAULT_BUCKETS).status).toBe('default_status');
      expect((service as any).getBucket(90, DEFAULT_BUCKETS).classification).toBe('doubtful');
      expect((service as any).getBucket(91, DEFAULT_BUCKETS).classification).toBe('loss');
    });
  });
});
