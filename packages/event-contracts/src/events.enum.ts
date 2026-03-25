export enum EventType {
  // Tenant events
  TENANT_CREATED = 'tenant.created',
  TENANT_UPDATED = 'tenant.updated',
  TENANT_SUSPENDED = 'tenant.suspended',

  // User events
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DEACTIVATED = 'user.deactivated',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',

  // Product events
  PRODUCT_CREATED = 'product.created',
  PRODUCT_UPDATED = 'product.updated',
  PRODUCT_ACTIVATED = 'product.activated',
  PRODUCT_SUSPENDED = 'product.suspended',
  PRODUCT_DISCONTINUED = 'product.discontinued',

  // Customer events
  CUSTOMER_CREATED = 'customer.created',
  CUSTOMER_UPDATED = 'customer.updated',
  CUSTOMER_BLACKLISTED = 'customer.blacklisted',
  CUSTOMER_UNBLACKLISTED = 'customer.unblacklisted',

  // Subscription events
  SUBSCRIPTION_ACTIVATED = 'subscription.activated',
  SUBSCRIPTION_DEACTIVATED = 'subscription.deactivated',

  // Lender events
  LENDER_CREATED = 'lender.created',
  LENDER_UPDATED = 'lender.updated',

  // Loan lifecycle events (stubs for Phase 2)
  LOAN_REQUEST_CREATED = 'loan_request.created',
  LOAN_REQUEST_STATUS_CHANGED = 'loan_request.status_changed',
  CONTRACT_CREATED = 'contract.created',
  CONTRACT_STATE_CHANGED = 'contract.state_changed',
  DISBURSEMENT_COMPLETED = 'disbursement.completed',
  DISBURSEMENT_FAILED = 'disbursement.failed',
  REPAYMENT_RECEIVED = 'repayment.received',
  REPAYMENT_FAILED = 'repayment.failed',

  // Offer events
  OFFER_SENT = 'offer.sent',
  OFFER_EXPIRED = 'offer.expired',

  // Post-processing events (Phase 3)
  INTEREST_ACCRUED = 'interest.accrued',
  CONTRACT_AGED = 'contract.aged',
  PENALTY_APPLIED = 'penalty.applied',
  PENALTY_WAIVED = 'penalty.waived',
  SETTLEMENT_CALCULATED = 'settlement.calculated',
  SETTLEMENT_APPROVED = 'settlement.approved',
  RECONCILIATION_COMPLETED = 'reconciliation.completed',
  COLLECTIONS_ACTION_LOGGED = 'collections_action.logged',
}
