export enum RepaymentScheduleStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
  WAIVED = 'waived',
}

export enum RepaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

export enum RepaymentMethodType {
  AUTO_DEDUCTION = 'auto_deduction',
  MANUAL = 'manual',
  BULK = 'bulk',
  THIRD_PARTY = 'third_party',
  FEE_RECOVERY = 'fee_recovery',
}
