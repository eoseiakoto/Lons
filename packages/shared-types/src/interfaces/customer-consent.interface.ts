import { ConsentType } from '../enums';
import { IBaseEntity, ITenantScoped } from './common.interface';

export interface ICustomerConsent extends IBaseEntity, ITenantScoped {
  customerId: string;
  consentType: ConsentType;
  granted: boolean;
  grantedAt?: Date;
  revokedAt?: Date;
  channel?: string;
  version: number;
  ipAddress?: string;
}
