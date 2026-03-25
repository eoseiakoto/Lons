import { add, subtract, multiply, divide, bankersRound, compare } from '@lons/common';

export interface ScheduleParams {
  principalAmount: string;
  interestRate: string; // Annual percentage
  tenorDays: number;
  startDate: Date;
  gracePeriodDays?: number;
}

export interface ScheduleEntry {
  installmentNumber: number;
  dueDate: Date;
  principalAmount: string;
  interestAmount: string;
  feeAmount: string;
  totalAmount: string;
}

export function generateEMISchedule(params: ScheduleParams): ScheduleEntry[] {
  const { principalAmount, interestRate, tenorDays, startDate, gracePeriodDays = 0 } = params;
  const months = Math.max(Math.ceil(tenorDays / 30), 1);
  const monthlyRate = divide(interestRate, '1200');

  if (compare(monthlyRate, '0') <= 0 || months <= 0) {
    // Zero interest — single payment
    return [{
      installmentNumber: 1,
      dueDate: addDays(startDate, tenorDays),
      principalAmount: bankersRound(principalAmount, 4),
      interestAmount: '0.0000',
      feeAmount: '0.0000',
      totalAmount: bankersRound(principalAmount, 4),
    }];
  }

  // EMI = P * r * (1+r)^n / ((1+r)^n - 1)
  const onePlusR = add('1', monthlyRate);
  let onePlusRN = '1.0000';
  for (let i = 0; i < months; i++) {
    onePlusRN = multiply(onePlusRN, onePlusR);
  }
  const emi = bankersRound(divide(multiply(principalAmount, multiply(monthlyRate, onePlusRN)), subtract(onePlusRN, '1')), 4);

  const entries: ScheduleEntry[] = [];
  let remainingPrincipal = principalAmount;

  for (let i = 1; i <= months; i++) {
    const dueDate = addDays(startDate, gracePeriodDays + i * 30);
    const interestPortion = bankersRound(multiply(remainingPrincipal, monthlyRate), 4);

    let principalPortion: string;
    if (i === months) {
      // Last installment: pay off remaining
      principalPortion = remainingPrincipal;
    } else {
      principalPortion = bankersRound(subtract(emi, interestPortion), 4);
    }

    const totalAmount = bankersRound(add(principalPortion, interestPortion), 4);
    remainingPrincipal = bankersRound(subtract(remainingPrincipal, principalPortion), 4);

    entries.push({
      installmentNumber: i,
      dueDate,
      principalAmount: principalPortion,
      interestAmount: interestPortion,
      feeAmount: '0.0000',
      totalAmount,
    });
  }

  return entries;
}

export function generateReducingBalanceSchedule(params: ScheduleParams): ScheduleEntry[] {
  const { principalAmount, interestRate, tenorDays, startDate, gracePeriodDays = 0 } = params;
  const months = Math.max(Math.ceil(tenorDays / 30), 1);
  const monthlyRate = divide(interestRate, '1200');
  const fixedPrincipal = bankersRound(divide(principalAmount, String(months)), 4);

  const entries: ScheduleEntry[] = [];
  let remainingPrincipal = principalAmount;

  for (let i = 1; i <= months; i++) {
    const dueDate = addDays(startDate, gracePeriodDays + i * 30);
    const interestPortion = bankersRound(multiply(remainingPrincipal, monthlyRate), 4);

    const principalPortion = i === months ? remainingPrincipal : fixedPrincipal;
    const totalAmount = bankersRound(add(principalPortion, interestPortion), 4);
    remainingPrincipal = bankersRound(subtract(remainingPrincipal, principalPortion), 4);

    entries.push({
      installmentNumber: i,
      dueDate,
      principalAmount: principalPortion,
      interestAmount: interestPortion,
      feeAmount: '0.0000',
      totalAmount,
    });
  }

  return entries;
}

export function generateLumpSumSchedule(params: ScheduleParams): ScheduleEntry[] {
  const { principalAmount, interestRate, tenorDays, startDate } = params;
  const dailyRate = divide(interestRate, '36500');
  const totalInterest = bankersRound(multiply(principalAmount, multiply(dailyRate, String(tenorDays))), 4);
  const totalAmount = add(principalAmount, totalInterest);

  return [{
    installmentNumber: 1,
    dueDate: addDays(startDate, tenorDays),
    principalAmount: bankersRound(principalAmount, 4),
    interestAmount: totalInterest,
    feeAmount: '0.0000',
    totalAmount: bankersRound(totalAmount, 4),
  }];
}

export function generateBalloonSchedule(params: ScheduleParams): ScheduleEntry[] {
  const { principalAmount, interestRate, tenorDays, startDate, gracePeriodDays = 0 } = params;
  const months = Math.max(Math.ceil(tenorDays / 30), 1);
  const monthlyRate = divide(interestRate, '1200');

  const entries: ScheduleEntry[] = [];
  let remainingPrincipal = principalAmount;

  for (let i = 1; i <= months; i++) {
    const dueDate = addDays(startDate, gracePeriodDays + i * 30);
    const interestPortion = bankersRound(multiply(remainingPrincipal, monthlyRate), 4);

    if (i === months) {
      // Final balloon payment
      entries.push({
        installmentNumber: i,
        dueDate,
        principalAmount: remainingPrincipal,
        interestAmount: interestPortion,
        feeAmount: '0.0000',
        totalAmount: bankersRound(add(remainingPrincipal, interestPortion), 4),
      });
    } else {
      // Interest-only payment
      entries.push({
        installmentNumber: i,
        dueDate,
        principalAmount: '0.0000',
        interestAmount: interestPortion,
        feeAmount: '0.0000',
        totalAmount: interestPortion,
      });
    }
  }

  return entries;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
