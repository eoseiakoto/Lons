import { ProductType, ProductStatus, InterestRateModel, RepaymentMethod, ApprovalWorkflow } from '../enums';
import { IBaseEntity, ISoftDeletable, ITenantScoped } from './common.interface';

export interface IProduct extends IBaseEntity, ISoftDeletable, ITenantScoped {
  code: string;
  name: string;
  description?: string;
  type: ProductType;
  lenderId?: string;
  currency: string;
  minAmount?: string;
  maxAmount?: string;
  minTenorDays?: number;
  maxTenorDays?: number;
  interestRateModel: InterestRateModel;
  interestRate?: string;
  rateTiers?: Record<string, unknown>;
  feeStructure?: Record<string, unknown>;
  repaymentMethod: RepaymentMethod;
  gracePeriodDays: number;
  penaltyConfig?: Record<string, unknown>;
  approvalWorkflow: ApprovalWorkflow;
  approvalThresholds?: Record<string, unknown>;
  scoringModelId?: string;
  eligibilityRules?: Record<string, unknown>;
  revenueSharing?: Record<string, unknown>;
  notificationConfig?: Record<string, unknown>;
  coolingOffHours: number;
  maxActiveLoans: number;
  version: number;
  status: ProductStatus;
  activatedAt?: Date;
  createdBy?: string;
}

export interface IProductVersion extends IBaseEntity, ITenantScoped {
  productId: string;
  version: number;
  snapshot: Record<string, unknown>;
  changeSummary?: string;
  createdBy?: string;
}
