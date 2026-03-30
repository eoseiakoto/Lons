export enum RecoveryStrategyType {
  GRACE_PERIOD = 'grace_period',
  RESTRUCTURE = 'restructure',
  PARTIAL_SETTLEMENT = 'partial_settlement',
  FEE_RECOVERY = 'fee_recovery',
  ESCALATION = 'escalation',
  PAYMENT_HOLIDAY = 'payment_holiday',
}

export enum RecoveryOutcomeStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
