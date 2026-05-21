import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

/**
 * Sprint 14 (S14-IF-1) — input types for the invoice verification queue.
 *
 * `RejectInvoiceInput.reason` must be one of the canonical reject
 * strings — the service double-checks this against the same list so
 * a typo'd payload can't reach the DB.
 *
 * Every field carries a class-validator decorator because the global
 * `ValidationPipe` runs with `forbidNonWhitelisted: true`. Without them
 * every property is treated as non-whitelisted and queries 400 even
 * with no inputs sent (the empty filter instance still has the
 * properties declared).
 */

const REJECT_REASONS = [
  'duplicate_invoice',
  'invalid_document',
  'debtor_not_verified',
  'amount_discrepancy',
  'other',
] as const;

@InputType()
export class ApproveInvoiceInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true }) notes?: string;
  /**
   * Verification checklist (per SPEC-invoice-factoring.md §10.4):
   * `{ documentAuthenticity, amountMatches, debtorExists, noDuplicate }`.
   * Stored as JSON on `invoice.metadata.verificationChecklist`.
   */
  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  checklist?: Record<string, boolean>;
}

@InputType()
export class RejectInvoiceInput {
  /**
   * One of:
   *   - `duplicate_invoice`
   *   - `invalid_document`
   *   - `debtor_not_verified`
   *   - `amount_discrepancy`
   *   - `other`
   */
  @IsIn(REJECT_REASONS as unknown as string[])
  @Field() reason!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true }) notes?: string;
}

@InputType()
export class VerificationQueueFiltersInput {
  @IsOptional() @IsString() @Field({ nullable: true }) sellerId?: string;
  @IsOptional() @IsString() @Field({ nullable: true }) debtorId?: string;
  @IsOptional() @IsString() @Field({ nullable: true }) minAmount?: string;
  @IsOptional() @IsString() @Field({ nullable: true }) maxAmount?: string;
  @IsOptional() @IsString() @Field({ nullable: true }) submittedAfter?: string;
  @IsOptional() @IsString() @Field({ nullable: true }) submittedBefore?: string;
  /** `'me'` (claimed by current user) | `'unassigned'` | null for all. */
  @IsOptional() @IsString() @Field({ nullable: true }) assignedTo?: string;
}

@InputType()
export class VerificationQueuePaginationInput {
  @IsOptional() @IsInt() @Min(1) @Field(() => Int, { nullable: true }) first?: number;
  @IsOptional() @IsString() @Field({ nullable: true }) after?: string;
}
