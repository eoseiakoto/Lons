import { DisbursementStatus } from '../enums';
import { IBaseEntity, ITenantScoped } from './common.interface';

export interface IDisbursement extends IBaseEntity, ITenantScoped {
  contractId: string;
  customerId: string;
  amount: string;
  currency: string;
  channel?: string;
  destination?: string;
  externalRef?: string;
  status: DisbursementStatus;
  retryCount: number;
  failureReason?: string;
  completedAt?: Date;
}
