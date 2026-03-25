import { RepaymentScheduleStatus } from '../enums';
import { IBaseEntity, ITenantScoped } from './common.interface';

export interface IRepaymentScheduleEntry extends IBaseEntity, ITenantScoped {
  contractId: string;
  installmentNumber: number;
  dueDate: Date;
  principalAmount?: string;
  interestAmount?: string;
  feeAmount?: string;
  totalAmount: string;
  paidAmount: string;
  status: RepaymentScheduleStatus;
  paidAt?: Date;
}
