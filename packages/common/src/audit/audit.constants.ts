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
}

export enum AuditAccessType {
  TENANT_SCOPED = 'tenant_scoped',
  PLATFORM_ADMIN_CROSS_TENANT = 'platform_admin_cross_tenant',
}
