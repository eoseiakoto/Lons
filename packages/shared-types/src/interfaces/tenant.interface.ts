import { TenantStatus, PlanTier } from '../enums';
import { IBaseEntity, ISoftDeletable } from './common.interface';

export interface ITenant extends IBaseEntity, ISoftDeletable {
  name: string;
  legalName?: string;
  registrationNumber?: string;
  country: string;
  schemaName: string;
  planTier: PlanTier;
  status: TenantStatus;
  settings?: Record<string, unknown>;
}
