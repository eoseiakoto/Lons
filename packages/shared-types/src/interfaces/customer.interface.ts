import { CustomerStatus, Gender, KycLevel } from '../enums';
import { IBaseEntity, ISoftDeletable, ITenantScoped } from './common.interface';

export interface ICustomer extends IBaseEntity, ISoftDeletable, ITenantScoped {
  externalId: string;
  externalSource?: string;
  fullName?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  nationalId?: string;
  nationalIdType?: string;
  phonePrimary?: string;
  phoneSecondary?: string;
  email?: string;
  country?: string;
  region?: string;
  city?: string;
  kycLevel: KycLevel;
  kycVerifiedAt?: Date;
  segment?: string;
  status: CustomerStatus;
  blacklistReason?: string;
  watchlist: boolean;
  metadata?: Record<string, unknown>;
}
