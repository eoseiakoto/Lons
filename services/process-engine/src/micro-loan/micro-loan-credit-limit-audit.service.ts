import { Injectable, Logger } from '@nestjs/common';

import {
  MicroLoanCreditLimitChange,
  PrismaService,
} from '@lons/database';

/**
 * Sprint 16 (S16-6) — append-only audit log for micro-loan credit
 * limit changes.
 *
 * Distinct from the overdraft `CreditLimitChange` audit (which keys off
 * `CreditLine`) — micro-loan credit limits live on `Subscription`
 * (`creditLimit` + `availableLimit`), so they need their own audit
 * trail with the matching shape.
 *
 * Append-only by construction: the underlying table has no `updated_at`
 * or `deleted_at`. Callers should write a NEW row on every change, not
 * mutate an existing one. The service wraps `prisma.create()` directly;
 * the surrounding $transaction (in MicroLoanCreditLimitService) keeps
 * the audit row + the Subscription update atomic.
 */
export interface IRecordCreditLimitChangeInput {
  customerId: string;
  subscriptionId: string;
  /** Decimal-as-string per CLAUDE.md. */
  previousLimit: string;
  /** Decimal-as-string per CLAUDE.md. */
  newLimit: string;
  /** `increase`, `decrease`, `suspension`, `restoration`. */
  changeType: 'increase' | 'decrease' | 'suspension' | 'restoration';
  reason: string;
  /** `system`, `manual:<userId>`, or trigger name. */
  triggeredBy: string;
  /**
   * Sprint 16 fixes (FIX-1): the identifier of whatever triggered this
   * audit row (`repaymentId` for `reviewOnRepayment`, `contractId` for
   * `reduceOnDefault`, etc). The caller checks
   * `(tenantId, sourceId)` BEFORE applying the change to dedupe
   * re-delivered events. Optional — manual operator adjustments and
   * legacy callers leave it null.
   */
  sourceId?: string;
}

/**
 * Tx-aware client shape — accepts either the root `prisma` or a
 * transactional client from `$transaction(async (tx) => {...})`. Keeps
 * the audit write atomic with the subscription update in S16-4/S16-5.
 */
type PrismaLike = {
  microLoanCreditLimitChange: PrismaService['microLoanCreditLimitChange'];
};

@Injectable()
export class MicroLoanCreditLimitAuditService {
  private readonly logger = new Logger(MicroLoanCreditLimitAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write a single audit row. Pass an explicit `tx` when calling from
   * within a `$transaction` so the audit row commits with the
   * subscription update.
   */
  async record(
    tenantId: string,
    input: IRecordCreditLimitChangeInput,
    tx?: PrismaLike,
  ): Promise<MicroLoanCreditLimitChange> {
    const client = tx ?? this.prisma;
    return client.microLoanCreditLimitChange.create({
      data: {
        tenantId,
        customerId: input.customerId,
        subscriptionId: input.subscriptionId,
        previousLimit: input.previousLimit,
        newLimit: input.newLimit,
        changeType: input.changeType,
        reason: input.reason,
        triggeredBy: input.triggeredBy,
        sourceId: input.sourceId,
      },
    });
  }

  /**
   * Cursor-paginated history for the GraphQL `creditLimitHistory`
   * query. Filterable by customer + optional subscription, newest
   * first. Caps `take` at 100.
   */
  async list(
    tenantId: string,
    filters: { customerId: string; subscriptionId?: string },
    pagination: { take?: number; cursor?: string } = {},
  ): Promise<MicroLoanCreditLimitChange[]> {
    const take = Math.min(pagination.take ?? 25, 100);
    return this.prisma.microLoanCreditLimitChange.findMany({
      where: {
        tenantId,
        customerId: filters.customerId,
        ...(filters.subscriptionId && {
          subscriptionId: filters.subscriptionId,
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
    });
  }
}
