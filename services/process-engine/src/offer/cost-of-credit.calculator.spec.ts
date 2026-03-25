import { calculateCostOfCredit } from './cost-of-credit.calculator';

describe('CostOfCreditCalculator', () => {
  it('should calculate flat interest correctly', () => {
    const result = calculateCostOfCredit({
      principalAmount: '1000.0000',
      interestRate: '10.0000',
      interestRateModel: 'flat',
      tenorDays: 30,
    });

    // Flat: 1000 * 10% * (30/365) = 8.2192 (approx)
    expect(Number(result.totalInterest)).toBeCloseTo(8.2192, 1);
    expect(result.totalFees).toBe('0.0000');
    expect(Number(result.totalCostCredit)).toBeGreaterThan(1000);
  });

  it('should calculate fees correctly', () => {
    const result = calculateCostOfCredit({
      principalAmount: '5000.0000',
      interestRate: '12.0000',
      interestRateModel: 'flat',
      tenorDays: 90,
      feeStructure: {
        origination: { type: 'percentage', value: 1.5 },
        service: { type: 'flat', value: 10 },
      },
    });

    expect(result.feeBreakdown.origination).toBe('75.0000');
    expect(result.feeBreakdown.service).toBe('10.0000');
    expect(result.totalFees).toBe('85.0000');
  });

  it('should calculate reducing balance interest', () => {
    const result = calculateCostOfCredit({
      principalAmount: '10000.0000',
      interestRate: '24.0000',
      interestRateModel: 'reducing_balance',
      tenorDays: 180,
    });

    // Reducing balance should produce less interest than flat
    const flatResult = calculateCostOfCredit({
      principalAmount: '10000.0000',
      interestRate: '24.0000',
      interestRateModel: 'flat',
      tenorDays: 180,
    });

    expect(Number(result.totalInterest)).toBeLessThan(Number(flatResult.totalInterest));
  });

  it('should return totalCostCredit = principal + interest + fees', () => {
    const result = calculateCostOfCredit({
      principalAmount: '1000.0000',
      interestRate: '15.0000',
      interestRateModel: 'flat',
      tenorDays: 60,
      feeStructure: { origination: { type: 'flat', value: 25 } },
    });

    const expected = Number(result.principalAmount) + Number(result.totalInterest) + Number(result.totalFees);
    expect(Number(result.totalCostCredit)).toBeCloseTo(expected, 2);
  });
});
