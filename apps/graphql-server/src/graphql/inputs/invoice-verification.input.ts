import { Field, InputType, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * Sprint 14 (S14-IF-1) — input types for the invoice verification queue.
 *
 * `RejectInvoiceInput.reason` must be one of the canonical reject
 * strings — the service double-checks this against the same list so
 * a typo'd payload can't reach the DB.
 */

@InputType()
export class ApproveInvoiceInput {
  @Field({ nullable: true }) notes?: string;
  /**
   * Verification checklist (per SPEC-invoice-factoring.md §10.4):
   * `{ documentAuthenticity, amountMatches, debtorExists, noDuplicate }`.
   * Stored as JSON on `invoice.metadata.verificationChecklist`.
   */
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
  @Field() reason!: string;
  @Field({ nullable: true }) notes?: string;
}

@InputType()
export class VerificationQueueFiltersInput {
  @Field({ nullable: true }) sellerId?: string;
  @Field({ nullable: true }) debtorId?: string;
  @Field({ nullable: true }) minAmount?: string;
  @Field({ nullable: true }) maxAmount?: string;
  @Field({ nullable: true }) submittedAfter?: string;
  @Field({ nullable: true }) submittedBefore?: string;
  /** `'me'` (claimed by current user) | `'unassigned'` | null for all. */
  @Field({ nullable: true }) assignedTo?: string;
}

@InputType()
export class VerificationQueuePaginationInput {
  @Field(() => Int, { nullable: true }) first?: number;
  @Field({ nullable: true }) after?: string;
}
