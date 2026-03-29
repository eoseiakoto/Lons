import { RecoveryStrategyType, RecoveryOutcomeStatus } from '../enums/recovery.enum';

export interface IRecoveryStrategy {
  type: RecoveryStrategyType;
  description: string;
  successProbability: number; // 0-1
  estimatedRecovery: string; // Decimal string
  priority: number;
  confidence?: number; // 0-1
  reasoning?: string;
}

export interface IRecoveryOutcome {
  id: string;
  tenantId: string;
  contractId: string;
  strategyType: RecoveryStrategyType;
  strategyParams?: Record<string, unknown>;
  status: RecoveryOutcomeStatus;
  amountRecovered?: string; // Decimal string
  daysToResolution?: number;
  notes?: string;
  appliedBy?: string;
  appliedAt: Date;
  resolvedAt?: Date;
}

export interface IRestructuringParams {
  newTenorDays?: number;
  newInstallmentAmount?: string; // Decimal string
  newInterestRate?: string; // Decimal string
  penaltyWaiver?: boolean;
  paymentHolidayDays?: number;
  reason: string;
}
