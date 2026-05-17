import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import {
  NotFoundError,
  ValidationError,
  AuditActionType,
  AuditResourceType,
  EventBusService,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { AuditService } from '../audit/audit.service';

/**
 * S17-8 / FR-CM-001.3 — customer merge.
 *
 * After de-duplication is rolled out, operators occasionally need to
 * fold a duplicate that pre-dates the rules into the canonical record.
 * `mergeCustomers(source, target)`:
 *
 *   1. Re-parents every business-affecting child row from source → target.
 *   2. Merges metadata JSON (target wins on key conflict).
 *   3. Soft-deletes the source row.
 *   4. Audit-logs the merge with both IDs.
 *
 * **Idempotency.** Repeated calls with the same `idempotencyKey` return
 * the prior result. The idempotency key is stored in the merge audit
 * log's metadata; on replay we look it up first and short-circuit if a
 * matching record exists. This deliberately mirrors the loan-request
 * idempotency pattern rather than introducing a separate table.
 *
 * **Trade-offs.** We re-parent with `updateMany` rather than a recursive
 * deep-clone because:
 *   - FK ON UPDATE CASCADE isn't configured for these tables;
 *   - copying rows would break audit immutability;
 *   - the volume per merge is low (single-digit thousands worst case),
 *     so a handful of updateMany roundtrips are acceptable.
 *
 * The list of re-parented tables is hand-maintained (see
 * `REPARENT_TABLES`). Whenever a new table gains `customerId`, add it
 * here OR the merge will silently leave rows pointing at the soft-
 * deleted source. There's no scheme to enforce this at the type level
 * with current Prisma, so the list is the contract.
 */

/**
 * Tables that own a `customerId` foreign key and must be re-parented on
 * merge. Order doesn't matter — `updateMany` doesn't cross-reference
 * other tables. Tables that store an audit/event trail (audit_logs,
 * ledger_entries, refresh_tokens) are intentionally OMITTED — they
 * record history against the original customer and should not retcon.
 */
const REPARENT_TABLES = [
  'subscription',
  'loanRequest',
  'scoringResult',
  'contract',
  'disbursement',
  'repayment',
  'notification',
  'screeningResult',
  'creditLine',
  'customerConsent',
  'walletAccountMapping',
  'bnplTransaction',
  'bnplCreditLine',
  'microLoanCreditLimitChange',
  'customerFinancialData',
] as const;

export interface CustomerMergeResult {
  /** UUID of the surviving (target) customer. */
  targetCustomerId: string;
  /** UUID of the merged-away (source) customer — soft-deleted. */
  sourceCustomerId: string;
  /** Per-table reparented row counts, for audit and debugging. */
  reparented: Record<string, number>;
  /** Whether this was an idempotent replay of a prior merge. */
  idempotentReplay: boolean;
  /** ISO timestamp of the merge. */
  mergedAt: string;
}

@Injectable()
export class CustomerMergeService {
  private readonly logger = new Logger(CustomerMergeService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    // S17 review fix — emit CUSTOMER_MERGED so the financial-profile
    // and credit-summary caches can drop stale entries on merge rather
    // than waiting up to 15 minutes for TTL expiry.
    private eventBus: EventBusService,
  ) {}

  async mergeCustomers(
    tenantId: string,
    sourceCustomerId: string,
    targetCustomerId: string,
    actorId: string,
    idempotencyKey: string,
  ): Promise<CustomerMergeResult> {
    if (sourceCustomerId === targetCustomerId) {
      throw new ValidationError(
        'Cannot merge a customer into itself',
        { sourceCustomerId, targetCustomerId },
      );
    }

    // Idempotency: check for a prior successful merge under this key.
    // We store the key in audit log metadata; a hit means we replay the
    // recorded result.
    const replay = await this.findReplay(tenantId, idempotencyKey);
    if (replay) return replay;

    // Verify both customers exist and belong to the tenant. We use raw
    // `findFirst` rather than `findUniqueOrThrow` so a cross-tenant ID
    // surface as a NotFoundError (the standard hide-existence pattern).
    const [source, target] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: sourceCustomerId, tenantId, deletedAt: null },
      }),
      this.prisma.customer.findFirst({
        where: { id: targetCustomerId, tenantId, deletedAt: null },
      }),
    ]);
    if (!source) throw new NotFoundError('Customer', sourceCustomerId);
    if (!target) throw new NotFoundError('Customer', targetCustomerId);

    // Single transaction — all-or-nothing. We avoid running re-parent
    // queries serially outside a tx because a partial merge is far
    // worse than a hung tx (orphaned FKs across multiple business
    // domains).
    const reparented: Record<string, number> = {};
    await this.prisma.$transaction(async (tx) => {
      for (const table of REPARENT_TABLES) {
        // Each Prisma model exposes `updateMany`. The cast is needed
        // because we're indexing by a string literal — TypeScript can't
        // infer the union of payload types across all tables, but the
        // runtime shape is uniform (`where + data`).
        const result = await (tx as unknown as Record<string, {
          updateMany: (args: {
            where: Record<string, unknown>;
            data: Record<string, unknown>;
          }) => Promise<{ count: number }>;
        }>)[table].updateMany({
          where: { tenantId, customerId: sourceCustomerId },
          data: { customerId: targetCustomerId },
        });
        reparented[table] = result.count;
      }

      // Merge metadata (target wins on conflict).
      const mergedMetadata = this.mergeMetadata(
        (source.metadata as Prisma.JsonValue | null) ?? null,
        (target.metadata as Prisma.JsonValue | null) ?? null,
      );
      if (mergedMetadata !== undefined) {
        await tx.customer.update({
          where: { id: targetCustomerId },
          data: { metadata: mergedMetadata as Prisma.InputJsonValue },
        });
      }

      // Soft-delete the source. We keep the row so historical audit
      // logs / ledger entries / refresh tokens still resolve their FK.
      // CustomerStatus has no `merged` value; we use `inactive` and
      // record the merge intent in metadata for operator clarity.
      const sourceMergeMeta = {
        ...((source.metadata as Record<string, unknown>) ?? {}),
        _mergedInto: targetCustomerId,
        _mergedAt: new Date().toISOString(),
      };
      await tx.customer.update({
        where: { id: sourceCustomerId },
        data: {
          deletedAt: new Date(),
          status: 'inactive',
          metadata: sourceMergeMeta as Prisma.InputJsonValue,
        },
      });
    });

    const mergedAt = new Date().toISOString();
    const result: CustomerMergeResult = {
      targetCustomerId,
      sourceCustomerId,
      reparented,
      idempotentReplay: false,
      mergedAt,
    };

    // Audit log carries the merge IDs and reparent counts. The
    // idempotencyKey is stored in metadata so replay can find it.
    await this.auditService.log({
      tenantId,
      actorId,
      actorType: 'user',
      action: AuditActionType.UPDATE,
      resourceType: AuditResourceType.CUSTOMER,
      resourceId: targetCustomerId,
      beforeValue: { customerId: sourceCustomerId },
      afterValue: { customerId: targetCustomerId, reparented },
      metadata: {
        event: 'customer_merged',
        sourceCustomerId,
        targetCustomerId,
        idempotencyKey,
        reparented,
        mergedAt,
      },
    });

    this.logger.log(
      `Merged customer ${sourceCustomerId} → ${targetCustomerId} ` +
        `(reparented: ${JSON.stringify(reparented)})`,
    );

    // S17 review fix — drop downstream caches.
    this.eventBus.emitAndBuild(
      EventType.CUSTOMER_MERGED,
      tenantId,
      {
        sourceCustomerId,
        targetCustomerId,
        reparented,
        mergedAt,
      },
    );

    return result;
  }

  /**
   * Idempotency replay: look up a prior merge audit log keyed by
   * `metadata.idempotencyKey`. Prisma JSON path filters are
   * provider-specific; this uses the Postgres `path` operator. If the
   * audit lookup itself fails we proceed with the merge — better to
   * risk a duplicate side-effect than miss a real merge.
   */
  private async findReplay(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<CustomerMergeResult | null> {
    try {
      const prior = await this.prisma.auditLog.findFirst({
        where: {
          tenantId,
          action: AuditActionType.UPDATE,
          resourceType: AuditResourceType.CUSTOMER,
          metadata: {
            path: ['idempotencyKey'],
            equals: idempotencyKey,
          } as never,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!prior) return null;
      const meta = (prior.metadata as Record<string, unknown>) || {};
      if (meta.event !== 'customer_merged') return null;
      return {
        targetCustomerId: String(meta.targetCustomerId ?? ''),
        sourceCustomerId: String(meta.sourceCustomerId ?? ''),
        reparented: (meta.reparented as Record<string, number>) ?? {},
        idempotentReplay: true,
        mergedAt: String(meta.mergedAt ?? prior.createdAt.toISOString()),
      };
    } catch (err) {
      this.logger.warn(
        `Idempotency replay lookup failed for key=${idempotencyKey}: ${
          err instanceof Error ? err.message : String(err)
        } — proceeding with merge`,
      );
      return null;
    }
  }

  /**
   * Shallow merge of two metadata JSON values, with target keys winning
   * on conflict. Returns `undefined` when both inputs are null (no
   * update needed) and the merged object otherwise. Non-object inputs
   * fall back to "target wins" because there's no meaningful merge for
   * scalars / arrays at the customer-record granularity.
   */
  private mergeMetadata(
    source: Prisma.JsonValue | null,
    target: Prisma.JsonValue | null,
  ): Prisma.JsonValue | undefined {
    if (source == null && target == null) return undefined;
    if (
      typeof source !== 'object' ||
      Array.isArray(source) ||
      source === null
    ) {
      return target ?? source ?? undefined;
    }
    if (
      typeof target !== 'object' ||
      Array.isArray(target) ||
      target === null
    ) {
      return target ?? source;
    }
    return {
      ...(source as Record<string, unknown>),
      ...(target as Record<string, unknown>),
    } as Prisma.JsonValue;
  }
}
