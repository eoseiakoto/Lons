import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import {
  DebtorStatusGql,
  InvoiceStatusGql,
  RecourseTypeGql,
} from '../types/factoring.type';

/**
 * GraphQL input shapes for the Invoice Factoring resolvers
 * (Sprint 12 Phase 4A).
 *
 * Monetary values are Decimal-as-string per CLAUDE.md and validated with the
 * canonical 4-dp regex (`/^\d+(\.\d{1,4})?$/`). Dates submitted as ISO 8601
 * (`YYYY-MM-DD` for calendar dates).
 *
 * FIX-STAB-1: class-validator decorators placed ABOVE @Field so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted. See invoice-verification.input.ts for the
 * canonical pattern.
 */

const DECIMAL_4DP_REGEX = /^\d+(\.\d{1,4})?$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─── Debtor inputs ───────────────────────────────────────────────────────

@InputType()
export class CreateDebtorInput {
  @IsString()
  @MinLength(1)
  @Field()
  companyName!: string;

  /** Required — ISO-3 country code (e.g. "GHA", "KEN"). */
  @IsString()
  @Length(3, 3)
  @Field()
  country!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  tradingName?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  taxId?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  industrySector?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  contactName?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  externalCreditRating?: string;

  /** Decimal-as-string. */
  @IsOptional()
  @Matches(DECIMAL_4DP_REGEX, { message: 'exposureLimit must be a Decimal string with up to 4dp' })
  @Field({ nullable: true })
  exposureLimit?: string;
}

@InputType()
export class UpdateDebtorInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  companyName?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  tradingName?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  taxId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Field({ nullable: true })
  country?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  industrySector?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  contactName?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  externalCreditRating?: string;

  /** Decimal-as-string. */
  @IsOptional()
  @Matches(DECIMAL_4DP_REGEX, { message: 'exposureLimit must be a Decimal string with up to 4dp' })
  @Field({ nullable: true })
  exposureLimit?: string;
}

@InputType()
export class DebtorFiltersInput {
  @IsOptional()
  @IsEnum(DebtorStatusGql)
  @Field(() => DebtorStatusGql, { nullable: true })
  status?: DebtorStatusGql;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  industrySector?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Field({ nullable: true })
  country?: string;

  /** Free-text search across companyName + registrationNumber. */
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  search?: string;
}

// ─── Invoice inputs ──────────────────────────────────────────────────────

@InputType()
export class SubmitInvoiceInput {
  @IsString()
  @MinLength(1)
  @Field()
  idempotencyKey!: string;

  @IsUUID()
  @Field(() => ID)
  sellerId!: string;

  @IsUUID()
  @Field(() => ID)
  debtorId!: string;

  @IsUUID()
  @Field(() => ID)
  productId!: string;

  @IsString()
  @MinLength(1)
  @Field()
  invoiceNumber!: string;

  /** ISO 8601 calendar date (YYYY-MM-DD). */
  @IsDateString()
  @Matches(ISO_DATE_REGEX, { message: 'issueDate must be YYYY-MM-DD' })
  @Field()
  issueDate!: string;

  /** ISO 8601 calendar date (YYYY-MM-DD). Must be strictly future. */
  @IsDateString()
  @Matches(ISO_DATE_REGEX, { message: 'dueDate must be YYYY-MM-DD' })
  @Field()
  dueDate!: string;

  /** Decimal-as-string. Must be positive. */
  @Matches(DECIMAL_4DP_REGEX, { message: 'faceValue must be a Decimal string with up to 4dp' })
  @Field()
  faceValue!: string;

  /** ISO 4217 currency code (e.g. "GHS"). */
  @IsString()
  @Length(3, 3)
  @Field()
  currency!: string;

  @IsOptional()
  @IsEnum(RecourseTypeGql)
  @Field(() => RecourseTypeGql, { nullable: true })
  recourseType?: RecourseTypeGql;

  /** Optional supporting documents (invoice PDF, delivery note, etc.). */
  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  documents?: string;

  /** Free-form metadata (JSON serialised as a string). */
  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  metadata?: string;
}

@InputType()
export class RecordDebtorPaymentInput {
  /** Decimal-as-string. Must be positive. */
  @Matches(DECIMAL_4DP_REGEX, { message: 'amountReceived must be a Decimal string with up to 4dp' })
  @Field()
  amountReceived!: string;

  @IsString()
  @MinLength(1)
  @Field()
  paymentRef!: string;

  @IsString()
  @MinLength(1)
  @Field()
  idempotencyKey!: string;
}

@InputType()
export class InvoiceFiltersInput {
  @IsOptional()
  @IsEnum(InvoiceStatusGql)
  @Field(() => InvoiceStatusGql, { nullable: true })
  status?: InvoiceStatusGql;

  @IsOptional()
  @IsUUID()
  @Field(() => ID, { nullable: true })
  sellerId?: string;

  @IsOptional()
  @IsUUID()
  @Field(() => ID, { nullable: true })
  debtorId?: string;

  /** ISO 8601 calendar date (YYYY-MM-DD) — inclusive lower bound. */
  @IsOptional()
  @IsDateString()
  @Field({ nullable: true })
  dateRangeFrom?: string;

  /** ISO 8601 calendar date (YYYY-MM-DD) — inclusive upper bound. */
  @IsOptional()
  @IsDateString()
  @Field({ nullable: true })
  dateRangeTo?: string;

  /** Decimal-as-string — inclusive lower bound. */
  @IsOptional()
  @Matches(DECIMAL_4DP_REGEX, { message: 'amountMin must be a Decimal string with up to 4dp' })
  @Field({ nullable: true })
  amountMin?: string;

  /** Decimal-as-string — inclusive upper bound. */
  @IsOptional()
  @Matches(DECIMAL_4DP_REGEX, { message: 'amountMax must be a Decimal string with up to 4dp' })
  @Field({ nullable: true })
  amountMax?: string;
}

// Re-export the shared PaginationInput so resolvers can import everything
// factoring-related from one place.
@InputType()
export class FactoringPaginationInput {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Field(() => Int, { nullable: true, defaultValue: 20 })
  first?: number;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  after?: string;
}
