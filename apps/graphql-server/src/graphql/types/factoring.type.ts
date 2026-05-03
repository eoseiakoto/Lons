import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

import { PageInfo } from './page-info.type';

/**
 * GraphQL surface for the Invoice Factoring product family
 * (Sprint 12 Phase 4A).
 *
 * Mirrors the Prisma `Debtor`, `Invoice`, and the in-memory `InvoiceOffer` /
 * `ConcentrationSummary` shapes returned by the process-engine factoring
 * services. Monetary fields are Decimal-as-string per CLAUDE.md.
 */

// ─── Prisma enum mirrors ─────────────────────────────────────────────────

export enum DebtorStatusGql {
  active = 'active',
  under_review = 'under_review',
  suspended = 'suspended',
  blacklisted = 'blacklisted',
}
registerEnumType(DebtorStatusGql, { name: 'DebtorStatus' });

export enum InvoiceStatusGql {
  submitted = 'submitted',
  under_review = 'under_review',
  verified = 'verified',
  offer_generated = 'offer_generated',
  offer_accepted = 'offer_accepted',
  funded = 'funded',
  debtor_notified = 'debtor_notified',
  payment_received = 'payment_received',
  reserve_released = 'reserve_released',
  settled = 'settled',
  disputed = 'disputed',
  defaulted = 'defaulted',
  cancelled = 'cancelled',
  rejected = 'rejected',
}
registerEnumType(InvoiceStatusGql, { name: 'InvoiceStatus' });

export enum VerificationStatusGql {
  pending = 'pending',
  verified = 'verified',
  failed = 'failed',
  waived = 'waived',
}
registerEnumType(VerificationStatusGql, { name: 'VerificationStatus' });

export enum RecourseTypeGql {
  with_recourse = 'with_recourse',
  without_recourse = 'without_recourse',
}
registerEnumType(RecourseTypeGql, { name: 'RecourseType' });

// ─── Debtor ──────────────────────────────────────────────────────────────

