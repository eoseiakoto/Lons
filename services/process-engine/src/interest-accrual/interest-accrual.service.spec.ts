import { InterestAccrualService } from './interest-accrual.service';

describe('InterestAccrualService', () => {
  let service: InterestAccrualService;

  beforeEach(() => {
    service = new InterestAccrualService(null as any, null as any);
  });

  describe('calculateDailyAccrual', () => {
    it('should calculate flat rate daily accrual', () => {
      const result = service.calculateDailyAccrual({
        outstandingPrincipal: 10000,
        interestRate: 12,
        product: { interestRateModel: 'flat' },
      });
      // 10000 * 12 / 36500 = 3.2877
      expect(Number(result)).toBeCloseTo(3.2877, 2);
    });

    it('should calculate reducing balance daily accrual', () => {
      const result = service.calculateDailyAccrual({
        outstandingPrincipal: 5000,
        interestRate: 24,
        product: { interestRateModel: 'reducing_balance' },
      });
      // 5000 * 24 / 36500 = 3.2877
      expect(Number(result)).toBeCloseTo(3.2877, 2);
    });

    it('should return zero for zero interest rate', () => {
      const result = service.calculateDailyAccrual({
        outstandingPrincipal: 10000,
        interestRate: 0,
        product: { interestRateModel: 'flat' },
      });
      expect(result).toBe('0.0000');
    });

    it('should return zero for zero principal', () => {
      const result = service.calculateDailyAccrual({
        outstandingPrincipal: 0,
        interestRate: 12,
        product: { interestRateModel: 'flat' },
      });
      expect(result).toBe('0.0000');
    });
  });
});
