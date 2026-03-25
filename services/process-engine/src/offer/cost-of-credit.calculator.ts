import { add, multiply, divide, subtract, bankersRound, percentage } from '@lons/common';

export interface CostOfCreditInput {
  principalAmount: string;
  interestRate: string; // Annual percentage
  interestRateModel: 'flat' | 'reducing_balance' | 'tiered';
  tenorDays: number;
  feeStructure?: {
    origination?: { type: 'flat' | 'percentage'; value: number };
    service?: { type: 'flat' | 'percentage'; value: number };
    insurance?: { type: 'flat' | 'percentage'; value: number };
    [key: string]: { type: 'flat' | 'percentage'; value: number } | undefined;
  };
}

export interface CostOfCreditResult {
  principalAmount: string;
  totalInterest: string;
  totalFees: string;
  totalCostCredit: string;
  feeBreakdown: Record<string, string>;
}

export function calculateCostOfCredit(input: CostOfCreditInput): CostOfCreditResult {
  const { principalAmount, interestRate, interestRateModel, tenorDays, feeStructure } = input;

  // Calculate interest
  let totalInterest: string;
  if (interestRateModel === 'flat') {
    // Flat: interest = principal * rate% * (tenor / 365)
    const dailyRate = divide(interestRate, '365');
    totalInterest = bankersRound(multiply(principalAmount, multiply(dailyRate, String(tenorDays))), 4);
    totalInterest = bankersRound(divide(totalInterest, '100'), 4);
  } else {
    // Reducing balance: approximate total interest
    // For exact calculation, use the schedule generator. This is for offer preview.
    const monthlyRate = divide(interestRate, '1200');
    const months = Math.ceil(tenorDays / 30);
    if (months <= 1) {
      totalInterest = bankersRound(percentage(principalAmount, divide(interestRate, '12')), 4);
    } else {
      // Total interest from EMI formula: total payments - principal
      const onePlusR = add('1', monthlyRate);
      let onePlusRN = '1.0000';
      for (let i = 0; i < months; i++) {
        onePlusRN = multiply(onePlusRN, onePlusR);
      }
      const emi = divide(multiply(principalAmount, multiply(monthlyRate, onePlusRN)), subtract(onePlusRN, '1'));
      const totalPayments = multiply(emi, String(months));
      totalInterest = bankersRound(subtract(totalPayments, principalAmount), 4);
    }
  }

  // Calculate fees
  let totalFees = '0.0000';
  const feeBreakdown: Record<string, string> = {};

  if (feeStructure) {
    for (const [feeName, feeConfig] of Object.entries(feeStructure)) {
      if (!feeConfig) continue;
      let feeAmount: string;
      if (feeConfig.type === 'percentage') {
        feeAmount = bankersRound(percentage(principalAmount, String(feeConfig.value)), 4);
      } else {
        feeAmount = bankersRound(String(feeConfig.value), 4);
      }
      feeBreakdown[feeName] = feeAmount;
      totalFees = add(totalFees, feeAmount);
    }
  }

  const totalCostCredit = add(principalAmount, add(totalInterest, totalFees));

  return {
    principalAmount: bankersRound(principalAmount, 4),
    totalInterest,
    totalFees,
    totalCostCredit: bankersRound(totalCostCredit, 4),
    feeBreakdown,
  };
}
