export enum LedgerEntryType {
  DISBURSEMENT = 'disbursement',
  INTEREST_ACCRUAL = 'interest_accrual',
  FEE = 'fee',
  PENALTY = 'penalty',
  REPAYMENT = 'repayment',
  ADJUSTMENT = 'adjustment',
  WRITE_OFF = 'write_off',
  REVERSAL = 'reversal',
}

export enum DebitCredit {
  DEBIT = 'debit',
  CREDIT = 'credit',
}
