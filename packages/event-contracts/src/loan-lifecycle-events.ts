import { IBaseEvent } from './base-event';
import { EventType } from './events.enum';

export interface ILoanRequestCreatedEvent extends IBaseEvent<{
  loanRequestId: string;
  customerId: string;
  productId: string;
  amount: string;
  currency: string;
}> {
  event: EventType.LOAN_REQUEST_CREATED;
}

export interface ILoanRequestStatusChangedEvent extends IBaseEvent<{
  loanRequestId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}> {
  event: EventType.LOAN_REQUEST_STATUS_CHANGED;
}

export interface IContractCreatedEvent extends IBaseEvent<{
  contractId: string;
  contractNumber: string;
  customerId: string;
  productId: string;
  principalAmount: string;
  currency: string;
}> {
  event: EventType.CONTRACT_CREATED;
}

export interface IContractStateChangedEvent extends IBaseEvent<{
  contractId: string;
  previousStatus: string;
  newStatus: string;
}> {
  event: EventType.CONTRACT_STATE_CHANGED;
}

export interface IDisbursementCompletedEvent extends IBaseEvent<{
  disbursementId: string;
  contractId: string;
  customerId: string;
  amount: string;
}> {
  event: EventType.DISBURSEMENT_COMPLETED;
}

export interface IDisbursementFailedEvent extends IBaseEvent<{
  disbursementId: string;
  contractId: string;
  reason: string;
  retryCount: number;
}> {
  event: EventType.DISBURSEMENT_FAILED;
}

export interface IRepaymentReceivedEvent extends IBaseEvent<{
  repaymentId: string;
  contractId: string;
  amount: string;
  allocatedPrincipal: string;
  allocatedInterest: string;
  allocatedFees: string;
  allocatedPenalties: string;
}> {
  event: EventType.REPAYMENT_RECEIVED;
}

export interface IRepaymentFailedEvent extends IBaseEvent<{
  repaymentId: string;
  contractId: string;
  amount: string;
  reason: string;
}> {
  event: EventType.REPAYMENT_FAILED;
}
