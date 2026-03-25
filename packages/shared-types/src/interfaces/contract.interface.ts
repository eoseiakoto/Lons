import { ContractStatus, ContractClassification, RepaymentMethod } from '../enums';
import { IBaseEntity, ITenantScoped } from './common.interface';

export interface IContract extends IBaseEntity, ITenantScoped {
  contractNumber: string;
  customerId: string;
  productId: string;
  productVersion?: number;
  lenderId: string;
  loanRequestId: string;
  principalAmount: string;
  interestRate: string;
  interestAmount?: string;
  totalFees?: string;
  totalCostCredit?: string;
  currency: string;
  tenorDays?: number;
  repaymentMethod: RepaymentMethod;
  startDate: Date;
  maturityDate: Date;
  firstPaymentDate?: Date;
  outstandingPrincipal?: string;
  outstandingInterest?: string;
  outstandingFees?: string;
  outstandingPenalties?: string;
  totalOutstanding?: string;
  totalPaid?: string;
  daysPastDue: number;
  status: ContractStatus;
  classification: ContractClassification;
  termsSnapshot?: Record<string, unknown>;
  restructured: boolean;
  restructureCount: number;
  disbursementId?: string;
  metadata?: Record<string, unknown>;
  settledAt?: Date;
  defaultedAt?: Date;
  writtenOffAt?: Date;
}
