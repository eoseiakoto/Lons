export enum AuditActionType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  READ = 'read',
  LOGIN = 'login',
  LOGOUT = 'logout',
  LOGIN_FAILED = 'login_failed',
  ROLE_ASSIGNED = 'role_assigned',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_ROTATED = 'api_key_rotated',
  API_KEY_REVOKED = 'api_key_revoked',
  DISBURSEMENT = 'disbursement',
  REPAYMENT = 'repayment',
  SETTLEMENT = 'settlement',
  WRITE_OFF = 'write_off',
  BLACKLIST = 'blacklist',
  CONFIG_CHANGE = 'config_change',
  // Sprint 18 (S18-1) — operator decisions surfaced on the loan
  // review workflow. APPROVE / REJECT are coarse-grained UPDATEs but
  // we want them queryable as distinct audit actions for compliance.
  LOAN_APPROVE = 'loan_approve',
  LOAN_REJECT = 'loan_reject',
  LOAN_ESCALATE = 'loan_escalate',
  LOAN_TERMS_MODIFIED = 'loan_terms_modified',
  // Sprint 18 (S18-2) — contract write operations from the operator
  // portal: manual payment, restructure, penalty waiver.
  MANUAL_PAYMENT = 'manual_payment',
  CONTRACT_RESTRUCTURE = 'contract_restructure',
  PENALTY_WAIVER = 'penalty_waiver',
  // Sprint 18 (S18-3) — CSV/PDF report export.
  EXPORT = 'export',
  // Sprint 18 (S18-11) — tenant requests a plan tier upgrade.
  PLAN_UPGRADE_REQUESTED = 'plan_upgrade_requested',
}

export enum AuditResourceType {
  CUSTOMER = 'customer',
  PRODUCT = 'product',
  CONTRACT = 'contract',
  LOAN_REQUEST = 'loan_request',
  REPAYMENT = 'repayment',
  TENANT = 'tenant',
  USER = 'user',
  ROLE = 'role',
  API_KEY = 'api_key',
  LENDER = 'lender',
  SETTLEMENT = 'settlement',
  WEBHOOK = 'webhook',
  PLATFORM_USER = 'platform_user',
  // Sprint 18 (S18-3) — report-export audit log resource.
  REPORT = 'report',
}

export enum AuditAccessType {
  TENANT_SCOPED = 'tenant_scoped',
  PLATFORM_ADMIN_CROSS_TENANT = 'platform_admin_cross_tenant',
}
