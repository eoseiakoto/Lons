import { RepaymentStatus, RepaymentMethodType } from '../enums';
import { IBaseEntity, ITenantScoped } from './common.interface';

export interface IRepayment extends IBaseEntity, ITenantScoped {
  contractId: string;
  customerId: string;
  amount: string;
  currency: string;
  method: RepaymentMethodType;
  source?: string;
  externalRef?: string;
  allocatedPrincipal?: string;
  allocatedInterest?: string;
  allocatedFees?: string;
  allocatedPenalties?: string;
  status: RepaymentStatus;
  failureReason?: string;
  receiptNumber?: string;
  completedAt?: Date;
}
