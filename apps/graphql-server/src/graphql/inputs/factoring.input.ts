import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
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
 */

const DECIMAL_4DP_REGEX = /^\d+(\.\d{1,4})?$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─── Debtor inputs ───────────────────────────────────────────────────────

@InputType()
export class CreateDebtorInput {
  @Field()
  @IsString()
  @MinLength(1)
  companyName!: string;

  /** Required — ISO-3 country code (e.g. "GHA", "KEN"). */
  @Field()
  @IsString()
  @Length(3, 3)
  country!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  tradingName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  taxId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  industrySector?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  contactEmail?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  contactName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  externalCreditRating?: string;

  /** Decimal-as-string. */
  @Field({ nullable: true })
  @IsOptional()
  @Matches(DECIMAL_4DP_REGEX, {
    message: 'exposureLimit must be a Decimal string with up to 4dp',
  })
  exposureLimit?: string;
}

@InputType()
export class UpdateDebtorInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  companyName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  tradingName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  taxId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  country?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  industrySector?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  contactEmail?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  contactName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  externalCreditRating?: string;

  /** Decimal-as-string. */
  @Field({ nullable: true })
  @IsOptional()
  @Matches(DECIMAL_4DP_REGEX, {
    message: 'exposureLimit must be a Decimal string with up to 4dp',
  })
  exposureLimit?: string;
}

@InputType()
export class DebtorFiltersInput {
  @Field(() => DebtorStatusGql, { nullable: true })
  @IsOptional()
  @IsEnum(DebtorStatusGql)
  status?: DebtorStatusGql;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  industrySector?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  country?: string;

  /** Free-text search across companyName + registrationNumber. */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  search?: string;
}

// ─── Invoice inputs ──────────────────────────────────────────────────────

@InputType()
export class SubmitInvoiceInput {
  @Field()
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;

  @Field(() => ID)
  @IsUUID()
  sellerId!: string;

  @Field(() => ID)
  @IsUUID()
  debtorId!: string;

  @Field(() => ID)
  @IsUUID()
  productId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  invoiceNumber!: string;

  /** ISO 8601 calendar date (YYYY-MM-DD). */
  @Field()
  @IsDateString()
  @Matches(ISO_DATE_REGEX, { message: 'issueDate must be YYYY-MM-DD' })
  issueDate!: string;

  /** ISO 8601 calendar date (YYYY-MM-DD). Must be strictly future. */
  @Field()
  @IsDateString()
  @Matches(ISO_DATE_REGEX, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate!: string;

  /** Decimal-as-string. Must be positive. */
  @Field()
  @Matches(DECIMAL_4DP_REGEX, {
    message: 'faceValue must be a Decimal string with up to 4dp',
  })
  faceValue!: string;

  /** ISO 4217 currency code (e.g. "GHS"). */
  @Field()
  @IsString()
  @Length(3, 3)
  currency!: string;

  @Field(() => RecourseTypeGql, { nullable: true })
  @IsOptional()
  @IsEnum(RecourseTypeGql)
  recourseType?: RecourseTypeGql;

  /** Optional supporting documents (invoice PDF, delivery note, etc.). */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  documents?: string;

  /** Free-form metadata (JSON serialised as a string). */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  metadata?: string;
}

@InputType()
export class RecordDebtorPaymentInput {
  /** Decimal-as-string. Must be positive. */
  @Field()
  @Matches(DECIMAL_4DP_REGEX, {
    message: 'amountReceived must be a Decimal string with up to 4dp',
  })
  amountReceived!: string;

  @Field()
  @IsString()
  @MinLength(1)
  paymentRef!: string;

  @Field()
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;
}

@InputType()
export class InvoiceFiltersInput {
  @Field(() => InvoiceStatusGql, { nullable: true })
  @IsOptional()
  @IsEnum(InvoiceStatusGql)
  status?: InvoiceStatusGql;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  debtorId?: string;

  /** ISO 8601 calendar date (YYYY-MM-DD) — inclusive lower bound. */
  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  dateRangeFrom?: string;

  /** ISO 8601 calendar date (YYYY-MM-DD) — inclusive upper bound. */
  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  dateRangeTo?: string;

  /** Decimal-as-string — inclusive lower bound. */
  @Field({ nullable: true })
  @IsOptional()
  @Matches(DECIMAL_4DP_REGEX, {
    message: 'amountMin must be a Decimal string with up to 4dp',
  })
  amountMin?: string;

  /** Decimal-as-string — inclusive upper bound. */
  @Field({ nullable: true })
  @IsOptional()
  @Matches(DECIMAL_4DP_REGEX, {
    message: 'amountMax must be a Decimal string with up to 4dp',
  })
  amountMax?: string;
}

// Re-export the shared PaginationInput so resolvers can import everything
// factoring-related from one place.
@InputType()
export class FactoringPaginationInput {
  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  first?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  after?: string;
}

// Suppress unused imports — IsBoolean is reserved for forthcoming filter
// fields (e.g., `verified?: boolean`) that the admin portal will need.
void IsBoolean;
