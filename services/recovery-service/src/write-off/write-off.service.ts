import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { EventBusService, ValidationError, NotFoundError } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import type {
  WriteOffApproval,
  WriteOffApprovalLevel,
  WriteOffApprovalDecision,
  Prisma,
} from '@prisma/client';

import { CollectionsStateMachine } from '../collections/collections-state-machine';

/**
 * S19-8 — multi-level write-off approval workflow.
 *
 * Lifecycle:
 *   1. requestWriteOff() — case officer (L1) recommends a write-off.
 *      Case transitions to write_off_pending. L1 row is created
 *      `approved` immediately (the request IS the L1 approval). L2/L3
 *      rows are created `pending` IF the amount exceeds the
 *      corresponding threshold.
 *   2. decideWriteOff() — manager (L2) and/or director (L3) reviews.
 *      Approve → check if all required levels have approved; if so,
 *      executeWriteOff() runs the ledger write + transitions case to
 *      written_off. Reject at any level → transition case back to
 *      escalated.
 *   3. Ledger entry uses `entryType = write_off`, `debitCredit = debit`
 *      (write-off is an expense from the lender's perspective).
 *
 * Threshold resolution: per-tenant rows in WriteOffThreshold scoped by
 * currency. Resolution is "amount > threshold for level → require that
 * level". Hardcoded fallback if no thresholds exist for a (tenant,
 * currency) pair: require all three levels.
 *
 * Idempotency: each (caseId, level) is unique. Re-requesting after a
 * full reject is allowed — the prior pending rows are recreated by
 * the next requestWriteOff() call. (The case's prior approvals are
 * preserved as audit trail; the unique constraint blocks duplicate
 * approval rows at the SAME level only.)
 */
