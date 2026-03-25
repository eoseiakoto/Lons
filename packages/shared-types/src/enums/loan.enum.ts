export enum LoanRequestStatus {
  RECEIVED = 'received',
  VALIDATED = 'validated',
  PRE_QUALIFIED = 'pre_qualified',
  SCORED = 'scored',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  MANUAL_REVIEW = 'manual_review',
  OFFER_SENT = 'offer_sent',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  CONTRACT_CREATED = 'contract_created',
  DISBURSING = 'disbursing',
  DISBURSED = 'disbursed',
  DISBURSEMENT_FAILED = 'disbursement_failed',
  CANCELLED = 'cancelled',
}

export enum ContractStatus {
  ACTIVE = 'active',
  PERFORMING = 'performing',
  DUE = 'due',
  OVERDUE = 'overdue',
  DELINQUENT = 'delinquent',
  DEFAULT = 'default',
  WRITTEN_OFF = 'written_off',
  SETTLED = 'settled',
  CANCELLED = 'cancelled',
}

export enum ContractClassification {
  PERFORMING = 'performing',
  SPECIAL_MENTION = 'special_mention',
  SUBSTANDARD = 'substandard',
  DOUBTFUL = 'doubtful',
  LOSS = 'loss',
}

export enum ScoringModelType {
  RULE_BASED = 'rule_based',
  ML_MODEL = 'ml_model',
  HYBRID = 'hybrid',
}

export enum ScoringContext {
  APPLICATION = 'application',
  REVIEW = 'review',
  RENEWAL = 'renewal',
  MONITORING = 'monitoring',
}

export enum RiskTier {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
}
