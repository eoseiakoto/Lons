export const PERMISSIONS = {
  // Tenant management
  TENANT_CREATE: 'tenant:create',
  TENANT_READ: 'tenant:read',
  TENANT_UPDATE: 'tenant:update',
  TENANT_SUSPEND: 'tenant:suspend',

  // User management
  USER_CREATE: 'user:create',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DEACTIVATE: 'user:deactivate',

  // Role management
  ROLE_CREATE: 'role:create',
  ROLE_READ: 'role:read',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',

  // Product management
  PRODUCT_CREATE: 'product:create',
  PRODUCT_READ: 'product:read',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_ACTIVATE: 'product:activate',

  // Customer management
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_UPDATE: 'customer:update',
  CUSTOMER_READ_PII: 'customer:read_pii',
  CUSTOMER_BLACKLIST: 'customer:blacklist',

  // Lender management
  LENDER_CREATE: 'lender:create',
  LENDER_READ: 'lender:read',
  LENDER_UPDATE: 'lender:update',

  // Subscription management
  SUBSCRIPTION_CREATE: 'subscription:create',
  SUBSCRIPTION_READ: 'subscription:read',
  SUBSCRIPTION_UPDATE: 'subscription:update',

  // Loan management
  LOAN_REQUEST_CREATE: 'loan_request:create',
  LOAN_REQUEST_READ: 'loan_request:read',
  LOAN_REQUEST_PROCESS: 'loan_request:process',

  // Contract management
  CONTRACT_READ: 'contract:read',
  CONTRACT_UPDATE: 'contract:update',

  // Repayment management
  REPAYMENT_CREATE: 'repayment:create',
  REPAYMENT_READ: 'repayment:read',

  // Audit
  AUDIT_READ: 'audit:read',

  // Analytics
  ANALYTICS_READ: 'analytics:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  sp_admin: Object.values(PERMISSIONS) as Permission[],
  sp_operator: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.LOAN_REQUEST_READ,
    PERMISSIONS.LOAN_REQUEST_CREATE,
    PERMISSIONS.LOAN_REQUEST_PROCESS,
    PERMISSIONS.CONTRACT_READ,
    PERMISSIONS.REPAYMENT_READ,
    PERMISSIONS.REPAYMENT_CREATE,
    PERMISSIONS.SUBSCRIPTION_READ,
    PERMISSIONS.SUBSCRIPTION_CREATE,
    PERMISSIONS.SUBSCRIPTION_UPDATE,
  ],
  sp_analyst: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.LOAN_REQUEST_READ,
    PERMISSIONS.CONTRACT_READ,
    PERMISSIONS.REPAYMENT_READ,
    PERMISSIONS.ANALYTICS_READ,
  ],
  sp_auditor: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_READ_PII,
    PERMISSIONS.LOAN_REQUEST_READ,
    PERMISSIONS.CONTRACT_READ,
    PERMISSIONS.REPAYMENT_READ,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ANALYTICS_READ,
  ],
  sp_collections: [
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_READ_PII,
    PERMISSIONS.CONTRACT_READ,
    PERMISSIONS.CONTRACT_UPDATE,
    PERMISSIONS.REPAYMENT_READ,
    PERMISSIONS.REPAYMENT_CREATE,
    PERMISSIONS.LOAN_REQUEST_READ,
  ],
};