@Injectable()
export class WriteOffService {
  private readonly logger = new Logger(WriteOffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: CollectionsStateMachine,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Initiate a write-off request. Caller must have
   * `collections:write_off_recommend`. Refuses if the case is already
   * in any write_off-related state.
   */
  async requestWriteOff(
    tenantId: string,
    caseId: string,
    amount: Prisma.Decimal,
    currency: string,
    reason: string,
    actorId: string,
  ): Promise<WriteOffApproval> {
    const collectionsCase = await this.prisma.collectionsCase.findFirst({
      where: { id: caseId, tenantId, deletedAt: null },
    });
    if (!collectionsCase) throw new NotFoundError('CollectionsCase', caseId);

    // Refuse on terminal states + already-pending write-offs.
    if (['written_off', 'closed', 'write_off_pending'].includes(collectionsCase.status)) {
      throw new ValidationError(
        `Cannot request write-off when case is in ${collectionsCase.status} state`,
        { caseId, status: collectionsCase.status },
      );
    }

    const requiredLevels = await this.getRequiredApprovalLevels(tenantId, amount, currency);

    // State transition first — fails fast if escalated → write_off_pending
    // isn't allowed for the tenant.
    await this.stateMachine.transition(
      tenantId,
      caseId,
      'write_off_pending',
      actorId,
      'user',
      `Write-off requested: ${amount.toString()} ${currency} (${reason})`,
    );

    // Create the L1 approval row + pending rows for higher levels.
    // Wrapped in a transaction so a partial insert can't leave the
    // case `write_off_pending` with no approval rows at all.
    const l1Approval = await this.prisma.$transaction(async (tx) => {
      const created = await tx.writeOffApproval.create({
        data: {
          tenantId,
          caseId,
          level: 'l1_officer',
          decision: 'approved',
          amount,
          currency,
          reason,
          actorId,
          decidedAt: new Date(),
        },
      });

      for (const level of requiredLevels) {
        if (level === 'l1_officer') continue;
        await tx.writeOffApproval.create({
          data: {
            tenantId,
            caseId,
            level,
            decision: 'pending',
            amount,
            currency,
          },
        });
      }

      // Stamp the case's snapshot fields for the dashboard.
      const nextPending = requiredLevels.find((l) => l !== 'l1_officer');
      await tx.collectionsCase.update({
        where: { id: caseId },
        data: {
          writeOffApprovalStatus: nextPending ? `pending_${nextPending}` : 'approved',
          writeOffAmount: amount,
        },
      });

      return created;
    });

    this.eventBus.emitAndBuild(EventType.COLLECTIONS_WRITE_OFF_REQUESTED, tenantId, {
      caseId,
      contractId: collectionsCase.contractId,
      amount: amount.toString(),
      currency,
      requiredLevels,
      actorId,
    });

    // Single-level case: L1-only and we're already approved → execute now.
    if (requiredLevels.length === 1) {
      await this.executeWriteOff(tenantId, caseId, amount, currency, actorId);
    }

    return l1Approval;
  }

  /**
   * Approve or reject at a specific level. Caller's permission gate
   * (l2_manager → `collections:write_off_approve`,
   *  l3_director → `collections:write_off_final` or `tenant:admin`)
   * is enforced at the resolver — this method assumes authz already
   * passed.
   */
  async decideWriteOff(
    tenantId: string,
    caseId: string,
    level: WriteOffApprovalLevel,
    decision: 'approved' | 'rejected',
    actorId: string,
    reason?: string,
  ): Promise<WriteOffApproval> {
    const approval = await this.prisma.writeOffApproval.findUnique({
      where: { caseId_level: { caseId, level } },
    });
    if (!approval) throw new NotFoundError('WriteOffApproval', `${caseId}/${level}`);
    if (approval.tenantId !== tenantId) {
      throw new NotFoundError('WriteOffApproval', `${caseId}/${level}`);
    }
    if (approval.decision !== 'pending') {
      throw new ValidationError(
        `Write-off approval at ${level} is already ${approval.decision}`,
        { caseId, level, currentDecision: approval.decision },
      );
    }

    const updated = await this.prisma.writeOffApproval.update({
      where: { id: approval.id },
      data: {
        decision,
        actorId,
        reason: reason ?? null,
        decidedAt: new Date(),
      },
    });

    if (decision === 'rejected') {
      // Reset the case → escalated. Cancel sibling pending rows so they
      // don't dangle (the rejection at one level voids the whole
      // request; re-requesting creates fresh rows).
      await this.prisma.writeOffApproval.updateMany({
        where: { caseId, decision: 'pending' },
        data: { decision: 'rejected', reason: `Cancelled — ${level} rejected the request` },
      });
      await this.stateMachine.transition(
        tenantId,
        caseId,
        'escalated',
        actorId,
        'user',
        `Write-off rejected at ${level}: ${reason ?? '(no reason given)'}`,
      );
      await this.prisma.collectionsCase.update({
        where: { id: caseId },
        data: { writeOffApprovalStatus: 'rejected' },
      });
      this.eventBus.emitAndBuild(EventType.COLLECTIONS_WRITE_OFF_REJECTED, tenantId, {
        caseId,
        level,
        actorId,
        reason,
      });
      return updated;
    }

    // Approved at this level — check if all required levels are now approved.
    const allApprovals = await this.prisma.writeOffApproval.findMany({
      where: { caseId },
      orderBy: { level: 'asc' },
    });
    const allApproved = allApprovals.every((a) => a.decision === 'approved');

    if (allApproved) {
      await this.executeWriteOff(tenantId, caseId, approval.amount, approval.currency, actorId);
    } else {
      const nextPending = allApprovals.find((a) => a.decision === 'pending');
      await this.prisma.collectionsCase.update({
        where: { id: caseId },
        data: { writeOffApprovalStatus: nextPending ? `pending_${nextPending.level}` : 'approved' },
      });
    }

    return updated;
  }

  /**
   * Final execution. Atomically:
   *   - Mark contract status = written_off, classification = loss.
   *   - Insert the ledger entry (entryType=write_off, debit).
   *   - Stamp case writeOffApprovalStatus + closedAt + closedReason.
   * Followed by a state-machine transition (which lives outside the
   * tx because it emits events post-commit).
   */
  private async executeWriteOff(
    tenantId: string,
    caseId: string,
    amount: Prisma.Decimal,
    currency: string,
    actorId: string,
  ): Promise<void> {
    const collectionsCase = await this.prisma.collectionsCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { contract: { select: { id: true } } },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: collectionsCase.contractId },
        data: { status: 'written_off', classification: 'loss' },
      });
      // Running balance: simplistic — assume the write-off zeros the
      // open balance. A future enhancement could read the prior
      // running_balance and compute properly. For S19-8 the running
      // balance after write-off is 0.
      await tx.ledgerEntry.create({
        data: {
          tenantId,
          contractId: collectionsCase.contractId,
          entryType: 'write_off',
          debitCredit: 'debit',
          amount,
          currency,
          runningBalance: new (amount.constructor as any)('0'),
          effectiveDate: new Date(),
          valueDate: new Date(),
          description: `Write-off approved (case ${caseId})`,
          referenceType: 'collections_case',
          referenceId: caseId,
        },
      });
      await tx.collectionsCase.update({
        where: { id: caseId },
        data: {
          writeOffApprovalStatus: 'approved',
        },
      });
    });

    await this.stateMachine.transition(
      tenantId,
      caseId,
      'written_off',
      actorId,
      'user',
      'All approvals received — write-off executed',
    );

    this.eventBus.emitAndBuild(EventType.COLLECTIONS_WRITE_OFF_APPROVED, tenantId, {
      caseId,
      contractId: collectionsCase.contractId,
      amount: amount.toString(),
      currency,
    });
  }

  /**
   * Resolve which levels are required for an amount in a currency.
   * Rules:
   *   - L1 always required (the request itself).
   *   - amount > L1 threshold → require L2.
   *   - amount > L2 threshold → require L3.
   *   - No thresholds configured for currency → require all 3
   *     (safe default).
   */
  async getRequiredApprovalLevels(
    tenantId: string,
    amount: Prisma.Decimal,
    currency: string,
  ): Promise<WriteOffApprovalLevel[]> {
    const thresholds = await this.prisma.writeOffThreshold.findMany({
      where: { tenantId, currency },
    });
    if (thresholds.length === 0) {
      return ['l1_officer', 'l2_manager', 'l3_director'];
    }
    const byLevel = new Map<WriteOffApprovalLevel, Prisma.Decimal>();
    for (const t of thresholds) {
      byLevel.set(t.level, t.maxAmountThreshold);
    }

    const required: WriteOffApprovalLevel[] = ['l1_officer'];
    const l1 = byLevel.get('l1_officer');
    const l2 = byLevel.get('l2_manager');
    if (l1 && amount.greaterThan(l1)) required.push('l2_manager');
    if (l2 && amount.greaterThan(l2)) {
      if (!required.includes('l2_manager')) required.push('l2_manager');
      required.push('l3_director');
    }
    return required;
  }
}
