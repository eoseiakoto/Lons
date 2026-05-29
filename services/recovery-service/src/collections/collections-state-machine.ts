import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { EventBusService, ValidationError } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import type { CollectionsCase, CollectionsStatus, Prisma } from '@prisma/client';

/**
 * S19-5 / FR-CW-* — collections workflow state machine.
 *
 * The transition map is consulted PER CALL — it can be overridden
 * per-tenant via CollectionsWorkflowConfig.transitions. The hardcoded
 * DEFAULT_TRANSITIONS map below is the fallback when no config row
 * exists, and is also the canonical reference for the default
 * lifecycle:
 *
 *   new ──┬─ contacted ──┬─ promise_to_pay ──┬─ recovered ── closed
 *         │              │                    │
 *         │              │                    └─ broken_ptp ──┐
 *         │              │                                     ├─ escalated
 *         │              └─ escalated ────────────────────────┤
 *         │                                                    ├─ legal ── recovered / written_off
 *         └─ escalated ──── write_off_pending ── written_off ──┘                              │
 *                                                              │                              │
 *                                                              └──────────────────── closed ──┘
 *
 * Transitions are validated at the SERVICE layer (this class). The DB
 * has no CHECK constraint on (previousStatus, status) — we want
 * tenant-customised transitions to land without a migration. The
 * audit trail (CollectionsCaseTransition) and the event emission
 * happen atomically inside a single Prisma transaction so a partial
 * write can't leave the case visible-without-history.
 */
export const DEFAULT_TRANSITIONS: Record<CollectionsStatus, CollectionsStatus[]> = {
  new: ['contacted', 'escalated', 'closed'],
  contacted: ['promise_to_pay', 'escalated', 'closed'],
  promise_to_pay: ['broken_ptp', 'recovered', 'closed'],
  broken_ptp: ['contacted', 'escalated', 'legal', 'closed'],
  escalated: ['contacted', 'legal', 'write_off_pending', 'closed'],
  legal: ['write_off_pending', 'recovered', 'closed'],
  write_off_pending: ['written_off', 'escalated', 'closed'],
  written_off: ['closed'],
  recovered: ['closed'],
  closed: [],
};

export type ActorType = 'user' | 'system' | 'scheduler';

@Injectable()
export class CollectionsStateMachine {
  private readonly logger = new Logger(CollectionsStateMachine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Resolve the effective transition map for a tenant. Tenant
   * customisation takes precedence; the hardcoded DEFAULT applies
   * when no config row exists.
   *
   * The shape stored in `CollectionsWorkflowConfig.transitions` MUST
   * be `Record<string, string[]>` (status → allowed targets). The
   * cast is unchecked here — the API surface that writes the config
   * should validate the shape upstream.
   */
  async getTransitionMap(tenantId: string): Promise<Record<string, string[]>> {
    const config = await this.prisma.collectionsWorkflowConfig.findUnique({
      where: { tenantId },
    });
    if (config?.transitions) {
      return config.transitions as Record<string, string[]>;
    }
    return DEFAULT_TRANSITIONS as Record<string, string[]>;
  }

  /**
   * Validate + execute a state transition. Throws BusinessError if
   * the (fromStatus → toStatus) edge isn't in the tenant's transition
   * map. On success, atomically:
   *   1. Update the case (status, previousStatus, statusReason)
   *   2. Insert a transition row (audit trail)
   *   3. Emit COLLECTIONS_CASE_TRANSITIONED (post-commit)
   *
   * Idempotency is the caller's concern — the state machine does
   * NOT silently no-op on identity transitions (status → status).
   * If a future need arises, add an `idempotencyKey` parameter and
   * a uniqueness check against recent transitions.
   */
  async transition(
    tenantId: string,
    caseId: string,
    toStatus: CollectionsStatus,
    actorId: string,
    actorType: ActorType,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): Promise<CollectionsCase> {
    const collectionsCase = await this.prisma.collectionsCase.findUniqueOrThrow({
      where: { id: caseId },
    });

    const transitionMap = await this.getTransitionMap(tenantId);
    const allowedTargets = transitionMap[collectionsCase.status] ?? [];
    if (!allowedTargets.includes(toStatus)) {
      throw new ValidationError(
        `Cannot transition collections case from ${collectionsCase.status} to ${toStatus}`,
        { caseId, fromStatus: collectionsCase.status, toStatus, allowedTargets },
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedCase = await tx.collectionsCase.update({
        where: { id: caseId },
        data: {
          previousStatus: collectionsCase.status,
          status: toStatus,
          statusReason: reason ?? null,
          // Bump escalation level when entering escalated state — purely
          // informational, doesn't gate anything.
          ...(toStatus === 'escalated'
            ? { escalationLevel: { increment: 1 } }
            : {}),
          // Clear PTP fields when leaving promise_to_pay state — they're
          // only meaningful while the case is in that state.
          ...(collectionsCase.status === 'promise_to_pay' && toStatus !== 'promise_to_pay'
            ? { ptpDate: null, ptpAmount: null, ptpGraceDays: null }
            : {}),
          // Stamp closedAt when the workflow terminates.
          ...(toStatus === 'closed'
            ? { closedAt: new Date(), closedReason: reason ?? null }
            : {}),
        },
      });

      await tx.collectionsCaseTransition.create({
        data: {
          tenantId,
          caseId,
          fromStatus: collectionsCase.status,
          toStatus,
          reason: reason ?? null,
          actorId,
          actorType,
          metadata: (metadata ?? null) as Prisma.InputJsonValue,
        },
      });

      return updatedCase;
    });

    this.eventBus.emitAndBuild(EventType.COLLECTIONS_CASE_TRANSITIONED, tenantId, {
      caseId,
      contractId: collectionsCase.contractId,
      customerId: collectionsCase.customerId,
      fromStatus: collectionsCase.status,
      toStatus,
      actorId,
      actorType,
      reason,
    });

    // Specific lifecycle events for downstream consumers that care about
    // particular states (e.g. notifications on close, analytics on PTP).
    if (toStatus === 'closed') {
      this.eventBus.emitAndBuild(EventType.COLLECTIONS_CASE_CLOSED, tenantId, {
        caseId,
        contractId: collectionsCase.contractId,
        reason,
      });
    } else if (toStatus === 'escalated') {
      this.eventBus.emitAndBuild(EventType.COLLECTIONS_CASE_ESCALATED, tenantId, {
        caseId,
        contractId: collectionsCase.contractId,
        escalationLevel: updated.escalationLevel,
        actorId,
      });
    } else if (toStatus === 'promise_to_pay') {
      this.eventBus.emitAndBuild(EventType.COLLECTIONS_PTP_RECORDED, tenantId, {
        caseId,
        contractId: collectionsCase.contractId,
        ptpDate: updated.ptpDate?.toISOString(),
        ptpAmount: updated.ptpAmount?.toString(),
      });
    } else if (toStatus === 'broken_ptp') {
      this.eventBus.emitAndBuild(EventType.COLLECTIONS_PTP_BROKEN, tenantId, {
        caseId,
        contractId: collectionsCase.contractId,
      });
    }

    return updated;
  }
}
