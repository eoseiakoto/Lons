import { allocatePayment, OutstandingAmounts } from './waterfall-allocator';

describe('WaterfallAllocator', () => {
  const outstanding: OutstandingAmounts = {
    overduePenalties: '50.0000',
    overdueInterest: '100.0000',
    overduePrincipal: '200.0000',
    currentFees: '25.0000',
    currentInterest: '75.0000',
    currentPrincipal: '500.0000',
  };

  it('should allocate in priority order', () => {
    const result = allocatePayment('150.0000', outstanding);
    expect(result.allocatedPenalties).toBe('50.0000');
    expect(result.allocatedInterest).toBe('100.0000');
    expect(result.allocatedPrincipal).toBe('0.0000');
    expect(result.allocatedFees).toBe('0.0000');
    expect(result.remainder).toBe('0.0000');
    expect(result.fullyPaid).toBe(false);
  });

  it('should handle full payment', () => {
    const result = allocatePayment('1000.0000', outstanding);
    expect(result.fullyPaid).toBe(true);
    expect(Number(result.remainder)).toBeGreaterThanOrEqual(0);
  });

  it('should handle exact payment', () => {
    const result = allocatePayment('950.0000', outstanding);
    expect(result.fullyPaid).toBe(true);
    expect(result.remainder).toBe('0.0000');
  });

  it('should handle partial payment', () => {
    const result = allocatePayment('25.0000', outstanding);
    expect(result.allocatedPenalties).toBe('25.0000');
    expect(result.remainder).toBe('0.0000');
    expect(result.fullyPaid).toBe(false);
  });

  it('should handle zero outstanding', () => {
    const zeroOutstanding: OutstandingAmounts = {
      overduePenalties: '0.0000',
      overdueInterest: '0.0000',
      overduePrincipal: '0.0000',
      currentFees: '0.0000',
      currentInterest: '0.0000',
      currentPrincipal: '0.0000',
    };
    const result = allocatePayment('100.0000', zeroOutstanding);
    expect(result.remainder).toBe('100.0000');
    expect(result.fullyPaid).toBe(true);
  });
});
