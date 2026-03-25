export enum ProductType {
  OVERDRAFT = 'overdraft',
  MICRO_LOAN = 'micro_loan',
  BNPL = 'bnpl',
  INVOICE_FINANCING = 'invoice_financing',
}

export enum ProductStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DISCONTINUED = 'discontinued',
}

export enum InterestRateModel {
  FLAT = 'flat',
  REDUCING_BALANCE = 'reducing_balance',
  TIERED = 'tiered',
}

export enum RepaymentMethod {
  LUMP_SUM = 'lump_sum',
  EQUAL_INSTALLMENTS = 'equal_installments',
  REDUCING = 'reducing',
  BALLOON = 'balloon',
  AUTO_DEDUCTION = 'auto_deduction',
}

export enum ApprovalWorkflow {
  AUTO = 'auto',
  SEMI_AUTO = 'semi_auto',
  SINGLE_LEVEL = 'single_level',
  MULTI_LEVEL = 'multi_level',
}
