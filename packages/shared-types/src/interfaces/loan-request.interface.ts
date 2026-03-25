import { LoanRequestStatus } from '../enums';
import { IBaseEntity, ITenantScoped } from './common.interface';

export interface ILoanRequest extends IBaseEntity, ITenantScoped {
  idempotencyKey?: string;
  customerId: string;
  productId: string;
  productVersion?: number;
  requestedAmount: string;
  requestedTenor?: number;
  currency: string;
  channel?: string;
  status: LoanRequestStatus;
  rejectionReasons?: Record<string, unknown>;
  scoringResultId?: string;
  approvedAmount?: string;
  approvedTenor?: number;
  offerDetails?: Record<string, unknown>;
  offerExpiresAt?: Date;
  acceptedAt?: Date;
  contractId?: string;
  processedBy?: string;
  processingNotes?: string;
  metadata?: Record<string, unknown>;
}
