import { LonsBaseError } from './base.error';

export class TenantIsolationError extends LonsBaseError {
  constructor() {
    super('TENANT_ISOLATION_VIOLATION', 'Cross-tenant access denied');
  }
}
