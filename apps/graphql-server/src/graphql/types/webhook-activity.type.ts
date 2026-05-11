import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

import { PageInfo } from './page-info.type';

/**
 * Sprint 13B (S13B-6) — Webhook activity feed.
 *
 * Surface for the per-invoice "Webhook Activity" panel on the admin portal
 * Invoice Detail screen (`apps/admin-portal/src/app/(portal)/loans/factoring/[id]/page.tsx`).
 * Backed by the audit log (`packages/database/prisma/schema.prisma → AuditLog`)
 * filtered to `resourceType = 'invoice'` and webhook-driven action labels
 * (`match.debtorPayment`, `unmatch.debtorPayment`).
 */

// ─── Match-result enum ──────────────────────────────────────────────────

export enum MatchResultTypeGql {
  matched = 'matched',
  no_matching_invoice = 'no_matching_invoice',
  currency_mismatch = 'currency_mismatch',
}
registerEnumType(MatchResultTypeGql, { name: 'MatchResultType' });

@ObjectType()
export class MatchResult {
  @Field(() => MatchResultTypeGql) type!: MatchResultTypeGql;
  /**
   * `'invoice_number' | 'debtor_ref' | 'fifo'` when matched; null on
   * unmatched outcomes. We don't enum-ify here (unlike the Prisma surface)
   * because the audit-log payload is the source of truth and may grow.
   */
  @Field({ nullable: true }) strategy?: string;
}

// ─── Activity entry ─────────────────────────────────────────────────────

@ObjectType()
export class WebhookActivityEntry {
  @Field(() => ID) id!: string;
  /** ISO-8601 — `AuditLog.createdAt`. */
  @Field() timestamp!: string;
  /** `'match.debtorPayment'` or `'unmatch.debtorPayment'` (S13B-1). */
  @Field() eventType!: string;
  /** Inbound webhook provider name from `metadata.provider` (e.g. `mtn-momo`). Null for legacy entries. */
  @Field({ nullable: true }) provider?: string;
  /** Provider's transaction reference. */
  @Field() transactionRef!: string;
  /** Decimal-as-string per CLAUDE.md (never `Number()` it). */
  @Field() amount!: string;
  /** ISO-4217 currency code. */
  @Field() currency!: string;
  /** Outcome — matched / unmatched / currency_mismatch + strategy when matched. */
  @Field(() => MatchResult) matchResult!: MatchResult;
  /** Human-readable one-liner pre-rendered server-side for the activity feed. */
  @Field() payloadSummary!: string;
}

// ─── Relay connection wrappers ──────────────────────────────────────────

@ObjectType()
export class WebhookActivityEdge {
  @Field(() => WebhookActivityEntry) node!: WebhookActivityEntry;
  @Field() cursor!: string;
}

@ObjectType()
export class WebhookActivityConnection {
  @Field(() => [WebhookActivityEdge]) edges!: WebhookActivityEdge[];
  @Field(() => PageInfo) pageInfo!: PageInfo;
}
