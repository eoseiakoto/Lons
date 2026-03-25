import { LenderStatus } from '../enums';
import { IBaseEntity, ISoftDeletable, ITenantScoped } from './common.interface';

export interface ILender extends IBaseEntity, ISoftDeletable, ITenantScoped {
  name: string;
  licenseNumber?: string;
  country?: string;
  fundingCapacity?: string;
  fundingCurrency?: string;
  minInterestRate?: string;
  maxInterestRate?: string;
  settlementAccount?: Record<string, unknown>;
  riskParameters?: Record<string, unknown>;
  status: LenderStatus;
}