@ObjectType()
export class DebtorType {
  @Field(() => ID) id!: string;
  @Field() tenantId!: string;
  @Field() companyName!: string;
  @Field({ nullable: true }) tradingName?: string;
  @Field({ nullable: true }) registrationNumber?: string;
  @Field({ nullable: true }) taxId?: string;
  /** ISO-3 country code. */
  @Field() country!: string;
  @Field({ nullable: true }) industrySector?: string;
  @Field({ nullable: true }) contactEmail?: string;
  @Field({ nullable: true }) contactPhone?: string;
  @Field({ nullable: true }) contactName?: string;
  @Field({ nullable: true }) paymentTerms?: string;
  @Field(() => Int, { nullable: true }) averagePaymentDays?: number;
  @Field({ nullable: true }) externalCreditRating?: string;
  /** Decimal-as-string in [0, 100]. */
  @Field({ nullable: true }) internalRiskScore?: string;
  /** Decimal-as-string. */
  @Field() totalExposure!: string;
  /** Decimal-as-string. */
  @Field({ nullable: true }) exposureLimit?: string;
  @Field(() => DebtorStatusGql) status!: DebtorStatusGql;
  @Field({ nullable: true }) verifiedAt?: Date;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType()
export class DebtorEdgeType {
  @Field(() => DebtorType) node!: DebtorType;
  @Field() cursor!: string;
}

@ObjectType()
export class DebtorConnectionType {
  @Field(() => [DebtorEdgeType]) edges!: DebtorEdgeType[];
  @Field(() => PageInfo) pageInfo!: PageInfo;
  @Field(() => Int) totalCount!: number;
}

// ─── Invoice ─────────────────────────────────────────────────────────────

@ObjectType()
export class InvoiceType {
  @Field(() => ID) id!: string;
  @Field() tenantId!: string;
  @Field() sellerId!: string;
  @Field() debtorId!: string;
  @Field() productId!: string;
  @Field({ nullable: true }) contractId?: string;
  @Field() invoiceNumber!: string;
  @Field() issueDate!: Date;
  @Field() dueDate!: Date;
  /** Decimal-as-string. */
  @Field() faceValue!: string;
  @Field() currency!: string;
  /** Decimal-as-string (percent, 2dp). */
  @Field() advanceRatePercent!: string;
  /** Decimal-as-string. */
  @Field({ nullable: true }) advancedAmount?: string;
  /** Decimal-as-string. */
  @Field({ nullable: true }) reserveAmount?: string;
  /** Decimal-as-string. */
  @Field({ nullable: true }) discountFee?: string;
  /** Decimal-as-string. */
  @Field({ nullable: true }) serviceFee?: string;
  /** Decimal-as-string. */
  @Field({ nullable: true }) netDisbursement?: string;
  @Field(() => InvoiceStatusGql) status!: InvoiceStatusGql;
  @Field(() => VerificationStatusGql) verificationStatus!: VerificationStatusGql;
  @Field({ nullable: true }) verifiedBy?: string;
  @Field({ nullable: true }) verifiedAt?: Date;
  @Field({ nullable: true }) verificationNotes?: string;
  @Field(() => RecourseTypeGql) recourseType!: RecourseTypeGql;
  @Field({ nullable: true }) debtorNotifiedAt?: Date;
  @Field({ nullable: true }) debtorPaymentRef?: string;
  /** Decimal-as-string. */
  @Field({ nullable: true }) amountReceived?: string;
  /** Decimal-as-string. */
  @Field({ nullable: true }) reserveReleased?: string;
  @Field({ nullable: true }) disputeReason?: string;
  @Field({ nullable: true }) fundedAt?: Date;
  @Field({ nullable: true }) settledAt?: Date;
  @Field({ nullable: true }) defaultedAt?: Date;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType()
export class InvoiceEdgeType {
  @Field(() => InvoiceType) node!: InvoiceType;
  @Field() cursor!: string;
}

@ObjectType()
export class InvoiceConnectionType {
  @Field(() => [InvoiceEdgeType]) edges!: InvoiceEdgeType[];
  @Field(() => PageInfo) pageInfo!: PageInfo;
  @Field(() => Int) totalCount!: number;
}

// ─── InvoiceOffer (FactoringOriginationService.generateOffer) ────────────

@ObjectType()
export class InvoiceOfferType {
  @Field(() => ID) invoiceId!: string;
  /** Decimal-as-string. */
  @Field() faceValue!: string;
  /** Decimal-as-string (percent, 2dp). */
  @Field() advanceRatePercent!: string;
  /** Decimal-as-string. */
  @Field() advancedAmount!: string;
  /** Decimal-as-string. */
  @Field() reserveAmount!: string;
  /** Decimal-as-string. */
  @Field() discountFee!: string;
  /** Decimal-as-string. */
  @Field() serviceFee!: string;
  /** Decimal-as-string. */
  @Field() netDisbursement!: string;
  @Field(() => RecourseTypeGql) recourseType!: RecourseTypeGql;
  /** ISO 8601 calendar date (YYYY-MM-DD). */
  @Field() dueDate!: string;
  @Field() currency!: string;
  /** ISO 8601 timestamp — 24h from offer generation. */
  @Field({ nullable: true }) expiresAt?: string;
}

// ─── Concentration check (live submission gate) ──────────────────────────

@ObjectType()
export class ConcentrationViolationType {
  /** One of: debtor_percent, debtor_absolute, industry_percent, seller_debtor_percent. */
  @Field() type!: string;
  /** Decimal-as-string. The projected value that would result from accepting the invoice. */
  @Field() current!: string;
  /** Decimal-as-string. The configured cap that would be exceeded. */
  @Field() max!: string;
  @Field() message!: string;
}

@ObjectType()
export class ConcentrationCheckResultType {
  @Field() passed!: boolean;
  @Field(() => [ConcentrationViolationType]) violations!: ConcentrationViolationType[];
}

// ─── Concentration summary (admin dashboard) ─────────────────────────────

@ObjectType()
export class DebtorExposureRowType {
  @Field(() => ID) debtorId!: string;
  @Field() companyName!: string;
  /** Decimal-as-string. */
  @Field() totalExposure!: string;
  /** Decimal-as-string percent in [0, 100], 2dp. */
  @Field() percentOfPortfolio!: string;
}

@ObjectType()
export class IndustryExposureRowType {
  /** Null when grouping invoices whose debtor has no industry sector. */
  @Field({ nullable: true }) industrySector?: string;
  /** Decimal-as-string. */
  @Field() totalExposure!: string;
  /** Decimal-as-string percent in [0, 100], 2dp. */
  @Field() percentOfPortfolio!: string;
  @Field(() => Int) debtorCount!: number;
}

@ObjectType()
export class SellerDebtorExposureRowType {
  @Field(() => ID) sellerId!: string;
  @Field(() => ID) debtorId!: string;
  /** Decimal-as-string. */
  @Field() totalExposure!: string;
  /** Decimal-as-string percent in [0, 100], 2dp. */
  @Field() percentOfPortfolio!: string;
}

@ObjectType()
export class LimitUtilizationRowType {
  @Field() type!: string;
  /** Decimal-as-string. */
  @Field() max!: string;
  /** Decimal-as-string. */
  @Field() current!: string;
  /** Decimal-as-string percent in [0, 100], 2dp. */
  @Field() utilizationPercent!: string;
}

@ObjectType()
export class ConcentrationSummaryType {
  @Field(() => [DebtorExposureRowType]) topDebtors!: DebtorExposureRowType[];
  @Field(() => [IndustryExposureRowType]) industryBreakdown!: IndustryExposureRowType[];
  @Field(() => [SellerDebtorExposureRowType]) topSellerDebtors!: SellerDebtorExposureRowType[];
  @Field(() => [LimitUtilizationRowType]) limitUtilization!: LimitUtilizationRowType[];
}

// ─── Debtor risk assessment ──────────────────────────────────────────────

@ObjectType()
export class DebtorRiskFactorsType {
  /** Decimal-as-string. */
  @Field() paymentHistory!: string;
  /** Decimal-as-string. */
  @Field() industry!: string;
  /** Decimal-as-string. */
  @Field() country!: string;
  /** Decimal-as-string. */
  @Field() default!: string;
}

@ObjectType()
export class DebtorRiskResultType {
  /** Decimal-as-string in [0, 100] (higher = better). */
  @Field() score!: string;
  /** Whole-day average days late across paid invoices. Null if no history. */
  @Field(() => Int, { nullable: true }) averagePaymentDays?: number;
  /** Decimal-as-string in [0, 100]. % of paid invoices paid on/before due date. */
  @Field() reliabilityPercent!: string;
  @Field(() => DebtorRiskFactorsType) factors!: DebtorRiskFactorsType;
}
