import { subtract, compare, add, bankersRound } from '@lons/common';

export interface OutstandingAmounts {
  overduePenalties: string;
  overdueInterest: string;
  overduePrincipal: string;
  currentFees: string;
  currentInterest: string;
  currentPrincipal: string;
}

export interface AllocationResult {
  allocatedPenalties: string;
  allocatedInterest: string;
  allocatedFees: string;
  allocatedPrincipal: string;
  remainder: string;
  fullyPaid: boolean;
}

const DEFAULT_PRIORITY: (keyof OutstandingAmounts)[] = [
  'overduePenalties',
  'overdueInterest',
  'overduePrincipal',
  'currentFees',
  'currentInterest',
  'currentPrincipal',
];

export function allocatePayment(
  paymentAmount: string,
  outstanding: OutstandingAmounts,
  priorityOrder: (keyof OutstandingAmounts)[] = DEFAULT_PRIORITY,
): AllocationResult {
  let remaining = paymentAmount;
  const allocations: Record<string, string> = {
    overduePenalties: '0.0000',
    overdueInterest: '0.0000',
    overduePrincipal: '0.0000',
    currentFees: '0.0000',
    currentInterest: '0.0000',
    currentPrincipal: '0.0000',
  };

  for (const bucket of priorityOrder) {
    const bucketAmount = outstanding[bucket];
    if (compare(remaining, '0') <= 0) break;
    if (compare(bucketAmount, '0') <= 0) continue;

    if (compare(remaining, bucketAmount) >= 0) {
      allocations[bucket] = bucketAmount;
      remaining = bankersRound(subtract(remaining, bucketAmount), 4);
    } else {
      allocations[bucket] = remaining;
      remaining = '0.0000';
    }
  }

  const allocatedPenalties = allocations.overduePenalties;
  const allocatedInterest = bankersRound(add(allocations.overdueInterest, allocations.currentInterest), 4);
  const allocatedFees = allocations.currentFees;
  const allocatedPrincipal = bankersRound(add(allocations.overduePrincipal, allocations.currentPrincipal), 4);

  const totalOutstanding = Object.values(outstanding).reduce(
    (sum, val) => add(sum, val),
    '0.0000',
  );
  const fullyPaid = compare(paymentAmount, totalOutstanding) >= 0;

  return {
    allocatedPenalties,
    allocatedInterest,
    allocatedFees,
    allocatedPrincipal,
    remainder: bankersRound(remaining, 4),
    fullyPaid,
  };
}
