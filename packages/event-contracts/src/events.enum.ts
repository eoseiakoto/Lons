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

  // Notification events (Phase 4)
  NOTIFICATION_SENT = 'notification.sent',
  NOTIFICATION_FAILED = 'notification.failed',
  NOTIFICATION_DELIVERED = 'notification.delivered',

  // Recovery events (Sprint 5)
  RECOVERY_STRATEGY_RECOMMENDED = 'recovery.strategy_recommended',
  RECOVERY_STRATEGY_APPLIED = 'recovery.strategy_applied',
  RECOVERY_OUTCOME_RECORDED = 'recovery.outcome_recorded',
  LOAN_RESTRUCTURED = 'loan.restructured',

  // Monitoring events (Sprint 5)
  MONITORING_RISK_CHANGED = 'monitoring.risk_changed',
  MONITORING_ALERT_TRIGGERED = 'monitoring.alert_triggered',
  MONITORING_ALERT_ACKNOWLEDGED = 'monitoring.alert_acknowledged',
  ADAPTIVE_ACTION_EXECUTED = 'monitoring.adaptive_action_executed',

  // ML model events (Sprint 5)
  ML_MODEL_TRAINED = 'ml_model.trained',
  ML_MODEL_ACTIVATED = 'ml_model.activated',
  ML_MODEL_DRIFT_DETECTED = 'ml_model.drift_detected',

  // Webhook events (Sprint 6)
  WEBHOOK_DELIVERY_ATTEMPTED = 'webhook.delivery_attempted',
  WEBHOOK_DELIVERY_SUCCEEDED = 'webhook.delivery_succeeded',
  WEBHOOK_DELIVERY_FAILED = 'webhook.delivery_failed',
  WEBHOOK_DELIVERY_EXHAUSTED = 'webhook.delivery_exhausted',

  // Audit events (Sprint 6)
  AUDIT_ENTRY_CREATED = 'audit.entry_created',

  // Integration events (Sprint 5)
  INTEGRATION_HEALTH_CHANGED = 'integration.health_changed',

  // Cooling-off events (Sprint 9)
  CONTRACT_COOLING_OFF_STARTED = 'contract.cooling_off.started',
  CONTRACT_COOLING_OFF_CANCELLED = 'contract.cooling_off.cancelled',
  CONTRACT_COOLING_OFF_EXPIRED = 'contract.cooling_off.expired',

  // AML Screening events (Sprint 9)
  SCREENING_INITIATED = 'screening.initiated',
  SCREENING_CLEAR = 'screening.clear',
  SCREENING_MATCH_FOUND = 'screening.match.found',
  SCREENING_POTENTIAL_MATCH = 'screening.potential_match',
  SCREENING_ERROR = 'screening.error',
  SCREENING_MANUAL_REVIEW_REQUIRED = 'screening.manual_review.required',
  SCREENING_MANUAL_REVIEW_COMPLETED = 'screening.manual_review.completed',

  // Exposure events (Sprint 9)
  EXPOSURE_LIMIT_CHECK_PASSED = 'exposure.limit.check.passed',
  EXPOSURE_LIMIT_CHECK_FAILED = 'exposure.limit.check.failed',
  EXPOSURE_LIMIT_WARNING = 'exposure.limit.warning',

  // Anonymization events (Sprint 9)
  CUSTOMER_ANONYMIZATION_REQUESTED = 'customer.anonymization.requested',
  CUSTOMER_ANONYMIZATION_COMPLETED = 'customer.anonymization.completed',
  CUSTOMER_ANONYMIZATION_BLOCKED = 'customer.anonymization.blocked',

  // ── Overdraft (Sprint 10B) ────────────────────────────────────────────
  // Credit line lifecycle
  CREDITLINE_ACTIVATED = 'creditline.activated',
  CREDITLINE_FROZEN = 'creditline.frozen',
  CREDITLINE_UNFROZEN = 'creditline.unfrozen',
  CREDITLINE_SUSPENDED = 'creditline.suspended',
  CREDITLINE_REINSTATED = 'creditline.reinstated',
  CREDITLINE_CLOSED = 'creditline.closed',
  CREDITLINE_EXPIRED = 'creditline.expired',

  // Drawdown events
  CREDITLINE_DRAWDOWN_INITIATED = 'creditline.drawdown.initiated',
  CREDITLINE_DRAWDOWN_COMPLETED = 'creditline.drawdown.completed',
  CREDITLINE_DRAWDOWN_FAILED = 'creditline.drawdown.failed',
  CREDITLINE_DRAWDOWN_REVERSED = 'creditline.drawdown.reversed',

  // Repayment events
  CREDITLINE_REPAYMENT_AUTO_COLLECTED = 'creditline.repayment.auto_collected',
  CREDITLINE_REPAYMENT_MANUAL = 'creditline.repayment.manual',
  CREDITLINE_REPAYMENT_FAILED = 'creditline.repayment.failed',
  CREDITLINE_FULLY_REPAID = 'creditline.fully_repaid',

  // Limit management
  CREDITLINE_LIMIT_CHANGED = 'creditline.limit.changed',
  CREDITLINE_LIMIT_REVIEW_SCHEDULED = 'creditline.limit.review_scheduled',

  // Interest and billing
  CREDITLINE_INTEREST_ACCRUED = 'creditline.interest.accrued',
  CREDITLINE_CYCLE_CLOSED = 'creditline.cycle.closed',
  CREDITLINE_STATEMENT_GENERATED = 'creditline.statement.generated',

  // Overdue / aging (Sprint 11 A5)
  CREDITLINE_AGED = 'creditline.aged',
  CREDITLINE_OVERDUE_REMINDER_DUE = 'creditline.overdue.reminder_due',
  CREDITLINE_RECOVERY_REFERRED = 'creditline.recovery.referred',
  CREDITLINE_NPL_CLASSIFIED = 'creditline.npl.classified',

  // Wallet events (from integration service)
  WALLET_BALANCE_INSUFFICIENT = 'wallet.balance.insufficient',
  WALLET_BALANCE_CREDITED = 'wallet.balance.credited',
  WALLET_OVERDRAFT_DECLINED = 'wallet.overdraft.declined',

  // ── BNPL (Sprint 11 Track B) ─────────────────────────────────────────
  // Purchase lifecycle
  BNPL_PURCHASE_INITIATED = 'bnpl.purchase.initiated',
  BNPL_PURCHASE_APPROVED = 'bnpl.purchase.approved',
  BNPL_PURCHASE_DECLINED = 'bnpl.purchase.declined',
  BNPL_PURCHASE_COMPLETED = 'bnpl.purchase.completed',
  BNPL_PURCHASE_CANCELLED = 'bnpl.purchase.cancelled',

  // Installment lifecycle
  BNPL_INSTALLMENT_DUE = 'bnpl.installment.due',
  BNPL_INSTALLMENT_PAID = 'bnpl.installment.paid',
  BNPL_INSTALLMENT_OVERDUE = 'bnpl.installment.overdue',
  BNPL_INSTALLMENT_WAIVED = 'bnpl.installment.waived',
  // Sprint 12 G2 — auto-collection on due date
  BNPL_INSTALLMENT_COLLECTED = 'bnpl.installment.collected',
  BNPL_INSTALLMENT_COLLECTION_FAILED = 'bnpl.installment.collection_failed',

  // Acceleration
  BNPL_ACCELERATED = 'bnpl.accelerated',

  // Merchant settlement
  BNPL_MERCHANT_SETTLEMENT_GENERATED = 'bnpl.merchant_settlement.generated',
  BNPL_MERCHANT_SETTLEMENT_COMPLETED = 'bnpl.merchant_settlement.completed',
  BNPL_MERCHANT_SETTLEMENT_FAILED = 'bnpl.merchant_settlement.failed',

  // Refund
  BNPL_REFUND_INITIATED = 'bnpl.refund.initiated',
  BNPL_REFUND_COMPLETED = 'bnpl.refund.completed',

  // Collections referral (Sprint 11 Track B FIX 7)
  BNPL_COLLECTIONS_REFERRED = 'bnpl.collections.referred',

  // Early settlement / advance payment (Sprint 12 G3)
  BNPL_EARLY_SETTLEMENT = 'bnpl.early_settlement',
  BNPL_ADVANCE_PAYMENT = 'bnpl.advance_payment',

  // ── Invoice Factoring (Sprint 12) ────────────────────────────────────
  // Invoice lifecycle (16)
  INVOICE_SUBMITTED = 'invoice.submitted',
  INVOICE_UNDER_REVIEW = 'invoice.under_review',
  INVOICE_VERIFIED = 'invoice.verified',
  INVOICE_REJECTED = 'invoice.rejected',
  INVOICE_OFFER_GENERATED = 'invoice.offer.generated',
  INVOICE_OFFER_ACCEPTED = 'invoice.offer.accepted',
  INVOICE_OFFER_DECLINED = 'invoice.offer.declined',
  INVOICE_FUNDED = 'invoice.funded',
  INVOICE_DEBTOR_NOTIFIED = 'invoice.debtor.notified',
  INVOICE_PAYMENT_RECEIVED = 'invoice.payment.received',
  INVOICE_PAYMENT_PARTIAL = 'invoice.payment.partial',
  DEBTOR_PAYMENT_MATCHED = 'invoice.debtor_payment.matched',
  DEBTOR_PAYMENT_UNMATCHED = 'invoice.debtor_payment.unmatched',
  INVOICE_RESERVE_RELEASED = 'invoice.reserve.released',
  INVOICE_SETTLED = 'invoice.settled',
  INVOICE_DISPUTED = 'invoice.disputed',
  INVOICE_DEFAULTED = 'invoice.defaulted',
  INVOICE_CANCELLED = 'invoice.cancelled',

  // Debtor lifecycle (5)
  DEBTOR_CREATED = 'debtor.created',
  DEBTOR_RISK_ASSESSED = 'debtor.risk.assessed',
  DEBTOR_SUSPENDED = 'debtor.suspended',
  DEBTOR_BLACKLISTED = 'debtor.blacklisted',
  DEBTOR_EXPOSURE_CHANGED = 'debtor.exposure.changed',

  // Concentration (2)
  CONCENTRATION_LIMIT_WARNING = 'concentration.limit.warning',
  CONCENTRATION_LIMIT_BREACHED = 'concentration.limit.breached',

  // Recourse / write-off (additional, beyond the 23 in spec)
  RECOURSE_ENFORCEMENT_INITIATED = 'invoice.recourse.initiated',
  NON_RECOURSE_WRITE_OFF = 'invoice.non_recourse.write_off',

  // ── Sprint 14 — Commercial billing + plan tier (S14-9 … S14-15) ──
  BILLING_INVOICE_GENERATED = 'billing.invoice.generated',
  BILLING_INVOICE_PAID = 'billing.invoice.paid',
  BILLING_INVOICE_OVERDUE = 'billing.invoice.overdue',
  BILLING_FEE_RECORDED = 'billing.fee.recorded',
  USAGE_THRESHOLD_WARNING = 'usage.threshold.warning',
  QUOTA_EXCEEDED = 'usage.quota.exceeded',
  PLAN_UPGRADE_REQUESTED = 'plan.upgrade.requested',
  PLAN_TIER_CHANGED = 'plan.tier.changed',
}
