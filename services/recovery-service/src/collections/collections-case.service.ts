import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { EventBusService, ValidationError, NotFoundError } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import type { CollectionsCase, CollectionsStatus, Prisma } from '@prisma/client';

import { CollectionsStateMachine } from './collections-state-machine';

/**
 * S19-5 — collections case CRUD + lifecycle operations.
 *
 * Boundary: this service owns case creation, list/get, assignment,
 * PTP recording, contact tracking, and close. The state-machine
 * transitions are delegated to CollectionsStateMachine — this
 * service is the "what" (operations), the state machine is the
 * "when" (transition validity).
 *
 * RLS: every call assumes the caller has set `app.current_tenant`
 * via PrismaService.enterTenantContext. The `tenantId` parameter is
 * passed through to writes so cross-tenant leaks fail fast (FK on
 * tenant_id would mismatch the RLS-admitted row).
 */
export interface CreateCollectionsCaseInput {
  contractId: string;
  customerId: string;
  outstandingAmount: Prisma.Decimal;
  currency: string;
  currentDpd: number;
  priority?: number;
  assignedToId?: string;
}

export interface CollectionsCaseFilters {
  status?: CollectionsStatus;
  assignedToId?: string;
  minDpd?: number;
  maxDpd?: number;
  priority?: number;
}

