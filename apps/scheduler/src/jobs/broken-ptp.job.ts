import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { CollectionsStateMachine } from '@lons/recovery-service';

/**
 * S19-9 / FR-CW-002.3 — broken promise-to-pay auto-detection.
 *
 * Runs hourly. Scans every collections_case in promise_to_pay status
 * whose ptpDate + ptpGraceDays has passed. For each:
 *   1. Sum repayments received since the PTP was recorded.
 *   2. If total < ptpAmount → transition case to broken_ptp.
 *
 * The state machine emits COLLECTIONS_PTP_BROKEN; the notification
 * service handles the fanout (officer + manager + optionally
 * borrower per tenant config).
 *
 * Idempotency: a case in promise_to_pay can only be transitioned to
 * broken_ptp once — the state machine's allowed-transitions check
 * prevents double-processing. Errors on one case don't stop the
 * batch; each case is wrapped in try/catch.
 *
 * Cross-tenant: this job runs outside HTTP request scope, so RLS
 * never fires globally. We loop tenants under platform-admin
 * context, then re-enter per-tenant for the transition call so the
 * state machine's writes land correctly.
 */
@Injectable()
export class BrokenPtpJob {
  private readonly logger = new Logger('BrokenPtpJob');

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: CollectionsStateMachine,
  ) {}

  @Cron('0 * * * *') // Every hour on the hour
  async handleCron(): Promise<void> {
    this.logger.log('Starting broken-PTP detection scan');
    const startedAt = Date.now();
    let processedCount = 0;
    let brokenCount = 0;

    // Look up active tenants under platform-admin context.
    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () =>
        this.prisma.tenant.findMany({
          where: { status: 'active', deletedAt: null },
          select: { id: true },
        }),
    );

    for (const tenant of tenants) {
      try {
        const tenantBroken = await this.processTenant(tenant.id);
        brokenCount += tenantBroken;
      } catch (err) {
        this.logger.error(
          `Broken-PTP scan failed for tenant ${tenant.id}: ${(err as Error).message}`,
        );
      }
      processedCount++;
    }

    this.logger.log(
      `Broken-PTP scan complete in ${Date.now() - startedAt}ms — ` +
        `${brokenCount} cases broken across ${processedCount} tenants`,
    );
  }

  /**
   * Process every PTP case in a single tenant. Returns the count of
   * cases that transitioned to broken_ptp on this run.
   */
  private async processTenant(tenantId: string): Promise<number> {
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      const now = new Date();

      const ptpCases = await this.prisma.collectionsCase.findMany({
        where: {
          tenantId,
          status: 'promise_to_pay',
          ptpDate: { not: null },
          deletedAt: null,
        },
        select: {
          id: true,
          contractId: true,
          ptpDate: true,
          ptpAmount: true,
          ptpGraceDays: true,
          currentOutstanding: true,
        },
      });

      let brokenCount = 0;

      for (const ptpCase of ptpCases) {
        if (!ptpCase.ptpDate) continue;

        // Compute the effective deadline = ptpDate + graceDays. The
        // grace defaults to 3 if the row's ptpGraceDays is null
        // (matches CollectionsWorkflowConfig default).
        const graceDays = ptpCase.ptpGraceDays ?? 3;
        const deadline = new Date(ptpCase.ptpDate);
        deadline.setDate(deadline.getDate() + graceDays);
        if (now < deadline) continue;

        // Has the promised amount been received since the PTP was
        // recorded? Look up the most recent promise_to_pay transition
        // for the "since" anchor — the case may have had multiple
        // PTPs across its lifetime, only the latest one matters.
        const lastPtpTransition = await this.prisma.collectionsCaseTransition.findFirst({
          where: { caseId: ptpCase.id, toStatus: 'promise_to_pay' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        const since = lastPtpTransition?.createdAt ?? new Date(0);

        const paid = await this.prisma.repayment.aggregate({
          where: {
            contractId: ptpCase.contractId,
            status: 'completed',
            createdAt: { gte: since },
          },
          _sum: { amount: true },
        });

        const totalPaid = paid._sum.amount ?? new (ptpCase.currentOutstanding.constructor as any)('0');
        const promised = ptpCase.ptpAmount ?? ptpCase.currentOutstanding;

        if (totalPaid.greaterThanOrEqualTo(promised)) {
          // Promise was kept — state machine won't move it; an
          // operator or a separate "PTP-fulfilled" job can transition
          // to recovered. For now we leave it; out of scope for S19-9.
          continue;
        }

        try {
          await this.stateMachine.transition(
            tenantId,
            ptpCase.id,
            'broken_ptp',
            'system',
            'scheduler',
            `PTP broken — promised ${promised.toString()}, received ${totalPaid.toString()} ` +
              `by deadline ${deadline.toISOString()}`,
          );
          brokenCount++;
          this.logger.log(`Case ${ptpCase.id} → broken_ptp`);
        } catch (err) {
          // INVALID_TRANSITION can fire if a race (e.g. operator
          // manually closed the case between the findMany and the
          // transition) shows up. Log + continue.
          this.logger.warn(
            `Failed to transition case ${ptpCase.id} to broken_ptp: ${(err as Error).message}`,
          );
        }
      }

      return brokenCount;
    });
  }
}