@Injectable()
export class CollectionsCaseService {
  private readonly logger = new Logger(CollectionsCaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: CollectionsStateMachine,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Open a new case. Refuses if a non-deleted case already exists
   * for (tenant, contract) — service-layer enforcement of the
   * "one active case per contract" rule (the schema allows multiple
   * historical cases via soft-delete, see CollectionsCase model
   * comment).
   */
  async createCase(
    tenantId: string,
    input: CreateCollectionsCaseInput,
  ): Promise<CollectionsCase> {
    const existing = await this.prisma.collectionsCase.findFirst({
      where: { tenantId, contractId: input.contractId, deletedAt: null },
    });
    if (existing) {
      throw new ValidationError(
        `Collections case already exists for contract ${input.contractId}`,
        { contractId: input.contractId, existingCaseId: existing.id },
      );
    }

    const collectionsCase = await this.prisma.collectionsCase.create({
      data: {
        tenantId,
        contractId: input.contractId,
        customerId: input.customerId,
        status: 'new',
        outstandingAmount: input.outstandingAmount,
        currentOutstanding: input.outstandingAmount,
        currency: input.currency,
        dpdAtEntry: input.currentDpd,
        currentDpd: input.currentDpd,
        priority: input.priority ?? 3,
        assignedToId: input.assignedToId ?? null,
      },
    });

    this.eventBus.emitAndBuild(EventType.COLLECTIONS_CASE_CREATED, tenantId, {
      caseId: collectionsCase.id,
      contractId: input.contractId,
      customerId: input.customerId,
      outstandingAmount: input.outstandingAmount.toString(),
      currency: input.currency,
      dpd: input.currentDpd,
    });

    return collectionsCase;
  }

  /**
   * Cursor-paginated list with filters. Returns the cursor's
   * next-page hint (`hasMore`) without an extra count query —
   * the resolver wraps this into a Relay-style connection.
   */
  async findMany(
    tenantId: string,
    filters: CollectionsCaseFilters,
    take = 20,
    cursor?: string,
  ): Promise<{ items: CollectionsCase[]; hasMore: boolean }> {
    const where: Prisma.CollectionsCaseWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
      ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
      ...(filters.minDpd !== undefined || filters.maxDpd !== undefined
        ? {
            currentDpd: {
              ...(filters.minDpd !== undefined ? { gte: filters.minDpd } : {}),
              ...(filters.maxDpd !== undefined ? { lte: filters.maxDpd } : {}),
            },
          }
        : {}),
    };
    const items = await this.prisma.collectionsCase.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ priority: 'asc' }, { currentDpd: 'desc' }, { createdAt: 'desc' }],
    });
    return {
      items: items.slice(0, take),
      hasMore: items.length > take,
    };
  }

  async findById(tenantId: string, caseId: string): Promise<CollectionsCase> {
    const collectionsCase = await this.prisma.collectionsCase.findFirst({
      where: { id: caseId, tenantId, deletedAt: null },
      include: {
        transitions: { orderBy: { createdAt: 'desc' } },
        writeOffApprovals: { orderBy: { level: 'asc' } },
      },
    });
    if (!collectionsCase) throw new NotFoundError('CollectionsCase', caseId);
    return collectionsCase;
  }

  async findByContract(tenantId: string, contractId: string): Promise<CollectionsCase | null> {
    return this.prisma.collectionsCase.findFirst({
      where: { tenantId, contractId, deletedAt: null },
    });
  }

  async assignCase(
    tenantId: string,
    caseId: string,
    assignToId: string,
    actorId: string,
  ): Promise<CollectionsCase> {
    const collectionsCase = await this.findById(tenantId, caseId);
    const updated = await this.prisma.collectionsCase.update({
      where: { id: caseId },
      data: { assignedToId: assignToId },
    });
    this.eventBus.emitAndBuild(EventType.COLLECTIONS_CASE_ASSIGNED, tenantId, {
      caseId,
      contractId: collectionsCase.contractId,
      previousAssigneeId: collectionsCase.assignedToId,
      newAssigneeId: assignToId,
      actorId,
    });
    return updated;
  }

  /**
   * Record a promise-to-pay. Transitions case → promise_to_pay (via
   * the state machine) and persists the PTP fields. Grace days
   * default to the tenant's CollectionsWorkflowConfig.ptpGraceDays
   * (which defaults to 3 if no config exists).
   */
  async recordPtp(
    tenantId: string,
    caseId: string,
    ptpDate: Date,
    ptpAmount: Prisma.Decimal,
    actorId: string,
    graceDays?: number,
  ): Promise<CollectionsCase> {
    // Transition first — fails fast if the source state doesn't
    // allow promise_to_pay.
    await this.stateMachine.transition(
      tenantId,
      caseId,
      'promise_to_pay',
      actorId,
      'user',
      `PTP recorded: ${ptpAmount.toString()} by ${ptpDate.toISOString()}`,
    );

    const config = await this.prisma.collectionsWorkflowConfig.findUnique({
      where: { tenantId },
    });
    const effectiveGrace = graceDays ?? config?.ptpGraceDays ?? 3;

    return this.prisma.collectionsCase.update({
      where: { id: caseId },
      data: {
        ptpDate,
        ptpAmount,
        ptpGraceDays: effectiveGrace,
      },
    });
  }

  /**
   * Track a contact attempt. Doesn't transition — the case stays in
   * whatever state it's in; this is a counter + last-seen stamp.
   * The collections dashboard surfaces `contactAttempts >= max` as
   * a "consider escalation" hint.
   */
  async recordContact(
    tenantId: string,
    caseId: string,
    _actorId: string,
    _contactMethod: string,
    _notes: string,
  ): Promise<CollectionsCase> {
    // Verify the case exists under this tenant (RLS would also block,
    // but the explicit check yields a cleaner error).
    await this.findById(tenantId, caseId);
    return this.prisma.collectionsCase.update({
      where: { id: caseId },
      data: {
        contactAttempts: { increment: 1 },
        lastContactAt: new Date(),
      },
    });
  }

  async closeCase(
    tenantId: string,
    caseId: string,
    actorId: string,
    reason: string,
  ): Promise<CollectionsCase> {
    return this.stateMachine.transition(tenantId, caseId, 'closed', actorId, 'user', reason);
  }

  /**
   * Update the running outstanding balance after a payment is
   * allocated. Called from the repayment pipeline; not exposed on
   * the GraphQL surface.
   */
  async updateOutstanding(
    tenantId: string,
    caseId: string,
    newOutstanding: Prisma.Decimal,
    newDpd: number,
  ): Promise<void> {
    await this.prisma.collectionsCase.updateMany({
      where: { id: caseId, tenantId, deletedAt: null },
      data: { currentOutstanding: newOutstanding, currentDpd: newDpd },
    });
  }
}
